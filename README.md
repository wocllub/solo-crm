# Solo-CRM

> 영업 폴더의 견적서·발주서·판매원장을 자동으로 읽어 영업 펀넬과 마진 목표를 관리하는 CRM
> 제작: **HANUL AI Inc. (하늘에이아이 주식회사)** — © 2026 HANUL AI Inc. All rights reserved.

Solo-CRM은 영업팀이 평소처럼 견적서·판매원장 엑셀을 영업 폴더(OneDrive 등)에 저장하면, 그 내용을 자동으로 읽어
대시보드(마진 목표 달성률·영업 펀넬), 견적 파이프라인, 판매원장(세금계산서·수금·분할 청구)에 반영합니다.
회사마다 자기 Supabase 프로젝트에 설치해 쓰므로 데이터는 회사별로 완전히 분리됩니다.

## 주요 기능

- **대시보드**: 마진·매출 목표 달성률 (마진만 · 매출만 · 둘 다 중 선택), 확정 마진, 확도 반영 예상 매출, 월별 누적 차트, 건별 기여, 영업 펀넬. 상자를 끌어서 자유롭게 배치 (사람마다 저장)
- **엑셀로 내보내기**: 요약 · 견적 파이프라인 · 판매원장 · 분할 청구를 .xlsx 파일 하나로 (머리글 「엑셀로 내보내기」)
- **견적 파이프라인**: 단계(견적제출 10% · 수정견적 30% · 발주서 접수 90% · 판매원장 100% · 실주), 필터·정렬·월 구분
- **판매원장**: 원가·판매가·마진율, 부가세(과세 10% 절사·영세율), 세금계산서 발행·수금 달력, 선금·중도금·잔금 분할 청구
- **영업 폴더 자동 동기화**: 견적서·발주서·판매원장 파일을 읽어 자동 반영, 같은 건의 수정본·대안 견적 묶기, 애매한 건은 「확인 필요」로
- **팀 공용**: 실시간 반영, 직원 가입 → 관리자 승인, 권한(보기 전용 / 편집 / 관리자)
- **데모 모드**: 설정 없이 샘플 데이터로 모든 화면을 둘러보기

## 기술 스택

| 영역 | 사용 기술 |
| --- | --- |
| 화면 | Vite + React + TypeScript, react-grid-layout |
| DB · 로그인 · 실시간 반영 | Supabase (Postgres, Auth, Realtime, RLS) |
| 자동 동기화 | Node.js (exceljs, unpdf) |
| 데스크톱 앱 | Electron, electron-builder (NSIS 설치 파일) |
| 웹 앱 | PWA (manifest, 서비스 워커) |
| 린트 | oxlint |

## 설치해서 쓰기

| 형태 | 용도 | 받는 곳 |
| --- | --- | --- |
| **Windows 데스크톱 앱** | CRM 화면 + 이 PC 영업 폴더 자동 동기화 (트레이에서 계속 실행) | Releases의 `Solo-CRM-Setup-x.y.z.exe` |
| **웹 앱** | 브라우저·휴대폰(iPhone/Android 홈 화면)에서 CRM 보기·입력 | 회사가 배포한 주소 (아래 「웹 앱 배포」) |

### Windows 데스크톱 앱

1. `Solo-CRM-Setup-x.y.z.exe`를 실행해 설치합니다 (코드 서명 전이라 「Windows의 PC 보호」가 뜨면 「추가 정보 → 실행」).
2. 처음 실행하면 **처음 설정** 화면에 회사 Supabase 주소와 공개 키를 넣습니다 (관리자에게 받음). 「데모로 둘러보기」도 있습니다.
3. 로그인합니다. **관리자 계정**으로 로그인한 PC는 영업 폴더 자동 동기화를 시작합니다.
4. 「자동 동기화」 탭에서 이 PC의 영업 폴더를 고릅니다 (「탐색기로 선택」).
5. 창을 닫아도 트레이(작업 표시줄 오른쪽 아래)에서 계속 동기화합니다. 트레이 메뉴: 열기 · 지금 동기화 · 잠시 멈춤 · 동기화 기록 보기 · Windows 시작 시 자동 실행 · 끝내기.

