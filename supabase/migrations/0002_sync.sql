-- 영업 폴더 자동 동기화
--  - 동기화 프로그램은 전용 계정(role = 'sync')으로 로그인해서 쓴다
--  - 행마다 source_key(어느 파일 묶음에서 왔는지)를 두어 여러 번 돌려도 중복이 생기지 않게 한다
--  - 사람이 CRM 화면에서 고친 칸은 locked 에 기록되고, 동기화는 그 칸을 다시 덮어쓰지 않는다
--  - 짐작하지 않은 항목은 sync_issues(확인 필요)에 쌓는다

-- 1. 동기화 계정 역할
alter table public.profiles drop constraint profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('pending','viewer','member','admin','sync'));

-- 2. 출처·잠금 칸
alter table public.deals
  add column source       text not null default 'manual' check (source in ('manual','sync')),
  add column source_key   text unique,
  add column source_files jsonb,
  add column locked       text[] not null default '{}';
alter table public.ledger
  add column source       text not null default 'manual' check (source in ('manual','sync')),
  add column source_key   text unique,
  add column source_files jsonb,
  add column locked       text[] not null default '{}';

-- 사람이 고친 칸을 잠근다 (동기화 계정이 고친 것은 잠그지 않음)
create function public.lock_manual_edits() returns trigger language plpgsql as $$
declare k text;
begin
  if public.my_role() = 'sync' then return new; end if;
  for k in select jsonb_object_keys(to_jsonb(new)) loop
    if k in ('stage','date','client','end_client','name','no','ver','amt','memo','owner',
             'deal_id','file','sale','cost','tax_type')
       and (to_jsonb(new) -> k) is distinct from (to_jsonb(old) -> k)
       and not (k = any(new.locked)) then
      new.locked := array_append(new.locked, k);
    end if;
  end loop;
  return new;
end $$;
create trigger deals_lock before update on public.deals for each row execute function public.lock_manual_edits();
create trigger ledger_lock before update on public.ledger for each row execute function public.lock_manual_edits();

-- 3. 쓰기 권한에 sync 추가
drop policy "deals write" on public.deals;
create policy "deals write" on public.deals for all to authenticated
  using (public.my_role() in ('member','admin','sync')) with check (public.my_role() in ('member','admin','sync'));
drop policy "ledger write" on public.ledger;
create policy "ledger write" on public.ledger for all to authenticated
  using (public.my_role() in ('member','admin','sync')) with check (public.my_role() in ('member','admin','sync'));
-- 동기화 계정은 담당자 이름을 찾으려고 직원 목록을 읽는다
drop policy "profiles read" on public.profiles;
create policy "profiles read" on public.profiles for select to authenticated
  using (id = auth.uid() or public.my_role() in ('viewer','member','admin','sync'));

-- 4. 확인 필요 목록
create table public.sync_issues (
  id          uuid primary key default gen_random_uuid(),
  key         text not null unique,          -- 파일 + 종류 (같은 항목이 다시 나와도 1건)
  title       text not null,
  detail      text,
  file        text,                          -- 영업 폴더 기준 상대 경로
  status      text not null default 'open' check (status in ('open','resolved','ignored')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  resolved_by uuid references public.profiles(id)
);
alter table public.sync_issues enable row level security;
create policy "issues read"  on public.sync_issues for select to authenticated using (public.my_role() in ('viewer','member','admin','sync'));
create policy "issues write" on public.sync_issues for all    to authenticated using (public.my_role() in ('member','admin','sync')) with check (public.my_role() in ('member','admin','sync'));
create trigger sync_issues_touch before update on public.sync_issues for each row execute function public.touch_updated_at();

-- 5. 실행 기록
create table public.sync_runs (
  id          uuid primary key default gen_random_uuid(),
  started_at  timestamptz not null default now(),
  finished_at timestamptz,
  stats       jsonb,
  error       text
);
alter table public.sync_runs enable row level security;
create policy "runs read"  on public.sync_runs for select to authenticated using (public.my_role() in ('viewer','member','admin','sync'));
create policy "runs write" on public.sync_runs for all    to authenticated using (public.my_role() = 'sync') with check (public.my_role() = 'sync');

alter publication supabase_realtime add table public.sync_issues, public.sync_runs;
