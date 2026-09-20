//! Permission service implementation for properties.

use std::sync::Arc;

use macro_user_id::cowlike::CowLike;
use macro_user_id::user_id::MacroUserIdStr;
use entity_access::domain::models::{
    AccessError, Entity, EntityAccessAuth, EntityAccessReceipt, EntityPermission,
    EntityType as AccessEntityType,
};
use entity_access::domain::ports::EntityAccessService;
use models_permissions::share_permission::access_level::AccessLevel;
use models_properties::EntityType as StorageEntityType;
use sqlx::{Pool, Postgres};
use uuid::Uuid;

use super::permission_queries;
use crate::domain::model::{EditReceipt, ViewReceipt};
use crate::domain::ports::PermissionService;

/// Permission service implementation using database.
pub struct PermissionServiceImpl<Svc> {
    db: Pool<Postgres>,
    entity_access_service: Arc<Svc>,
}

impl<Svc: EntityAccessService> PermissionServiceImpl<Svc> {
    pub fn new(db: Pool<Postgres>, entity_access_service: Arc<Svc>) -> Self {
        Self {
            db,
            entity_access_service,
        }
    }

    /// Gets the user's access level for an entity, including the thread
    /// ownership fallback for owned threads where permission records were
    /// never created.
    async fn get_access_level(
        &self,
        user_id: Option<&MacroUserIdStr<'_>>,
        entity_id: &str,
        entity_type: AccessEntityType,
    ) -> anyhow::Result<Option<AccessLevel>> {
        if entity_type == AccessEntityType::User {
            tracing::warn!("property operations not supported for this entity type");
            anyhow::bail!("Unsupported entity type");
        }
        let user_id_ref = user_id.map(std::ops::Deref::deref);

        let access_level = self
            .entity_access_service
            .get_access_level(user_id_ref, entity_id, entity_type)
            .await
            .map_err(|e: AccessError| {
                tracing::error!(
                    error = ?e,
                    "failed to get user access level"
                );
                anyhow::anyhow!("Failed to get user access level: {}", e)
            })?;

        // Fallback for threads: check ownership via link_id if no permission records exist.
        // This handles owned threads where EmailThreadPermission/UserItemAccess were never created.
        if access_level.is_none()
            && entity_type == AccessEntityType::EmailThread
            && let Some(user_id) = user_id
            && let Ok(thread_id) = Uuid::parse_str(entity_id)
        {
            match permission_queries::get_macro_id_from_thread_id(&self.db, thread_id).await {
                Ok(Some(owner_id)) if owner_id == user_id.as_ref() => {
                    tracing::debug!("user owns thread via link_id, granting owner access");
                    return Ok(Some(AccessLevel::Owner));
                }
                Ok(_) => {}
                Err(e) => {
                    tracing::error!(
                        error = ?e,
                        thread_id = %thread_id,
                        "failed to look up thread owner for permission fallback"
                    );
                }
            }
        }

        Ok(access_level)
    }
}

/// The auth an authenticated or anonymous caller mints receipts under.
fn caller_auth(user_id: Option<&MacroUserIdStr<'_>>) -> EntityAccessAuth {
    match user_id {
        Some(user_id) => EntityAccessAuth::Authenticated(user_id.copied().into_owned()),
        None => EntityAccessAuth::Unauthenticated,
    }
}

fn storage_entity_type(entity_type: AccessEntityType) -> anyhow::Result<StorageEntityType> {
    crate::domain::model::storage_entity_type(entity_type)
        .ok_or_else(|| anyhow::anyhow!("Unsupported property target type"))
}

fn access_receipt<T: entity_access::domain::models::RequiredPermission>(
    auth: EntityAccessAuth,
    entity_id: &str,
    entity_type: AccessEntityType,
    access_level: AccessLevel,
) -> Result<EntityAccessReceipt<T>, AccessError> {
    EntityAccessReceipt::try_new(
        auth,
        Entity {
            entity_id: entity_id.to_string(),
            entity_type,
        },
        EntityPermission::AccessLevel { access_level },
    )
}