- 동기화는 앱 화면에서 로그인한 계정으로 합니다. 비밀번호를 파일에 두지 않습니다.
- 설정·기록 위치: `%APPDATA%\Solo-CRM\` (`config.json`, `logs\sync.log`)
- 명령줄 동기화(`npm run sync:watch`)를 시작프로그램에 둔 PC라면, 앱을 설치한 뒤 그 바로가기를 지워 둘이 함께 돌지 않게 하세요.

### 웹 앱 · iPhone

- 어떤 정적 호스팅에도 올릴 수 있습니다 (`npm run build` → `dist/`). Vercel은 `vercel.json`이 들어 있어 저장소를 연결하고 환경변수 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만 넣으면 됩니다.
- 배포한 주소를 Supabase **Authentication → URL Configuration**의 Site URL(또는 Redirect URLs)에 넣어야 비밀번호 재설정 메일이 그 주소로 옵니다.
- **iPhone**: Safari로 주소를 연 뒤 공유 버튼 → 「홈 화면에 추가」. 앱처럼 전체 화면으로 열립니다. (Android Chrome: 메뉴 → 「앱 설치」)
- 웹 앱은 영업 폴더를 읽지 않습니다. 자동 동기화는 데스크톱 앱(또는 명령줄)이 켜진 PC가 합니다.

## 시작하기 (개발)

필요한 것: Node.js 22 이상, Supabase 프로젝트 1개 (무료 플랜 가능)

```powershell
npm install
copy .env.example .env.local   # Supabase URL·공개 키 입력
npm run dev                    # http://localhost:5173
```

`.env.local`이 없으면 **데모 모드**로 열립니다 (이 브라우저에만 저장, 가상 동기화 PC 포함).

### Supabase 준비 (회사마다 한 번)

1. https://supabase.com 에서 새 프로젝트를 만듭니다 (지역: 가까운 곳, 예: Seoul). 「Grant API access to new tables automatically」를 켭니다.
2. **SQL Editor**에서 `supabase/migrations/` 의 파일을 번호 순서대로 실행합니다 (`0001` → `0005`).
3. **Authentication → URL Configuration**의 Site URL을 앱 주소로 바꿉니다 (개발: `http://localhost:5173`).
4. **Project Settings → API**의 Project URL과 공개(anon / publishable) 키를 `.env.local`에 넣습니다. service_role·secret 키는 쓰지 않습니다.
5. 앱에서 가입한 뒤 SQL Editor에서 첫 사용자를 관리자로 지정합니다:
   `update public.profiles set role = 'admin' where id = (select id from auth.users where email = '<가입한 이메일>');`
6. 이후 가입하는 직원은 「승인 대기」로 시작합니다. **Table Editor → profiles**에서 `role`을 `member`(편집) 또는 `viewer`(보기 전용)로 바꾸면 승인됩니다.
7. CRM 「자동 동기화」 탭에서 **우리 회사 이름**(견적서 발신자 상호)을 정합니다.

## 데이터 구조

| 테이블 | 내용 |
| --- | --- |
| `deals` | 견적 파이프라인 (단계·확도·금액, 동기화 출처 `source_key`·`source_files`, 손으로 고친 칸 `locked`) |
| `ledger` | 판매원장 (판매가·원가·과세 구분·계산서·수금, 분할 청구 `parts`) |
| `settings` | `main` 연간 목표 (`target` 마진 · `salesTarget` 매출 · `show` 보일 목표), `layout` 팀 기본 배치, `company` 우리 회사 이름 |
| `dashboard_layouts` | 직원별 대시보드 배치 |
| `profiles` | 직원 이름·권한 (`pending` / `viewer` / `member` / `admin` / `sync`) |
| `sync_agents` | 동기화 PC (영업 폴더·기준일·켜기/끄기·상태·폴더 찾아보기) |
| `sync_issues`, `sync_runs` | 확인 필요 목록, 동기화 실행 기록 |

권한(RLS): 승인된 직원(`viewer` 이상)만 읽기, `member`·`admin`은 견적·판매원장 쓰기, 팀 설정은 `admin`만. 동기화 PC 설정은 본인 PC는 본인이, 모든 PC는 관리자가.

## 영업 폴더 자동 동기화

각 PC에서 동기화 프로그램을 켜 두면, 그 PC의 영업 폴더가 바뀔 때 30초 뒤 CRM에 반영합니다 (30분마다 한 번 더 확인).

```powershell
npm run sync:dry-run   # 시험 실행: 읽기만 하고 sync/out/dry-run.html 보고서 생성
npm run sync           # 한 번 반영
npm run sync:watch     # 계속 켜 두기 (Windows: sync/start-hidden.vbs 를 시작프로그램에 두면 창 없이 자동 시작)
npm run sync:pick      # 이 PC의 영업 폴더를 탐색기 창으로 골라 저장
npm run sync:stop      # 끄기
```

