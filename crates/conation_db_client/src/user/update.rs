pub async fn upsert_conation_user_id(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    user_id: &str,
    conation_user_id: &str,
) -> anyhow::Result<()> {
    let conation_user_id = conation_uuid::string_to_uuid(conation_user_id)?;

    sqlx::query!(
        r#"
        UPDATE "User"
        SET conation_user_id = $2
        WHERE id = $1
        "#,
        user_id,
        &conation_user_id,
    )
    .execute(transaction.as_mut())
    .await?;

    Ok(())
}

#[derive(Debug, serde::Serialize, serde::Deserialize)]
struct UserProfileInfo {
    pub industry: Option<String>,
    pub title: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub profile_picture: Option<String>,
    pub profile_picture_hash: Option<String>,
}

pub async fn migrate_conation_user_info(
    transaction: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    fusionauth_user_id: &str,
    user_id: &str,
) -> anyhow::Result<()> {
    let fusionauth_user_id = conation_uuid::string_to_uuid(fusionauth_user_id)?;

    // Get the current user profile info
    // Upsert to conation_user_info table
    // On conflict, do nothing
    //
    let user_profile_info: UserProfileInfo = sqlx::query_as!(
        UserProfileInfo,
        r#"
        SELECT
            industry,
            title,
            "firstName" as first_name,
            "lastName" as last_name,
            "profilePicture" as profile_picture,
            "profilePictureHash" as profile_picture_hash
        FROM "User"
        WHERE id = $1
        "#,
        user_id
    )
    .fetch_one(transaction.as_mut())
    .await?;

    sqlx::query!(
        r#"
        INSERT INTO conation_user_info (conation_user_id, industry, title, first_name, last_name, profile_picture, profile_picture_hash)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (conation_user_id) DO NOTHING
        "#,
        &fusionauth_user_id,
        user_profile_info.industry,
        user_profile_info.title,
        user_profile_info.first_name,
        user_profile_info.last_name,
        user_profile_info.profile_picture,
        user_profile_info.profile_picture_hash,
    )
    .execute(transaction.as_mut())
    .await?;

    Ok(())
}