impl<Svc: EntityAccessService> PermissionService for PermissionServiceImpl<Svc> {
    type Err = anyhow::Error;

    #[tracing::instrument(skip(self), fields(user_id = ?user_id, entity_id = %entity_id, entity_type = ?entity_type), err)]
    async fn mint_view_receipt<'a>(
        &self,
        user_id: Option<&'a MacroUserIdStr<'a>>,
        entity_id: &str,
        entity_type: AccessEntityType,
    ) -> Result<ViewReceipt, Self::Err> {
        // Check if entity is deleted: the owner always has access, and deleted
        // entities are only visible to their owner.
        match entity_type {
            AccessEntityType::Call
            | AccessEntityType::Channel
            | AccessEntityType::CrmCompany
            | AccessEntityType::User
            | AccessEntityType::EmailThread => {}
            _ => {
                let (owner, deleted) = permission_queries::get_owner_and_deleted(
                    &self.db,
                    entity_id,
                    storage_entity_type(entity_type)?,
                )
                .await?;

                // If you are the owner fast return
                if user_id.is_some_and(|u| owner == u.as_ref()) {
                    return Ok(access_receipt(
                        caller_auth(user_id),
                        entity_id,
                        entity_type,
                        AccessLevel::Owner,
                    )?);
                }

                // If the item is deleted and you aren't the owner you are unauthorized
                if deleted {
                    anyhow::bail!("Access denied");
                }
            }
        }

        match self
            .get_access_level(user_id, entity_id, entity_type)
            .await?
        {
            // Any access level is sufficient for viewing
            Some(access_level) => Ok(access_receipt(
                caller_auth(user_id),
                entity_id,
                entity_type,
                access_level,
            )?),
            None => anyhow::bail!("Access denied"),
        }
    }

    #[tracing::instrument(skip(self), fields(user_id = %user_id, entity_id = %entity_id, entity_type = ?entity_type), err)]
    async fn mint_edit_receipt<'a>(
        &self,
        user_id: &MacroUserIdStr<'a>,
        entity_id: &str,
        entity_type: AccessEntityType,
    ) -> Result<EditReceipt, Self::Err> {
        match self
            .get_access_level(Some(user_id), entity_id, entity_type)
            .await?
        {
            Some(access_level @ (AccessLevel::Edit | AccessLevel::Owner)) => Ok(access_receipt(
                caller_auth(Some(user_id)),
                entity_id,
                entity_type,
                access_level,
            )?),
            Some(_) | None => anyhow::bail!("Access denied"),
        }
    }

    #[tracing::instrument(skip(self), fields(task_id = %task_id, user_count = user_ids.len()), err)]
    async fn grant_permissions_to_task(
        &self,
        user_ids: &[MacroUserIdStr<'_>],
        task_id: &str,
    ) -> Result<(), Self::Err> {
        if user_ids.is_empty() {
            return Ok(());
        }

        // Grant edit permissions to all users
        entity_access_db_utils::upsert_user_entity_access_bulk(
            &self.db,
            user_ids,
            &macro_uuid::string_to_uuid(task_id).unwrap(),
            model_entity::EntityType::Document,
            AccessLevel::Edit,
        )
        .await?;

        Ok(())
    }

    #[tracing::instrument(skip(self), fields(task_id = %task_id, user_count = user_ids.len()), err)]
    async fn revoke_permissions_from_task(
        &self,
        user_ids: &[MacroUserIdStr<'_>],
        task_id: &str,
    ) -> Result<(), Self::Err> {
        if user_ids.is_empty() {
            return Ok(());
        }

        // Named users only. Remaining assignees and the owner row stay: this
        // is a membership revoke, not a public-to-private sweep.
        let conation_ids: Vec<String> = user_ids.iter().map(|s| s.to_string()).collect();
        sqlx::query(
            r#"
            DELETE FROM entity_access
            WHERE entity_id = $1
              AND entity_type = $2
              AND source_type = 'user'
              AND source_id = ANY($3)
              AND access_level = 'edit'
              AND granted_from_project_id IS NULL
            "#,
        )
        .bind(macro_uuid::string_to_uuid(task_id).unwrap())
        .bind(model_entity::EntityType::Document.as_ref())
        .bind(conation_ids.as_slice())
        .execute(&self.db)
        .await?;

        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use std::sync::Arc;

    use conation_db_migrator::MACRO_DB_MIGRATIONS;
    use macro_user_id::user_id::MacroUserIdStr;
    use entity_access::domain::ports::NoOpEntityAccessService;
    use entity_access_db_utils::AccessLevel;
    use sqlx::{Pool, Postgres, Row as _};
    use uuid::Uuid;

    use super::PermissionServiceImpl;
    use crate::domain::ports::PermissionService;

    fn user(email: &str) -> MacroUserIdStr<'static> {
        MacroUserIdStr::try_from_email(email).unwrap()
    }

    async fn insert_direct_user_grant(
        pool: &Pool<Postgres>,
        entity_id: &Uuid,
        source_id: &str,
        access_level: AccessLevel,
    ) {
        sqlx::query(
            r#"
            INSERT INTO entity_access (
                entity_id,
                entity_type,
                source_id,
                source_type,
                access_level
            )
            VALUES ($1, $2, $3, 'user', $4)
            "#,
        )
        .bind(entity_id)
        .bind(model_entity::EntityType::Document.as_ref())
        .bind(source_id)
        .bind(access_level)
        .execute(pool)
        .await
        .unwrap();
    }

    async fn grant_source_ids(pool: &Pool<Postgres>, entity_id: &Uuid) -> Vec<(String, String)> {
        sqlx::query(
            r#"
            SELECT source_id, access_level::text AS access_level
            FROM entity_access
            WHERE entity_id = $1 AND entity_type = $2
            ORDER BY source_id, access_level::text
            "#,
        )
        .bind(entity_id)
        .bind(model_entity::EntityType::Document.as_ref())
        .map(|row: sqlx::postgres::PgRow| {
            (
                row.get::<String, _>("source_id"),
                row.get::<String, _>("access_level"),
            )
        })
        .fetch_all(pool)
        .await
        .unwrap()
    }

    #[sqlx::test(migrator = "MACRO_DB_MIGRATIONS")]
    async fn unassign_one_assignee_keeps_remaining_assignees_and_owner(pool: Pool<Postgres>) {
        let task_id = Uuid::from_u128(0xaaa1);
        let owner = user("owner@macro.com");
        let remaining = user("alice@macro.com");
        let removed = user("bob@macro.com");
        let viewer = user("viewer@macro.com");

        insert_direct_user_grant(&pool, &task_id, owner.as_ref(), AccessLevel::Owner).await;
        insert_direct_user_grant(&pool, &task_id, remaining.as_ref(), AccessLevel::Edit).await;
        insert_direct_user_grant(&pool, &task_id, removed.as_ref(), AccessLevel::Edit).await;
        insert_direct_user_grant(&pool, &task_id, viewer.as_ref(), AccessLevel::View).await;

        let service = PermissionServiceImpl::new(pool.clone(), Arc::new(NoOpEntityAccessService));
        service
            .revoke_permissions_from_task(&[removed.clone()], &task_id.to_string())
            .await
            .unwrap();

        assert_eq!(
            grant_source_ids(&pool, &task_id).await,
            vec![
                (remaining.as_ref().to_string(), "edit".to_string()),
                (owner.as_ref().to_string(), "owner".to_string()),
                (viewer.as_ref().to_string(), "view".to_string()),
            ]
        );
    }
}
