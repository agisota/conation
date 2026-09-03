use std::sync::{Arc, Mutex};

use super::*;

#[derive(Clone, Default)]
struct RecordingGateway {
    posted: Arc<Mutex<Vec<PostedWelcomeMessage>>>,
}

struct PostedWelcomeMessage {
    actor: Sender,
    channel_id: Uuid,
    request: PostMessageRequest,
}

impl SupportChannelMessageGateway for RecordingGateway {
    async fn post_message(
        &self,
        actor: Sender,
        channel_id: Uuid,
        request: PostMessageRequest,
    ) -> Result<(), Report> {
        self.posted.lock().unwrap().push(PostedWelcomeMessage {
            actor,
            channel_id,
            request,
        });
        Ok(())
    }
}

fn user_id(email: &str) -> MacroUserIdStr<'static> {
    MacroUserIdStr::try_from_email(email).unwrap()
}

const NEW_USER_MENTION: &str = "<m-user-mention>{\"userId\":\"conation|new.user@example.com\",\"email\":\"new.user@example.com\"}</m-user-mention>";

#[test]
fn exposes_the_conation_support_team_used_by_signup() {
    let support_team = SupportTeam::conation_default().unwrap();

    assert_eq!(
        support_team
            .participants()
            .map(|user_id| user_id.as_ref().to_string()),
        [
            "conation|ramzan.kadyrov@conation.dev",
            "conation|pythia@conation.dev",
            "conation|tars@conation.dev",
        ]
    );
    assert!(support_team.contains_user_id("conation|pythia@conation.dev"));
    assert!(support_team.contains_user_id("conation|tars@conation.dev"));
    assert!(support_team.contains_user_id("conation|ramzan.kadyrov@conation.dev"));
    assert!(!support_team.contains_user_id("conation|new.user@example.com"));
}

fn expected_welcome() -> String {
    format!(
        concat!(
            "Привет, {new_user}!\n",
            "\n",
            "Добро пожаловать в Conation! Мы рады, что вы с нами.\n",
            "\n",
            "Это ваш личный канал поддержки. Здесь вам помогут <m-user-mention>{{\"userId\":\"conation|ramzan.kadyrov@conation.dev\",\"email\":\"ramzan.kadyrov@conation.dev\"}}</m-user-mention> (генеральный директор), <m-user-mention>{{\"userId\":\"conation|tars@conation.dev\",\"email\":\"tars@conation.dev\"}}</m-user-mention> (технический директор) и я.\n",
            "\n",
            "Если у вас появятся вопросы, предложения или вы найдёте ошибку — напишите нам здесь.",
        ),
        new_user = NEW_USER_MENTION,
    )
}

#[tokio::test]
async fn posts_the_welcome_message() {
    let channel_id = Uuid::new_v4();
    let gateway = RecordingGateway::default();

    post_support_channel_welcome(
        &gateway,
        &channel_id.to_string(),
        user_id("new.user@example.com"),
        &SupportTeam::conation_default().unwrap(),
        None,
    )
    .await
    .unwrap();

    let posted = gateway.posted.lock().unwrap();
    let [welcome] = posted.as_slice() else {
        panic!("expected exactly one posted message, got {}", posted.len());
    };

    assert_eq!(welcome.channel_id, channel_id);
    assert_eq!(
        welcome.actor.as_user(),
        Some(&user_id("pythia@conation.dev"))
    );
    assert_eq!(welcome.request.content, expected_welcome());
    assert!(!welcome.request.content.contains("Macro"));
    assert_eq!(
        welcome.request.mentions,
        vec![SimpleMention::user(&user_id("new.user@example.com"))]
    );
    assert_eq!(welcome.request.thread_id, None);
    assert!(welcome.request.attachments.is_empty());
    assert_eq!(welcome.request.nonce, None);
    assert_eq!(
        welcome.request.notification_policy,
        PostMessageNotificationPolicy::MentionsOnly
    );
    assert_eq!(welcome.request.triggered_by, None);
}

#[tokio::test]
async fn posts_the_welcome_message_with_how_to_guide() {
    let channel_id = Uuid::new_v4();
    let gateway = RecordingGateway::default();
    let guide_id = "c2f62cd8-cd0a-504b-a3c0-9ca0d850f560";
    let guide_name = "Знакомство с Conation";

    post_support_channel_welcome(
        &gateway,
        &channel_id.to_string(),
        user_id("new.user@example.com"),
        &SupportTeam::conation_default().unwrap(),
        Some((guide_id, guide_name)),
    )
    .await
    .unwrap();

    let posted = gateway.posted.lock().unwrap();
    let [welcome] = posted.as_slice() else {
        panic!("expected exactly one posted message, got {}", posted.len());
    };

    let guide_mention = document_mention(guide_id, guide_name).unwrap();
    assert!(welcome.request.content.contains(&guide_mention));
    assert!(welcome.request.content.contains("краткого руководства"));
    assert!(!welcome.request.content.contains("Macro"));
    assert_eq!(
        welcome.request.mentions,
        vec![
            SimpleMention::user(&user_id("new.user@example.com")),
            SimpleMention {
                entity_type: "document".to_string(),
                entity_id: guide_id.to_string(),
            },
        ]
    );
}

#[tokio::test]
async fn rejects_an_invalid_channel_id_without_posting() {
    let gateway = RecordingGateway::default();

    let error = post_support_channel_welcome(
        &gateway,
        "not-a-uuid",
        user_id("new.user@example.com"),
        &SupportTeam::conation_default().unwrap(),
        None,
    )
    .await
    .unwrap_err();

    assert_eq!(
        error.downcast_current_context::<&str>().copied(),
        Some("support channel returned an invalid id")
    );
    assert!(gateway.posted.lock().unwrap().is_empty());
}
