import { test } from "node:test";
import assert from "node:assert/strict";
import { installVscodeMock } from "./vscodeMock";

installVscodeMock();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { extractCommitMessage } = require("../../src/ai/utils/extractCommitMessage");

const FALLBACK = "✨ feat(misc): 更新代码";

test("提取: 同行解释性前缀被剥离（L42赋值修复的回归样本）", () => {
  // 修复前 cleaned.replace 结果未赋值，整行含"提交信息"关键词被过滤，静默降级为兜底串
  const output = extractCommitMessage("以下是生成的提交信息：✨ feat(auth): 实现用户登录");
  assert.notEqual(output, FALLBACK);
  assert.ok(output.includes("feat(auth)"));
  assert.ok(output.includes("实现用户登录"));
});

test("提取: 标准提交信息+body保留", () => {
  const input = "🐛 fix(billing): 修复折扣计算错误\n- 修正舍入误差\n- 添加边界检查";
  const output = extractCommitMessage(input);
  assert.ok(output.startsWith("🐛 fix(billing)"));
  assert.ok(output.includes("- 修正舍入误差"));
});

test("提取: markdown围栏内提交信息可提取", () => {
  const input = "```\n✨ feat(user): 添加配置导出\n```";
  const output = extractCommitMessage(input);
  assert.ok(output.includes("feat(user)"));
});

test("提取: 解释性总结行被过滤", () => {
  const input = "✨ feat(user): 添加配置导出\n本次提交涉及配置模块的改动";
  const output = extractCommitMessage(input);
  assert.ok(!output.includes("本次提交"));
});

test("提取: 无有效内容时返回兜底串", () => {
  assert.equal(extractCommitMessage("你好，我无法生成"), FALLBACK);
  assert.equal(extractCommitMessage(""), FALLBACK);
});

test("提取: 无think标签的纯正文可正常提取（清洗层下游场景）", () => {
  assert.ok(extractCommitMessage("✨ feat(core): 优化生成流程").includes("feat(core)"));
});

test("提取: subject含关键词不误杀（历史提交回归样本）", () => {
  // 仓库历史提交 0432a20 的 subject 即含"生成/分析"，修复前会被关键词过滤整行干掉
  const output = extractCommitMessage("✨ feat(ai): 添加生成BUG原因分析功能");
  assert.notEqual(output, FALLBACK);
  assert.ok(output.includes("添加生成BUG原因分析功能"));
});

test("提取: 非提交行的解释性文本仍被过滤", () => {
  const output = extractCommitMessage(
    "✨ fix(user): 修复登录\n好的，以下是根据您的变更分析得到的结果：\n- 修改了登录逻辑",
  );
  assert.ok(!output.includes("以下是根据"));
  assert.ok(output.includes("fix(user)"));
  assert.ok(output.includes("- 修改了登录逻辑"));
});
