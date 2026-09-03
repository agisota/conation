use super::*;

#[test]
fn legacy_onboarding_templates_are_valid_russian_first_json() {
    serde_json::from_str::<serde_json::Value>(MARKDOWN_TEMPLATE)
        .expect("markdown onboarding template must remain valid JSON");
    serde_json::from_str::<serde_json::Value>(CANVAS_TEMPLATE)
        .expect("canvas onboarding template must remain valid JSON");

    assert!(MARKDOWN_TEMPLATE.contains("Conation"));
    assert!(MARKDOWN_TEMPLATE.contains("Попробуйте разные типы файлов"));
    assert!(CANVAS_TEMPLATE.contains("Добро пожаловать в Conation"));
    assert!(!MARKDOWN_TEMPLATE.contains("Macro"));
    assert!(!CANVAS_TEMPLATE.contains("Macro"));
}

#[test]
fn legacy_onboarding_keeps_document_placeholders_and_localized_names_aligned() {
    for placeholder in [
        "DOCUMENT_ID_MD",
        "DOCUMENT_ID_PDF",
        "DOCUMENT_ID_CANVAS",
        "DOCUMENT_ID_PY",
    ] {
        assert!(MARKDOWN_TEMPLATE.contains(placeholder));
    }
    assert!(CANVAS_TEMPLATE.contains("DOCUMENT_ID_MD"));
    assert!(CANVAS_TEMPLATE.contains("DOCUMENT_ID_CANVAS"));

    assert_eq!(PROJECT_NAME, "Знакомство с Conation");
    assert!(MARKDOWN_TEMPLATE.contains("Зачем нужен Conation?"));
    assert!(MARKDOWN_TEMPLATE.contains("Холст Conation"));
    assert!(CANVAS_TEMPLATE.contains("Зачем нужен Conation?"));
    assert!(CANVAS_TEMPLATE.contains("Холст Conation"));
}

#[test]
fn legacy_sample_titles_are_localized_without_changing_source_names() {
    assert_eq!(
        legacy_onboarding_display_name("Sample PDF", "pdf"),
        "Пример PDF"
    );
    assert_eq!(
        legacy_onboarding_display_name("New Code File", "py"),
        "Пример кода"
    );
    assert_eq!(
        legacy_onboarding_display_name("Macro Enterprise", "jpg"),
        "Пример изображения"
    );
    assert_eq!(
        legacy_onboarding_display_name("Macro Enterprise", "jpeg"),
        "Пример изображения"
    );
    assert_eq!(legacy_onboarding_display_name("Таблица", "xlsx"), "Таблица");
}
