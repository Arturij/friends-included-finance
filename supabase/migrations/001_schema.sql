create extension if not exists pgcrypto;

create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  full_name text not null,
  role text not null check (role in ('manager', 'salesperson', 'expense_reporter')),
  sort_order integer not null,
  telegram_user_id bigint unique,
  telegram_chat_id bigint,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.telegram_contacts (
  id uuid primary key default gen_random_uuid(),
  telegram_user_id bigint not null unique,
  chat_id bigint not null,
  username text,
  display_name text,
  last_seen_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  reference text not null unique check (reference ~ '^[A-Z0-9-]{2,24}$'),
  kind text not null check (kind in ('sale', 'expense')),
  status text not null check (status in ('Pending approval', 'Approved', 'Awaiting allocation', 'Allocated')),
  submitter_id uuid not null references public.employees(id),
  customer text,
  project text check (project in ('A', 'B')),
  description text not null,
  category text check (category in ('Materials', 'Travel', 'Other')),
  amount_cents bigint not null check (amount_cents > 0),
  proposed_richard_pct numeric(5,2),
  proposed_anastasia_pct numeric(5,2),
  proposed_jean_claude_pct numeric(5,2),
  final_richard_pct numeric(5,2),
  final_anastasia_pct numeric(5,2),
  final_jean_claude_pct numeric(5,2),
  commission_pool_cents bigint not null default 0,
  richard_earned_cents bigint not null default 0,
  anastasia_earned_cents bigint not null default 0,
  jean_claude_earned_cents bigint not null default 0,
  proposed_allocation text check (proposed_allocation in ('A', 'B', 'Company overhead')),
  final_allocation text check (final_allocation in ('A', 'B', 'Company overhead')),
  origin text not null check (origin in ('website', 'telegram')),
  source_chat_id bigint,
  notification_chat_id bigint,
  sheet_sync_status text not null default 'Sync pending' check (sheet_sync_status in ('Sync pending', 'Syncing', 'Synced', 'Sync failed')),
  sheet_sync_error text,
  sheet_sync_attempted_at timestamptz,
  notification_status text not null default 'Not due' check (notification_status in ('Not due', 'Sending', 'Not required', 'No recipient', 'Sent', 'Failed')),
  notification_error text,
  notification_attempted_at timestamptz,
  submitted_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references public.employees(id),
  updated_at timestamptz not null default now(),
  constraint transaction_shape check (
    (kind = 'sale' and customer is not null and project is not null and category is null and proposed_allocation is null
      and proposed_richard_pct between 0 and 100 and proposed_anastasia_pct between 0 and 100 and proposed_jean_claude_pct between 0 and 100
      and proposed_richard_pct + proposed_anastasia_pct + proposed_jean_claude_pct = 100)
    or
    (kind = 'expense' and customer is null and project is null and category is not null and proposed_allocation is not null)
  )
);

alter table public.transactions drop constraint if exists transactions_sheet_sync_status_check;
alter table public.transactions add constraint transactions_sheet_sync_status_check
  check (sheet_sync_status in ('Sync pending', 'Syncing', 'Synced', 'Sync failed'));
alter table public.transactions drop constraint if exists transactions_notification_status_check;
alter table public.transactions add constraint transactions_notification_status_check
  check (notification_status in ('Not due', 'Sending', 'Not required', 'No recipient', 'Sent', 'Failed'));

create index if not exists transactions_submitter_idx on public.transactions(submitter_id);
create index if not exists transactions_status_idx on public.transactions(status);

create or replace function public.set_updated_at() returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists transactions_updated_at on public.transactions;
create trigger transactions_updated_at before update on public.transactions for each row execute function public.set_updated_at();

insert into public.employees (slug, full_name, role, sort_order) values
  ('svetlana', 'Svetlana de Monte Carlo', 'manager', 1),
  ('richard', 'Richard “Call Me Dick” Darling', 'salesperson', 2),
  ('anastasia', 'Anastasia Ferrari', 'salesperson', 3),
  ('jean-claude', 'Jean-Claude Bērziņš', 'salesperson', 4),
  ('kevin', 'Kevin von Whatever', 'expense_reporter', 5)
on conflict (slug) do update set full_name = excluded.full_name, role = excluded.role, sort_order = excluded.sort_order;

create or replace function public.approve_sale(
  p_actor_id uuid,
  p_reference text,
  p_richard_pct numeric,
  p_anastasia_pct numeric,
  p_jean_claude_pct numeric
) returns boolean language plpgsql security definer set search_path = public as $$
declare
  v_tx public.transactions%rowtype;
  v_pool bigint;
  v_r bigint;
  v_a bigint;
  v_j bigint;
  v_diff bigint;
