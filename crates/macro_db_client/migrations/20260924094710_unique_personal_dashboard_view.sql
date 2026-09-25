-- Keep legacy duplicates for explicit reconciliation; never select a winner.
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM saved_view
        WHERE config->>'kind' = 'dashboard'
          AND config->>'id' = 'dashboard:personal'
        GROUP BY user_id HAVING COUNT(*) > 1
    ) THEN
        RAISE EXCEPTION 'Duplicate personal dashboard saved_view rows: reconcile per owner before applying this migration';
    END IF;
END $$;

CREATE UNIQUE INDEX saved_view_personal_dashboard_owner_key ON saved_view (user_id)
WHERE config->>'kind' = 'dashboard'
  AND config->>'id' = 'dashboard:personal';
