-- Solo-CRM — 초기 스키마
-- 원본(legacy/index.html)의 Claude 아티팩트 DB 컬렉션을 Postgres 테이블로 옮긴 것.
--   deals       ← db.collection("deals")      견적 파이프라인
--   ledger      ← db.collection("ledger")     판매원장 (분할 청구 parts 는 jsonb)
--   settings    ← db.doc("settings/main"), db.doc("settings/layout")
--   dashboard_layouts ← db.doc("data/users/{uid}/dash")  개인 대시보드 배치

-- 직원 프로필 (auth.users 와 1:1)
create table public.profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  name        text,
  avatar_url  text,
  -- pending: 가입 후 관리자 승인 대기 (아무것도 못 봄) / viewer: 보기 전용 / member: 편집 / admin: 관리자
  role        text not null default 'pending' check (role in ('pending','viewer','member','admin')),
  created_at  timestamptz not null default now()
);

-- 가입 시 프로필 자동 생성
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, name, avatar_url)
  values (new.id, coalesce(new.raw_user_meta_data->>'name', split_part(new.email,'@',1)), new.raw_user_meta_data->>'avatar_url');
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- 견적 파이프라인
create table public.deals (
  id          uuid primary key default gen_random_uuid(),
  stage       text not null default 'quote' check (stage in ('quote','nego','po','won','lost')),
  date        date,                       -- 견적일
  client      text not null,              -- 거래처 (매출처)
  end_client  text,                       -- 최종 고객 (원본 필드명: end)
  name        text not null,              -- 사업명
  no          text,                       -- 견적번호
  ver         text,                       -- 버전
  amt         bigint not null default 0,  -- 견적금액 (원, VAT 별도)
  memo        text,
  owner       uuid references public.profiles(id),
  created_at  timestamptz not null default now(),
  created_by  uuid references public.profiles(id),
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);

-- 판매원장
create table public.ledger (
  id           uuid primary key default gen_random_uuid(),
  deal_id      uuid references public.deals(id) on delete set null,
  client       text not null,
  end_client   text,
  name         text not null,              -- 건명
  date         date not null,              -- 계약일 (월별 달성률 기준)
  file         text,                       -- 판매원장 파일명
  sale         bigint not null default 0,  -- 판매가 (공급가액)
  cost         bigint not null default 0,  -- 원가
  tax_type     text not null default 'taxable' check (tax_type in ('taxable','zero')),
  invoiced     boolean not null default false,
  invoiced_at  date,
  paid         boolean not null default false,
  paid_at      date,
  -- 분할 청구: [{label, amt, invoiced, date, paid, paidDate}]  null 이면 일시 청구
  parts        jsonb,
  owner        uuid references public.profiles(id),
  created_at   timestamptz not null default now(),
  created_by   uuid references public.profiles(id),
  updated_at   timestamptz not null default now(),
  updated_by   uuid references public.profiles(id)
);
create index ledger_deal_id_idx on public.ledger(deal_id);
create index ledger_date_idx on public.ledger(date);

-- 팀 설정 (key: 'main' = {target, year}, 'layout' = 팀 기본 대시보드 배치)
create table public.settings (
  key         text primary key,
  value       jsonb not null,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references public.profiles(id)
);
insert into public.settings (key, value) values ('main', '{"target":100000000,"year":2026}');

-- 개인 대시보드 배치
create table public.dashboard_layouts (
  user_id     uuid primary key references public.profiles(id) on delete cascade,
  layout      jsonb not null,
  updated_at  timestamptz not null default now()
);

-- updated_at 자동 갱신
create function public.touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger deals_touch before update on public.deals for each row execute function public.touch_updated_at();
create trigger ledger_touch before update on public.ledger for each row execute function public.touch_updated_at();
create trigger settings_touch before update on public.settings for each row execute function public.touch_updated_at();

-- 권한 헬퍼
create function public.my_role() returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

-- RLS: 승인된 직원(viewer 이상)만 읽기, member/admin 은 쓰기, settings 는 admin 만 쓰기
-- 승인 대기(pending)는 자기 프로필만 볼 수 있음
alter table public.profiles enable row level security;
alter table public.deals enable row level security;
alter table public.ledger enable row level security;
alter table public.settings enable row level security;
alter table public.dashboard_layouts enable row level security;

create policy "profiles read"   on public.profiles for select to authenticated using (id = auth.uid() or public.my_role() in ('viewer','member','admin'));
-- 본인은 이름·사진만 고칠 수 있고 role 은 못 바꿈 (my_role() 은 security definer 라 정책 재귀가 생기지 않음)
create policy "profiles self"   on public.profiles for update to authenticated using (id = auth.uid()) with check (id = auth.uid() and role = public.my_role());
-- 관리자는 직원 승인·권한 변경
create policy "profiles admin"  on public.profiles for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create policy "deals read"   on public.deals for select to authenticated using (public.my_role() in ('viewer','member','admin'));
create policy "deals write"  on public.deals for all    to authenticated using (public.my_role() in ('member','admin')) with check (public.my_role() in ('member','admin'));

create policy "ledger read"  on public.ledger for select to authenticated using (public.my_role() in ('viewer','member','admin'));
create policy "ledger write" on public.ledger for all    to authenticated using (public.my_role() in ('member','admin')) with check (public.my_role() in ('member','admin'));

create policy "settings read"  on public.settings for select to authenticated using (public.my_role() in ('viewer','member','admin'));
create policy "settings write" on public.settings for all    to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

create policy "layout own" on public.dashboard_layouts for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- 실시간 반영 (원본의 onSnapshot 대체)
alter publication supabase_realtime add table public.deals, public.ledger, public.settings;
