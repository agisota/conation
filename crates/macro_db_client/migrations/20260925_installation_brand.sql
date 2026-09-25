-- Installation-wide, database-backed brand state. The owner organization is
-- supplied by trusted service configuration; branding history is immutable.
CREATE TABLE installation_brand_state (
    singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
    owner_organization_id integer NOT NULL REFERENCES "Organization"("id"),
    version bigint NOT NULL CHECK (version >= 1),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE installation_brand_revision (
    version bigint PRIMARY KEY CHECK (version >= 1),
    display_name text NOT NULL CHECK (length(display_name) BETWEEN 1 AND 80),
    color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
    logo_svg bytea,
    published_by text NOT NULL,
    published_at timestamptz NOT NULL DEFAULT now(),
    CHECK (logo_svg IS NULL OR octet_length(logo_svg) <= 65536)
);
