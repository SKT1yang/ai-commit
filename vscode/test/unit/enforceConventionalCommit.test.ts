import { test } from "node:test";
import assert from "node:assert/strict";
import { installVscodeMock } from "./vscodeMock";

// 模板通过配置注入（enforceConventionalCommit 每次调用都读取配置，mock 安装须先于 require）
installVscodeMock({
  "aiMessage.zendao.commitTemplate":
    "[{zendaoType}: {zendaoId}][MSG: {zendaoDescription}]\n{message}",
});

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { enforceConventionalCommit } = require("../../src/ai/utils/enforceConventionalCommit");

const RAW = "✨ feat(ai): 测试提交信息\n- 变更一\n- 变更二";

test("禅道模板: bug分类字段缺失时{zendaoType}仍替换为BUG（0.0.16泄漏回归）", () => {
  // BUG #20009 未填禅道 type 分类字段，修复前 {zendaoType} 原样残留
  const result = enforceConventionalCommit(
    RAW,
    [],
    "diff",
    { id: "20009", description: "BUG #20009 储运V1.2.2 测试单" },
  );
  assert.ok(
    result.startsWith("[BUG: 20009][MSG: BUG #20009 储运V1.2.2 测试单]"),
    `实际输出: ${result}`,
  );
  assert.ok(!result.includes("{zendao"), `占位符残留: ${result}`);
});

test("禅道模板: id缺失时不残留{zendaoId}", () => {
  const result = enforceConventionalCommit(
    RAW,
    [],
    "diff",
    { description: "BUG 测试单" },
  );
  assert.ok(!result.includes("{zendao"), `占位符残留: ${result}`);
  assert.ok(result.includes("[BUG: ][MSG: BUG 测试单]"));
});

test("无禅道信息且无提交模板: 原样返回规范化message", () => {
  const result = enforceConventionalCommit(RAW, [], "diff");
  assert.ok(!result.includes("[BUG:"));
  assert.ok(!result.includes("{zendao"));
});