begin
  if not exists (select 1 from public.employees where id = p_actor_id and role = 'manager' and active) then
    raise exception 'Only the manager may approve sales' using errcode = '42501';
  end if;
  if p_richard_pct < 0 or p_richard_pct > 100 or p_anastasia_pct < 0 or p_anastasia_pct > 100 or p_jean_claude_pct < 0 or p_jean_claude_pct > 100 or p_richard_pct + p_anastasia_pct + p_jean_claude_pct <> 100 then
    raise exception 'Commission shares must total exactly 100 percent' using errcode = '22023';
  end if;
  select * into v_tx from public.transactions where reference = upper(p_reference) for update;
  if not found or v_tx.kind <> 'sale' then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  if v_tx.status = 'Approved' then return false; end if;

  v_pool := round(v_tx.amount_cents * 0.10);
  v_r := round(v_pool * p_richard_pct / 100.0);
  v_a := round(v_pool * p_anastasia_pct / 100.0);
  v_j := round(v_pool * p_jean_claude_pct / 100.0);
  v_diff := v_pool - v_r - v_a - v_j;
  if p_richard_pct >= p_anastasia_pct and p_richard_pct >= p_jean_claude_pct then v_r := v_r + v_diff;
  elsif p_anastasia_pct >= p_jean_claude_pct then v_a := v_a + v_diff;
  else v_j := v_j + v_diff;
  end if;

  update public.transactions set
    status = 'Approved', final_richard_pct = p_richard_pct, final_anastasia_pct = p_anastasia_pct,
    final_jean_claude_pct = p_jean_claude_pct, commission_pool_cents = v_pool,
    richard_earned_cents = v_r, anastasia_earned_cents = v_a, jean_claude_earned_cents = v_j,
    decided_at = now(), decided_by = p_actor_id, sheet_sync_status = 'Sync pending',
    notification_status = case when notification_chat_id is null then 'No recipient' else 'Not due' end,
    notification_error = null
  where id = v_tx.id;
  return true;
end;
$$;

create or replace function public.allocate_expense(p_actor_id uuid, p_reference text, p_allocation text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_tx public.transactions%rowtype;
begin
  if not exists (select 1 from public.employees where id = p_actor_id and role = 'manager' and active) then
    raise exception 'Only the manager may allocate expenses' using errcode = '42501';
  end if;
  if p_allocation not in ('A', 'B', 'Company overhead') then raise exception 'Invalid allocation' using errcode = '22023'; end if;
  select * into v_tx from public.transactions where reference = upper(p_reference) for update;
  if not found or v_tx.kind <> 'expense' then raise exception 'Expense not found' using errcode = 'P0002'; end if;
  if v_tx.status = 'Allocated' then return false; end if;
  update public.transactions set status = 'Allocated', final_allocation = p_allocation, decided_at = now(), decided_by = p_actor_id,
    sheet_sync_status = 'Sync pending', notification_status = case when notification_chat_id is null then 'No recipient' else 'Not due' end,
    notification_error = null
  where id = v_tx.id;
  return true;
end;
$$;

create or replace function public.clear_practice_data(p_actor_id uuid)
returns bigint language plpgsql security definer set search_path = public as $$
declare v_count bigint;
begin
  if not exists (select 1 from public.employees where id = p_actor_id and role = 'manager' and active) then
    raise exception 'Only the manager may clear practice data' using errcode = '42501';
  end if;
  select count(*) into v_count from public.transactions;
  delete from public.transactions;
  return v_count;
end;
$$;

create or replace function public.link_telegram_employee(
  p_actor_id uuid,
  p_employee_id uuid,
  p_telegram_user_id bigint,
  p_chat_id bigint
) returns boolean language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.employees where id = p_actor_id and role = 'manager' and active) then
    raise exception 'Only the manager may link Telegram users' using errcode = '42501';
  end if;
  if not exists (select 1 from public.employees where id = p_employee_id and active) then
    raise exception 'Employee not found' using errcode = 'P0002';
  end if;
  update public.employees
    set telegram_user_id = null, telegram_chat_id = null
    where telegram_user_id = p_telegram_user_id and id <> p_employee_id;
  update public.employees
    set telegram_user_id = p_telegram_user_id, telegram_chat_id = p_chat_id
    where id = p_employee_id;
  return true;
end;
$$;

create or replace function public.claim_sheet_sync(p_reference text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_claimed boolean;
begin
  update public.transactions
    set sheet_sync_status = 'Syncing', sheet_sync_attempted_at = now(), sheet_sync_error = null
    where reference = upper(p_reference)
      and (sheet_sync_status in ('Sync pending', 'Sync failed')
        or (sheet_sync_status = 'Syncing' and sheet_sync_attempted_at < now() - interval '5 minutes'))
    returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

create or replace function public.claim_notification(p_reference text)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_claimed boolean;
begin
  update public.transactions
    set notification_status = 'Sending', notification_attempted_at = now(), notification_error = null
    where reference = upper(p_reference)
      and ((kind = 'sale' and status = 'Approved') or (kind = 'expense' and status = 'Allocated'))
      and notification_chat_id is not null
      and (notification_status in ('Not due', 'Failed')
        or (notification_status = 'Sending' and notification_attempted_at < now() - interval '5 minutes'))
    returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;

alter table public.employees enable row level security;
alter table public.telegram_contacts enable row level security;
alter table public.transactions enable row level security;

revoke all on public.employees, public.telegram_contacts, public.transactions from anon, authenticated;
revoke all on function public.approve_sale(uuid, text, numeric, numeric, numeric) from public;
revoke all on function public.allocate_expense(uuid, text, text) from public;
revoke all on function public.clear_practice_data(uuid) from public;
revoke all on function public.link_telegram_employee(uuid, uuid, bigint, bigint) from public;
revoke all on function public.claim_sheet_sync(text) from public;
revoke all on function public.claim_notification(text) from public;
grant execute on function public.approve_sale(uuid, text, numeric, numeric, numeric) to service_role;
grant execute on function public.allocate_expense(uuid, text, text) to service_role;
grant execute on function public.clear_practice_data(uuid) to service_role;
grant execute on function public.link_telegram_employee(uuid, uuid, bigint, bigint) to service_role;
grant execute on function public.claim_sheet_sync(text) to service_role;
grant execute on function public.claim_notification(text) to service_role;
