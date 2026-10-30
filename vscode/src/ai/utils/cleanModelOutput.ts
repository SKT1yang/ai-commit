import { outputChannel } from "../../utils/outputChannel";

/**
 * 清洗模型输出：
 * 1. 剥离思考型模型（如 qwen3 系列）输出的 <think>...</think> 思考内容
 * 2. 兼容思考与正文分离的部署形态（reasoning_content 单独字段）
 * 3. 剥离 markdown 代码围栏，避免污染下游解析
 */

/**
 * 剥离 <think> 思考内容
 * - 闭合形态：<think>xxx</think>正文 → 正文
 * - 未闭合形态（finish_reason=length 截断时常见）：<think>xxx（无闭合）→ 整段丢弃
 * - 支持多个 think 块
 */
export function stripThinkTags(text: string): string {
  if (!text) {
    return text;
  }
  let result = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const unclosedIndex = result.indexOf("<think>");
  if (unclosedIndex !== -1) {
    // 未闭合的思考块：说明模型思考未结束即被截断，其后不会有正文，整段丢弃
    outputChannel.appendLine(
      "[cleanModelOutput] 检测到未闭合的<think>块（疑似max_tokens截断），丢弃其后全部内容",
    );
    result = result.slice(0, unclosedIndex);
  }
  return result.trim();
}

/**
 * 从 OpenAI 兼容响应体中提取正文文本，
 * 兼容 content / text / result / response 多种返回形态；
 * content 为空时降级使用 reasoning_content（部分部署把全部输出放在该字段）
 */
export function extractResponseContent(data: unknown): string {
  const payload = data as {
    choices?: Array<{
      message?: { content?: string; reasoning_content?: string };
      text?: string;
    }>;
    result?: string;
    response?: string;
  };

  const content = payload?.choices?.[0]?.message?.content || "";
  if (content) {
    return content;
  }

  const reasoning = payload?.choices?.[0]?.message?.reasoning_content || "";
  if (reasoning) {
    // 思考字段有内容但正文为空：通常是 max_tokens 被思考耗尽，或部署把输出放在该字段
    outputChannel.appendLine(
      "[cleanModelOutput] content为空，降级使用reasoning_content字段",
    );
    return reasoning;
  }

  return payload?.choices?.[0]?.text || payload?.result || payload?.response || "";
}

/**
 * 组合清洗入口：剥 think + 去 markdown 围栏 + trim。
 * 返回空串时由调用方按"模型返回空响应"处理。
 */
export function cleanModelOutput(text: string): string {
  let cleaned = stripThinkTags(text);
  // 与 extractCommitMessage 保持一致的围栏清理，但先行执行，
  // 避免围栏包住 think 剥离后的正文导致识别失败
  cleaned = cleaned.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "");
  cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  return cleaned.trim();
}
