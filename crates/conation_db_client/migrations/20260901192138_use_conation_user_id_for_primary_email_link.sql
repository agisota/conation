-- `email_links.macro_id` is a compatibility-sensitive column name, but its
-- greenfield principal values use the canonical `conation|<email>` namespace.
-- Recreate the generated column so existing local databases and fresh schema
-- builds compute the same value after the namespace transition.
ALTER TABLE email_links
    DROP COLUMN is_primary;

ALTER TABLE email_links
    ADD COLUMN is_primary boolean NOT NULL
    GENERATED ALWAYS AS (
        macro_id = 'conation|' || lower(email_address::text)
    ) STORED;
