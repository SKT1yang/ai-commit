import { MAX_ZENDAO_STEPS_CHARS } from "../ai/utils/constants";

/**
 * 禅道富文本 HTML 转纯文本，用于注入 AI prompt：
 * 删除 style/script/img 等噪声标签，块级标签转换行，
 * 解码常见实体，压平空行并按长度截断。
 * 纯函数，无 vscode 依赖。
 */
export function stripZendaoHtml(
  html: string,
  maxLength: number = MAX_ZENDAO_STEPS_CHARS,
): string {
  if (!html) {
    return "";
  }

  let text = html;

  // 删除 style/script 整块与 img 标签（禅道 steps 中的截图对 prompt 是纯噪声）
  text = text.replace(/<(style|script)[\s\S]*?<\/\1>/gi, "");
  text = text.replace(/<img\b[^>]*>/gi, "");

  // 块级标签与 <br> 转换行，保留文本结构
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<\/(p|div|li|tr|h[1-6]|blockquote)>/gi, "\n");

  // 剥离其余全部标签
  text = text.replace(/<[^>]+>/g, "");

  // 解码常见 HTML 实体（&amp; 必须最后处理）
  text = text
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&amp;/gi, "&");

  // 每行压平空白，去掉首尾空行
  text = text
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .join("\n")
    .replace(/\n{2,}/g, "\n")
    .trim();

  if (text.length > maxLength) {
    // 按行边界截断，避免半行内容干扰模型理解
    const cut = text.slice(0, maxLength);
    const lastBreak = cut.lastIndexOf("\n");
    text =
      (lastBreak > maxLength * 0.5 ? cut.slice(0, lastBreak) : cut) +
      "\n...(内容过长已截断)";
  }

  return text;
}
