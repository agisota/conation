use std::future::Future;

use channels::domain::{
    models::{PostMessageNotificationPolicy, PostMessageRequest, Sender, SimpleMention},
    ports::ChannelService,
};
use conation_user_id::user_id::MacroUserIdStr;
use mention_utils::serialize::user_mention;
use rootcause::{Report, prelude::ResultExt};
use uuid::Uuid;

#[cfg(test)]
mod test;

const PYTHIA_SUPPORT_EMAIL: &str = "pythia@conation.dev";
const TARS_SUPPORT_EMAIL: &str = "tars@conation.dev";
const RAMZAN_KADYROV_SUPPORT_EMAIL: &str = "ramzan.kadyrov@conation.dev";

/// Support identities used to create a new user's private onboarding channel.
#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SupportTeam {
    host: MacroUserIdStr<'static>,
    chief_executive: MacroUserIdStr<'static>,
    chief_technology_officer: MacroUserIdStr<'static>,
}

impl SupportTeam {
    /// Build a support team from deployer-owned email addresses.
    pub fn try_from_emails(
        host: &str,
        chief_executive: &str,
        chief_technology_officer: &str,
    ) -> Result<Self, Report> {
        Ok(Self {
            host: support_user("host", host)?,
            chief_executive: support_user("chief executive", chief_executive)?,
            chief_technology_officer: support_user(
                "chief technology officer",
                chief_technology_officer,
            )?,
        })
    }

    /// The support identities owned by the Conation deployment.
    pub fn conation_default() -> Result<Self, Report> {
        Self::try_from_emails(
            PYTHIA_SUPPORT_EMAIL,
            RAMZAN_KADYROV_SUPPORT_EMAIL,
            TARS_SUPPORT_EMAIL,
        )
    }

    /// All support identities to add to the onboarding channel.
    pub fn participants(&self) -> [MacroUserIdStr<'static>; 3] {
        [
            self.chief_executive.clone(),
            self.host.clone(),
            self.chief_technology_officer.clone(),
        ]
    }

    /// Whether a canonical user ID belongs to this support team.
    pub fn contains_user_id(&self, user_id: &str) -> bool {
        self.participants()
            .iter()
            .any(|support_user| support_user.as_ref() == user_id)
    }
}

/// The channel operation required to post a new user's welcome messages.
pub trait SupportChannelMessageGateway: Send + Sync + 'static {
    /// Post a welcome message.
    fn post_message(
        &self,
        actor: Sender,
        channel_id: Uuid,
        request: PostMessageRequest,
    ) -> impl Future<Output = Result<(), Report>> + Send;
}

impl<T> SupportChannelMessageGateway for T
where
    T: ChannelService,
{
    async fn post_message(
        &self,
        actor: Sender,
        channel_id: Uuid,
        request: PostMessageRequest,
    ) -> Result<(), Report> {
        ChannelService::post_message(self, actor, channel_id, request)
            .await
            .context("failed to post Conation support welcome message")?;

        Ok(())
    }
}

fn support_user(role: &str, email: &str) -> Result<MacroUserIdStr<'static>, Report> {
    Ok(MacroUserIdStr::try_from_email(email)
        .context_with(|| format!("invalid Conation support {role} email: {email}"))?)
}

/// Post the support host's welcome message in a newly created support channel.
pub async fn post_support_channel_welcome(
    gateway: &impl SupportChannelMessageGateway,
    channel_id: &str,
    new_user: MacroUserIdStr<'static>,
    support_team: &SupportTeam,
) -> Result<(), Report> {
    let channel_id =
        Uuid::parse_str(channel_id).context("support channel returned an invalid id")?;

    let new_user_mention = user_mention(&new_user)?;

    let welcome = format!(
        "Привет, {new_user_mention}!\n\
\n\
Добро пожаловать в Conation! Мы рады, что вы с нами.\n\
\n\
Это ваш личный канал поддержки. Здесь вам помогут {} (генеральный директор), {} (технический директор) и я.\n\
\n\
Если у вас появятся вопросы, предложения или вы найдёте ошибку — напишите нам здесь.",
        user_mention(&support_team.chief_executive)?,
        user_mention(&support_team.chief_technology_officer)?,
    );
    // Keep the executive and technical lead visually mentioned without
    // tracking them: tracked mentions would notify them on every signup. The
    // support host is the sender, so the channel notification policy excludes
    // that account automatically.
    let mentions = [&new_user].into_iter().map(SimpleMention::user).collect();

    gateway
        .post_message(
            Sender::new_from_user(support_team.host.clone()),
            channel_id,
            PostMessageRequest {
                content: welcome,
                mentions,
                thread_id: None,
                attachments: Vec::new(),
                nonce: None,
                notification_policy: PostMessageNotificationPolicy::MentionsOnly,
                triggered_by: None,
            },
        )
        .await?;

    Ok(())
}
