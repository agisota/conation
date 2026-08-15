-- Supersedes 20260813201120: per-URL suppression was replaced with Discord's
-- all-or-nothing model before this feature shipped. IF EXISTS / IF NOT EXISTS
-- because some dev databases already carry the boolean from an interim state.
ALTER TABLE comms_messages
    DROP COLUMN IF EXISTS suppressed_preview_urls;
ALTER TABLE comms_messages
    ADD COLUMN IF NOT EXISTS suppress_link_previews BOOLEAN NOT NULL DEFAULT false;
