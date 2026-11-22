// 처음 설정: 이 PC에서 탐색기 「폴더 선택」 창으로 영업 폴더를 골라 바로 저장
//   npm run sync:pick
// 이 PC를 동기화 PC로 등록하고(없으면), 고른 폴더를 CRM 「동기화 PC·폴더 설정」에 저장한다.
// 켜져 있는 자동 동기화는 1분 안에 새 폴더로 바꿔 읽는다.
import { config } from "./config.ts";
import { connect } from "./push.ts";
import { syncAgent } from "./agent.ts";
import { pickFolderNative } from "./pick.ts";

const { sb, uid } = await connect();
const agent = await syncAgent(sb, uid);
console.log(`지금 영업 폴더: ${agent.root}${agent.folderOk ? "" : " (찾을 수 없음)"}`);
console.log("탐색기 「폴더 선택」 창을 띄웠습니다. 영업 폴더를 골라 「이 폴더 선택」을 누르세요…");
const chosen = await pickFolderNative(agent.folderOk ? agent.root : "");
if (!chosen) {
  console.log("취소했습니다. 바뀐 것은 없습니다.");
} else {
  const { error } = await sb.from("sync_agents").update({ sales_dir: chosen }).eq("id", agent.id);
  if (error) { console.error("저장하지 못했습니다: " + error.message); process.exitCode = 1; }
  else console.log(`저장했습니다: ${chosen}\n(기준일 ${config.since}. 자동 동기화가 켜져 있으면 1분 안에 새 폴더로 반영합니다.)`);
}
await sb.auth.signOut();
