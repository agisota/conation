pub(crate) static INVITE_USER_SUBJECT: &str = "Invitation to Macro";

/// Builds the user invite message
pub(crate) fn build_user_invite_message(
    org_name: &str,
    invite_url: &str,
    support_email: &str,
) -> String {
    include_str!("../templates/invite_user.html")
        .replace("{INVITE_URL}", invite_url)
        .replace("{ORG_NAME}", &html_escape::encode_text(org_name))
        .replace("{SUPPORT_EMAIL}", support_email)
}

#[cfg(test)]
mod test;
