-- What the account screen needs to show (docs/credits-economy.md §6).
--
-- Both RPCs answer only for the caller's own auth.uid(), so the account page
-- needs no service role and no new surface: a signed-out call returns nothing
-- rather than an error, which is exactly what the screen renders anyway.

/**
 * Recent ledger rows for the signed-in user, newest first. The ledger is the
 * truth behind the balance, so this doubles as the receipt: every grant, spend
 * and refund with what it was for.
 */
create or replace function public.credits_my_ledger(p_limit integer default 50)
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(
    jsonb_agg(jsonb_build_object(
      'kind', t.kind,
      'delta', t.delta,
      'ref', t.ref,
      'at', t.created_at
    ) order by t.id desc),
    '[]'::jsonb
  )
  from (
    select id, kind, delta, ref, created_at
      from looplore_credit_ledger
     where user_id = auth.uid()
     order by id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) t;
$$;

/**
 * The reads this account owns, newest first, across both funnels — enough to
 * rebuild a deep link (?s=<id>) and say whether the report was ever generated.
 * Photo sessions keep no answers once the photos are swept, so "has_report"
 * is the only reliable "is there something to come back to".
 */
create or replace function public.credits_my_reads()
returns jsonb
language sql
security definer
set search_path = public
as $$
  select coalesce(jsonb_agg(r order by r.at desc), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id', s.id,
             'funnel', 'quiz',
             'at', s.created_at,
             'has_report', s.report is not null and s.report::text <> '{}',
             'label', s.pattern
           ) as r,
           s.created_at as at
      from unloop_sessions s
     where s.user_id = auth.uid()
    union all
    select jsonb_build_object(
             'id', p.id,
             'funnel', 'photoread',
             'at', p.created_at,
             'has_report', p.report is not null,
             'label', null
           ),
           p.created_at
      from photoread_sessions p
     where p.user_id = auth.uid()
  ) r;
$$;

grant execute on function public.credits_my_ledger(integer) to authenticated;
grant execute on function public.credits_my_reads() to authenticated;
