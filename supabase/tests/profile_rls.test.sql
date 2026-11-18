begin;

create extension if not exists pgtap with schema extensions;
select plan(15);

select has_table('public', 'profiles', 'the profile table exists');
select ok(
  has_table_privilege('authenticated', 'public.profiles', 'SELECT'),
  'authenticated users can select profiles'
);
select ok(
  has_column_privilege('authenticated', 'public.profiles', 'display_name', 'UPDATE'),
  'authenticated users can update profile display names'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'id', 'UPDATE'),
  'authenticated users cannot update profile ids'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'created_at', 'UPDATE'),
  'authenticated users cannot update profile creation timestamps'
);
select ok(
  not has_column_privilege('authenticated', 'public.profiles', 'updated_at', 'UPDATE'),
  'authenticated users cannot update profile modification timestamps'
);
select ok(
  not has_table_privilege('authenticated', 'public.profiles', 'UPDATE'),
  'authenticated users do not have table-level profile update permission'
);

insert into auth.users (id, email, email_confirmed_at, raw_app_meta_data, raw_user_meta_data)
values
  (
    '11111111-1111-4111-8111-111111111111',
    'phase12-owner@example.test',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"display_name":"Owner Student"}'
  ),
  (
    '22222222-2222-4222-8222-222222222222',
    'phase12-other@example.test',
    now(),
    '{"provider":"google","providers":["google"]}',
    '{"full_name":"Other Student"}'
  );

select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Owner Student',
  'email registration display name creates a profile'
);
select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'Other Student',
  'Google profile name creates a profile'
);

set local role authenticated;
select set_config(
  'request.jwt.claims',
  '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '11111111-1111-4111-8111-111111111111',
  true
);

select is(
  (select count(*)::int from public.profiles),
  1,
  'an authenticated user can only read their own profile'
);
select lives_ok(
  $$update public.profiles
    set display_name = 'Updated Owner'
    where id = '11111111-1111-4111-8111-111111111111'$$,
  'an authenticated user can update their own profile'
);
select is(
  (select display_name from public.profiles where id = '11111111-1111-4111-8111-111111111111'),
  'Updated Owner',
  'owner profile update is persisted'
);
select is(
  (
    with updated as (
      update public.profiles
      set display_name = 'Unauthorized Change'
      where id = '22222222-2222-4222-8222-222222222222'
      returning id
    )
    select count(*)::int from updated
  ),
  0,
  'an authenticated user cannot update another profile'
);
select throws_ok(
  $$insert into public.profiles (id, display_name)
    values ('33333333-3333-4333-8333-333333333333', 'Injected Profile')$$,
  '42501',
  null,
  'authenticated users cannot create profiles directly'
);

reset role;
select is(
  (select display_name from public.profiles where id = '22222222-2222-4222-8222-222222222222'),
  'Other Student',
  'another user profile remains unchanged'
);

select * from finish();
rollback;
