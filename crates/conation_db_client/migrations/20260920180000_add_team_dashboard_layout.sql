-- Team-default dashboard layout. Opaque JSON owned by the frontend, same
-- idea as team_crm_settings.team_views. NULL means no team default.
ALTER TABLE team
    ADD COLUMN dashboard_layout jsonb;

COMMENT ON COLUMN team.dashboard_layout IS
    'Opaque team-default dashboard layout, owned by the frontend';
