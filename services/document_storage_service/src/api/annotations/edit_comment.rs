use std::sync::Arc;

use crate::{
    api::annotations::CommentNotifContext,
    api::context::{AuthorizationService, EntityAccessService},
    service::conn_gateway::update_live_comment_state,
};
use axum::{
    Json,
    extract::{Path, State},
    http::StatusCode,
    response::{IntoResponse, Response},
};
use conation_authorization::{MacroAuthorizationExtractor, UserOrInternal, UserOrInternalCaller};
use conation_db_client::annotations::edit_comment::edit_document_comment;
use conation_db_client::annotations::get::get_comment_thread;
use macro_user_id::user_id::MacroUserIdStr;
use connection_gateway_client::ConnectionGatewayClient;
use entity_access::domain::ports::EntityAccessService as _;
use entity_access::inbound::axum_extractors::ExtractorError;
use model::{
    annotations::{
        AnnotationIncrementalUpdate, Mentions,
        edit::{EditCommentRequest, EditCommentResponse},
    },
    response::ErrorResponse,
};
use model_entity::EntityType;
use model_notifications::NotificationDocumentSubType;
use models_permissions::share_permission::access_level::CommentAccessLevel;
use notification::domain::service::NotificationIngress;
use sqlx::PgPool;

use super::comment_error_response;

#[derive(serde::Deserialize)]
pub struct Params {
    pub comment_id: i64,
}

/// Edits a single comment for a document
#[utoipa::path(
        patch,
        path = "/annotations/comments/comment/{comment_id}",
        params(
            ("comment_id" = i64, Path, description = "The comment id")
        ),
        operation_id = "edit_comment",
        responses(
            (status = 200, body=EditCommentResponse),
            (status = 401, body=ErrorResponse),
            (status = 404, body=ErrorResponse),
            (status = 500, body=ErrorResponse),
        )
    )]
#[axum::debug_handler(state = crate::api::context::ApiContext)]
pub async fn edit_comment_handler(
    State(db): State<PgPool>,
    State(notification_ingress_service): State<Arc<crate::api::context::NotificationIngressType>>,
    State(conn_gateway_client): State<Arc<ConnectionGatewayClient>>,
    State(entity_access_service): State<Arc<EntityAccessService>>,
    user: MacroAuthorizationExtractor<AuthorizationService, UserOrInternal>,
    Path(Params { comment_id }): Path<Params>,
    Json(req): Json<EditCommentRequest>,
) -> Result<Response, Response> {
    let user_id = user.authorization.user.macro_user_id.to_string();

    if user.authorization.caller != UserOrInternalCaller::Internal {
        let thread = get_comment_thread(&db, req.thread_id)
            .await
            .map_err(|err| {
                tracing::error!(error=?err, "failed to look up comment thread");
                (
                    StatusCode::INTERNAL_SERVER_ERROR,
                    Json(ErrorResponse {
                        message: "Error editing comment".into(),
                    }),
                )
                    .into_response()
            })?
            .ok_or_else(|| {
                (
                    StatusCode::NOT_FOUND,
                    Json(ErrorResponse {
                        message: "Comment not found".into(),
                    }),
                )
                    .into_response()
            })?;

        if !thread
            .comments
            .iter()
            .any(|comment| comment.comment_id == comment_id)
        {
            return Err((
                StatusCode::NOT_FOUND,
                Json(ErrorResponse {
                    message: "Comment not found".into(),
                }),
            )
                .into_response());
        }

        let organization_id = user
            .authorization
            .user
            .user_context
            .organization_id
            .map(i64::from);

        let _comment_access = entity_access_service
            .generate_entity_access_receipt::<CommentAccessLevel>(
                &user.authorization.user.macro_user_id,
                organization_id,
                &thread.thread.document_id,
                EntityType::Document,
            )
            .await
            .map_err(|err| ExtractorError::from(err).into_response())?;
    }

    match edit_document_comment(&db, comment_id, &user_id, &req).await {
        Ok(res) => {
            if let Some(Mentions { users, mention_id }) = req.mentions {
                let sender_profile_picture_url =
                    conation_db_client::user::update_profile_picture::get_profile_pictures(
                        &db,
                        &vec![user_id.clone()],
                    )
                    .await
                    .ok()
                    .and_then(|pics| pics.pictures.into_iter().next().map(|p| p.url));

                // Only mention notifications on edit — no thread-reply or document-owner
                // notifications, since edits shouldn't re-notify participants.
                let notif_ctx = CommentNotifContext {
                    text: req.text.clone().unwrap_or_default(),
                    comment_id: res.comment.comment_id,
                    thread_id: req.thread_id,
                    document_name: res.document_name.clone(),
                    document_id: res.document_id.to_string(),
                    owner: res.document_owner.clone(),
                    file_type: res.file_type.clone(),
                    sub_type: res.sub_type.map(|sub_type| match sub_type {
                        document_sub_type::DocumentSubType::Task => {
                            NotificationDocumentSubType::Task
                        }
                        document_sub_type::DocumentSubType::Snippet => {
                            NotificationDocumentSubType::Snippet
                        }
                        document_sub_type::DocumentSubType::Skill => {
                            NotificationDocumentSubType::Skill
                        }
                        document_sub_type::DocumentSubType::InitiativeDescription => {
                            NotificationDocumentSubType::InitiativeDescription
                        }
                    }),
                    sender_id: user_id.clone().try_into().ok(),
                    sender_profile_picture_url,
                };

                let recipient_ids: std::collections::HashSet<MacroUserIdStr<'static>> = users
                    .iter()
                    .filter_map(|id| MacroUserIdStr::try_from(id.clone()).ok())
                    .collect();

                // If the document is link-shared, grant the mentioned users access
                // so the comment surfaces in their soup/inbox — a notification alone
                // isn't enough for the document to appear there.
                let mention_recipients: Vec<MacroUserIdStr<'_>> =
                    recipient_ids.iter().cloned().collect();

                let _ = conation_db_client::share_on_mention::share_link_shared_document_with_mentioned_users(
                    &db,
                    &res.document_id,
                    &mention_recipients,
                )
                .await
                .inspect_err(|e| tracing::error!(error =? e, "couldn't share link-shared document with mentioned users"));

                let request = notif_ctx
                    .build_mention_notif(recipient_ids, &mention_id)
                    .into_request()
                    .with_apns()
                    .with_conn_gateway();

                _ = notification_ingress_service
                    .send_notification(request)
                    .await
                    .inspect_err(|e| tracing::error!(error =? e, "couldn't send document mention notification"));
            }
            update_live_comment_state(
                &conn_gateway_client,
                &res.document_id,
                AnnotationIncrementalUpdate::EditComment {
                    sender: &user_id,
                    document_id: &res.document_id,
                    response: &res,
                },
            )
            .await;
            Ok((StatusCode::OK, Json(res)).into_response())
        }
        Err(e) => comment_error_response(e, "Error editing comment"),
    }
}
