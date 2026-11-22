// public/favicon.svg → 앱 아이콘 PNG·ICO 만들기 (Electron으로 그림)
//   npx electron scripts/make-icons.mjs
// 결과: build/icon.png(512), build/icon.ico(16~256), build/tray.png(32), public/icon-192.png, public/icon-512.png, public/apple-touch-icon.png(180)
import { app, BrowserWindow } from "electron";
import fs from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..");
const svg = fs.readFileSync(path.join(root, "public", "favicon.svg"), "utf8");

// 숨긴 창의 canvas에 SVG를 그려 PNG로 받는다 (화면 캡처 없이)
async function renderAll(win, sizes) {
  await win.loadURL("data:text/html,<html><body></body></html>");
  const src = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");
  const urls = await win.webContents.executeJavaScript(`(async () => {
    const img = new Image(); img.src = ${JSON.stringify(src)}; await img.decode();
    return ${JSON.stringify(sizes)}.map((s) => { const c = document.createElement("canvas"); c.width = c.height = s;
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high"; g.drawImage(img, 0, 0, s, s); return c.toDataURL("image/png"); });
  })()`);
  return Object.fromEntries(sizes.map((s, i) => [s, Buffer.from(urls[i].split(",")[1], "base64")]));
}

// ICO: PNG 그대로 담는 형식 (Windows Vista 이후 지원)
function ico(pngs) {
  const head = Buffer.alloc(6 + 16 * pngs.length);
  head.writeUInt16LE(0, 0); head.writeUInt16LE(1, 2); head.writeUInt16LE(pngs.length, 4);
  let off = head.length;
  pngs.forEach(({ size, png }, i) => {
    const e = 6 + 16 * i;
    head.writeUInt8(size >= 256 ? 0 : size, e); head.writeUInt8(size >= 256 ? 0 : size, e + 1);
    head.writeUInt16LE(1, e + 4); head.writeUInt16LE(32, e + 6);
    head.writeUInt32LE(png.length, e + 8); head.writeUInt32LE(off, e + 12);
    off += png.length;
  });
  return Buffer.concat([head, ...pngs.map((p) => p.png)]);
}

setTimeout(() => { console.error("시간 초과"); app.exit(1); }, 60_000);
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false });
  const out = await renderAll(win, [16, 24, 32, 48, 64, 128, 180, 192, 256, 512]);
  fs.mkdirSync(path.join(root, "build"), { recursive: true });
  fs.writeFileSync(path.join(root, "build", "icon.png"), out[512]);
  fs.writeFileSync(path.join(root, "build", "tray.png"), out[32]);
  fs.writeFileSync(path.join(root, "build", "icon.ico"), ico([16, 24, 32, 48, 64, 128, 256].map((size) => ({ size, png: out[size] }))));
  fs.writeFileSync(path.join(root, "public", "icon-192.png"), out[192]);
  fs.writeFileSync(path.join(root, "public", "icon-512.png"), out[512]);
  fs.writeFileSync(path.join(root, "public", "apple-touch-icon.png"), out[180]);
  console.log("아이콘을 만들었습니다");
  app.quit();
});
