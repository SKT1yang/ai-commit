import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { installVscodeMock } from "./vscodeMock";

installVscodeMock();

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { fetchWithTimeout } = require("../../src/ai/utils/fetchWithTimeout");

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

function jsonResponse(status: number, body: unknown = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

test("重试: 网络错误后重试成功", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    if (calls < 3) {
      throw new TypeError("fetch failed");
    }
    return jsonResponse(200, { ok: true });
  }) as typeof fetch;

  const response = await fetchWithTimeout("http://test.local", { method: "POST" }, 1000, {
    retries: 2,
    baseDelayMs: 1,
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});

test("重试: HTTP 429 限流后重试成功", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return calls < 3 ? jsonResponse(429) : jsonResponse(200);
  }) as typeof fetch;

  const response = await fetchWithTimeout("http://test.local", { method: "POST" }, 1000, {
    retries: 2,
    baseDelayMs: 1,
  });
  assert.equal(response.status, 200);
  assert.equal(calls, 3);
});

test("重试: 400 不重试", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    return jsonResponse(400);
  }) as typeof fetch;

  const response = await fetchWithTimeout("http://test.local", { method: "POST" }, 1000, {
    retries: 3,
    baseDelayMs: 1,
  });
  assert.equal(response.status, 400);
  assert.equal(calls, 1);
});

test("重试: 超时（AbortError）默认不重试", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw Object.assign(new Error("The operation was aborted"), {
      name: "AbortError",
    });
  }) as typeof fetch;

  await assert.rejects(
    fetchWithTimeout("http://test.local", { method: "POST" }, 1000, {
      retries: 3,
      baseDelayMs: 1,
    }),
    /aborted/,
  );
  assert.equal(calls, 1);
});

test("重试: 次数耗尽后仍抛出原始错误", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  await assert.rejects(
    fetchWithTimeout("http://test.local", { method: "POST" }, 1000, {
      retries: 2,
      baseDelayMs: 1,
    }),
    /fetch failed/,
  );
  assert.equal(calls, 3); // 1 次原始 + 2 次重试
});

test("默认行为: 不传重试选项时单次请求（向后兼容）", async () => {
  let calls = 0;
  globalThis.fetch = (async () => {
    calls++;
    throw new TypeError("fetch failed");
  }) as typeof fetch;

  await assert.rejects(
    fetchWithTimeout("http://test.local", { method: "POST" }, 1000),
    /fetch failed/,
  );
  assert.equal(calls, 1);
});
