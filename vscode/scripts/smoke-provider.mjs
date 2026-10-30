/**
 * Provider 级冒烟测试：用编译产物（out/src）+ vscode 模块打桩，
 * 直连真实端点验证修复后的 CustomProvider 完整路径（非流式 + 清洗层 + 重试）。
 *
 * 用法（先 npm run compile-tests）：
 *   node scripts/smoke-provider.mjs [--ref HEAD~1]
 */

import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const vscodeDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// ---- vscode 模块打桩（outputChannel 日志直通 console，配置返回默认值） ----
const Module = require("node:module");
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === "vscode") {
    return {
      window: {
        createOutputChannel: () => ({
          appendLine: (msg) => console.log(`    [ch] ${String(msg).slice(0, 300)}`),
          show() {},
          clear() {},
        }),
      },
      workspace: {
        getConfiguration: () => ({ get: (_k, d) => d }),
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { CustomProvider } = require("../out/src/ai/providers/customProvider.js");

// ---- 样本（与 model-benchmark.mjs 同源逻辑） ----
function gitCapture(args) {
  return execFileSync("git", args, { cwd: vscodeDir, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
}

const ref = process.argv.includes("--ref")
  ? process.argv[process.argv.indexOf("--ref") + 1]
  : "HEAD~1";

const repoRoot = gitCapture(["rev-parse", "--show-toplevel"]).trim();
const diff = gitCapture(["show", ref, "--format=", "--unified=3"]).slice(0, 30000);
const changedFiles = gitCapture(["diff-tree", "--no-commit-id", "--name-status", "-r", ref])
  .split("\n").filter(Boolean)
  .map((line) => {
    const [status, ...paths] = line.split("\t");
    return { path: paths[paths.length - 1], status: status[0] };
  });

const bugResp = JSON.parse(
  require("node:fs").readFileSync(path.join(vscodeDir, "src/zendao/bug-data.json"), "utf8"),
);
const bug = bugResp.bug ?? {};
const severityMap = { "1": "致命", "2": "严重", "3": "一般", "4": "次要" };
const zendaoInfo = {
  id: bug.id,
  title: bug.title,
  status: bug.status,
  assignedTo: bug.assignedTo,
  openedBy: bug.openedBy,
  openedDate: bug.openedDate,
  lastEditedDate: bug.lastEditedDate,
  type: bug.type,
  severity: severityMap[bug.severity] || "一般",
  priority: bug.pri,
  steps: bug.steps,
  product: bugResp.products?.[bugResp.productID] || "",
  module: (bugResp.modulePath ?? []).map((m) => m.name).join(" -> "),
  description: bugResp.title,
};

// ---- 执行 ----
const provider = new CustomProvider({
  provider: "custom",
  timeout: 30000,
  commitTimeout: 60000,
  bugReasonTimeout: 60000,
  requestRetryCount: 1,
  customEndpoint: "http://192.168.100.56:9901/v1/chat/completions",
  customApiKey: "EMPTY",
  customModel: "qwen3.8-flash-next",
});

console.log(`\n=== 冒烟: generateCommitMessage (ref=${ref}, ${changedFiles.length} 文件, diff ${diff.length} 字符) ===`);
const t1 = Date.now();
const message = await provider.generateCommitMessage(diff, changedFiles);
console.log(`  耗时 ${Date.now() - t1}ms`);
console.log(`  结果:\n${message.split("\n").map((l) => `    | ${l}`).join("\n")}`);

console.log(`\n=== 冒烟: generateReason (BUG#${zendaoInfo.id}) ===`);
const t2 = Date.now();
const reason = await provider.generateReason(diff, changedFiles, { zendaoInfo });
console.log(`  耗时 ${Date.now() - t2}ms`);
console.log(`  结果:\n${reason.split("\n").map((l) => `    | ${l}`).join("\n")}`);

console.log("\n=== 冒烟通过 ===");
