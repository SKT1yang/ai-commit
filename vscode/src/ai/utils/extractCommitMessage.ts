import { getEmojiMap, getEmojiByText } from "../../utils/emoji";

/**
 * 提取和清理AI响应的提交信息，
 * 目标是从响应中提取出符合Conventional Commits格式的提交信息。
 * 由于AI的响应可能包含解释性文本、代码块标记等，我们需要清理这些内容。
 * 同时，我们也要确保提交信息有正确的格式，比如包含emoji和类型
 * 
 * 主要功能
 * 
 * 清理响应文本：移除引号、Markdown代码块标记等格式标记

 * 过滤解释性文本：移除AI响应的前缀说明文字

 * 格式标准化：确保提交信息包含正确的emoji符号

 * 内容筛选：过滤掉不必要的总结性描述
 */
export function extractCommitMessage(response: string): string {
  // 清理响应 - 移除引号和多余空格
  let cleaned = response.trim().replace(/^["']|["']$/g, "");

  // 移除markdown代码块标记
  cleaned = cleaned.replace(/^```[\s\S]*?\n/, "").replace(/\n```$/, "");
  cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");

  // 移除其他常见的格式标记
  cleaned = cleaned.replace(/^`/, "").replace(/`$/, "");

  // 移除解释性前缀文本，保留实际的提交信息
  const emojiMap = getEmojiMap();
  const patterns = [
    ...Array.from(emojiMap.keys()),
    ...Array.from(emojiMap.values()).flat(),
  ];

  const escapedPatterns = patterns.map((p) =>
    p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );
  const regex = new RegExp(`^.*?(?=${escapedPatterns.join("|")})`, "s");

  cleaned.replace(regex, "");

  // 按行分割并过滤空行
  const lines = cleaned
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line);

  if (lines.length === 0) {
    return `${getEmojiByText("feat")} feat(misc): 更新代码`;
  }

  // 移除解释性文本和标题，但保留提交信息和body内容
  const filteredLines = lines.filter((line) => {
    const lower = line.toLowerCase();
    return (
      !lower.includes("提交信息") &&
      !lower.includes("生成") &&
      !lower.includes("基于") &&
      !lower.includes("分析") &&
      !lower.includes("示例") &&
      !lower.includes("example") &&
      !lower.includes("输出") &&
      !lower.includes("格式") &&
      !lower.includes("以下是") &&
      !lower.includes("根据") &&
      !line.startsWith("#") &&
      !line.startsWith("**") &&
      !line.startsWith("*") &&
      !line.startsWith("Note:") &&
      !line.startsWith("注:") &&
      line.length > 0
    );
  });

  if (filteredLines.length === 0) {
    return `${getEmojiByText("feat")} feat(misc): 更新代码`;
  }

  const processedLines: string[] = [];

  for (const line of filteredLines) {
    // 检查是否为有效的提交信息行（包含emoji或type）
    if (isValidCommitLine(line)) {
      // 确保有正确的emoji
      const processedLine = ensureCorrectEmoji(line);
      processedLines.push(processedLine);
    } else if (isBodyContent(line)) {
      // 这是body内容
      processedLines.push(formatBodyLine(line));
    }
  }

  // 如果没有有效的提交行，创建默认的
  if (
    processedLines.length === 0 ||
    !processedLines.some((line) => isValidCommitLine(line))
  ) {
    return `${getEmojiByText("feat")} feat(misc): 更新代码`;
  }

  return processedLines.join("\n").trim();
}

/**
 * 检查是否为有效的提交信息行
 */
export function isValidCommitLine(line: string): boolean {
  // 检查是否包含emoji开头或者直接以type开头
  const emojiMap = getEmojiMap();
  const emojiPattern = new RegExp(`^[${Array.from(emojiMap.keys()).join("")}]`);
  const typePattern =
    /^(feat|fix|docs|style|refactor|perf|test|build|ci|chore|i18n)(\([^)]*\))?:/;

  return emojiPattern.test(line) || typePattern.test(line);
}

/**
 * 检查是否为body内容
 */
function isBodyContent(line: string): boolean {
  // body内容通常以-开头或者包含【】标记，或者是较长的描述性文本
  return (
    line.startsWith("-") ||
    line.startsWith("•") ||
    line.startsWith("*") ||
    line.includes("【") ||
    line.includes("】") ||
    (!isValidCommitLine(line) &&
      line.length > 10 &&
      !isDescriptiveSummary(line))
  );
}

/**
 * 识别总结性描述行（应该被过滤掉）
 */
function isDescriptiveSummary(line: string): boolean {
  const lower = line.toLowerCase();
  return (
    lower.includes("本次提交") ||
    lower.includes("此次提交") ||
    lower.includes("本次更新") ||
    lower.includes("此次更新") ||
    lower.includes("包含") ||
    lower.includes("涉及") ||
    lower.includes("总结") ||
    lower.includes("概述") ||
    (lower.length > 30 && !line.includes(":") && !line.startsWith("-"))
  );
}

/**
 * 格式化body行
 */
function formatBodyLine(line: string): string {
  // 统一使用-作为项目符号
  return line.replace(/^[•*]\s*/, "- ");
}

/**
 * 确保提交信息有正确的emoji
 */
function ensureCorrectEmoji(line: string): string {
  // 如果已经有emoji，直接返回
  const emojiMap = getEmojiMap();
  const emojiPattern = new RegExp(`^[${Array.from(emojiMap.keys()).join("")}]`);
  if (line.match(emojiPattern)) {
    return line;
  }

  // 提取commit type并添加对应的emoji
  const typeMatch = line.match(/^(\w+)(?:\([^)]*\))?:/);
  if (typeMatch) {
    const type = typeMatch[1];
    const emoji = getEmojiByText(type) || getEmojiByText("feat");
    return `${emoji} ${line}`;
  }

  return line;
}
