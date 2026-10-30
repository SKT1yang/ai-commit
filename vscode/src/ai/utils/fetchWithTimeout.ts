import { outputChannel } from "../../utils/outputChannel";

/**
 * 重试配置（可选，不传保持原有单次请求行为）
 */
export interface FetchRetryOptions {
  /** 额外重试次数，默认 0 */
  retries?: number;
  /** 指数退避基数（毫秒），默认 500 */
  baseDelayMs?: number;
  /** 退避上限（毫秒），默认 4000 */
  maxDelayMs?: number;
  /** 请求超时（AbortError）是否重试，默认 false——避免超时×重试次数的最坏等待 */
  retryOnTimeout?: boolean;
  /** 每次重试前的回调，供上层打日志 */
  onRetry?: (attempt: number, error: Error) => void;
}

/** 可重试的 HTTP 状态码：限流与网关/服务端瞬时错误 */
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

/** 判断是否为可重试的网络层错误（DNS/连接被重置/拒绝/超时等） */
function isRetryableNetworkError(error: unknown): boolean {
  const message = String((error as Error)?.message || error);
  return (
    (error instanceof TypeError && message.includes("fetch failed")) ||
    /ECONNRESET|ECONNREFUSED|ETIMEDOUT|EAI_AGAIN|ENOTFOUND/i.test(message)
  );
}

function isAbortError(error: unknown): boolean {
  return (error as Error)?.name === "AbortError";
}

/**
 * 创建带超时与可选重试的fetch请求
 * 注意：超时预算按"每次尝试"生效，最坏总耗时 ≈ timeout × (retries + 1)
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeout: number = 30000,
  retryOptions?: FetchRetryOptions,
): Promise<Response> {
  const retries = retryOptions?.retries ?? 0;
  const baseDelayMs = retryOptions?.baseDelayMs ?? 500;
  const maxDelayMs = retryOptions?.maxDelayMs ?? 4000;
  const retryOnTimeout = retryOptions?.retryOnTimeout ?? false;

  let lastError: unknown;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timeoutId);
      lastError = error;
      const timeoutHit = isAbortError(error);
      if (
        attempt < retries &&
        ((timeoutHit && retryOnTimeout) ||
          (!timeoutHit && isRetryableNetworkError(error)))
      ) {
        await delayForRetry(attempt, baseDelayMs, maxDelayMs, retryOptions);
        continue;
      }
      throw error;
    }
    clearTimeout(timeoutId);

    if (response.ok || !RETRYABLE_STATUS.has(response.status)) {
      return response;
    }

    lastError = new Error(`HTTP ${response.status}`);
    if (attempt < retries) {
      // 排空响应体以释放连接，再退避重试
      try {
        await response.text();
      } catch {
        /* 忽略排空失败 */
      }
      await delayForRetry(attempt, baseDelayMs, maxDelayMs, retryOptions);
      continue;
    }
    return response;
  }

  // 理论上不会到达（循环内要么 return 要么 throw）
  throw lastError;
}

async function delayForRetry(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  retryOptions?: FetchRetryOptions,
): Promise<void> {
  const exponential = Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
  // ±30% 抖动，避免并发请求同时重试造成惊群
  const jitter = exponential * (0.7 + Math.random() * 0.6);
  const message = `请求失败，${Math.round(jitter)}ms 后第 ${attempt + 1} 次重试`;
  outputChannel.appendLine(`[fetchWithTimeout] ${message}`);
  retryOptions?.onRetry?.(attempt + 1, new Error(message));
  await new Promise((resolve) => setTimeout(resolve, jitter));
}
