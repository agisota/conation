use axum::{
    Json, Router,
    extract::{Path, State},
    http::{HeaderMap, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use macro_authorization::{MacroAuthorizationExtractor, UserOnly};
use quick_xml::{Reader, events::Event};
use serde::{Deserialize, Serialize};
use sqlx::{FromRow, PgPool};

use crate::api::context::{ApiContext, AuthorizationService};

const DEFAULT_NAME: &str = "Macro";
const DEFAULT_COLOR: &str = "#6B5CFF";
const MAX_SVG_BYTES: usize = 65_536;

pub fn router() -> Router<ApiContext> {
    Router::new()
        .route("/brand", get(get_brand).put(publish_brand))
        .route("/brand/capability", get(get_capability))
        .route("/brand/logo/{version}", get(get_logo))
        .route("/brand/rollback", post(rollback_brand))
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct BrandSnapshot {
    version: i64,
    name: String,
    color: String,
    logo_url: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct PublishRequest {
    expected_version: i64,
    name: String,
    color: String,
    /// Omitted or null preserves the current logo; an empty string removes it.
    logo_svg: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct RollbackRequest {
    expected_version: i64,
    revision_version: i64,
}

#[derive(FromRow)]
struct CurrentBrand {
    version: i64,
    display_name: String,
    color: String,
    logo_svg: Option<Vec<u8>>,
}

#[derive(FromRow)]
struct Revision {
    display_name: String,
    color: String,
    logo_svg: Option<Vec<u8>>,
}

fn snapshot(version: i64, name: String, color: String, has_logo: bool) -> BrandSnapshot {
    BrandSnapshot {
        version,
        name,
        color,
        logo_url: has_logo.then(|| format!("/brand/logo/{version}")),
    }
}

async fn current_brand(db: &PgPool) -> Result<Option<CurrentBrand>, sqlx::Error> {
    sqlx::query_as::<_, CurrentBrand>(
        "SELECT state.version, revision.display_name, revision.color, revision.logo_svg
         FROM installation_brand_state state
         JOIN installation_brand_revision revision ON revision.version = state.version
         WHERE state.singleton = true",
    )
    .fetch_optional(db)
    .await
}

async fn get_brand(State(ctx): State<ApiContext>) -> Response {
    match current_brand(&ctx.db).await {
        Ok(Some(current)) => (
            StatusCode::OK,
            cache_headers(),
            Json(snapshot(
                current.version,
                current.display_name,
                current.color,
                current.logo_svg.is_some(),
            )),
        )
            .into_response(),
        Ok(None) => (
            StatusCode::OK,
            cache_headers(),
            Json(snapshot(
                0,
                DEFAULT_NAME.into(),
                DEFAULT_COLOR.into(),
                false,
            )),
        )
            .into_response(),
        Err(error) => {
            tracing::error!(?error, "public brand read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn get_logo(State(ctx): State<ApiContext>, Path(version): Path<i64>) -> Response {
    if version < 1 {
        return StatusCode::NOT_FOUND.into_response();
    }
    let result = sqlx::query_scalar::<_, Option<Vec<u8>>>(
        "SELECT logo_svg FROM installation_brand_revision WHERE version = $1",
    )
    .bind(version)
    .fetch_optional(&ctx.db)
    .await;
    match result {
        Ok(Some(Some(bytes))) => svg_response(bytes),
        Ok(_) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            tracing::error!(?error, "brand asset read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

#[derive(Serialize)]
struct BrandError {
    message: &'static str,
}

fn bad_request(message: &'static str) -> Response {
    (StatusCode::BAD_REQUEST, Json(BrandError { message })).into_response()
}
fn svg_response(bytes: Vec<u8>) -> Response {
    let mut headers = HeaderMap::new();
    headers.insert(
        header::CONTENT_TYPE,
        HeaderValue::from_static("image/svg+xml; charset=utf-8"),
    );
    headers.insert(
        header::X_CONTENT_TYPE_OPTIONS,
        HeaderValue::from_static("nosniff"),
    );
    headers.insert(
        header::CONTENT_SECURITY_POLICY,
        HeaderValue::from_static("default-src 'none'; style-src 'none'; sandbox"),
    );
    headers.insert(
        header::CACHE_CONTROL,
        HeaderValue::from_static("public, max-age=31536000, immutable"),
    );
    (StatusCode::OK, headers, bytes).into_response()
}

fn cache_headers() -> HeaderMap {
    let mut headers = HeaderMap::new();
    headers.insert(header::CACHE_CONTROL, HeaderValue::from_static("no-store"));
    headers
}

fn configured_owner_org() -> Result<i32, ()> {
    macro_env_var::read_env_var("INSTALLATION_BRAND_ORGANIZATION_ID")
        .ok()
        .and_then(|value| value.parse::<i32>().ok())
        .filter(|value| *value > 0)
        .ok_or(())
}

async fn is_owner_admin(
    db: &PgPool,
    user_id: &str,
    organization_id: i32,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, bool>(
        "SELECT EXISTS (
            SELECT 1 FROM \"OrganizationIT\" administrator
            JOIN \"User\" user_record
              ON user_record.email = administrator.email
             AND user_record.\"organizationId\" = administrator.\"organizationId\"
            WHERE administrator.\"organizationId\" = $1 AND user_record.id = $2
         )",
    )
    .bind(organization_id)
    .bind(user_id)
    .fetch_one(db)
    .await
}
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct BrandCapability {
    can_manage: bool,
}

async fn get_capability(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOnly>,
) -> Response {
    let owner_org = match configured_owner_org() {
        Ok(value) => value,
        Err(()) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    match is_owner_admin(
        &ctx.db,
        authorization.authorization.macro_user_id.as_ref(),
        owner_org,
    )
    .await
    {
        Ok(can_manage) => Json(BrandCapability { can_manage }).into_response(),
        Err(error) => {
            tracing::error!(?error, "brand capability check failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

fn validate_name_color(name: &str, color: &str) -> bool {
    let name = name.trim();
    !name.is_empty()
        && name.chars().count() <= 80
        && !name.chars().any(char::is_control)
        && color.len() == 7
        && color.starts_with('#')
        && color[1..].bytes().all(|byte| byte.is_ascii_hexdigit())
}

fn sanitize_svg(input: &str) -> Result<Vec<u8>, ()> {
    if input.is_empty() || input.len() > MAX_SVG_BYTES {
        return Err(());
    }
    let mut reader = Reader::from_str(input);
    reader.config_mut().trim_text(true);
    let mut output = String::with_capacity(input.len());
    let mut root_seen = false;
    let mut root_closed = false;
    loop {
        match reader.read_event().map_err(|_| ())? {
            Event::Start(event) => append_element(
                &event,
                reader.decoder(),
                false,
                &mut output,
                &mut root_seen,
                &mut root_closed,
            )?,
            Event::Empty(event) => append_element(
                &event,
                reader.decoder(),
                true,
                &mut output,
                &mut root_seen,
                &mut root_closed,
            )?,
            Event::End(event) => {
                let qualified_name = event.name();
                let name = std::str::from_utf8(qualified_name.as_ref()).map_err(|_| ())?;
                if name == "svg" {
                    root_closed = true;
                }
                output.push_str("</");
                output.push_str(name);
                output.push('>');
            }
            Event::Text(event) if event.decode().map_err(|_| ())?.trim().is_empty() => {}
            Event::Eof => break,
            // Reject DTDs, entities, comments, stylesheets and all non-element content.
            _ => return Err(()),
        }
    }
    if !root_seen || !root_closed || !output.starts_with("<svg ") {
        return Err(());
    }
    Ok(output.into_bytes())
}

fn append_element(
    event: &quick_xml::events::BytesStart<'_>,
    decoder: quick_xml::encoding::Decoder,
    empty: bool,
    output: &mut String,
    root_seen: &mut bool,
    root_closed: &mut bool,
) -> Result<(), ()> {
    let qualified_name = event.name();
    let name = std::str::from_utf8(qualified_name.as_ref()).map_err(|_| ())?;
    if name == "svg" {
        if *root_seen || *root_closed {
            return Err(());
        }
        *root_seen = true;
    } else if !*root_seen
        || *root_closed
        || !matches!(
            name,
            "g" | "path" | "circle" | "rect" | "line" | "polyline" | "polygon" | "ellipse"
        )
    {
        return Err(());
    }
    let mut has_svg_namespace = false;
    output.push('<');
    output.push_str(name);
    for attribute in event.attributes().with_checks(true) {
        let attribute = attribute.map_err(|_| ())?;
        let key = std::str::from_utf8(attribute.key.as_ref()).map_err(|_| ())?;
        let value = attribute
            .decode_and_unescape_value(decoder)
            .map_err(|_| ())?;
        if !allowed_attribute(name, key, &value) {
            return Err(());
        }
        if key == "xmlns" {
            has_svg_namespace = true;
        }
        output.push(' ');
        output.push_str(key);
        output.push_str("=\"");
        escape_attribute(output, &value);
        output.push('"');
    }
    if name == "svg" && !has_svg_namespace {
        return Err(());
    }
    if empty {
        output.push_str("/>");
        if name == "svg" {
            *root_closed = true;
        }
    } else {
        output.push('>');
    }
    Ok(())
}

fn allowed_attribute(element: &str, key: &str, value: &str) -> bool {
    let safe_name = match key {
        "xmlns" => element == "svg" && value == "http://www.w3.org/2000/svg",
        "viewBox" => element == "svg" && numeric_list(value, 4),
        "width" | "height" | "x" | "y" | "x1" | "y1" | "x2" | "y2" | "cx" | "cy" | "r" | "rx"
        | "ry" | "stroke-width" => numeric(value),
        "fill" | "stroke" => {
            value == "none"
                || value == "currentColor"
                || (value.len() == 7
                    && value.starts_with('#')
                    && value[1..].bytes().all(|b| b.is_ascii_hexdigit()))
        }
        "opacity" | "fill-opacity" | "stroke-opacity" => {
            value.parse::<f32>().is_ok_and(|n| (0.0..=1.0).contains(&n))
        }
        "d" => {
            element == "path"
                && value
                    .bytes()
                    .all(|b| b.is_ascii_alphanumeric() || b" .,+-\t\r\n".contains(&b))
                && !contains_ascii_ignore_case(value, b"url")
        }
        "points" => {
            matches!(element, "polygon" | "polyline")
                && value
                    .bytes()
                    .all(|b| b.is_ascii_digit() || b" .,+-\t\r\n".contains(&b))
        }
        "stroke-linecap" => matches!(value, "butt" | "round" | "square"),
        "stroke-linejoin" => matches!(value, "miter" | "round" | "bevel"),
        _ => false,
    };
    safe_name
        && !contains_ascii_ignore_case(value, b"url(")
        && !contains_ascii_ignore_case(value, b"javascript:")
}

fn numeric(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 16
        && value
            .bytes()
            .all(|b| b.is_ascii_digit() || b".+-".contains(&b))
        && value.parse::<f32>().is_ok_and(f32::is_finite)
}
fn numeric_list(value: &str, expected: usize) -> bool {
    let mut count = 0;
    for part in value.split([',', ' ']).filter(|part| !part.is_empty()) {
        if !numeric(part) {
            return false;
        }
        count += 1;
        if count > expected {
            return false;
        }
    }
    count == expected
}

fn contains_ascii_ignore_case(value: &str, needle: &[u8]) -> bool {
    value
        .as_bytes()
        .windows(needle.len())
        .any(|window| window.eq_ignore_ascii_case(needle))
}

fn escape_attribute(output: &mut String, value: &str) {
    for ch in value.chars() {
        match ch {
            '&' => output.push_str("&amp;"),
            '"' => output.push_str("&quot;"),
            '<' => output.push_str("&lt;"),
            '>' => output.push_str("&gt;"),
            _ => output.push(ch),
        }
    }
}

async fn publish_brand(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOnly>,
    Json(request): Json<PublishRequest>,
) -> Response {
    let user_id = authorization.authorization.macro_user_id.as_ref();
    let owner_org = match configured_owner_org() {
        Ok(value) => value,
        Err(()) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    match is_owner_admin(&ctx.db, user_id, owner_org).await {
        Ok(true) => {}
        Ok(false) => return StatusCode::FORBIDDEN.into_response(),
        Err(error) => {
            tracing::error!(?error, "brand admin check failed");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    }
    if request.expected_version < 0 {
        return bad_request("expectedVersion must be a non-negative published version");
    }
    if !validate_name_color(&request.name, &request.color) {
        return bad_request("name must be 1–80 printable characters and color must be #RRGGBB");
    }
    let logo = match request.logo_svg.as_deref() {
        Some("") => Some(None),
        Some(svg) => match sanitize_svg(svg) {
            Ok(clean) => Some(Some(clean)),
            Err(()) => {
                return bad_request(
                    "SVG must be at most 64 KiB and contain only static vector shapes (path, group, circle, rectangle, line, polygon or ellipse) with local numeric/color attributes; scripts, styles and external references are rejected",
                );
            }
        },
        None => None,
    };
    match publish_revision(
        &ctx.db,
        owner_org,
        user_id,
        request.expected_version,
        request.name.trim(),
        &request.color,
        logo,
    )
    .await
    {
        Ok(Some(snapshot)) => (StatusCode::OK, cache_headers(), Json(snapshot)).into_response(),
        Ok(None) => StatusCode::CONFLICT.into_response(),
        Err(error) => {
            tracing::error!(?error, "brand publication failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn rollback_brand(
    State(ctx): State<ApiContext>,
    authorization: MacroAuthorizationExtractor<AuthorizationService, UserOnly>,
    Json(request): Json<RollbackRequest>,
) -> Response {
    let user_id = authorization.authorization.macro_user_id.as_ref();
    let owner_org = match configured_owner_org() {
        Ok(value) => value,
        Err(()) => return StatusCode::SERVICE_UNAVAILABLE.into_response(),
    };
    match is_owner_admin(&ctx.db, user_id, owner_org).await {
        Ok(true) => {}
        Ok(false) => return StatusCode::FORBIDDEN.into_response(),
        Err(error) => {
            tracing::error!(?error, "brand admin check failed");
            return StatusCode::SERVICE_UNAVAILABLE.into_response();
        }
    }
    if request.expected_version < 0
        || request.revision_version < 1
        || request.revision_version >= request.expected_version
    {
        return StatusCode::BAD_REQUEST.into_response();
    }
    let revision = sqlx::query_as::<_, Revision>(
        "SELECT display_name, color, logo_svg FROM installation_brand_revision WHERE version = $1",
    )
    .bind(request.revision_version)
    .fetch_optional(&ctx.db)
    .await;
    match revision {
        Ok(Some(revision)) => match publish_revision(
            &ctx.db,
            owner_org,
            user_id,
            request.expected_version,
            &revision.display_name,
            &revision.color,
            Some(revision.logo_svg),
        )
        .await
        {
            Ok(Some(snapshot)) => (StatusCode::OK, cache_headers(), Json(snapshot)).into_response(),
            Ok(None) => StatusCode::CONFLICT.into_response(),
            Err(error) => {
                tracing::error!(?error, "brand rollback failed");
                StatusCode::SERVICE_UNAVAILABLE.into_response()
            }
        },
        Ok(None) => StatusCode::NOT_FOUND.into_response(),
        Err(error) => {
            tracing::error!(?error, "brand revision read failed");
            StatusCode::SERVICE_UNAVAILABLE.into_response()
        }
    }
}

async fn publish_revision(
    db: &PgPool,
    owner_org: i32,
    actor: &str,
    expected_version: i64,
    name: &str,
    color: &str,
    logo: Option<Option<Vec<u8>>>,
) -> Result<Option<BrandSnapshot>, sqlx::Error> {
    let mut tx = db.begin().await?;
    sqlx::query("SELECT pg_advisory_xact_lock(184938271)")
        .execute(&mut *tx)
        .await?;
    let configured_org = sqlx::query_scalar::<_, i32>(
        "SELECT owner_organization_id FROM installation_brand_state WHERE singleton = true FOR UPDATE",
    )
    .fetch_optional(&mut *tx)
    .await?;
    if configured_org.is_some_and(|stored_org| stored_org != owner_org) {
        return Ok(None);
    }
    let current = sqlx::query_as::<_, CurrentBrand>(
        "SELECT state.version, revision.display_name, revision.color, revision.logo_svg
         FROM installation_brand_state state
         JOIN installation_brand_revision revision ON revision.version = state.version
         WHERE state.singleton = true AND state.owner_organization_id = $1
         FOR UPDATE OF state",
    )
    .bind(owner_org)
    .fetch_optional(&mut *tx)
    .await?;
    let (new_version, selected_logo) = match current {
        None if expected_version == 0 && configured_org.is_none() => (1, logo.flatten()),
        None => return Ok(None),
        Some(current) if current.version == expected_version => {
            (current.version + 1, logo.unwrap_or(current.logo_svg))
        }
        Some(_) => return Ok(None),
    };
    sqlx::query(
        "INSERT INTO installation_brand_revision (version, display_name, color, logo_svg, published_by)
         VALUES ($1, $2, $3, $4, $5)",
    ).bind(new_version).bind(name).bind(color).bind(selected_logo.as_deref()).bind(actor).execute(&mut *tx).await?;
    let changed = if expected_version == 0 {
        sqlx::query(
            "INSERT INTO installation_brand_state (singleton, owner_organization_id, version)
             VALUES (true, $1, $2) ON CONFLICT (singleton) DO NOTHING",
        )
        .bind(owner_org)
        .bind(new_version)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1
    } else {
        sqlx::query(
            "UPDATE installation_brand_state SET version = $1, updated_at = now()
             WHERE singleton = true AND owner_organization_id = $2 AND version = $3",
        )
        .bind(new_version)
        .bind(owner_org)
        .bind(expected_version)
        .execute(&mut *tx)
        .await?
        .rows_affected()
            == 1
    };
    if !changed {
        tx.rollback().await?;
        return Ok(None);
    }
    tx.commit().await?;
    Ok(Some(snapshot(
        new_version,
        name.to_owned(),
        color.to_owned(),
        selected_logo.is_some(),
    )))
}

#[cfg(test)]
mod tests {
    use super::*;
    use macro_db_migrator::MACRO_DB_MIGRATIONS;

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn installation_admin_scope_and_optimistic_publish_are_database_enforced(
        db: PgPool,
    ) -> anyhow::Result<()> {
        let organization_id: i32 = sqlx::query_scalar(
            "INSERT INTO \"Organization\" (name) VALUES ('Brand test') RETURNING id",
        )
        .fetch_one(&db)
        .await?;
        let admin_id = "brand-admin";
        let member_id = "brand-member";
        for (user_id, email) in [
            (admin_id, "admin@brand.test"),
            (member_id, "member@brand.test"),
        ] {
            let macro_user_id = uuid::Uuid::new_v4();
            sqlx::query("INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $2, $3)")
                .bind(macro_user_id)
                .bind(email)
                .bind(format!("brand-customer-{macro_user_id}"))
                .execute(&db)
                .await?;
            sqlx::query("INSERT INTO \"User\" (id, email, \"organizationId\", macro_user_id) VALUES ($1, $2, $3, $4)")
                .bind(user_id)
                .bind(email)
                .bind(organization_id)
                .bind(macro_user_id)
                .execute(&db)
                .await?;
        }
        sqlx::query("INSERT INTO \"OrganizationIT\" (email, \"organizationId\") VALUES ('admin@brand.test', $1)")
            .bind(organization_id)
            .execute(&db)
            .await?;
        assert!(is_owner_admin(&db, admin_id, organization_id).await?);
        assert!(!is_owner_admin(&db, member_id, organization_id).await?);
        assert!(!is_owner_admin(&db, admin_id, organization_id + 1).await?);

        let initial = publish_revision(
            &db,
            organization_id,
            admin_id,
            0,
            "Acme",
            "#112233",
            Some(Some(
                sanitize_svg(
                    r#"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M0 0 L1 1"/></svg>"#,
                )
                .expect("safe fixture sanitizes"),
            )),
        )
        .await?
        .expect("first publication must create version one");
        assert_eq!(initial.version, 1);

        let (first, second) = tokio::join!(
            publish_revision(&db, organization_id, admin_id, 1, "First", "#223344", None),
            publish_revision(&db, organization_id, admin_id, 1, "Second", "#334455", None),
        );
        let concurrent = [first?, second?];
        assert_eq!(
            concurrent.iter().filter(|result| result.is_some()).count(),
            1
        );
        assert_eq!(
            concurrent.iter().filter(|result| result.is_none()).count(),
            1
        );
        assert!(
            publish_revision(&db, organization_id, admin_id, 1, "Stale", "#445566", None)
                .await?
                .is_none()
        );
        let current = current_brand(&db).await?.expect("published brand exists");
        assert_eq!(current.version, 2);

        let previous = sqlx::query_as::<_, Revision>(
            "SELECT display_name, color, logo_svg FROM installation_brand_revision WHERE version = 1",
        )
        .fetch_one(&db)
        .await?;
        let rolled_back = publish_revision(
            &db,
            organization_id,
            admin_id,
            2,
            &previous.display_name,
            &previous.color,
            Some(previous.logo_svg),
        )
        .await?
        .expect("rollback must publish a new revision");
        assert_eq!(rolled_back.version, 3);
        assert_eq!(rolled_back.name, "Acme");
        assert_eq!(current_brand(&db).await?.unwrap().version, 3);
        Ok(())
    }

    #[test]
    fn owner_org_respects_selected_secret_source() {
        if let Ok(expected) = std::env::var("CTN_BRAND_OWNER_TEST_CHILD") {
            let actual = configured_owner_org();
            if expected == "missing" {
                assert_eq!(actual, Err(()));
            } else {
                assert_eq!(actual, Ok(42));
            }
            return;
        }

        for (secrets, expected) in [
            (r#"{"INSTALLATION_BRAND_ORGANIZATION_ID":42}"#, "42"),
            ("{}", "missing"),
        ] {
            let output = std::process::Command::new(std::env::current_exe().unwrap())
                .arg("owner_org_respects_selected_secret_source")
                .arg("--nocapture")
                .env("CTN_BRAND_OWNER_TEST_CHILD", expected)
                .env("APP_SECRETS_JSON", secrets)
                .env("INSTALLATION_BRAND_ORGANIZATION_ID", "7")
                .output()
                .unwrap();
            assert!(
                output.status.success()
                    && String::from_utf8_lossy(&output.stdout).contains("1 passed"),
                "selected owner source failed: {}",
                String::from_utf8_lossy(&output.stdout)
            );
        }
    }

    #[test]
    fn safe_svg_shapes_are_normalized_and_preserved() {
        let clean = sanitize_svg(r##"<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2 L22 22" fill="none" stroke="#123456" stroke-width="2"/></svg>"##).unwrap();
        let clean = String::from_utf8(clean).unwrap();
        assert!(clean.contains("<path"));
        assert!(clean.contains("stroke=\"#123456\""));
    }

    #[test]
    fn active_and_external_svg_content_is_rejected() {
        for svg in [
            r#"<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>"#,
            r#"<svg xmlns="http://www.w3.org/2000/svg"><image href="https://attacker.invalid/x"/></svg>"#,
            r#"<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" fill="url(https://attacker.invalid/x)"/></svg>"#,
            r#"<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg xmlns="http://www.w3.org/2000/svg"/>"#,
        ] {
            assert!(sanitize_svg(svg).is_err());
        }
    }

    #[test]
    fn publish_fields_enforce_display_name_and_hex_color() {
        assert!(validate_name_color(" Acme ", "#aBc123"));
        assert!(!validate_name_color("\n", "#aBc123"));
        assert!(!validate_name_color("Acme", "red"));
    }
}
