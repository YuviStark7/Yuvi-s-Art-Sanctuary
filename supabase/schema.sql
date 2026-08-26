-- Stark Museo — the wish book.
--
-- Run this once in your Supabase project: SQL Editor → paste → Run.
--
-- The design assumption is that the browser is never trusted. Nothing here is
-- writable from the client; only the edge function, holding the service role
-- key, can insert a row, and it only does that after Stripe has confirmed the
-- payment really succeeded.

create table if not exists public.wishes (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),

  -- the wish itself. Anonymous by design: no name, no email, no address,
  -- no session id. If you ever add one, say so on the panel.
  text              text not null check (char_length(text) between 1 and 280),

  -- what was paid, for your own accounting
  amount_cents      integer not null check (amount_cents > 0),
  currency          text    not null default 'eur',

  -- Stripe's id for the charge. Unique, so one payment can only ever
  -- buy one wish however many times the request is replayed.
  payment_intent    text not null unique,

  -- flip to true once you have read it, if you ever display them publicly
  approved          boolean not null default false
);

create index if not exists wishes_created_at_idx on public.wishes (created_at desc);
create index if not exists wishes_approved_idx  on public.wishes (approved, created_at desc);

alter table public.wishes enable row level security;

-- Everything is denied unless a policy allows it, and the only policy is a
-- read of wishes you have approved. The service role bypasses RLS, which is
-- how the edge function writes.
drop policy if exists "approved wishes are public" on public.wishes;
create policy "approved wishes are public"
  on public.wishes for select
  to anon, authenticated
  using (approved = true);

-- No insert, update or delete policy exists on purpose. Do not add one.
