import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { installVscodeMock } from "./vscodeMock";

installVscodeMock();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { stripZendaoHtml } = require("../../src/zendao/htmlToText");

test("stripZendaoHtml: 真实禅道steps样本去HTML", () => {
  // 用仓库中的真实禅道响应样本（含 <p>、<img onload> 等）
  const data = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, "../../../src/zendao/bug-data.json"),
      "utf8",
    ),
  );
  const output = stripZendaoHtml(data.bug.steps);

  assert.ok(!output.includes("<p>"));
  assert.ok(!output.includes("<img"));
  assert.ok(!output.includes("onload"));
  assert.ok(output.includes("[步骤]"));
  assert.ok(output.includes("1.开启审计模式发包"));
  assert.ok(output.includes("[结果]"));
  assert.ok(output.includes("[期望]"));
});

test("stripZendaoHtml: 块级标签转换行", () => {
  const output = stripZendaoHtml("<p>第一行</p><p>第二行</p>");
  assert.equal(output, "第一行\n第二行");
});

test("stripZendaoHtml: 解码常见HTML实体", () => {
  const output = stripZendaoHtml("<p>a &lt; b &amp;&nbsp;c</p>");
  assert.equal(output, "a < b & c");
});

test("stripZendaoHtml: 空输入返回空串", () => {
  assert.equal(stripZendaoHtml(""), "");
  assert.equal(stripZendaoHtml(undefined as unknown as string), "");
});

test("stripZendaoHtml: 超长内容按行边界截断", () => {
  const longLine = "x".repeat(3000);
  const html = `<p>${longLine}</p>`.repeat(3); // 约9000+字符，远超默认2000
  const output = stripZendaoHtml(html);

  assert.ok(output.endsWith("...(内容过长已截断)"));
  assert.ok(output.length < longLine.length + 100); // 截断发生且行边界生效
});

test("stripZendaoHtml: style/script块整体删除", () => {
  const output = stripZendaoHtml(
    "<style>p{color:red}</style><p>正文</p><script>evil()</script>",
  );
  assert.equal(output, "正文");
});
