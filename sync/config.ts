// 영업 폴더 동기화 설정
// 고객사마다 다른 값(영업 폴더, 우리 회사 이름)은 CRM 화면에서 정한다:
//  - 영업 폴더: 「자동 동기화 → 동기화 PC·폴더 설정」 (PC마다)
//  - 우리 회사 이름: 「자동 동기화 → 우리 회사 이름」 (관리자, settings.company)
// 환경변수는 처음 등록·명령줄 실행용 기본값이다.

export const config = {
  // 읽을 영업 폴더. CRM 설정이 우선이고, 처음 등록할 때만 SALES_DIR 을 쓴다
  root: process.env.SALES_DIR || "",
  // 이 날짜 이후 견적일·계약일만 반영
  since: process.env.SYNC_SINCE || "2026-01-01",
  // 거래 자료가 있는 최상위 폴더. 하나도 없으면 영업 폴더 전체를 본다
  includeTop: ["거래처", "고객사", "나라장터 입찰", "회사자료"],
  // 이름에 이 글자가 있으면 건너뜀
  skipName: [/^~\$/, /복사본/, /\.bak$/i],
  // 우리 회사 상호 (견적서 발신자로 당사 견적을 구분). setCompanyNames 로 채운다
  ourNames: [] as RegExp[],
  companyNames: [] as string[],
};

// 「(주)하늘」 → /하\s*늘/ 처럼 글자 사이 공백·(주) 표기를 무시하고 찾는다
export function setCompanyNames(names: string[]) {
  const clean = names.map((n) => n.replace(/㈜|\(주\)|주식회사|\s+/g, "")).filter(Boolean);
  config.companyNames = clean;
  config.ourNames = clean.map((n) => new RegExp([...n].map((c) => c.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*"), "i"));
}

// 명령줄 실행(시험 실행 등)에서는 OUR_COMPANY="하늘에이아이,HANUL AI" 처럼 줄 수 있다
if (process.env.OUR_COMPANY) setCompanyNames(process.env.OUR_COMPANY.split(","));

export const isOurs = (s: string) => config.ourNames.some((re) => re.test(s));
