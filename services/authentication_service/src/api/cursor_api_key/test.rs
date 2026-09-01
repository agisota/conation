use conation_user_id::user_id::MacroUserIdStr;

use super::{CursorApiKeyError, require_conation_staff};

#[test]
fn conation_staff_domain_is_allowed() {
    let user_id = MacroUserIdStr::try_from_email("Staff@Macro.com").unwrap();

    assert!(require_conation_staff(&user_id).is_ok());
}

#[test]
fn non_staff_and_lookalike_domains_are_forbidden() {
    for email in ["user@example.com", "user@macro.com.example.com"] {
        let user_id = MacroUserIdStr::try_from_email(email).unwrap();

        assert!(matches!(
            require_conation_staff(&user_id),
            Err(CursorApiKeyError::NotMacroStaff)
        ));
    }
}
