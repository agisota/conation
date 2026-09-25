-- Auth-owned, additive. No mailbox is reported ready by these records.
CREATE TABLE corporate_activation_invitation (
    id uuid PRIMARY KEY,
    corporate_email text NOT NULL,
    organization_id integer NOT NULL REFERENCES "Organization"(id),
    code_hash bytea NOT NULL,
    expires_at timestamptz NOT NULL,
    attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 5),
    session_hash bytea,
    session_expires_at timestamptz,
    claimed_at timestamptz,
    consumed_at timestamptz,
    revoked_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    CHECK (corporate_email = lower(corporate_email)),
    CHECK ((session_hash IS NULL AND session_expires_at IS NULL AND claimed_at IS NULL)
        OR (session_hash IS NOT NULL AND session_expires_at IS NOT NULL AND claimed_at IS NOT NULL))
);
CREATE UNIQUE INDEX corporate_activation_one_open_email
    ON corporate_activation_invitation(corporate_email)
    WHERE consumed_at IS NULL AND revoked_at IS NULL;

CREATE TABLE corporate_activation_audit (
    id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    invitation_id uuid NOT NULL REFERENCES corporate_activation_invitation(id),
    action text NOT NULL CHECK (action IN ('issued', 'failed_attempt', 'verified', 'revoked', 'reissued', 'activated')),
    occurred_at timestamptz NOT NULL DEFAULT now()
);

-- Exactly one durable request per activated identity. No worker calls an absent
-- mailbox provider; PENDING_PROVIDER means the mailbox does not yet exist.
CREATE TABLE corporate_mailbox_provision_intent (
    idempotency_key uuid PRIMARY KEY REFERENCES corporate_activation_invitation(id),
    fusionauth_user_id uuid NOT NULL UNIQUE REFERENCES macro_user(id),
    corporate_email text NOT NULL UNIQUE,
    state text NOT NULL DEFAULT 'PENDING_PROVIDER' CHECK (state = 'PENDING_PROVIDER'),
    created_at timestamptz NOT NULL DEFAULT now()
);
