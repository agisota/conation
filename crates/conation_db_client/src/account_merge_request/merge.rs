/// Merges to_merge_conation_user_id into conation_user_id
/// This transaction is not committed and will need to be manually committed by the caller
#[tracing::instrument(skip(transaction))]
pub async fn merge_accounts(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    conation_user_id: &str,
    to_merge_conation_user_id: &str,
) -> anyhow::Result<()> {
    let conation_user_id = conation_uuid::string_to_uuid(conation_user_id)?;
    let to_merge_conation_user_id = conation_uuid::string_to_uuid(to_merge_conation_user_id)?;

    // Update the user profiles to point to the new macro user id
    sqlx::query!(
        r#"
        UPDATE "User" SET "conation_user_id" = $1 WHERE "conation_user_id" = $2
        "#,
        &conation_user_id,
        &to_merge_conation_user_id
    )
    .execute(transaction.as_mut())
    .await?;

    // Update conation_user_email_verification
    sqlx::query!(
        r#"
        UPDATE "conation_user_email_verification" SET "conation_user_id" = $1 WHERE "conation_user_id" = $2
        "#,
        &conation_user_id,
        &to_merge_conation_user_id
    )
    .execute(transaction.as_mut())
    .await?;

    // Delete the old macro user
    sqlx::query!(
        r#"
        DELETE FROM "conation_user" WHERE "id" = $1
        "#,
        &to_merge_conation_user_id
    )
    .execute(transaction.as_mut())
    .await?;

    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::{Pool, Postgres};

    #[sqlx::test(fixtures(path = "../../fixtures", scripts("account_merge_request")))]
    async fn test_merge_accounts(pool: Pool<Postgres>) -> anyhow::Result<()> {
        let mut transaction = pool.begin().await?;

        merge_accounts(
            &mut transaction,
            "11111111-1111-1111-1111-111111111111",
            "22222222-2222-2222-2222-222222222222",
        )
        .await?;

        transaction.commit().await?;

        // User should be moved
        let result = sqlx::query!(
            r#"
            SELECT "conation_user_id" as "conation_user_id!" FROM "User" WHERE "conation_user_id" = $1 AND "id" = $2
            "#,
            conation_uuid::string_to_uuid("11111111-1111-1111-1111-111111111111")?,
            "macro|test2@macro.com",
        )
        .map(|row| row.conation_user_id)
        .fetch_one(&pool)
        .await?;

        assert_eq!(
            result.to_string(),
            "11111111-1111-1111-1111-111111111111".to_string()
        );

        Ok(())
    }
}
