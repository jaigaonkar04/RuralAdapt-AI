-- RuralAdapt AI initial Supabase schema (run in Supabase SQL Editor before enabling hosted storage).
-- Keep uploaded files in a PRIVATE Storage bucket; do not make farmer reports public.
create extension if not exists pgcrypto;
create table if not exists public.farmer_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  guest_key_hash text,
  problem_type text not null default 'Other',
  crop_activity text,
  problem_text text not null,
  broad_location text,
  farm_size text,
  budget text,
  water_availability text,
  electricity_availability text,
  confirmed_observations jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  private_by_default boolean not null default true,
  share_consent boolean not null default false,
  consent_at timestamptz,
  consent_version text,
  deleted_at timestamptz,
  constraint consent_timestamp_required check (share_consent = false or consent_at is not null)
);
create table if not exists public.uploaded_files (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.farmer_cases(id) on delete cascade,
  storage_path text not null,
  mime_type text not null,
  file_kind text not null check (file_kind in ('soil_report','crop_photo','other')),
  created_at timestamptz not null default now()
);
create table if not exists public.solutions (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.farmer_cases(id) on delete cascade,
  title text,
  summary text,
  ladder jsonb not null default '{}'::jsonb,
  confidence text check (confidence in ('High','Medium','Low')),
  generated_at timestamptz not null default now(),
  model_label text
);
create table if not exists public.case_outcomes (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.farmer_cases(id) on delete cascade,
  outcome text not null check (outcome in ('helped','no_change','worsened','unknown')) default 'unknown',
  notes text,
  reported_at timestamptz not null default now()
);
create table if not exists public.expert_reviews (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references public.farmer_cases(id) on delete set null,
  solution_id uuid references public.solutions(id) on delete set null,
  reviewer_name text,
  reviewer_organization text,
  status text not null check (status in ('pending','reviewed','approved','needs_revision','rejected')) default 'pending',
  comments text,
  reviewed_at timestamptz
);
create table if not exists public.knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  organization text,
  source_url text,
  publication_date date,
  evidence_type text not null default 'research',
  notes text,
  created_at timestamptz not null default now()
);
create table if not exists public.shared_case_learning (
  id uuid primary key default gen_random_uuid(),
  source_case_id uuid not null references public.farmer_cases(id) on delete cascade,
  anonymized_context jsonb not null,
  solution_summary text,
  outcome text not null default 'unknown' check (outcome in ('helped','no_change','worsened','unknown')),
  verification_status text not null default 'farmer-reported',
  created_at timestamptz not null default now(),
  unique(source_case_id)
);
create table if not exists public.consent_records (
  id uuid primary key default gen_random_uuid(),
  case_id uuid not null references public.farmer_cases(id) on delete cascade,
  consent_type text not null check (consent_type in ('anonymized_learning','follow_up_contact')),
  granted boolean not null default false,
  consent_version text not null,
  recorded_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
create index if not exists farmer_cases_created_at_idx on public.farmer_cases(created_at desc);
create index if not exists shared_case_learning_problem_idx on public.shared_case_learning using gin(anonymized_context);

-- Row-level security: private farmer data is not public. Server-side access should use a secret key
-- kept only in the backend environment. Do not expose service_role credentials in React.
alter table public.farmer_cases enable row level security;
alter table public.uploaded_files enable row level security;
alter table public.solutions enable row level security;
alter table public.case_outcomes enable row level security;
alter table public.expert_reviews enable row level security;
alter table public.knowledge_sources enable row level security;
alter table public.shared_case_learning enable row level security;
alter table public.consent_records enable row level security;
-- No broad public policies are created intentionally. Add narrowly scoped policies after choosing
-- the final auth/guest-key model; server routes must enforce ownership and consent.

-- Create a PRIVATE Storage bucket named "farmer-private-files" in the Supabase dashboard.
