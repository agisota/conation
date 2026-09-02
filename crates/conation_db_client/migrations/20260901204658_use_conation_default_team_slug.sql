-- Add migration script here
-- `MACRO` was the historical fallback when a team name could not be reduced
-- to the uppercase slug grammar.  Conation greenfield deployments must not
-- create that branded value, and upgraded deployments should migrate only the
-- exact fallback without changing operator-selected slugs.
UPDATE team
SET slug = 'CONATION'
WHERE slug = 'MACRO';

ALTER TABLE team
    ALTER COLUMN slug SET DEFAULT 'CONATION';
