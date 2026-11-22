// 데스크톱 앱의 main·preload 를 dist-electron/ 으로 묶는다 (동기화 코드·라이브러리 포함)
import { build } from "esbuild";

const common = { bundle: true, platform: "node", target: "node22", external: ["electron"], logLevel: "warning", legalComments: "none" };

await build({
  ...common,
  entryPoints: ["electron/main.ts"],
  outfile: "dist-electron/main.mjs",
  format: "esm",
  // 묶인 CommonJS 라이브러리(exceljs 등)가 require 를 쓸 수 있게
  banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" },
});

await build({
  ...common,
  entryPoints: ["electron/preload.ts"],
  outfile: "dist-electron/preload.cjs",
  format: "cjs",
});

console.log("dist-electron/ 준비 완료");
