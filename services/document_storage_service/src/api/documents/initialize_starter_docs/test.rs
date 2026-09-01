use super::*;

#[test]
fn visible_titles_change_without_changing_starter_document_ids() {
    let user_id = MacroUserIdStr::try_from_email("person@example.com").unwrap();

    assert_eq!(HOW_TO_GUIDE_NAME, "Conation how to guide");
    assert_eq!(HOW_TO_GUIDE_ID_SEED, "Macro how to guide");
    assert_eq!(
        starter_doc_id(&user_id, HOW_TO_GUIDE_ID_SEED).to_string(),
        "28e4e723-d47b-5c4a-b307-6af25b6bbb27"
    );

    let task = &STARTER_TASKS[2];
    assert_eq!(task.name, "How we use tasks at Conation");
    assert_eq!(task.id_seed, "How we use tasks at Macro");
    assert_eq!(
        starter_doc_id(&user_id, task.id_seed).to_string(),
        "48ac198e-4c57-52c4-96b4-b479b8bbb24b"
    );
}

#[test]
fn starter_copy_uses_conation_and_keeps_deployed_link_hosts() {
    assert!(HOW_TO_GUIDE_TEMPLATE.contains("# Welcome to Conation!"));
    assert!(!HOW_TO_GUIDE_TEMPLATE.contains("# Welcome to Macro!"));
    assert!(HOW_TO_GUIDE_TEMPLATE.contains("https://docs.macro.com"));

    let task = &STARTER_TASKS[2];
    assert!(task.template.contains("At Conation we use Conation"));
    assert!(
        task.template
            .contains("https://static-file-service.macro.com")
    );
}
