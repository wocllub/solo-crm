-- 동기화 PC 폴더 찾아보기
--  - CRM 화면에서 「폴더 찾아보기」를 누르면 browse_path·browse_req_at 을 적는다
--  - 그 PC의 동기화 프로그램이 실시간으로 받아 그 폴더의 하위 폴더 목록을 browse_result 에 적는다
--    (브라우저는 PC 폴더 경로를 읽을 수 없어서, 폴더 목록은 항상 그 PC의 동기화 프로그램이 만든다)

alter table public.sync_agents
  add column browse_path   text,          -- 보고 싶은 폴더 (빈 값이면 드라이브·내 폴더 목록)
  add column browse_req_at timestamptz,   -- 요청 시각 (같은 경로를 다시 눌러도 새 요청이 되게)
  add column browse_result jsonb;         -- {req_at, path, parent, dirs:[이름], roots:[{label,path}], error}
