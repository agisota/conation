-- PostgreSQL does not support safely removing a single enum value while rows
-- may reference it, so this additive migration intentionally has no down
-- migration. `IF NOT EXISTS` keeps repeated bootstrap/apply flows idempotent.
ALTER TYPE email_user_provider_enum ADD VALUE IF NOT EXISTS 'STALWART';
