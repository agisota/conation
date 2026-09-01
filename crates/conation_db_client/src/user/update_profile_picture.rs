use std::collections::HashMap;

use model::user::{ProfilePictures, UserProfilePicture};

#[tracing::instrument(skip(db))]
pub async fn update_profile_picture(
    db: &sqlx::PgPool,
    conation_user_id: &str,
    picture: &str,
    checksum: &str,
) -> anyhow::Result<()> {
    let conation_user_id = conation_uuid::string_to_uuid(conation_user_id)?;

    sqlx::query!(
        r#"
        INSERT INTO conation_user_info (conation_user_id, profile_picture, profile_picture_hash)
        VALUES ($1, $2, $3)
        ON CONFLICT (conation_user_id)
        DO UPDATE SET 
            profile_picture = EXCLUDED.profile_picture,
            profile_picture_hash = EXCLUDED.profile_picture_hash
    "#,
        conation_user_id,
        picture,
        checksum
    )
    .execute(db)
    .await?;

    Ok(())
}

/// Given a list of user profile ids (from "Users" table), return a list of profile pictures
#[tracing::instrument(skip(db))]
pub async fn get_profile_pictures(
    db: &sqlx::PgPool,
    user_profile_ids_list: &Vec<String>,
) -> anyhow::Result<ProfilePictures> {
    if user_profile_ids_list.is_empty() {
        return Ok(ProfilePictures::default());
    }

    let conation_user_id_list: Vec<(String, uuid::Uuid)> = sqlx::query!(
        r#"
        SELECT 
            u.id as user_profile_id, 
            mu.id as conation_user_id
        FROM conation_user mu
        JOIN "User" u ON mu.id = u.conation_user_id
        WHERE u.id = ANY($1)
        "#,
        user_profile_ids_list
    )
    .map(|row| (row.user_profile_id, row.conation_user_id))
    .fetch_all(db)
    .await?;

    let conation_user_id_list: HashMap<uuid::Uuid, String> = conation_user_id_list
        .into_iter()
        .map(|(id, conation_user_id)| (conation_user_id, id))
        .collect();

    let conation_user_ids: Vec<uuid::Uuid> = conation_user_id_list.keys().copied().collect();

    let pictures: Vec<(uuid::Uuid, String, Option<String>)> = sqlx::query!(
        r#"
        SELECT conation_user_id, profile_picture as "profile_picture!", profile_picture_hash FROM conation_user_info
        WHERE conation_user_id = ANY($1) and profile_picture IS NOT NULL
        "#,
        &conation_user_ids
    )
    .map(|row| (row.conation_user_id, row.profile_picture, row.profile_picture_hash))
    .fetch_all(db)
    .await?;

    let result: Vec<UserProfilePicture> = pictures
        .into_iter()
        .filter_map(|(conation_user_id, url, checksum)| {
            conation_user_id_list
            .get(&conation_user_id)
            .map(|user_id| UserProfilePicture {
                id: user_id.to_string(),
                url,
                checksum,
            })
            .or_else(|| {
                tracing::warn!(conation_user_id=?conation_user_id, "user_id not found for conation_user_id");
                None
            })
        })
        .collect();

    Ok(ProfilePictures { pictures: result })
}
