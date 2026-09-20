fn main() {
    // sqlx::migrate! tracks existing files, but stable Rust does not track newly
    // added migrations. Rebuild the embedded migrator when the directory changes.
    println!("cargo:rerun-if-changed=../conation_db_client/migrations");
}
