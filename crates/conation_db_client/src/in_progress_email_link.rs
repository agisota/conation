/// Checks if an email is already in progress
/// If it is, returns the conation_user_id and the link_id
pub async fn check_existing_in_progress_email_link(
    db: &sqlx::Pool<sqlx::Postgres>,
    email: &str,
) -> anyhow::Result<Option<(uuid::Uuid, uuid::Uuid)>> {
    let result = sqlx::query!(
        r#"
            SELECT
                conation_user_id,
                id
            FROM
                in_progress_email_link
            WHERE
                in_progress_email_link.email = $1
        "#,
        email
    )
    .map(|r| (r.conation_user_id, r.id))
    .fetch_optional(db)
    .await?;

    Ok(result)
}

pub async fn insert_in_progress_email_link(
    db: &sqlx::Pool<sqlx::Postgres>,
    conation_user_id: &str,
    email: &str,
) -> anyhow::Result<uuid::Uuid> {
    let id = conation_uuid::generate_uuid_v7();
    let conation_user_id = conation_uuid::string_to_uuid(conation_user_id)?;

    sqlx::query!(
        r#"
            INSERT INTO
                in_progress_email_link (id, conation_user_id, email, created_at)
            VALUES
                ($1, $2, $3, NOW())
        "#,
        &id,
        &conation_user_id,
        email
    )
    .execute(db)
    .await?;

    Ok(id)
}

#[derive(Debug, Clone)]
pub struct InProgressEmailLink {
    pub id: uuid::Uuid,
    pub conation_user_id: uuid::Uuid,
    pub email: String,
}

pub async fn get_in_progress_email_link(
    db: &sqlx::Pool<sqlx::Postgres>,
    link_id: &str,
) -> anyhow::Result<Option<InProgressEmailLink>> {
    let link_id = conation_uuid::string_to_uuid(link_id)?;
    let result = sqlx::query_as!(
        InProgressEmailLink,
        r#"
            SELECT
                id,
                conation_user_id,
                email
            FROM
                in_progress_email_link
            WHERE
                id = $1
        "#,
        &link_id
    )
    .fetch_optional(db)
    .await?;

    Ok(result)
}

pub async fn delete_in_progress_email_link(
    db: &sqlx::Pool<sqlx::Postgres>,
    link_id: &str,
) -> anyhow::Result<()> {
    let link_id = conation_uuid::string_to_uuid(link_id)?;
    sqlx::query!(
        r#"
            DELETE FROM
                in_progress_email_link
            WHERE
                id = $1
        "#,
        &link_id
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Deletes all in progress email links that are older than 24 hours
pub async fn delete_day_old_in_progress_email_links(
    db: &sqlx::Pool<sqlx::Postgres>,
) -> anyhow::Result<()> {
    let now = chrono::Utc::now();
    let yesterday = now - chrono::Duration::hours(24);
    let yesterday = yesterday.naive_utc();

    sqlx::query!(
        r#"
            DELETE FROM
                in_progress_email_link
            WHERE
                created_at < $1
        "#,
        yesterday
    )
    .execute(db)
    .await?;

    Ok(())
}
