//! Per-recipient invite copy. English is the source catalog; Russian is the
//! product default when the invitee has no stored locale.

#[derive(Clone, Copy, Debug, Default, Eq, PartialEq)]
pub(crate) enum InviteLocale {
    English,
    #[default]
    Russian,
}

impl InviteLocale {
    pub(crate) fn parse(value: &str) -> Self {
        if value.trim().eq_ignore_ascii_case("en") {
            Self::English
        } else {
            Self::Russian
        }
    }

    pub(crate) const fn language_tag(self) -> &'static str {
        match self {
            Self::English => "en",
            Self::Russian => "ru",
        }
    }
}

pub(crate) fn default_recipient_locale() -> String {
    InviteLocale::Russian.language_tag().to_owned()
}

pub(crate) struct ReferralCopy {
    pub fallback_sender: &'static str,
    pub document_title: &'static str,
    pub invites_you: &'static str,
    pub body: &'static str,
    pub join_conation: &'static str,
}

pub(crate) struct ChannelCopy {
    pub document_title_prefix: &'static str,
    pub invites_you_to: &'static str,
    pub default_body_before: &'static str,
    pub default_body_after: &'static str,
    pub join_prefix: &'static str,
    pub continue_body: &'static str,
}

pub(crate) struct TeamCopy {
    pub document_title_prefix: &'static str,
    pub invites_you_to_team: &'static str,
    pub body_before: &'static str,
    pub body_after: &'static str,
    pub role_before: &'static str,
    pub join_prefix: &'static str,
}

const REFERRAL_EN: ReferralCopy = ReferralCopy {
    fallback_sender: "A Conation user",
    document_title: "You've been invited to Conation",
    invites_you: "has invited you to Conation",
    body: "has invited you to join Conation. Collaborate on documents, track tasks, and search your workspace. The AI assistant is there for any question.",
    join_conation: "Join",
};

const REFERRAL_RU: ReferralCopy = ReferralCopy {
    fallback_sender: "Пользователь Conation",
    document_title: "Вас пригласили в Conation",
    invites_you: "приглашает вас в Conation",
    body: "приглашает вас присоединиться к Conation. Работайте вместе над документами, следите за задачами, ищите по всему пространству. ИИ-помощник — для любых вопросов.",
    join_conation: "Присоединиться к",
};

const CHANNEL_EN: ChannelCopy = ChannelCopy {
    document_title_prefix: "You've been invited to #",
    invites_you_to: "has invited you to",
    default_body_before: "You've been invited to the",
    default_body_after: "channel on Conation. Collaborate on documents, track tasks, and search your workspace. The AI assistant is there for any question.",
    join_prefix: "Join #",
    continue_body: "Open Conation to continue",
};

const CHANNEL_RU: ChannelCopy = ChannelCopy {
    document_title_prefix: "Вас пригласили в #",
    invites_you_to: "приглашает вас в",
    default_body_before: "Вас пригласили в канал",
    default_body_after: "в Conation. Работайте вместе над документами, следите за задачами, ищите по всему пространству. ИИ-помощник — для любых вопросов.",
    join_prefix: "Присоединиться к #",
    continue_body: "Откройте Conation, чтобы продолжить",
};

const TEAM_EN: TeamCopy = TeamCopy {
    document_title_prefix: "You've been invited to the",
    invites_you_to_team: "has invited you to the",
    body_before: "You've been invited to the",
    body_after: "team on Conation. Collaborate on documents, track tasks, and search your workspace. The AI assistant is there for any question.",
    role_before: "Your role is",
    join_prefix: "Join",
};

const TEAM_RU: TeamCopy = TeamCopy {
    document_title_prefix: "Вас пригласили в команду",
    invites_you_to_team: "приглашает вас в команду",
    body_before: "Вас пригласили в команду",
    body_after: "в Conation. Работайте вместе над документами, следите за задачами, ищите по всему пространству. ИИ-помощник — для любых вопросов.",
    role_before: "Ваша роль —",
    join_prefix: "Присоединиться к",
};

pub(crate) const fn referral_copy(locale: InviteLocale) -> &'static ReferralCopy {
    match locale {
        InviteLocale::English => &REFERRAL_EN,
        InviteLocale::Russian => &REFERRAL_RU,
    }
}

pub(crate) const fn channel_copy(locale: InviteLocale) -> &'static ChannelCopy {
    match locale {
        InviteLocale::English => &CHANNEL_EN,
        InviteLocale::Russian => &CHANNEL_RU,
    }
}

pub(crate) const fn team_copy(locale: InviteLocale) -> &'static TeamCopy {
    match locale {
        InviteLocale::English => &TEAM_EN,
        InviteLocale::Russian => &TEAM_RU,
    }
}
