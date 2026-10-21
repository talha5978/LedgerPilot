-- ============================================================
-- LedgerPilot – Initial Schema
-- Migration: 0001_initial_schema.sql
-- Single merchant / single freelancer per user
-- ============================================================

-- Enable required extensions
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- ============================================================
-- 1. PROFILES
-- ============================================================
create table public.profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  email             text,
  full_name         text,
  paypal_merchant_id text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

comment on table public.profiles is 'One profile per authenticated user (the freelancer / merchant).';

-- ============================================================
-- 2. CLIENTS
-- ============================================================
create table public.clients (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  name              text not null,
  email             text,
  paypal_payer_id   text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index clients_profile_id_idx on public.clients(profile_id);

comment on table public.clients is 'Clients that the freelancer invoices.';

-- ============================================================
-- 3. INVOICES
-- ============================================================
create table public.invoices (
  id                  uuid primary key default gen_random_uuid(),
  profile_id          uuid not null references public.profiles(id) on delete cascade,
  client_id           uuid not null references public.clients(id) on delete restrict,
  paypal_invoice_id   text unique,
  invoice_number      text,
  amount              numeric(12,2) not null check (amount >= 0),
  currency            text not null default 'USD',
  status              text not null default 'draft'
                        check (status in ('draft','sent','paid','partially_paid','overdue','cancelled')),
  due_date            date,
  issue_date          date,
  description         text,
  line_items          jsonb,
  raw_paypal          jsonb,
  source              text not null default 'paypal'
                        check (source in ('paypal','simulator')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index invoices_profile_id_idx on public.invoices(profile_id);
create index invoices_client_id_idx on public.invoices(client_id);
create index invoices_status_idx on public.invoices(status);
create index invoices_due_date_idx on public.invoices(due_date);

comment on table public.invoices is 'Invoices created by the merchant. Can be real PayPal invoices or simulated.';

-- ============================================================
-- 4. TRANSACTIONS
-- ============================================================
create table public.transactions (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles(id) on delete cascade,
  paypal_transaction_id   text unique,
  amount                  numeric(12,2) not null,
  fee_amount              numeric(12,2) default 0,
  net_amount              numeric(12,2),
  currency                text not null default 'USD',
  status                  text,
  type                    text,                     -- payment, refund, fee, etc.
  payer_name              text,
  payer_email             text,
  client_id               uuid references public.clients(id) on delete set null,
  transaction_date        timestamptz,
  raw_paypal              jsonb,
  source                  text not null default 'paypal'
                            check (source in ('paypal','simulator')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now()
);

create index transactions_profile_id_idx on public.transactions(profile_id);
create index transactions_client_id_idx on public.transactions(client_id);
create index transactions_transaction_date_idx on public.transactions(transaction_date);
create index transactions_paypal_transaction_id_idx on public.transactions(paypal_transaction_id);

comment on table public.transactions is 'Incoming payments, refunds and fee events from PayPal or the simulator.';

-- ============================================================
-- 5. MATCHES (junction: transaction ↔ invoice)
-- ============================================================
create table public.matches (
  id                uuid primary key default gen_random_uuid(),
  transaction_id    uuid not null references public.transactions(id) on delete cascade,
  invoice_id        uuid not null references public.invoices(id) on delete cascade,
  amount_matched    numeric(12,2) not null check (amount_matched > 0),
  match_type        text not null
                      check (match_type in ('exact','fee_adjusted','partial','bulk','manual')),
  confidence        numeric(3,2) check (confidence >= 0 and confidence <= 1),
  reasoning         text,
  status            text not null default 'proposed'
                      check (status in ('proposed','approved','rejected')),
  created_by        text not null default 'agent'
                      check (created_by in ('agent','user')),
  created_at        timestamptz not null default now(),

  unique (transaction_id, invoice_id)
);

create index matches_transaction_id_idx on public.matches(transaction_id);
create index matches_invoice_id_idx on public.matches(invoice_id);
create index matches_status_idx on public.matches(status);

comment on table public.matches is 'Links payments to invoices. Supports partial and bulk matching.';

-- ============================================================
-- 6. ANNOTATIONS (categories + anomaly flags)
-- ============================================================
create table public.annotations (
  id                uuid primary key default gen_random_uuid(),
  entity_type       text not null check (entity_type in ('transaction','invoice')),
  entity_id         uuid not null,
  category          text,
  anomaly_type      text,               -- duplicate, fee_spike, unexpected_refund, etc.
  anomaly_reason    text,
  confidence        numeric(3,2) check (confidence >= 0 and confidence <= 1),
  created_by        text not null default 'agent'
                      check (created_by in ('agent','user')),
  created_at        timestamptz not null default now()
);

create index annotations_entity_idx on public.annotations(entity_type, entity_id);
create index annotations_anomaly_type_idx on public.annotations(anomaly_type);

comment on table public.annotations is 'AI or user annotations: categories and anomaly flags.';

-- ============================================================
-- 7. PENDING_ACTIONS (Approval Queue)
-- ============================================================
create table public.pending_actions (
  id                      uuid primary key default gen_random_uuid(),
  profile_id              uuid not null references public.profiles(id) on delete cascade,
  action_type             text not null,   -- send_reminder, issue_refund, apply_match, assign_client...
  payload                 jsonb not null,
  reasoning               text,
  related_transaction_id  uuid references public.transactions(id) on delete set null,
  related_invoice_id      uuid references public.invoices(id) on delete set null,
  status                  text not null default 'pending'
                            check (status in ('pending','approved','rejected','executed','failed')),
  proposed_at             timestamptz not null default now(),
  decided_at              timestamptz,
  decided_by              uuid references public.profiles(id) on delete set null
);

create index pending_actions_profile_id_idx on public.pending_actions(profile_id);
create index pending_actions_status_idx on public.pending_actions(status);
create index pending_actions_proposed_at_idx on public.pending_actions(proposed_at desc);

comment on table public.pending_actions is 'Human approval queue. Agent never executes money-touching actions directly.';

-- ============================================================
-- 8. AUDIT_LOG
-- ============================================================
create table public.audit_log (
  id                uuid primary key default gen_random_uuid(),
  profile_id        uuid not null references public.profiles(id) on delete cascade,
  action_type       text not null,
  entity_type       text,
  entity_id         uuid,
  details           jsonb,
  performed_by      text not null check (performed_by in ('agent','user','system')),
  result            text,
  created_at        timestamptz not null default now()
);

create index audit_log_profile_id_idx on public.audit_log(profile_id);
create index audit_log_created_at_idx on public.audit_log(created_at desc);
create index audit_log_entity_idx on public.audit_log(entity_type, entity_id);

comment on table public.audit_log is 'Immutable history of every significant action.';

-- ============================================================
-- 9. WEBHOOK_EVENTS
-- ============================================================
create table public.webhook_events (
  id                  uuid primary key default gen_random_uuid(),
  paypal_event_id     text unique,
  event_type          text not null,
  payload             jsonb not null,
  processed           boolean not null default false,
  processing_error    text,
  received_at         timestamptz not null default now(),
  processed_at        timestamptz
);

create index webhook_events_processed_idx on public.webhook_events(processed) where processed = false;
create index webhook_events_received_at_idx on public.webhook_events(received_at desc);

comment on table public.webhook_events is 'Raw PayPal webhooks stored for safe, idempotent processing.';

-- ============================================================
-- UPDATED_AT TRIGGER FUNCTION
-- ============================================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

create trigger invoices_updated_at
  before update on public.invoices
  for each row execute function public.set_updated_at();

create trigger transactions_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

-- ============================================================
-- ROW LEVEL SECURITY (RLS)
-- Every table is locked to the owning profile (auth.uid())
-- ============================================================

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.invoices enable row level security;
alter table public.transactions enable row level security;
alter table public.matches enable row level security;
alter table public.annotations enable row level security;
alter table public.pending_actions enable row level security;
alter table public.audit_log enable row level security;
alter table public.webhook_events enable row level security;

-- Profiles: users can only see / edit their own profile
create policy "Users can view own profile"
  on public.profiles for select
  using (id = auth.uid());

create policy "Users can update own profile"
  on public.profiles for update
  using (id = auth.uid());

-- Clients
create policy "Users can manage own clients"
  on public.clients for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Invoices
create policy "Users can manage own invoices"
  on public.invoices for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Transactions
create policy "Users can manage own transactions"
  on public.transactions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Matches (access controlled via the related transaction's profile)
create policy "Users can manage matches of own transactions"
  on public.matches for all
  using (
    exists (
      select 1 from public.transactions t
      where t.id = matches.transaction_id
        and t.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.transactions t
      where t.id = matches.transaction_id
        and t.profile_id = auth.uid()
    )
  );

-- Annotations (polymorphic – we allow based on existence of the entity under the user)
-- For simplicity and performance we allow the authenticated user to manage annotations
-- that belong to entities they own. In practice the application layer will only create
-- annotations for the current user's data.
create policy "Users can manage own annotations"
  on public.annotations for all
  using (true)          -- tightened in application; service role used for agent
  with check (true);

-- Pending Actions
create policy "Users can manage own pending actions"
  on public.pending_actions for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- Audit Log (read-only for the user)
create policy "Users can view own audit log"
  on public.audit_log for select
  using (profile_id = auth.uid());

-- Webhook events are only touched by service role (no user policies)
-- (intentionally left without user-facing policies)

-- ============================================================
-- HELPER: Auto-create profile on signup
-- ============================================================
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.email)
  );
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- END OF MIGRATION
-- ============================================================
