-- 관리자 계정 하나로 자동 동기화도 돌릴 수 있게 한다 (별도 sync 계정은 선택)
--  - 동기화 프로그램이 보낸 변경에는 sync_write = true 를 붙인다
--  - 잠금 트리거는 그 표시가 있으면 잠그지 않고 표시를 다시 false 로 돌려 저장한다
--    (화면에서 고친 변경은 이 칸을 보내지 않으므로 지금처럼 잠긴다)

alter table public.deals  add column sync_write boolean not null default false;
alter table public.ledger add column sync_write boolean not null default false;

create or replace function public.lock_manual_edits() returns trigger language plpgsql as $$
declare k text;
begin
  if new.sync_write then
    new.sync_write := false;
    return new;
  end if;
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

-- 실행 기록은 관리자도 쓸 수 있게
drop policy "runs write" on public.sync_runs;
create policy "runs write" on public.sync_runs for all to authenticated
  using (public.my_role() in ('sync','admin')) with check (public.my_role() in ('sync','admin'));
