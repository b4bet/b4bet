-- =============================================================================
-- Aviator server-side tables
-- Run this migration BEFORE deploying the updated process-bet edge function.
-- =============================================================================

-- aviator_rounds: stores the server-generated crash point per round.
-- crash_point is NEVER exposed to clients via RLS until the round is over.
create table if not exists public.aviator_rounds (
  round_id   integer      primary key,
  crash_point decimal(10,2) not null,
  started_at  timestamptz  not null default now(),
  ended_at    timestamptz
);

-- Service role (edge function) bypasses RLS so the function can read/write.
-- Anon/authenticated users must NOT be able to read crash_point before a round ends.
alter table public.aviator_rounds enable row level security;

-- Allow authenticated users to read only ended rounds (crash_point already revealed).
create policy "aviator_rounds: read ended rounds" on public.aviator_rounds
  for select
  using (ended_at is not null);

-- aviator_bets: one row per player bet per round.
create table if not exists public.aviator_bets (
  id                uuid        primary key default gen_random_uuid(),
  user_id           uuid        references public.profiles(id),
  round_id          integer     references public.aviator_rounds(round_id),
  stake             decimal(10,2) not null,
  status            text        not null default 'placed', -- placed | cashed_out | crashed
  cash_out_multiplier decimal(10,2),
  crash_point       decimal(10,2),
  payout            decimal(10,2),
  placed_at         timestamptz not null default now(),
  settled_at        timestamptz
);

alter table public.aviator_bets enable row level security;

create policy "aviator_bets: users can read own bets" on public.aviator_bets
  for select
  using (auth.uid() = user_id);
