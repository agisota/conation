use super::*;
use macro_db_migrator::MACRO_DB_MIGRATIONS;
use serde_json::json;

fn dashboard(owner: &str, revision: i64) -> View {
    View::new(
        owner.into(),
        "dashboard:personal".into(),
        json!({"kind":"dashboard","id":"dashboard:personal","version":1,
            "revision":revision,"preset":"focus","widgets":["tasks"]}),
    )
}

async fn insert_owner(pool: &PgPool) {
    let macro_user_id = Uuid::new_v4();
    sqlx::query(
        "INSERT INTO macro_user (id, username, email, stripe_customer_id) VALUES ($1, $2, $3, $4)"
    )
    .bind(macro_user_id)
    .bind("macro|owner@example.com")
    .bind("owner@example.com")
    .bind("cus_dashboard_test")
    .execute(pool)
    .await
    .unwrap();
    sqlx::query(r#"INSERT INTO "User" (id, email, macro_user_id) VALUES ($1, $2, $3)"#)
        .bind("macro|owner@example.com")
        .bind("owner@example.com")
        .bind(macro_user_id)
        .execute(pool)
        .await
        .unwrap();
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn first_write_race_keeps_one_uuid_and_stale_revision_cannot_overwrite(pool: PgPool) {
    insert_owner(&pool).await;
    let storage = PgViewStorage::new(pool);
    let first = dashboard("macro|owner@example.com", 1);
    let second = dashboard("macro|owner@example.com", 1);
    let (a, b) = tokio::join!(
        storage.upsert_personal_dashboard(&first, 0),
        storage.upsert_personal_dashboard(&second, 0)
    );
    assert_eq!([a.unwrap().is_some(), b.unwrap().is_some()].iter().filter(|&&ok| ok).count(), 1);
    let rows = storage.get_views_for_user(&first.user_id).await.unwrap();
    assert_eq!(rows.len(), 1);
    let physical_id = rows[0].id;

    let next = dashboard(&first.user_id, 2);
    let replaced = storage.upsert_personal_dashboard(&next, 1).await.unwrap().unwrap();
    assert_eq!(replaced.id, physical_id);
    assert!(storage.upsert_personal_dashboard(&next, 1).await.unwrap().is_none());
    assert_eq!(storage.get_views_for_user(&first.user_id).await.unwrap()[0].config["revision"], 2);
}

#[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
async fn full_replace_discards_legacy_team_keys_and_owner_guard_blocks_foreign_mutations(pool: PgPool) {
    insert_owner(&pool).await;
    let storage = PgViewStorage::new(pool);
    let mut legacy = dashboard("macro|owner@example.com", 0);
    legacy.config["teamDefault"] = json!(true);
    storage.create_view(&legacy).await.unwrap();
    let replacement = dashboard(&legacy.user_id, 1);
    let saved = storage.upsert_personal_dashboard(&replacement, 0).await.unwrap().unwrap();
    assert_eq!(saved.id, legacy.id);
    assert!(saved.config.get("teamDefault").is_none());

    let patch = || ViewPatch { name: None, config: Some(json!({"teamDefault":true})) };
    assert!(!storage.patch_view(saved.id, &saved.user_id, patch()).await.unwrap());
    assert!(!storage.patch_view(saved.id, "macro|other@example.com", patch()).await.unwrap());
    assert!(!storage.delete_view(saved.id, "macro|other@example.com").await.unwrap());
    assert!(!storage.delete_view(saved.id, &saved.user_id).await.unwrap());
    assert_eq!(storage.get_views_for_user(&legacy.user_id).await.unwrap()[0].config, saved.config);

    let crm = View::new(legacy.user_id.clone(), "CRM".into(), json!({"isDefault":false}));
    storage.create_view(&crm).await.unwrap();
    assert!(storage.patch_view(crm.id, &crm.user_id, ViewPatch {
        name: None, config: Some(json!({"isDefault":true}))
    }).await.unwrap());
    let rows = storage.get_views_for_user(&crm.user_id).await.unwrap();
    assert_eq!(rows.iter().find(|row| row.id == crm.id).unwrap().config["isDefault"], true);
    assert!(storage.delete_view(crm.id, &crm.user_id).await.unwrap());
    assert!(
        !storage
            .get_views_for_user(&crm.user_id)
            .await
            .unwrap()
            .iter()
            .any(|row| row.id == crm.id)
    );
}
