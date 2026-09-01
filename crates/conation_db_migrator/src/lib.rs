//! The sole responsibility of this crate is to expose the statically imported sql migrations for conation_db.
//!
//! We explicitly do not want these migrations to exist as part of conation_db_client crate because that crate is very heavy.
pub static MACRO_DB_MIGRATIONS: sqlx::migrate::Migrator =
    sqlx::migrate!("../conation_db_client/migrations");
