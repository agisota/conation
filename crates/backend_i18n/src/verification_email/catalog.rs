use crate::SupportedLocale;

pub(super) struct VerificationEmailCatalog {
    pub(super) subject: &'static str,
    pub(super) document_title: &'static str,
    pub(super) role_description: &'static str,
    pub(super) aria_label: &'static str,
    pub(super) heading: &'static str,
    pub(super) introduction: &'static str,
    pub(super) action: &'static str,
    pub(super) fallback_action: &'static str,
    pub(super) ignore_notice: &'static str,
    pub(super) support_prompt: &'static str,
}

const ENGLISH: VerificationEmailCatalog = VerificationEmailCatalog {
    subject: "Verify your email address",
    document_title: "Conation — Verify your email",
    role_description: "email",
    aria_label: "Conation email verification",
    heading: "Verify your email",
    introduction: "Click the button below to verify your email address.",
    action: "Verify",
    fallback_action: "Verify email address",
    ignore_notice: "If you didn't request this, you can safely ignore this email.",
    support_prompt: "Questions? Email us at",
};

const RUSSIAN: VerificationEmailCatalog = VerificationEmailCatalog {
    subject: "Подтвердите адрес электронной почты",
    document_title: "Conation — Подтвердите адрес электронной почты",
    role_description: "электронное письмо",
    aria_label: "Подтверждение адреса электронной почты в Conation",
    heading: "Подтвердите адрес электронной почты",
    introduction: "Нажмите кнопку ниже, чтобы подтвердить адрес электронной почты.",
    action: "Подтвердить",
    fallback_action: "Подтвердить адрес электронной почты",
    ignore_notice: "Если вы не запрашивали это письмо, просто проигнорируйте его.",
    support_prompt: "Есть вопросы? Напишите нам:",
};

pub(super) const fn catalog_for(locale: SupportedLocale) -> &'static VerificationEmailCatalog {
    match locale {
        SupportedLocale::English => &ENGLISH,
        SupportedLocale::Russian => &RUSSIAN,
    }
}
