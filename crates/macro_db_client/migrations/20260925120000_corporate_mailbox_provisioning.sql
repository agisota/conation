-- Extend the auth-owned activation intent into an observable, retryable outbox.
-- PENDING_PROVIDER rows remain non-ready until a provider account and personal
-- JMAP session have both been reconciled. This migration does not claim SMTP
-- delivery or enable user-facing JMAP access.
ALTER TABLE corporate_mailbox_provision_intent
    DROP CONSTRAINT corporate_mailbox_provision_intent_state_check;

ALTER TABLE corporate_mailbox_provision_intent
    ADD CONSTRAINT corporate_mailbox_provision_intent_state_check
    CHECK (state IN (
        'PENDING_PROVIDER',
        'PROVISIONING',
        'RETRYABLE',
        'NEEDS_REPAIR',
        'PROVISIONED',
        'READY'
    ));

ALTER TABLE corporate_mailbox_provision_intent
    ADD COLUMN attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    ADD COLUMN next_attempt_at timestamptz NOT NULL DEFAULT now(),
    ADD COLUMN lease_token uuid,
    ADD COLUMN lease_expires_at timestamptz,
    ADD COLUMN last_error_code text,
    ADD COLUMN stalwart_account_id text,
    ADD COLUMN jmap_account_id text,
    ADD COLUMN credential_ciphertext bytea,
    ADD COLUMN credential_kms_key_id text,
    ADD COLUMN credential_encryption_version smallint;

ALTER TABLE corporate_mailbox_provision_intent
    ADD CONSTRAINT corporate_mailbox_provision_intent_lease_pair_check
        CHECK ((lease_token IS NULL) = (lease_expires_at IS NULL)),
    ADD CONSTRAINT corporate_mailbox_provision_intent_credential_envelope_check
        CHECK (
            (credential_ciphertext IS NULL AND credential_kms_key_id IS NULL AND credential_encryption_version IS NULL)
            OR
            (credential_ciphertext IS NOT NULL AND credential_kms_key_id IS NOT NULL AND credential_encryption_version = 1)
        );

CREATE UNIQUE INDEX corporate_mailbox_provision_stalwart_account_unique
    ON corporate_mailbox_provision_intent (stalwart_account_id)
    WHERE stalwart_account_id IS NOT NULL;

CREATE INDEX corporate_mailbox_provision_due_idx
    ON corporate_mailbox_provision_intent (next_attempt_at, created_at)
    WHERE state IN ('PENDING_PROVIDER', 'RETRYABLE', 'PROVISIONING');

CREATE TABLE corporate_mailbox_provision_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    idempotency_key uuid NOT NULL REFERENCES corporate_mailbox_provision_intent(idempotency_key),
    action text NOT NULL CHECK (action IN ('claimed', 'retry_scheduled', 'needs_repair', 'jmap_verified', 'operator_retried')),
    occurred_at timestamptz NOT NULL DEFAULT now()
);
