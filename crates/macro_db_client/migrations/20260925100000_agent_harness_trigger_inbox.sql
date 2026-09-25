CREATE TABLE agent_harness_trigger_inbox (
    id UUID PRIMARY KEY,
    bot_id UUID NOT NULL,
    message_id UUID NOT NULL,
    event_id UUID NOT NULL,
    payload JSONB NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'retry', 'completed', 'terminal')),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    claim_token UUID,
    claim_expires_at TIMESTAMPTZ,
    last_error TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    completed_at TIMESTAMPTZ,
    CONSTRAINT agent_harness_trigger_inbox_claim_pair CHECK (
        (claim_token IS NULL) = (claim_expires_at IS NULL)
    )
);

CREATE UNIQUE INDEX agent_harness_trigger_inbox_message_unique
    ON agent_harness_trigger_inbox (bot_id, message_id);

CREATE INDEX agent_harness_trigger_inbox_ready_idx
    ON agent_harness_trigger_inbox (next_attempt_at, created_at, id)
    WHERE status IN ('pending', 'retry', 'processing');

CREATE INDEX agent_harness_trigger_inbox_order_idx
    ON agent_harness_trigger_inbox (bot_id, created_at, id)
    WHERE status IN ('pending', 'retry', 'processing');

CREATE TABLE agent_harness_trigger_receipt (
    topic TEXT NOT NULL,
    partition INTEGER NOT NULL,
    "offset" BIGINT NOT NULL,
    work_id UUID REFERENCES agent_harness_trigger_inbox (id) ON DELETE SET NULL,
    event_id UUID,
    bot_id UUID,
    message_id UUID,
    payload JSONB,
    terminal_reason TEXT,
    received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (topic, partition, "offset"),
    CONSTRAINT agent_harness_trigger_receipt_outcome CHECK (
        (work_id IS NULL) = (terminal_reason IS NOT NULL)
    )
);

CREATE INDEX agent_harness_trigger_receipt_work_idx
    ON agent_harness_trigger_receipt (work_id)
    WHERE work_id IS NOT NULL;
