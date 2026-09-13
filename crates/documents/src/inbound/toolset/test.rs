use super::*;
use ai_toolset::schema::generate_validated_input_schema;

#[test]
fn test_read_metadata_schema_validation() {
    let result = generate_validated_input_schema::<ReadMetadata>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "ReadMetadata",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("Retrieve"),
        "Description should contain expected text"
    );
}

#[test]
fn test_read_content_schema_validation() {
    let result = generate_validated_input_schema::<ReadContent>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "ReadContent",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("Retrieve"),
        "Description should contain expected text"
    );
}

#[test]
fn test_create_document_schema_validation() {
    let result = generate_validated_input_schema::<CreateDocument>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "CreateDocument",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("Create"),
        "Description should contain expected text"
    );
}

#[test]
fn test_rename_document_schema_validation() {
    let result = generate_validated_input_schema::<RenameDocument>();
    assert!(result.is_ok(), "{:?}", result);

    let validated = result.unwrap();
    assert_eq!(
        validated.name, "RenameDocument",
        "Tool name should match the schemars title"
    );
    assert!(
        validated.description.contains("Rename"),
        "Description should contain expected text"
    );
}

#[test]
fn create_document_schema_mentions_canvas() {
    let validated = generate_validated_input_schema::<CreateDocument>().unwrap();
    assert!(
        validated.description.to_lowercase().contains("canvas"),
        "CreateDocument must advertise canvas so the agent uses the same create as the UI: {}",
        validated.description
    );
}

#[test]
fn empty_canvas_body_matches_the_web_create_menu() {
    use super::create_document::{
        EMPTY_CANVAS_JSON, document_text_for_create, is_canvas_extension,
    };

    assert!(is_canvas_extension("canvas"));
    assert!(is_canvas_extension(".Canvas"));
    assert!(!is_canvas_extension("md"));
    assert_eq!(
        document_text_for_create("canvas", "").unwrap(),
        EMPTY_CANVAS_JSON
    );
    assert_eq!(
        document_text_for_create("canvas", "   ").unwrap(),
        EMPTY_CANVAS_JSON
    );
    assert_eq!(
        document_text_for_create("canvas", r#"{"nodes":[{"id":"n1"}],"edges":[]}"#).unwrap(),
        r#"{"nodes":[{"id":"n1"}],"edges":[]}"#
    );
    assert_eq!(document_text_for_create("md", "").unwrap(), "");
}

#[test]
fn canvas_create_rejects_json_without_nodes_and_edges() {
    use super::create_document::document_text_for_create;

    assert!(document_text_for_create("canvas", "not json").is_err());
    assert!(document_text_for_create("canvas", "[]").is_err());
    assert!(document_text_for_create("canvas", r#"{"nodes":[]}"#).is_err());
    assert!(document_text_for_create("canvas", r#"{"nodes":[],"edges":[]}"#).is_ok());
    assert!(document_text_for_create("canvas", r#"{"nodes":[],"edges":[],"groups":[]}"#).is_ok());
}
