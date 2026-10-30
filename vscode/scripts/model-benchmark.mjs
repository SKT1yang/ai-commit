/**
 * qwen3.8-flash-next 模型基准测试脚本
 *
 * 用途：实测 custom endpoint 上默认模型的能力与情况，为两条主流程优化提供数据：
 *   - stream:true 时服务端到底返回 SSE 还是 JSON（现网 customProvider 的 stream/parse 不匹配问题）
 *   - 思考模式（<think> / reasoning_content）的占比与耗时影响、关思考开关是否生效
 *   - commit / bug reason 两个真实 prompt 的失败率、时延、输出格式合规率
 *   - 端点并发排队情况（评估禅道流程两次 AI 调用并行化的可行性）
 *
 * 用法（在 vscode/ 目录下运行）：
 *   node scripts/model-benchmark.mjs [--repeat 3] [--cases P0,P2] [--timeout 90000]
 *        [--endpoint http://...] [--model xxx] [--api-key EMPTY] [--ref HEAD~1]
 *        [--diff-file <path>] [--json-out <path>]
 *
 * 不进扩展打包：scripts/ 不在 esbuild entryPoints 内。
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import esbuild from "esbuild";

// ---------- 路径与常量 ----------

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const vscodeDir = path.resolve(scriptDir, "..");
const benchmarkDir = path.join(vscodeDir, ".benchmark");
const shimPath = path.join(scriptDir, "vscode-shim.mjs");

const DEFAULTS = {
  endpoint: "http://192.168.100.56:9901/v1/chat/completions",
  model: "qwen3.8-flash-next",
  apiKey: "EMPTY",
  repeat: 3,
  timeout: 90_000,
  ref: "HEAD~1",
  maxDiffChars: 30_000,
  fallbackMessage: "✨ feat(misc): 更新代码",
};

// ---------- CLI 参数 ----------

function parseArgs(argv) {
  const args = {
    endpoint: process.env.BENCH_ENDPOINT || DEFAULTS.endpoint,
    model: process.env.BENCH_MODEL || DEFAULTS.model,
    apiKey: process.env.BENCH_API_KEY || DEFAULTS.apiKey,
    repeat: DEFAULTS.repeat,
    timeout: DEFAULTS.timeout,
    ref: DEFAULTS.ref,
    diffFile: null,
    jsonOut: null,
    cases: null,
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const next = () => argv[++i];
    switch (k) {
      case "--endpoint": args.endpoint = next(); break;
      case "--model": args.model = next(); break;
      case "--api-key": args.apiKey = next(); break;
      case "--repeat": args.repeat = parseInt(next(), 10); break;
      case "--timeout": args.timeout = parseInt(next(), 10); break;
      case "--ref": args.ref = next(); break;
      case "--diff-file": args.diffFile = next(); break;
      case "--json-out": args.jsonOut = next(); break;
      case "--cases": args.cases = next().split(",").map((s) => s.trim()); break;
      default: console.warn(`未知参数: ${k}`);
    }
  }
  return args;
}

const cliArgs = parseArgs(process.argv.slice(2));

// ---------- 复用 TS 源码（esbuild alias 打桩） ----------

async function bundlePromptModules() {
  fs.mkdirSync(benchmarkDir, { recursive: true });
  await esbuild.build({
    entryPoints: [
      path.join(vscodeDir, "src/ai/utils/buildPrompt.ts"),
      path.join(vscodeDir, "src/ai/utils/extractCommitMessage.ts"),
      path.join(vscodeDir, "src/ai/utils/enforceConventionalCommit.ts"),
    ],
    bundle: true,
    format: "esm",
    platform: "node",
    outdir: benchmarkDir,
    alias: { vscode: shimPath },
    logLevel: "silent",
  });
  // 标记产物为 ESM，避免 Node 的 MODULE_TYPELESS_PACKAGE_JSON 警告
  fs.writeFileSync(
    path.join(benchmarkDir, "package.json"),
    JSON.stringify({ type: "module" }),
  );

  const load = async (f) => import(pathToFileURL(path.join(benchmarkDir, f)).href);
  const [buildPrompt, extract, enforce] = await Promise.all([
    load("buildPrompt.js"),
    load("extractCommitMessage.js"),
    load("enforceConventionalCommit.js"),
  ]);
  return {
    buildBasePrompt: buildPrompt.buildBasePrompt,
    buildBugReasonPrompt: buildPrompt.buildBugReasonPrompt,
    extractCommitMessage: extract.extractCommitMessage,
    isValidCommitLine: extract.isValidCommitLine,
    enforceConventionalCommit: enforce.enforceConventionalCommit,
  };
}

// ---------- 样本数据 ----------

function gitCapture(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
}

function loadSamples() {
  const repoRoot = gitCapture(["rev-parse", "--show-toplevel"], vscodeDir).trim();

  let diff;
  if (cliArgs.diffFile) {
    diff = fs.readFileSync(cliArgs.diffFile, "utf8");
  } else {
    diff = gitCapture(
      ["show", cliArgs.ref, "--format=", "--unified=3"],
      repoRoot,
    );
  }
  if (diff.length > cliArgs.maxDiffChars) {
    diff = diff.slice(0, cliArgs.maxDiffChars);
  }

  const nameStatus = gitCapture(
    ["diff-tree", "--no-commit-id", "--name-status", "-r", cliArgs.ref],
    repoRoot,
  );
  // R/C 状态行格式为 "R100\t旧路径\t新路径"，取新路径
  const changedFiles = nameStatus
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, ...paths] = line.split("\t");
      return { path: paths[paths.length - 1], status: status[0] };
    });

  // 禅道 bug 样本：按 zentaoService.buildZendaoInfo 的字段映射逻辑拼 ZendaoInfo
  const resp = JSON.parse(
    fs.readFileSync(path.join(vscodeDir, "src/zendao/bug-data.json"), "utf8"),
  );
  const bug = resp?.bug ?? {};
  let productName = "";
  Object.keys(resp.products || {}).forEach((key) => {
    if (key === resp.productID) productName = resp.products[key];
  });
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
    product: productName,
    module: (resp?.modulePath ?? []).map((m) => m.name).join(" -> "),
    description: resp.title,
  };

  return { diff, changedFiles, zendaoInfo };
}

// ---------- 请求与指标采集 ----------

function chatBody({ messages, temperature, maxTokens, stream = false, extra = {} }) {
  return {
    model: cliArgs.model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream,
    ...extra,
  };
}

function post(body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  return fetch(cliArgs.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${cliArgs.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: controller.signal,
  }).then(
    (response) => {
      clearTimeout(timer);
      return { response, ttfbMs: Date.now() - startedAt };
    },
    (error) => {
      clearTimeout(timer);
      throw error;
    },
  );
}

/** 非流式请求：一次性读 JSON，采集全套指标 */
async function requestOnce(body, timeoutMs) {
  const record = {
    ok: false,
    failType: null,
    httpStatus: null,
    contentType: null,
    ttfbMs: null,
    totalMs: null,
    finishReason: null,
    usage: null,
    hasThinkTag: false,
    hasReasoningContent: false,
    formatOk: null,
    extractedOk: null,
    postFixOk: null,
    output: "",
    rawHead: "",
    error: null,
  };

  const startedAt = Date.now();
  try {
    const { response, ttfbMs } = await post(body, timeoutMs);
    record.ttfbMs = ttfbMs;
    record.httpStatus = response.status;
    record.contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      record.failType = "http";
      record.error = (await response.text()).slice(0, 500);
      record.totalMs = Date.now() - startedAt;
      return record;
    }

    const text = await response.text();
    record.totalMs = Date.now() - startedAt;

    let data;
    try {
      data = JSON.parse(text);
    } catch {
      record.failType = record.contentType.includes("event-stream")
        ? "sse_but_json"
        : "json";
      record.rawHead = text.slice(0, 500);
      return record;
    }

    record.hasReasoningContent = Boolean(
      data?.choices?.[0]?.message?.reasoning_content,
    );
    record.finishReason = data?.choices?.[0]?.finish_reason ?? null;
    record.usage = data?.usage ?? null;

    let content = data?.choices?.[0]?.message?.content;
    if (!content) content = data?.choices?.[0]?.text || "";
    record.output = (content ?? "").toString();
    record.hasThinkTag = record.output.includes("<think>");
    record.rawHead = record.output.slice(0, 200);

    if (!record.output.trim()) {
      record.failType = "empty";
      return record;
    }

    record.ok = true;
    return record;
  } catch (error) {
    record.failType = error.name === "AbortError" ? "timeout" : "network";
    record.error = String(error?.message || error).slice(0, 500);
    record.totalMs = Date.now() - startedAt;
    return record;
  }
}

