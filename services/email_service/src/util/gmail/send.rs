use crate::outbound::email_api::GmailApi;
use crate::util::upload_attachment::checked_attachment_total;
use anyhow::Context;
use models_email::service::attachment::{AttachmentDraft, AttachmentToSend};
use models_email::service::link::Link;
use models_email::service::message;
use sqlx::PgPool;
use uuid::Uuid;

/// Generate email headers that are used for threading
pub async fn generate_email_threading_headers(
    db: &PgPool,
    replying_to_db_id: Option<Uuid>,
    link_id: Uuid,
) -> (Option<String>, Option<Vec<String>>) {
    if let Some(replying_to_db_id) = replying_to_db_id {
        // Fetch headers from the parent message
        let (parent_id_header, parent_references_header) =
            email_db_client::messages::get::get_message_threading_headers(
                db,
                replying_to_db_id,
                link_id,
            )
                .await
                .unwrap_or_else(|e| {
                    tracing::warn!(error=?e, replying_to_db_id=?replying_to_db_id, "Unable to fetch threading headers for parent message");
                    (None, None) // Default to None on error
                });

        // Clean references header
        let mut references_list: Vec<String> = parent_references_header
            .map(|refs_str| {
                refs_str
                    .replace(['<', '>'], "")
                    .split_whitespace()
                    .map(String::from)
                    .collect()
            })
            .unwrap_or_default();

        // The message we are replying to will always be the last id in the References header
        if let Some(id) = &parent_id_header {
            references_list.push(id.clone());
        }

        let final_references = if references_list.is_empty() {
            None
        } else {
            Some(references_list)
        };

        (parent_id_header, final_references)
    } else {
        // If there is no message to reply to
        (None, None)
    }
}

/// Fetch any attachments the user previously added to the draft from s3 and attach them to the message
/// being sent. Return the attachment metadata so we can use it to delete the attachments from s3
/// after the message is sent.
#[tracing::instrument(
    skip(db, s3_client, message_to_send),
    fields(message_db_id = ?message_to_send.db_id)
)]
pub async fn fetch_and_attach_draft_attachments(
    db: &sqlx::PgPool,
    s3_client: &s3_client::S3,
    bucket: &str,
    link: &Link,
    message_to_send: &mut message::MessageToSend,
) -> anyhow::Result<Option<Vec<AttachmentDraft>>> {
    if let Some(db_id) = message_to_send.db_id {
        let db_attachments =
            email_db_client::attachments::draft::fetch_draft_attachments_by_draft_id(
                db, link.id, db_id,
            )
            .await
            .context("unable to fetch draft attachments from database")?;

        if !db_attachments.is_empty() {
            let mut attachments_to_send = Vec::with_capacity(db_attachments.len());
            let mut total_size = 0usize;
            for db_attachment in &db_attachments {
                let stored_size = s3_client
                    .size_bytes(bucket, &db_attachment.s3_key)
                    .await?
                    .context("draft attachment is missing from object storage")?;
                anyhow::ensure!(stored_size > 0, "draft attachment is empty");
                checked_attachment_total(total_size, stored_size as usize)?;
                let attachment_data = s3_client
                    .get(bucket, &db_attachment.s3_key)
                    .await
                    .with_context(|| {
                        format!(
                            "Failed to fetch attachment from S3 (key: {})",
                            db_attachment.s3_key
                        )
                    })?;
                total_size = checked_attachment_total(total_size, attachment_data.len())?;
                attachments_to_send.push(AttachmentToSend {
                    file_name: db_attachment.file_name.clone(),
                    content_type: db_attachment.content_type.clone(),
                    data: attachment_data,
                });
            }

            message_to_send.attachments = Some(attachments_to_send);
            return Ok(Some(db_attachments));
        }
    }
    Ok(None)
}

/// Fetch forwarded attachments from Gmail and attach them to the message being sent.
/// Forwarded attachments reference original Gmail attachments, so their data is fetched
/// from Gmail at send time rather than from S3.
#[tracing::instrument(
    skip(db, email_api, message_to_send),
    fields(message_db_id = ?message_to_send.db_id), err
)]
pub async fn fetch_and_attach_forwarded_attachments(
    db: &PgPool,
    email_api: &GmailApi,
    link: &Link,
    message_to_send: &mut message::MessageToSend,
) -> anyhow::Result<()> {
    let Some(db_id) = message_to_send.db_id else {
        return Ok(());
    };

    let fwd_attachments =
        email_db_client::attachments::forwarded::fetch_forwarded_attachments_by_draft_id(
            db, link.id, db_id,
        )
        .await
        .context("unable to fetch forwarded attachments from database")?;

    if fwd_attachments.is_empty() {
        return Ok(());
    }

    let mut total_size = message_to_send
        .attachments
        .as_ref()
        .map(|attachments| {
            attachments.iter().try_fold(0usize, |total, item| {
                checked_attachment_total(total, item.data.len())
            })
        })
        .transpose()?
        .unwrap_or(0usize);
    let mut forwarded_to_send = Vec::with_capacity(fwd_attachments.len());
    for fwd_att in &fwd_attachments {
        let provider_att_id = fwd_att
            .provider_attachment_id
            .as_deref()
            .unwrap_or_default();
        let data = email_api
            .get_attachment(link.id, &fwd_att.message_provider_id, provider_att_id)
            .await
            .with_context(|| {
                format!(
                    "Failed to fetch forwarded attachment from Gmail (message: {}, attachment: {:?})",
                    fwd_att.message_provider_id, fwd_att.provider_attachment_id
                )
            })?;
        total_size = checked_attachment_total(total_size, data.len())?;
        forwarded_to_send.push(AttachmentToSend {
            file_name: fwd_att.filename.clone().unwrap_or_default(),
            content_type: fwd_att
                .mime_type
                .clone()
                .unwrap_or_else(|| "application/octet-stream".to_string()),
            data,
        });
    }

    match &mut message_to_send.attachments {
        Some(existing) => existing.extend(forwarded_to_send),
        None => message_to_send.attachments = Some(forwarded_to_send),
    }

    Ok(())
}

#[tracing::instrument(skip(db, s3_client))]
pub async fn cleanup_draft_attachments(
    db: sqlx::PgPool,
    s3_client: &s3_client::S3,
    bucket: String,
    link_id: Uuid,
    draft_id: Uuid,
    attachments: Vec<AttachmentDraft>,
) {
    for attachment in attachments {
        // Delete from S3
        if let Err(e) = s3_client.delete(&bucket, &attachment.s3_key).await {
            tracing::error!(
                error = ?e,
                s3_key = %attachment.s3_key,
                    "Failed to delete draft attachment from S3 during cleanup; skipping database deletion"
            );
            continue;
        }

        // Delete from DB
        if let Err(e) = email_db_client::attachments::draft::delete_draft_attachment(
            &db,
            link_id,
            draft_id,
            attachment.id,
        )
        .await
        {
            tracing::error!(
                error = ?e,
                attachment_id = attachment.id.to_string(),
                draft_id = draft_id.to_string(),
                "Failed to delete draft attachment from database during cleanup"
            );
        }
    }
}
