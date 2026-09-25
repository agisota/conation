# Personal Home board

Home retains the Assistant composer, getting-started link, and sidebar access. The
personal board is an owner-keyed island: it is not the streamed AI DashboardToolView
or the team default at `/team/dashboard`.

`GET /saved_views` returns only authenticated-owner rows. A board is identified by
`config.kind = dashboard` and `config.id = dashboard:personal`; the row's `id` is a
physical UUID, never the logical marker. The client rejects duplicate, foreign,
unknown-version or malformed layouts instead of choosing a winner. The layout is
not in localStorage, sessionStorage or the IndexedDB query-persistence allowlist.

`POST /saved_views` with `name: dashboard:personal`, authenticated `ownerId`,
`expectedRevision`, and a **complete** config is the sole board writer. Config is
`{kind,id,version:1,revision,preset,widgets}` with ordered, unique allowlisted
widgets; `revision = expectedRevision + 1`. The server checks owner identity,
validates the whole config, atomically compares the stored revision, replaces the
entire JSON value, and returns the stable row UUID and acknowledged config. A
concurrent edit returns 409; the editor keeps unsaved changes for an explicit
reload/retry. First use requires `expectedRevision:0`; two first saves cannot
create two rows. The unique partial index blocks legacy duplicate ownership; its
migration fails with a reconciliation error rather than deleting rows.

The generic CRM PATCH remains shallow for ordinary rows, but cannot mutate or
create reserved dashboard identity, and PATCH/DELETE require `id` plus the
server-derived owner in the SQL mutation. A missing/cross-owner UUID is 404.
A failed board read never becomes a default save; a failed write remains visibly
unsaved. Owner change unmounts the old editor and source subscriptions. The task
widget reads the existing permission-scoped Tasks/Soup query, calendar requires
real connected calendars and reads owner-keyed occurrences; transcript discovery
is not currently verified and is displayed as unavailable rather than populated.

Authenticated local-stack and browser acceptance, SQLx cache regeneration, and
published SDK regeneration remain integration gates; this documentation is a
contract, not a claim those gates passed.