/** 流式 SSE 请求：逐帧解析，采集 TTFB（首 data 帧）与思考/正文 token 分布 */
async function requestStreamOnce(body, timeoutMs) {
  const record = {
    ok: false,
    failType: null,
    httpStatus: null,
    contentType: null,
    ttfbMs: null,
    totalMs: null,
    finishReason: null,
    usage: null,
    hasThinkTag: false,
    hasReasoningContent: false,
    formatOk: null,
    extractedOk: null,
    postFixOk: null,
    output: "",
    rawHead: "",
    error: null,
    reasoningChars: 0,
    contentChars: 0,
  };

  const startedAt = Date.now();
  let response;
  try {
    ({ response } = await post(body, timeoutMs));
  } catch (error) {
    record.failType = error.name === "AbortError" ? "timeout" : "network";
    record.error = String(error?.message || error).slice(0, 500);
    record.totalMs = Date.now() - startedAt;
    return record;
  }

  record.httpStatus = response.status;
  record.contentType = response.headers.get("content-type") || "";
  if (!response.ok) {
    record.failType = "http";
    record.error = (await response.text()).slice(0, 500);
    record.totalMs = Date.now() - startedAt;
    return record;
  }
  if (!record.contentType.includes("event-stream")) {
    // 服务端不支持流式（网关忽略了 stream 参数），退化为整体 JSON
    const text = await response.text();
    record.failType = "sse_but_json";
    record.rawHead = text.slice(0, 500);
    try {
      const data = JSON.parse(text);
      record.output = data?.choices?.[0]?.message?.content ?? "";
      record.finishReason = data?.choices?.[0]?.finish_reason ?? null;
    } catch { /* 保持 sse_but_json */ }
    record.totalMs = Date.now() - startedAt;
    return record;
  }

  // 读流阶段 post 的超时已失效，用 deadline 竞速兜底
  let deadlineTimer;
  const deadline = new Promise((_, reject) => {
    deadlineTimer = setTimeout(
      () => reject(Object.assign(new Error("read deadline"), { name: "AbortError" })),
      timeoutMs,
    );
  });

  try {
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let output = "";
    let done = false;
    while (!done) {
      const chunk = await Promise.race([reader.read(), deadline]);
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (record.ttfbMs === null) record.ttfbMs = Date.now() - startedAt;
        if (payload === "[DONE]") { done = true; break; }
        try {
          const frame = JSON.parse(payload);
          const delta = frame?.choices?.[0]?.delta ?? {};
          if (delta.reasoning_content) {
            record.reasoningChars += String(delta.reasoning_content).length;
            record.hasReasoningContent = true;
          }
          if (delta.content) {
            output += String(delta.content);
            record.contentChars += String(delta.content).length;
          }
          if (frame?.choices?.[0]?.finish_reason) {
            record.finishReason = frame.choices[0].finish_reason;
          }
          if (frame?.usage) record.usage = frame.usage;
        } catch { /* 忽略无法解析的帧 */ }
      }
    }

    record.totalMs = Date.now() - startedAt;
    record.output = output;
    record.hasThinkTag = output.includes("<think>");
    record.rawHead = output.slice(0, 200);
    record.ok = Boolean(output.trim());
    if (!record.ok) record.failType = "empty";
    return record;
  } catch (error) {
    record.failType = error.name === "AbortError" ? "timeout" : "network";
    record.error = String(error?.message || error).slice(0, 500);
    record.totalMs = Date.now() - startedAt;
    return record;
  } finally {
    clearTimeout(deadlineTimer);
  }
}

