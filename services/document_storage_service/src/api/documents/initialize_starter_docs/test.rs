use super::*;

#[test]
fn greenfield_starter_document_ids_are_deterministic() {
    let user_id = MacroUserIdStr::try_from_email("person@example.com").unwrap();
    assert_eq!(user_id.as_ref(), "conation|person@example.com");

    assert_eq!(HOW_TO_GUIDE_NAME, "Знакомство с Conation");
    assert_eq!(HOW_TO_GUIDE_ID_SEED, "Macro how to guide");
    assert_eq!(
        starter_doc_id(&user_id, HOW_TO_GUIDE_ID_SEED).to_string(),
        "c2f62cd8-cd0a-504b-a3c0-9ca0d850f560"
    );
    assert_eq!(
        starter_doc_id(&user_id, HOW_TO_GUIDE_ID_SEED),
        starter_doc_id(&user_id, HOW_TO_GUIDE_ID_SEED)
    );

    assert_eq!(STARTER_TASKS[0].name, "Знакомство с задачами");
    assert_eq!(STARTER_TASKS[0].id_seed, "Intro to tasks");
    assert_eq!(STARTER_TASKS[1].name, "Расширенные возможности задач");
    assert_eq!(STARTER_TASKS[1].id_seed, "Advanced task features");

    let task = &STARTER_TASKS[2];
    assert_eq!(task.name, "Пример работы с задачами в Conation");
    assert_eq!(task.id_seed, "How we use tasks at Macro");
    assert_eq!(
        starter_doc_id(&user_id, task.id_seed).to_string(),
        "fc39b40e-ea9a-5847-bf68-d29d2ae9b88e"
    );
}

#[test]
fn starter_copy_is_russian_first_and_uses_the_canonical_agent_handle() {
    assert!(HOW_TO_GUIDE_TEMPLATE.contains("# Добро пожаловать в Conation!"));
    assert!(HOW_TO_GUIDE_TEMPLATE.contains("**@conation**"));
    assert!(!HOW_TO_GUIDE_TEMPLATE.contains("@macro"));
    assert!(HOW_TO_GUIDE_TEMPLATE.contains("LEARN_ABOUT_TASKS_ID"));

    for template in STARTER_TASKS
        .iter()
        .map(|task| task.template)
        .chain(std::iter::once(HOW_TO_GUIDE_TEMPLATE))
    {
        assert!(!template.contains("Macro"));
        assert!(!template.contains("macro.com"));
        assert!(!template.contains("static-file-service"));
    }

    assert!(STARTER_TASKS[2].template.contains("учебный пример"));
    assert!(STARTER_TASKS[2].template.contains("**@conation**"));
    assert_eq!(DOCS_TAG_LABEL, "документы");
}
