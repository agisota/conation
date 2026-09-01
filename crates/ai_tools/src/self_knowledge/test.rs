use super::*;

#[test]
fn self_knowledge_uses_conation_copy_and_keeps_the_deployed_docs_host() {
    assert!(ABOUT_MACRO.contains("# About Conation"));
    assert!(ABOUT_MACRO.contains("Conation is a single, fast workspace"));
    assert!(!ABOUT_MACRO.contains("# About Macro"));
    assert!(ABOUT_MACRO.contains("https://docs.macro.com/llms.txt"));
    assert_eq!(SelfKnowledge::ANNOTATIONS.title, "About Conation");
}
