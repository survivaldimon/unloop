-- The Supabase project is SHARED with the tutoring-CRM product, and its
-- on_auth_user_created trigger turns EVERY new auth user into a CRM profile
-- with a 14-day trial. Looplore's silent signup (credits-auth) and the
-- webhook's by-email account creation stamp app_metadata.app="looplore";
-- this guard makes the CRM trigger skip those users.
--
-- CRM signups are untouched: their users never carry the flag, so the insert
-- behaves exactly as before. Revert = drop the first IF block.

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'pg_temp'
as $$
begin
  -- Looplore (quiz/photo funnels) users share the auth pool but must not
  -- become CRM trial profiles.
  if coalesce(new.raw_app_meta_data->>'app', '') = 'looplore' then
    return new;
  end if;
  insert into public.profiles (id, full_name, email, subscription_status, trial_ends_at)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email, '@', 1)),
    coalesce(new.email, new.raw_user_meta_data->>'email'),
    'trial',
    now() + interval '14 days'
  );
  return new;
end;
$$;
