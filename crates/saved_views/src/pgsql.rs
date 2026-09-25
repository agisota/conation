use crate::{
    ExcludedDefaultView, View,
    storage::{ExcludedDefaultViewStorage, ViewPatch, ViewStorage},
};
use sqlx::PgPool;
use uuid::Uuid;

pub struct PgViewStorage {
    pool: PgPool,
}

impl PgViewStorage {
    pub fn new(pool: PgPool) -> Self {
        Self { pool }
    }
}

impl ViewStorage for PgViewStorage {
    type Err = sqlx::Error;

    #[tracing::instrument(skip(self), err)]
    async fn create_view(&self, view: &View) -> Result<(), Self::Err> {
        sqlx::query!(
            "INSERT INTO saved_view (id, user_id, name, config, created_at, updated_at) 
             VALUES ($1, $2, $3, $4, $5, $6)",
            view.id,
            view.user_id,
            view.name,
            view.config,
            view.created_at,
            view.updated_at
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    #[tracing::instrument(skip(self, view), err)]
    async fn upsert_personal_dashboard(
        &self,
        view: &View,
        expected_revision: i64,
    ) -> Result<Option<View>, Self::Err> {
        sqlx::query_as!(
            View,
            r#"
            WITH updated AS (
                UPDATE saved_view
                SET name = $3, config = $4, updated_at = NOW()
                WHERE user_id = $2 AND config->>'kind' = 'dashboard'
                  AND config->>'id' = 'dashboard:personal'
                  AND COALESCE((config->>'revision')::bigint, 0) = $7::bigint
                RETURNING id, user_id, name, config, created_at, updated_at
            ), inserted AS (
                INSERT INTO saved_view (id, user_id, name, config, created_at, updated_at)
                SELECT $1, $2, $3, $4, $5, $6
                WHERE $7::bigint = 0 AND NOT EXISTS (SELECT 1 FROM updated)
                ON CONFLICT (user_id) WHERE config->>'kind' = 'dashboard'
                    AND config->>'id' = 'dashboard:personal' DO NOTHING
                RETURNING id, user_id, name, config, created_at, updated_at
            )
            SELECT id AS "id!", user_id AS "user_id!", name AS "name!",
                config AS "config!", created_at AS "created_at!", updated_at AS "updated_at!"
            FROM (SELECT * FROM updated UNION ALL SELECT * FROM inserted) saved
            "#,
            view.id,
            view.user_id,
            view.name,
            view.config,
            view.created_at,
            view.updated_at,
            expected_revision
        )
        .fetch_optional(&self.pool)
        .await
    }

    #[tracing::instrument(skip(self), err)]
    async fn get_views_for_user(&self, user_id: &str) -> Result<Vec<View>, Self::Err> {
        sqlx::query_as!(
            View,
            "SELECT id, user_id, name, config, created_at, updated_at FROM saved_view WHERE user_id = $1",
            user_id
        )
        .fetch_all(&self.pool)
        .await
    }

    #[tracing::instrument(skip(self, patch), err)]
    async fn patch_view(&self, id: Uuid, user_id: &str, patch: ViewPatch) -> Result<bool, Self::Err> {
        let result = sqlx::query!(
            r#"
            UPDATE saved_view
            SET name = COALESCE($3, name),
                config = CASE WHEN $4::jsonb IS NOT NULL THEN config || $4 ELSE config END,
                updated_at = NOW()
            WHERE id = $1 AND user_id = $2
              AND config->>'kind' IS DISTINCT FROM 'dashboard'
              AND config->>'id' IS DISTINCT FROM 'dashboard:personal'
              AND (config || COALESCE($4::jsonb, '{}'::jsonb))->>'kind'
                  IS DISTINCT FROM 'dashboard'
              AND (config || COALESCE($4::jsonb, '{}'::jsonb))->>'id'
                  IS DISTINCT FROM 'dashboard:personal'
            "#,
            id,
            user_id,
            patch.name,
            patch.config as Option<serde_json::Value>
        )
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }

    #[tracing::instrument(skip(self), err)]
    async fn delete_view(&self, id: Uuid, user_id: &str) -> Result<bool, Self::Err> {
        let result = sqlx::query(
            "DELETE FROM saved_view WHERE id = $1 AND user_id = $2
             AND config->>'kind' IS DISTINCT FROM 'dashboard'
             AND config->>'id' IS DISTINCT FROM 'dashboard:personal'",
        )
        .bind(id)
        .bind(user_id)
        .execute(&self.pool)
        .await?;
        Ok(result.rows_affected() == 1)
    }
}

impl ExcludedDefaultViewStorage for PgViewStorage {
    type Err = sqlx::Error;

    #[tracing::instrument(skip(self), err)]
    async fn create_excluded_default_view(
        &self,
        view: ExcludedDefaultView,
    ) -> Result<(), Self::Err> {
        sqlx::query!(
            "INSERT INTO excluded_default_view (id, user_id, default_view_id) 
         VALUES ($1, $2, $3)",
            view.id,
            view.user_id,
            view.default_view_id
        )
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    async fn get_excluded_default_views_for_user(
        &self,
        user_id: &str,
    ) -> Result<Vec<ExcludedDefaultView>, Self::Err> {
        sqlx::query_as!(
            ExcludedDefaultView,
            "SELECT id, user_id, default_view_id FROM excluded_default_view WHERE user_id = $1",
            user_id
        )
        .fetch_all(&self.pool)
        .await
    }
}

#[cfg(test)]
mod test;
