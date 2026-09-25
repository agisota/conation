# Corporate Stalwart mailbox provisioning boundary

## What this code does

Authentication commits one mailbox-provision intent in the same transaction as the corporate activation entitlement. The email-service worker consumes that intent only when all Stalwart settings are present. It targets the Stalwart v0.16+ JMAP management API (`POST /api`, `urn:stalwart:jmap`), creates or reconciles one account by exact local-part/domain, and requires the returned account's `externalId` to equal `macro-fusionauth:<reserved FusionAuth UUID>`. An existing email account without that exact marker is never adopted.

Before making a provider-side create request, the worker generates a high-entropy mailbox password, encrypts it with the configured KMS key using FusionAuth ID/email/purpose as the encryption context, and commits the ciphertext. The plaintext is not stored in macrodb, returned to callers, or logged. The worker then verifies that the user's own HTTPS JMAP Session authenticates with that credential and that its personal primary mail account ID equals the management API account ID.

Provision intents have explicit `PENDING_PROVIDER`, `PROVISIONING`, `RETRYABLE`, `NEEDS_REPAIR`, `PROVISIONED`, and `READY` states, a lease, retry counter/backoff, stable error code, account IDs, encrypted credential envelope, and an audit trail. A timed-out create is reconciled by Stalwart's Enterprise `externalId` before another create is attempted; a confirmed account ID is saved under the live lease before JMAP authentication, so later retries re-check that exact owner-bound account rather than creating another. A JMAP `401` immediately after creation is treated as bounded propagation retry and eventually enters `NEEDS_REPAIR` after the existing attempt limit. An expired worker lease at the attempt limit is also moved to `NEEDS_REPAIR`, rather than reclaimed indefinitely after repeated crashes. Internal repair retry is available at `POST /internal/mailboxes/provision/{id}/retry`; it requires InternalOnly auth and the exact owner UUID and canonical email, resets the retry budget, retains the encrypted credential, and still re-checks provider ownership.

`PROVISIONED` is deliberately not `READY`. An authenticated JMAP Session proves neither inbound SMTP acceptance nor external send/receive, and the current Gmail-backed `/email/init`/inbox/send/sync surfaces do not yet link or operate this account. Activation completion grants no ordinary access/refresh session, and all password, passwordless, Apple, SSO/OAuth, refresh, and mobile-session handoffs recheck the signed FusionAuth owner/email before issuing tokens; an exact reserved owner stays blocked until its intent is `READY`. Legacy `OrganizationEmailMatches` entries alone do not enroll a domain in corporate activation and retain their existing signup behavior. The worker never sets `READY`; `/internal/mailboxes/verify` remains read-only and is not treated as a link.

## Required configuration and provider contract

All settings below are optional as a group. With none configured, the worker is dormant and activation remains `PENDING_PROVIDER`. A partial group disables the worker and logs only that configuration is incomplete.

- `STALWART_MANAGEMENT_API_URL`: HTTPS endpoint ending in `/api`; no embedded credentials, query, or fragment.
- `STALWART_MANAGEMENT_API_TOKEN_SECRET_NAME`: local bearer token or secret name resolved using the existing `SECRETS_BACKEND` convention. The bearer principal needs Stalwart `sysAccountQuery`, `sysAccountGet`, and `sysAccountCreate` permissions.
- `STALWART_DOMAIN_IDS_JSON`: JSON object mapping every invited canonical email domain to its Stalwart Domain ID, e.g. `{"example.org":"<provider-domain-id>"}`.
- `STALWART_ACCOUNT_ENCRYPTION_AT_REST_JSON`: explicit Stalwart `encryptionAtRest` object. `Disabled` must be an intentional operator policy; `Aes128`/`Aes256` require a non-empty `publicKey`.
- `STALWART_JMAP_SESSION_URL`: HTTPS JMAP Session resource used for per-user Basic-auth verification.
- `STALWART_MAILBOX_KMS_KEY_ID`: dedicated KMS key for mailbox credentials. Email service IAM needs encrypt/decrypt access; production rotation must preserve decryptability of stored ciphertext.

The account API's `externalId` property is Enterprise-only in Stalwart documentation. This implementation requires that property to guarantee idempotent owner reconciliation after a crash between provider create and local commit. A server without that capability fails closed and must not be used to provision these accounts. The repository does not pin a Stalwart image/version; the operator must deploy and verify v0.16+ Enterprise before enabling this worker.

## Still required for T06–T09 acceptance

This checkout contains no deployed Stalwart version/image pin, management or JMAP URL, provider bearer credential, Stalwart domain IDs, KMS key/IAM policy, account encryption policy, verified mail domain, inbound MX routing, outbound SMTP/JMAP Submission policy, or consented external test sender/recipient. Those are external operator prerequisites, not safe code defaults. No provider-side account, secret, or DNS change has been made.

The following product work also remains before a mailbox can become READY:

1. Persist a user-facing Stalwart link and implement owner-authorized JMAP inbox/read/sync/send with a durable JMAP state/cursor and restart reconciliation. The current provisioned account ID is not inserted into Gmail-only `email_links`.
2. Route scheduled sends and attachments through the selected provider. Gmail's raw 18,000,000-byte attachment ceiling must remain unchanged; Stalwart's actual `maxSizeAttachmentsPerEmail` capability and overall message-size limits must be read from the authenticated account Session and enforced for the unencoded attachment bytes.
3. Configure and probe real SMTP inbound/outbound routing or the selected JMAP EmailSubmission path, including domain identity/authorized From, TLS, retry/bounce behavior, external receipt, MX, SPF, DKIM and DMARC. Mailpit or an HTTP 200 JMAP Session is not acceptance.
4. Set `READY` only after provider link, functional sync/read/send, attachment-byte round trip and externally observed inbound/outbound delivery have an operator-verifiable acceptance path. Preserve the passwordless gate until then.

## Parent acceptance path

On a controlled Stalwart v0.16+ Enterprise deployment, configure the required settings and provider permissions, issue one invitation for a synthetic address, activate it, and confirm exactly one intent keyed/bound to that reserved FusionAuth UUID/email. Observe `PENDING_PROVIDER` before the worker claims it, then one account whose `externalId` matches the reserved UUID, an encrypted credential envelope, and `PROVISIONED` only after the per-user JMAP account ID matches the provider account ID.

Then exercise worker restart/timeout recovery after provider account creation, duplicate claims, exact-owner retry, foreign-owner collision, wrong email/UUID, missing credentials/config, KMS failure, unauthorized management token, and explicit repair/retry. Confirm no credential appears in API bodies/logs and passwordless login remains blocked while state is `PROVISIONED`/`NEEDS_REPAIR`. After the remaining JMAP link and external SMTP delivery work lands, receive an external message with attachment bytes, sync/read/reply, send an attachment to an external mailbox, verify bytes/receipt after service restart, and only then verify `READY` permits normal login. Local Mailpit/JMAP probes are supporting checks only, not external acceptance.

## Official semantics

- Stalwart v0.16 migration replaces older REST management endpoints with JMAP management operations: <https://stalw.art/blog/stalwart-0-16/>.
- Current Account object documents `x:Account/query`, `x:Account/get`, `x:Account/set`, the `externalId` Enterprise limitation, password credentials, and permission requirements: <https://stalw.art/docs/ref/object/account/>.
- Management API bearer authentication contract: <https://stalw.art/docs/development/api/>.
- Required domain mail DNS records (MX, SPF, DKIM, DMARC and TLS policy): <https://stalw.art/docs/install/dns/>.
- JMAP mail submission model and account capabilities: <https://www.rfc-editor.org/rfc/rfc8621#section-7.5>.