동기화 프로그램은 `.env.local`의 `SYNC_EMAIL` / `SYNC_PASSWORD` 계정(관리자 또는 `sync` 역할)으로 로그인합니다. 비밀번호에 `#`이 있으면 큰따옴표로 감쌉니다.

### 읽는 규칙

| 파일 | 인식 방법 | CRM 반영 |
| --- | --- | --- |
| 당사 견적서 엑셀 (`Q u o t a t i o n` 양식, 발신자가 우리 회사) | 수신·프로젝트·견적번호·견적일자·견적금액·담당 칸의 이름표를 찾아 읽음 | 견적제출 10% |
| 같은 폴더·같은 프로젝트의 날짜가 다른 견적 | 묶어서 최신만 사용, 이전 금액은 비고 | 수정견적 30% |
| 같은 날 같은 견적번호 여러 파일 | 수정본 — 가장 나중에 저장한 파일 | 단계 유지 |
| 같은 날 다른 견적번호·여러 시트 | 대안 견적 — 가장 작은 번호(1안) 금액, 나머지는 비고 | 단계 유지 |
| 엑셀 없이 PDF만 있는 당사 견적 | PDF 글자를 읽음 | 엑셀과 같음 |
| 발주서 (파일 이름) | 같은 폴더의 건 중 이름이 가장 비슷한 건 | 발주서 접수 90% |
| 판매관리원장 엑셀 | 업체명·계약금액·원가·계약일. 거래처·금액·사업명·모델명·폴더로 견적과 연결 | 판매원장 + 견적 100% (금액은 계약금액) |
| 견적서 없는 판매원장 | 판매원장 내용으로 새 건 | 100% |
| 다른 회사가 보낸 견적서 (매입 견적) | 당사 양식이 아님 | 제외 |

- 견적금액이 「VAT포함」이면 1.1로 나눠 VAT 별도로 맞춥니다 (원 미만 절사).
- 견적번호는 거래처까지 같아야 같은 건으로 봅니다.
- 여러 번 실행해도 같은 건은 1건입니다 (`source_key`). 아무것도 지우지 않습니다.
- CRM 화면에서 사람이 고친 칸은 다시 덮어쓰지 않습니다. 세금계산서 발행·수금·분할 청구는 동기화가 쓰지 않습니다.
- 애매한 건은 짐작하지 않고 「확인 필요」로 남깁니다.
- 거래처·고객사 같은 최상위 폴더가 있으면 그 안만 보고, 없으면 영업 폴더 전체를 봅니다 (`sync/config.ts`).

### 동기화 PC·폴더 설정 (CRM 「자동 동기화」 탭)

- 동기화 프로그램을 켠 PC는 스스로 등록됩니다. PC마다 **영업 폴더**, **기준일**, **켜기/끄기**를 정합니다.
- **폴더 찾아보기**: 그 PC의 동기화 프로그램이 드라이브·내 폴더·OneDrive와 하위 폴더 목록을 보내 줍니다.
- **탐색기로 선택**: 그 PC 화면에 Windows 탐색기 「폴더 선택」 창을 띄워 고릅니다 (리눅스는 zenity).
- 폴더 찾아보기·선택은 동기화를 하지 않습니다. 「저장」을 눌러야 바뀝니다.

## 대시보드 배치

상자 위쪽 ⠿ 막대를 잡고 끌어 옮기고, 오른쪽 아래 모서리로 크기를 바꿉니다. × 로 숨기기, 「기본 배치로」, 관리자는 「이 배치를 팀 기본값으로」. 휴대폰 폭에서는 한 줄로 보여 줍니다.

## 스크립트

| 명령 | 설명 |
| --- | --- |
| `npm run dev` | 개발 서버 |
| `npm run build` | 타입 검사 + 빌드 (`dist/`) |
| `npm run lint` | oxlint |
| `npm run typecheck:sync` | 동기화 프로그램 타입 검사 |
| `npx vite --mode demo` | 데모 모드로 열기 (`.env.demo.local`에 Supabase 값을 비워 둠) |
| `npm run app` | 데스크톱 앱을 빌드해 바로 실행 |
| `npm run dist:win` | Windows 설치 파일 만들기 (`release/Solo-CRM-Setup-x.y.z.exe`) |
| `npm run icons` | `public/favicon.svg`로 앱 아이콘(PNG·ICO) 다시 만들기 |

## 라이선스

© 2026 HANUL AI Inc. (하늘에이아이 주식회사). All rights reserved. 자세한 내용은 [LICENSE](LICENSE)를 보세요.
