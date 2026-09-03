-- First-party bot identity now comes from `bot_id::SYSTEM_BOTS`, not from
-- `bots`. The later `system_bots_leave_the_bots_table` migration removes the
-- historical seed rows and keeps agent sessions intact by dropping their bot
-- foreign key first.
--
-- Some upgraded installations can still retain those legacy `kind = 'system'`
-- rows. Repair their metadata to match the Conation registry without adding or
-- deleting any rows. A current fresh migration chain has no matching rows, so
-- this is deliberately a harmless no-op there.
WITH canonical_system_bots (id, name, handle, has_agent) AS (
    VALUES
        ('00000000-0000-0000-0000-00000000a1a1'::uuid, 'Conation', 'conation', false),
        ('00000000-0000-0000-0000-00000000a9e7'::uuid, 'Conation Coder', 'coder', true)
)
UPDATE bots AS legacy
SET name = canonical.name,
    handle = canonical.handle,
    has_agent = canonical.has_agent,
    updated_at = now()
FROM canonical_system_bots AS canonical
WHERE legacy.kind = 'system'
  AND legacy.id = canonical.id
  AND (legacy.name, legacy.handle, legacy.has_agent)
      IS DISTINCT FROM (canonical.name, canonical.handle, canonical.has_agent);
