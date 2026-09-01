//! Directed links between conation_ids. Used by multi-inbox so a primary macro user can
//! read another macro user's inbox without merging identities. Each edge is scoped to
//! a single `email_links` row via `link_id` — it grants exactly that inbox, never
//! links the child connects later.

use sqlx::types::Uuid;
use sqlx::{Executor, Pool, Postgres};

#[cfg(test)]
mod test;

/// Insert an edge granting `primary` access to the child's `link_id` inbox.
/// Idempotent: if the edge already exists the conflict is swallowed.
#[tracing::instrument(skip(db), err)]
pub async fn insert_edge<'e, E>(
    db: E,
    primary_conation_id: &str,
    child_conation_id: &str,
    link_id: Uuid,
) -> anyhow::Result<()>
where
    E: Executor<'e, Database = Postgres>,
{
    sqlx::query!(
        r#"
            INSERT INTO conation_user_links (primary_conation_id, child_conation_id, link_id)
            VALUES ($1, $2, $3)
            ON CONFLICT (primary_conation_id, child_conation_id, link_id) DO NOTHING
        "#,
        primary_conation_id,
        child_conation_id,
        link_id,
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Remove the edge granting `primary` access to the child's `link_id` inbox.
/// No-op if the edge does not exist.
#[tracing::instrument(skip(db), err)]
pub async fn delete_edge(
    db: &Pool<Postgres>,
    primary_conation_id: &str,
    child_conation_id: &str,
    link_id: Uuid,
) -> anyhow::Result<()> {
    sqlx::query!(
        r#"
            DELETE FROM conation_user_links
            WHERE primary_conation_id = $1
              AND child_conation_id = $2
              AND link_id = $3
        "#,
        primary_conation_id,
        child_conation_id,
        link_id,
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Returns whether the edge granting `primary` access to the child's `link_id`
/// inbox exists. Used to authorize a primary macro user acting on an inbox
/// delegated to them.
#[tracing::instrument(skip(db), err)]
pub async fn edge_exists(
    db: &Pool<Postgres>,
    primary_conation_id: &str,
    child_conation_id: &str,
    link_id: Uuid,
) -> anyhow::Result<bool> {
    let exists = sqlx::query_scalar!(
        r#"
            SELECT EXISTS(
                SELECT 1
                FROM conation_user_links
                WHERE primary_conation_id = $1
                  AND child_conation_id = $2
                  AND link_id = $3
            ) AS "exists!"
        "#,
        primary_conation_id,
        child_conation_id,
        link_id,
    )
    .fetch_one(db)
    .await?;

    Ok(exists)
}

/// Returns the `child_conation_id`s the given primary delegates from.
/// Used by email-service to union linked inboxes with the user's own.
#[tracing::instrument(skip(db), err)]
pub async fn children_for_primary(
    db: &Pool<Postgres>,
    primary_conation_id: &str,
) -> anyhow::Result<Vec<String>> {
    let rows = sqlx::query_scalar!(
        r#"
            SELECT DISTINCT child_conation_id
            FROM conation_user_links
            WHERE primary_conation_id = $1
        "#,
        primary_conation_id
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}

/// Returns the `primary_conation_id`s holding any delegation edge to the child,
/// regardless of which link it covers. Used to decide whether a child has
/// delegates left (e.g. the last-delegate teardown of a promoted shared mailbox).
#[tracing::instrument(skip(db), err)]
pub async fn get_primaries_for_child(
    db: &Pool<Postgres>,
    child_conation_id: &str,
) -> anyhow::Result<Vec<String>> {
    let rows = sqlx::query_scalar!(
        r#"
            SELECT DISTINCT primary_conation_id
            FROM conation_user_links
            WHERE child_conation_id = $1
        "#,
        child_conation_id
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}

/// Returns the `primary_conation_id`s delegated to read the child's `link_id` inbox.
/// Used to fan a child inbox's notifications out to every primary that can view it.
#[tracing::instrument(skip(db), err)]
pub async fn get_primaries_for_link(
    db: &Pool<Postgres>,
    child_conation_id: &str,
    link_id: Uuid,
) -> anyhow::Result<Vec<String>> {
    let rows = sqlx::query_scalar!(
        r#"
            SELECT primary_conation_id
            FROM conation_user_links
            WHERE child_conation_id = $1
              AND link_id = $2
        "#,
        child_conation_id,
        link_id,
    )
    .fetch_all(db)
    .await?;

    Ok(rows)
}
