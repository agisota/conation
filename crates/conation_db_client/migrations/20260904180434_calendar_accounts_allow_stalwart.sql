ALTER TABLE calendar_accounts
    DROP CONSTRAINT calendar_accounts_provider_check;
ALTER TABLE calendar_accounts
    ADD CONSTRAINT calendar_accounts_provider_check
    CHECK (provider = ANY (ARRAY['google'::text, 'stalwart'::text]));
