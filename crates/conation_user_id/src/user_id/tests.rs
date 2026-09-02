use crate::email::ReadEmailParts;

use super::*;

#[test]
fn it_should_parse() {
    let valid_emails = [
        "conation|sean@conation.dev",
        "conation|sean+testing.thing@example.gc.ca",
        "conation|###hello###+weird@something-strange.world.tour",
    ];
    let res: Result<Vec<_>, _> = valid_emails
        .iter()
        .copied()
        .map(MacroUserId::parse_from_str)
        .collect();
    res.unwrap();
}

#[test]
fn it_should_fail() {
    let invalid_emails = [
        "conation|sean@conation.dev ",
        "conation| sean@conation.dev",
        "conation|sean@conation.dev\n",
        "conation|\nsean@conation.dev",
        "conation|sean..aye@conation.dev",
        "conation|sean@@conation.dev",
        "conationish|sean@conation.dev",
    ];
    invalid_emails
        .iter()
        .copied()
        .map(MacroUserId::parse_from_str)
        .for_each(|res| {
            res.unwrap_err();
        });
}

#[test]
fn legacy_macro_namespace_is_rejected() {
    let result = MacroUserId::parse_from_str("macro|sean@macro.com");

    assert!(result.is_err());
}

#[test]
fn email_works() {
    let id = MacroUserId::parse_from_str("conation|###hello###+weird@something-strange.world.tour")
        .unwrap();

    dbg!(&id);

    assert_eq!(
        id.email_part().email_str(),
        "###hello###+weird@something-strange.world.tour"
    );
}

#[test]
fn domain_part_works() {
    let id = MacroUserId::parse_from_str("conation|###hello###+weird@something-strange.world.tour")
        .unwrap();

    dbg!(&id);

    assert_eq!(
        id.email_part().domain_part(),
        "something-strange.world.tour"
    );
}

#[test]
fn local_part_works() {
    let id = MacroUserId::parse_from_str("conation|###hello###+weird@something-strange.world.tour")
        .unwrap();

    dbg!(&id);

    assert_eq!(id.email_part().local_part(), "###hello###+weird");
}

#[test]
fn casing_matters_for_prefix() {
    let _id =
        MacroUserId::parse_from_str("conAtion|###hello###+weird@something-strange.world.tour")
            .unwrap_err();
}

#[test]
fn incomplete_input_does_not_panic() {
    assert!(MacroUserId::parse_from_str("").is_err());
    assert!(MacroUserId::parse_from_str("conation").is_err());
    assert!(MacroUserId::parse_from_str("conation|").is_err());
}

#[test]
fn casing_ignored_for_email() {
    let id = MacroUserId::parse_from_str("conation|###hello###+WEIRD@something-strange.world.tour")
        .unwrap();

    assert_eq!(id.email_part().local_part(), "###hello###+WEIRD");
}

#[test]
fn debug_output_is_simple_string() {
    let id = MacroUserId::parse_from_str("conation|pythia@conation.dev").unwrap();
    assert_eq!(format!("{:?}", id), "conation|pythia@conation.dev");

    let id_str = MacroUserIdStr::parse_from_str("conation|pythia@conation.dev").unwrap();
    assert_eq!(format!("{:?}", id_str), "conation|pythia@conation.dev");
}

#[test]
fn from_email_uses_only_the_conation_namespace_and_lowercases() {
    let id = MacroUserIdStr::try_from_email("Pythia@Conation.Dev").unwrap();

    assert_eq!(id.as_ref(), "conation|pythia@conation.dev");
    assert_eq!(id.email_str(), "pythia@conation.dev");
    assert_eq!(CONATION_USER_ID_NAMESPACE, "conation");
    assert_eq!(CONATION_USER_ID_PREFIX, "conation|");
}

#[test]
fn conation_dev_users_are_staff() {
    let id = MacroUserIdStr::parse_from_str("conation|tars@conation.dev").unwrap();
    assert!(id.is_conation_staff());
}

#[test]
fn conation_dev_plus_aliases_are_staff() {
    let id = MacroUserIdStr::parse_from_str("conation|tars+notify@conation.dev").unwrap();
    assert!(id.is_conation_staff());
}

#[test]
fn non_conation_domains_are_not_staff() {
    let id = MacroUserIdStr::parse_from_str("conation|teo@example.com").unwrap();
    assert!(!id.is_conation_staff());
}

#[test]
fn legacy_macro_domain_is_not_staff() {
    let id = MacroUserIdStr::parse_from_str("conation|legacy@macro.com").unwrap();
    assert!(!id.is_conation_staff());
}
