-- The chat history table learns the tests funnel (docs/tests-monetization.md §3).
-- Apply to prod ONLY with the founder's explicit go.
--
-- looplore-chat now answers questions over a bought test report and stores the
-- exchange with funnel='tests', but the column's CHECK was written when only two
-- funnels existed. The insert is error-tolerant in the function, so the symptom
-- is not a 500 — it is silence: every 'tests' row is rejected, so the "last 6
-- exchanges" context stays permanently empty and the free replay of an
-- already-answered question (the duplicate branch after credits_spend) finds no
-- stored answer and pays for a second generation instead.
--
-- Deliberately narrow: this is the constraint the chat branch needs and nothing
-- else. The E7 migration proper (report column, looplore_portraits, the ledger's
-- spend_test_report / spend_portrait kinds, the retake cooldown) is a separate
-- file owned by the server-core wave; the two are order-independent, and keeping
-- them apart means neither can clobber the other's constraint list.
--
-- Ordering that matters: this must reach prod no later than the updated
-- looplore-chat. Re-runnable — the drop is guarded, so applying twice is a
-- no-op. Revert = the same two statements with 'tests' dropped from the list.
--
-- Constraint name verified against prod (pg_constraint), not assumed: the
-- original was declared inline on the column, and Postgres named it
-- looplore_chat_messages_funnel_check — the same shape the promo migration
-- relied on for looplore_credit_ledger_kind_check.

alter table public.looplore_chat_messages
  drop constraint if exists looplore_chat_messages_funnel_check;
alter table public.looplore_chat_messages
  add constraint looplore_chat_messages_funnel_check
  check (funnel in ('quiz', 'photoread', 'tests'));