// ---------- 格式合规检查（仅 commit 类用例） ----------

function attachFormatChecks(record, mods, samples) {
  if (!record.ok) return;
  const firstLine = record.output
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l);
  record.formatOk = Boolean(firstLine && mods.isValidCommitLine(firstLine));

  const extracted = mods.extractCommitMessage(record.output.trim());
  record.extractedOk = extracted.trim() !== DEFAULTS.fallbackMessage;

  try {
    const fixed = mods.enforceConventionalCommit(
      extracted,
      samples.changedFiles,
      samples.diff,
    );
    record.postFixOk = Boolean(fixed && fixed.trim());
  } catch {
    record.postFixOk = false;
  }
}

// ---------- 用例定义 ----------

function defineCases(mods, samples) {
  const commitPrompt = mods.buildBasePrompt(samples.diff, samples.changedFiles);
  const reasonPrompt = mods.buildBugReasonPrompt(samples.diff, samples.changedFiles, {
    zendaoInfo: samples.zendaoInfo,
  });

  // P7：按 "## 变更文件信息" 把模板切成 system（规则）/ user（数据）两半
  const splitAt = commitPrompt.indexOf("## 变更文件信息");

  const sanityBody = () =>
    chatBody({
      messages: [{ role: "user", content: "回复：OK" }],
      temperature: 0,
      maxTokens: 16,
    });

  const commitBody = (extra = {}, promptOverride = null) =>
    chatBody({
      messages: [
        { role: "user", content: promptOverride ?? commitPrompt },
      ],
      temperature: 0.3,
      maxTokens: 4096,
      ...extra,
    });

  return [
    {
      id: "P0",
      desc: "连通性 sanity（stream:false, max_tokens=16）",
      kind: "sanity",
      run: () => requestOnce(sanityBody(), cliArgs.timeout),
    },
    {
      id: "P1",
      desc: "stream 行为探测（stream:true，先看 content-type 再读原文）",
      kind: "sanity",
      run: async () => {
        // requestOnce 已按 content-type 标记 sse_but_json / json
        return requestOnce(
          chatBody({
            messages: [{ role: "user", content: "回复：OK" }],
            temperature: 0,
            maxTokens: 16,
            stream: true,
          }),
          cliArgs.timeout,
        );
      },
    },
    {
      id: "P2",
      desc: "commit 现网基线（temp=1.0, max_tokens=4096，仅去掉 stream:true）",
      kind: "commit",
      run: async () => {
        const record = await requestOnce(
          chatBody({ messages: [{ role: "user", content: commitPrompt }], temperature: 1.0, maxTokens: 4096 }),
          cliArgs.timeout,
        );
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P3",
      desc: "commit 修正参数（temp=0.3）",
      kind: "commit",
      run: async () => {
        const record = await requestOnce(commitBody(), cliArgs.timeout);
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P4",
      desc: "关思考-顶层参数 enable_thinking:false",
      kind: "commit",
      run: async () => {
        const record = await requestOnce(
          commitBody({ extra: { enable_thinking: false } }),
          cliArgs.timeout,
        );
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P5",
      desc: "关思考-模板参数 chat_template_kwargs",
      kind: "commit",
      run: async () => {
        const record = await requestOnce(
          commitBody({
            extra: { chat_template_kwargs: { enable_thinking: false } },
          }),
          cliArgs.timeout,
        );
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P6",
      desc: "关思考-软开关 /no_think",
      kind: "commit",
      run: async () => {
        const record = await requestOnce(
          commitBody({}, `${commitPrompt}\n\n/no_think`),
          cliArgs.timeout,
        );
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P7",
      desc: "格式规则拆 system message",
      kind: "commit",
      run: async () => {
        const messages =
          splitAt > 0
            ? [
                { role: "system", content: commitPrompt.slice(0, splitAt) },
                { role: "user", content: commitPrompt.slice(splitAt) },
              ]
            : [{ role: "user", content: commitPrompt }];
        const record = await requestOnce(
          chatBody({ messages, temperature: 0.3, maxTokens: 4096 }),
          cliArgs.timeout,
        );
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P8",
      desc: "bug reason 基线（复刻 generateReason 参数）",
      kind: "reason",
      run: () =>
        requestOnce(
          chatBody({ messages: [{ role: "user", content: reasonPrompt }], temperature: 0.3, maxTokens: 2000 }),
          cliArgs.timeout,
        ),
    },
    {
      id: "P9",
      desc: "max_tokens=1024 压力（思考吃预算 → finish=length 频率）",
      kind: "commit",
      run: async () => {
        const record = await requestOnce(
          chatBody({ messages: [{ role: "user", content: commitPrompt }], temperature: 0.3, maxTokens: 1024 }),
          cliArgs.timeout,
        );
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P10",
      desc: "流式时延分解（仅当 P1 证实返回 SSE 时执行）",
      kind: "commit",
      enabled: (ctx) => ctx.p1Sse,
      run: async () => {
        const record = await requestStreamOnce(commitBody(), cliArgs.timeout);
        attachFormatChecks(record, mods, samples);
        return record;
      },
    },
    {
      id: "P11",
      desc: "并发排队探测（两个 sanity 并发，对比 P0 串行 p50）",
      kind: "concurrency",
      // 每轮发 2 个并发请求，重复 repeat 轮
      multiplier: 2,
      run: () => requestOnce(sanityBody(), cliArgs.timeout),
    },
  ];
}

// ---------- 统计与输出 ----------

function percentile(sorted, p) {
  if (!sorted.length) return null;
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function summarizeCase(id, records) {
  const okRecords = records.filter((r) => r.ok);
  const totals = records
    .map((r) => r.totalMs)
    .filter((v) => typeof v === "number")
    .sort((a, b) => a - b);
  const ttfbs = records
    .map((r) => r.ttfbMs)
    .filter((v) => typeof v === "number")
    .sort((a, b) => a - b);
  const pct = (arr, p) => (arr.length ? `${Math.round(percentile(arr, p))}` : "-");

  const failTypes = {};
  records.forEach((r) => {
    if (!r.ok) failTypes[r.failType || "?"] = (failTypes[r.failType || "?"] || 0) + 1;
  });
  const failSummary = Object.entries(failTypes)
    .map(([k, v]) => `${k}:${v}`)
    .join("|") || "-";

  const rate = (pred) => {
    const valid = records.filter((r) => r.ok);
    if (!valid.length) return "-";
    return `${Math.round((valid.filter(pred).length / valid.length) * 100)}%`;
  };

  return {
    用例: id,
    成功率: `${okRecords.length}/${records.length}`,
    失败分布: failSummary,
    "p50总耗时ms": pct(totals, 50),
    "p95总耗时ms": pct(totals, 95),
    "p50TTFBms": pct(ttfbs, 50),
    格式合规: rate((r) => r.formatOk === true),
    提取成功: rate((r) => r.extractedOk === true),
    think标签: rate((r) => r.hasThinkTag),
    reasoning字段: rate((r) => r.hasReasoningContent),
    "finish=length": rate((r) => r.finishReason === "length"),
  };
}

// ---------- 主流程 ----------

async function main() {
  console.log("打包复用 TS 源码...");
  const mods = await bundlePromptModules();
  console.log("加载样本数据...");
  const samples = loadSamples();
  console.log(
    `diff: ${samples.diff.length} 字符, 文件: ${samples.changedFiles.length} 个, 禅道: BUG#${samples.zendaoInfo.id}`,
  );
  console.log(`端点: ${cliArgs.endpoint}  模型: ${cliArgs.model}\n`);

  const cases = defineCases(mods, samples)
    .filter((c) => !cliArgs.cases || cliArgs.cases.includes(c.id));

  const results = {}; // caseId -> records[]
  const context = {}; // 用例间依赖（如 P10 依赖 P1 结论）

  for (const testCase of cases) {
    if (testCase.enabled && !testCase.enabled(context)) {
      console.log(`[跳过] ${testCase.id}: 前置条件不满足`);
      results[testCase.id] = [];
      continue;
    }
    const rounds = cliArgs.repeat * (testCase.multiplier || 1);
    const records = [];
    process.stdout.write(`[${testCase.id}] ${testCase.desc} `);
    for (let i = 0; i < rounds; i++) {
      // P11：每轮 2 个并发；其余顺序执行
      if (testCase.multiplier) {
        const pair = await Promise.all([
          testCase.run(),
          testCase.run(),
        ]);
        records.push(...pair);
        process.stdout.write(i % 2 === 1 ? "#" : ".");
      } else {
        records.push(await testCase.run());
        process.stdout.write(".");
      }
    }
    process.stdout.write("\n");
    results[testCase.id] = records;
    if (testCase.id === "P1") {
      context.p1Sse = records.some(
        (r) => (r.contentType || "").includes("event-stream"),
      );
      console.log(
        `  → P1 结论: ${context.p1Sse ? "服务端返回 SSE（stream/parse 不匹配实锤）" : "服务端忽略 stream 参数，返回整体 JSON"}`,
      );
    }
  }

  // 汇总表
  const table = Object.entries(results)
    .filter(([, records]) => records.length > 0)
    .map(([id, records]) => summarizeCase(id, records));
  console.log("\n========== 汇总 ==========");
  console.table(table);

  // P11 对比参考
  const p0 = (results.P0 || []).map((r) => r.totalMs).filter(Boolean).sort((a, b) => a - b);
  const p11 = (results.P11 || []).map((r) => r.totalMs).filter(Boolean).sort((a, b) => a - b);
  if (p0.length && p11.length) {
    const p0p50 = percentile(p0, 50);
    const p11p50 = percentile(p11, 50);
    const ratio = p0p50 ? (p11p50 / p0p50).toFixed(2) : "?";
    console.log(
      `P11 并发排队: 串行 p50=${p0p50}ms, 并发 p50=${p11p50}ms, 恶化 ${ratio}x ${Number(ratio) > 2 ? "（>2x，并行化建议默认关闭）" : "（可接受，可并行）"}`,
    );
  }

  if (cliArgs.jsonOut) {
    fs.writeFileSync(
      path.resolve(cliArgs.jsonOut),
      JSON.stringify(
        { meta: { ...cliArgs, startedAt: new Date().toISOString() }, results },
        null,
        2,
      ),
    );
    console.log(`\n原始数据已保存: ${path.resolve(cliArgs.jsonOut)}`);
  }
}

main().catch((error) => {
  console.error("基准测试失败:", error);
  process.exit(1);
});
