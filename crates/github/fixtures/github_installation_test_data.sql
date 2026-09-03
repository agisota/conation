INSERT INTO
    public.macro_user (id, username, email, stripe_customer_id)
VALUES
    ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'testuser', 'testuser@test.com', 'cus_test'),
    ('cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid, 'testuser2', 'testuser2@test.com', 'cus_test2'),
    ('ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'solo', 'solo@test.com', 'cus_test3');

INSERT INTO
    public."User" (id, email, macro_user_id)
VALUES
    ('conation|user@user.com', 'testuser@test.com', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid),
    ('conation|user2@user.com', 'testuser2@test.com', 'cccccccc-cccc-cccc-cccc-cccccccccccc'::uuid),
    ('conation|solo@user.com', 'solo@test.com', 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid);

INSERT INTO
    public.github_links (id, macro_id, fusionauth_user_id, github_username, github_user_id)
VALUES
    ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'::uuid, 'conation|user@user.com', 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'::uuid, 'testuser', '12345'),
    ('99999999-9999-9999-9999-999999999999'::uuid, 'conation|solo@user.com', 'ffffffff-ffff-ffff-ffff-ffffffffffff'::uuid, 'solo', '67890');

INSERT INTO
    public.team (id, name, owner_id)
VALUES
    ('dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'Team Alpha', 'conation|user@user.com'),
    ('eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'Team Beta', 'conation|user2@user.com');

INSERT INTO
    public.team_user (user_id, team_id, team_role)
VALUES
    ('conation|user@user.com', 'dddddddd-dddd-dddd-dddd-dddddddddddd'::uuid, 'owner'),
    ('conation|user2@user.com', 'eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee'::uuid, 'owner');
