# Solo-CRM — 작업 메모 (HANUL AI Inc.)

- 제품: HANUL AI Inc.(하늘에이아이 주식회사)가 만든 Solo-CRM. 고객사별 값(우리 회사 이름, 영업 폴더)은 CRM 설정으로 두고 코드에 넣지 않는다. 실제 거래처 이름·금액을 코드·주석·커밋 메시지에 쓰지 않는다(공개 저장소).

- 목표: `legacy/index.html`(Claude 아티팩트 원본, 단일 HTML)을 Vite + React + TS + Supabase 앱으로 옮겨 GitHub에 올림.
- 원본은 참고용으로만 두고 수정하지 않는다. 화면 동작·문구·계산식(확도, 부가세 10% 절사, 분할 청구 합계 검증 등)은 원본을 기준으로 맞춘다.
- 원본의 `window.claude.use("db")` / `onSnapshot` → Supabase 테이블 + Realtime, `window.claude.use("user")` → Supabase Auth + `profiles`.
- 구조: 화면은 `src/views/`, 공용 UI `src/components/ui.tsx`, 계산식 `src/lib/calc.ts`, 전역 상태 `src/lib/crm.tsx`. 화면은 `Backend` 인터페이스(`src/lib/backend.ts`)만 쓰고, `.env.local`이 없으면 `src/lib/demo.ts`(localStorage) 구현이 쓰인다.
- 앱 내부 타입(`src/lib/types.ts`)은 원본 필드 이름(camelCase) 그대로. snake_case 변환은 `backend.ts`의 `*FromRow`/`*ToRow`에서만.
- DB 필드 이름: 원본 `end` → `end_client`, `dealId` → `deal_id`, `taxType` → `tax_type`, `invoicedAt`/`paidAt`/`createdAt` 등은 snake_case. `parts` 안의 키(`paidDate` 등)는 원본 그대로.
- 스키마: `supabase/migrations/` — 바꿀 때는 새 번호 파일을 추가한다.
- UI 문구는 한국어. 금액 단위는 원, VAT 별도.
- 비밀 값은 `.env.local`에만 둔다 (git 제외).
- 확인: `npm run build`, `npm run lint`, 개발 서버 `npm run dev` (포트 5173, `.claude/launch.json`).
