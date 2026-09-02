use conation_user_id::user_id::MacroUserIdStr;
use opensearch_client::OpensearchClient;

#[tracing::instrument(skip(opensearch_client))]
pub async fn remove_user_profile(
    opensearch_client: &OpensearchClient,
    user_profile_id: &str,
) -> anyhow::Result<()> {
    MacroUserIdStr::parse_from_str(user_profile_id)
        .map_err(|error| anyhow::anyhow!("invalid Conation user id: {error}"))?;

    // Delete documents of user
    opensearch_client
        .delete_documents_by_owner_id(user_profile_id)
        .await?;

    // Delete chats of user
    opensearch_client
        .delete_chat_by_user_id(user_profile_id)
        .await?;

    // Delete emails of user
    opensearch_client
        .delete_email_messages_by_user_id(user_profile_id)
        .await?;

    Ok(())
}
