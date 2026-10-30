import { test } from "node:test";
import assert from "node:assert/strict";
import { installVscodeMock } from "./vscodeMock";

installVscodeMock();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const {
  stripThinkTags,
  extractResponseContent,
  cleanModelOutput,
} = require("../../src/ai/utils/cleanModelOutput");

test("stripThinkTags: 剥离闭合的思考块", () => {
  const input = "<think>用户想要提交信息，我先分析一下diff...</think>✨ feat(auth): 实现登录";
  assert.equal(stripThinkTags(input), "✨ feat(auth): 实现登录");
});

test("stripThinkTags: 未闭合的思考块整段丢弃", () => {
  // finish_reason=length 截断时常见：<think> 无闭合标签
  assert.equal(stripThinkTags("<think>推理到一半被截断"), "");
  assert.equal(stripThinkTags("前文<think>推理到一半被截断"), "前文");
});

test("stripThinkTags: 多个思考块全部剥离", () => {
  const input = "<think>第一段</think>A<think>第二段</think>B";
  assert.equal(stripThinkTags(input), "AB");
});

test("stripThinkTags: 无思考块原样返回并trim", () => {
  assert.equal(stripThinkTags("  ✨ feat(x): y  "), "✨ feat(x): y");
});

test("extractResponseContent: 标准 OpenAI content 形态", () => {
  const data = { choices: [{ message: { content: "✨ feat: x" } }] };
  assert.equal(extractResponseContent(data), "✨ feat: x");
});

test("extractResponseContent: content为空时降级 reasoning_content", () => {
  // qwen3.8-flash-next 实测：思考 token 耗尽 max_tokens 时 content 为空
  const data = {
    choices: [{ message: { content: "", reasoning_content: "思考内容" } }],
  };
  assert.equal(extractResponseContent(data), "思考内容");
});

test("extractResponseContent: 兼容 text/result/response 形态", () => {
  assert.equal(extractResponseContent({ choices: [{ text: "a" }] }), "a");
  assert.equal(extractResponseContent({ result: "b" }), "b");
  assert.equal(extractResponseContent({ response: "c" }), "c");
  assert.equal(extractResponseContent({}), "");
});

test("cleanModelOutput: 组合剥think与markdown围栏", () => {
  const input = "<think>分析中</think>\n```diff\n✨ feat(x): y\n```";
  const output = cleanModelOutput(input);
  assert.ok(output.includes("feat(x)"));
  assert.ok(!output.includes("<think>"));
  assert.ok(!output.includes("```"));
});

test("cleanModelOutput: 围栏包住think剥离后的正文也能清理", () => {
  const input = "```\n<think>x</think>\n✨ feat(x): y\n```";
  const output = cleanModelOutput(input);
  assert.equal(output, "✨ feat(x): y");
});
