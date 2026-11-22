-- 동기화 PC·폴더 설정
--  - 각 PC의 동기화 프로그램이 켜질 때 자기 자신을 등록한다 (계정 + PC 이름)
--  - 어느 폴더를 읽을지(sales_dir), 기준일(since), 켜기/끄기(enabled)는 CRM 화면에서 정한다
--  - 동기화 프로그램은 1분마다 이 설정을 읽어 바로 반영하고, 폴더가 있는지(folder_ok)·마지막 접속(last_seen)을 적는다

create table public.sync_agents (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  machine     text not null,                 -- PC 이름 (hostname)
  platform    text,                          -- win32 / linux / darwin
  sales_dir   text,                          -- 읽을 영업 폴더 (그 PC 기준 경로)
  since       date,                          -- 이 날짜 이후 견적·계약만
  enabled     boolean not null default true,
  folder_ok   boolean,                       -- 마지막 확인 때 폴더가 있었는지
  last_seen   timestamptz,
  last_error  text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, machine)
);

alter table public.sync_agents enable row level security;
-- 자기 PC는 본인이, 모든 PC는 관리자가 본다·고친다
create policy "agents read"   on public.sync_agents for select to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');
create policy "agents insert" on public.sync_agents for insert to authenticated
  with check (user_id = auth.uid() and public.my_role() in ('member','admin','sync'));
create policy "agents update" on public.sync_agents for update to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin')
  with check (user_id = auth.uid() or public.my_role() = 'admin');
create policy "agents delete" on public.sync_agents for delete to authenticated
  using (user_id = auth.uid() or public.my_role() = 'admin');

create trigger sync_agents_touch before update on public.sync_agents for each row execute function public.touch_updated_at();

alter publication supabase_realtime add table public.sync_agents;
