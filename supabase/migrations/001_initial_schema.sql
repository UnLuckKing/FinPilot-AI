-- FinPilot AI PostgreSQL/Supabase schema
create extension if not exists "pgcrypto";

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.financial_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  monthly_income numeric(14,2) not null default 0 check (monthly_income >= 0),
  essential_expenses numeric(14,2) not null default 0 check (essential_expenses >= 0),
  optional_expenses numeric(14,2) not null default 0 check (optional_expenses >= 0),
  cash_savings numeric(14,2) not null default 0 check (cash_savings >= 0),
  credit_card_debt numeric(14,2) not null default 0 check (credit_card_debt >= 0),
  loan_debt numeric(14,2) not null default 0 check (loan_debt >= 0),
  monthly_debt_payments numeric(14,2) not null default 0 check (monthly_debt_payments >= 0),
  emergency_target numeric(14,2) not null default 0 check (emergency_target >= 0),
  upcoming_expenses numeric(14,2) not null default 0 check (upcoming_expenses >= 0),
  safety_margin numeric(14,2) not null default 0 check (safety_margin >= 0),
  horizon_years integer not null default 3 check (horizon_years between 1 and 50),
  risk_tolerance integer not null default 3 check (risk_tolerance between 1 and 5),
  maximum_loss numeric(5,2) not null default 20 check (maximum_loss between 0 and 100),
  crypto_exposure boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create table public.risk_assessments (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  profile text not null, score numeric(5,2) not null, inputs jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.portfolios (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Ana Portföy', base_currency text not null default 'TRY', created_at timestamptz not null default now()
);
create table public.assets (
  id uuid primary key default gen_random_uuid(), symbol text not null, name text not null, category text not null,
  currency text not null default 'TRY', provider_id text, metadata jsonb not null default '{}'::jsonb,
  unique(symbol, category)
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  portfolio_id uuid not null references public.portfolios(id) on delete cascade, asset_id uuid not null references public.assets(id),
  side text not null check (side in ('buy','sell')), quantity numeric(24,8) not null check (quantity > 0),
  unit_price numeric(24,8) not null check (unit_price >= 0), commission numeric(14,2) not null default 0 check (commission >= 0),
  transaction_date date not null, note text check (char_length(note) <= 500), created_at timestamptz not null default now()
);
create table public.asset_prices (
  id bigint generated always as identity primary key, asset_id uuid not null references public.assets(id) on delete cascade,
  price numeric(24,8) not null check (price >= 0), captured_at timestamptz not null, provider text not null, is_demo boolean not null default false,
  unique(asset_id, captured_at, provider)
);
create table public.watchlists (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null, created_at timestamptz not null default now()
);
create table public.watchlist_items (
  watchlist_id uuid not null references public.watchlists(id) on delete cascade, asset_id uuid not null references public.assets(id) on delete cascade,
  created_at timestamptz not null default now(), primary key(watchlist_id, asset_id)
);
create table public.alerts (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, asset_id uuid references public.assets(id),
  alert_type text not null, threshold numeric(24,8) not null, enabled boolean not null default true, created_at timestamptz not null default now()
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade,
  title text not null, body text not null, severity text not null default 'info', read_at timestamptz, created_at timestamptz not null default now()
);
create table public.financial_goals (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0), current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  target_date date not null, monthly_contribution numeric(14,2) not null default 0, priority text not null default 'medium', assumed_return numeric(5,2) not null default 0,
  created_at timestamptz not null default now()
);
create table public.ai_conversations (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, title text not null, created_at timestamptz not null default now()
);
create table public.ai_messages (
  id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.ai_conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade, role text not null check(role in ('user','assistant')), content text not null, facts jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id) on delete cascade, report_type text not null,
  period_start date not null, period_end date not null, payload jsonb not null default '{}'::jsonb, created_at timestamptz not null default now()
);
create table public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade, currency text not null default 'TRY', theme text not null default 'dark',
  notifications jsonb not null default '{}'::jsonb, privacy jsonb not null default '{}'::jsonb, updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;
alter table public.financial_profiles enable row level security;
alter table public.risk_assessments enable row level security;
alter table public.portfolios enable row level security;
alter table public.transactions enable row level security;
alter table public.watchlists enable row level security;
alter table public.watchlist_items enable row level security;
alter table public.alerts enable row level security;
alter table public.notifications enable row level security;
alter table public.financial_goals enable row level security;
alter table public.ai_conversations enable row level security;
alter table public.ai_messages enable row level security;
alter table public.reports enable row level security;
alter table public.user_settings enable row level security;

do $$ declare t text; begin
  foreach t in array array['profiles','financial_profiles','risk_assessments','portfolios','transactions','watchlists','alerts','notifications','financial_goals','ai_conversations','ai_messages','reports','user_settings']
  loop execute format('create policy "owner access" on public.%I for all using (auth.uid() = %I) with check (auth.uid() = %I)', t, case when t = 'profiles' then 'id' else 'user_id' end, case when t = 'profiles' then 'id' else 'user_id' end); end loop;
end $$;

create policy "watchlist item owner access" on public.watchlist_items for all
using (exists(select 1 from public.watchlists w where w.id=watchlist_id and w.user_id=auth.uid()))
with check (exists(select 1 from public.watchlists w where w.id=watchlist_id and w.user_id=auth.uid()));

-- Assets and demo prices are shared, read-only reference data for authenticated users.
alter table public.assets enable row level security;
alter table public.asset_prices enable row level security;
create policy "authenticated asset read" on public.assets for select to authenticated using (true);
create policy "authenticated price read" on public.asset_prices for select to authenticated using (true);
