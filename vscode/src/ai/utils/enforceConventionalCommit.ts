import * as vscode from "vscode";
import type { ZendaoInfo } from "../../zendao/zendaoInterface";
import { outputChannel } from "../../utils/outputChannel";
import { getEmojiByText } from "../../utils/emoji";

// 规范化提交信息，强制符合 Conventional Commits 基础格式
export function enforceConventionalCommit(
  raw: string,
  changedFiles?: any[],
  diff?: string,
  zendaoInfo?: ZendaoInfo,
): string {
  const config = vscode.workspace.getConfiguration("aiMessage");
  const enableEmoji = config.get("commit.enableEmoji", true);
  const enableBody = config.get("commit.enableBody", true);
  const enableIntelligentBody = config.get("commit.intelligentBody", true);
  const enableBodyQualityCheck = config.get("commit.bodyQualityCheck", true);

  // 从配置中获取模板
  let template = config.get<string>("commitTemplate", "");
  let zenndaoTemplate = config.get<string>("zendao.commitTemplate", "");

  const typeMap: Record<string, string> = {
    feat: "feat",
    feature: "feat",
    新功能: "feat",
    功能: "feat",
    fix: "fix",
    bug: "fix",
    修复: "fix",
    修正: "fix",
    docs: "docs",
    文档: "docs",
    style: "style",
    样式: "style",
    格式: "style",
    refactor: "refactor",
    重构: "refactor",
    优化: "refactor",
    test: "test",
    测试: "test",
    chore: "chore",
    杂务: "chore",
    其他: "chore",
    build: "build",
    ci: "ci",
    perf: "perf",
  };

  const lines = raw.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    return raw;
  }
  let header = lines[0];
  let body = lines.slice(1).join("\n");

  // 尝试解析已有格式
  let type = "chore";
  let scope: string | undefined;
  let subject = header.trim();

  const headerMatch =
    /^(\p{Emoji_Presentation}|\p{Extended_Pictographic})?\s*([a-zA-Z\u4e00-\u9fa5]+)(?:\(([^)]+)\))?:\s*(.+)$/u.exec(
      header,
    );
  if (headerMatch) {
    const maybeType = headerMatch[2].toLowerCase();
    const mapped = typeMap[maybeType];
    if (mapped) {
      type = mapped;
    }
    if (headerMatch[3]) {
      scope = headerMatch[3].trim();
    }
    subject = headerMatch[4].trim();
  } else {
    // 没有匹配格式，从subject中推断type
    for (const k of Object.keys(typeMap)) {
      if (subject.startsWith(k) || subject.includes(k)) {
        type = typeMap[k];
        break;
      }
    }
  }

  // 限制subject长度
  if (subject.length > 50) {
    subject = subject.slice(0, 47).trim() + "...";
  }

  const emoji = enableEmoji ? getEmojiByText(type) || "" : "";
  const finalHeader = `${emoji ? emoji + " " : ""}${type}${
    scope ? "(" + scope + ")" : ""
  }: ${subject}`.trim();

  // 处理或生成body
  if (enableBody) {
    if (!body || body.trim().length === 0) {
      // 使用智能body生成（如果启用）
      if (enableIntelligentBody && diff && changedFiles) {
        body = generateIntelligentBody(diff, changedFiles);
      } else if (changedFiles && changedFiles.length > 0) {
        // 回退到基础body生成
        body = generateBasicBody(changedFiles);
      }
    } else {
      // 对现有body进行格式标准化
      body = body
        .replace(/^#+\s*/gm, "")
        .replace(/^[*-]\s*/gm, "- ")
        .trim();
    }

    // 对生成的body进行质量检查和优化（如果启用）
    if (body && enableBodyQualityCheck) {
      const validation = validateAndOptimizeBody(body);
      body = validation.body;

      // 如果有警告且开启调试模式，输出到控制台
      if (validation.warnings.length > 0) {
        const debug = config.get<boolean>("debug.enableStreamingLog", false);
        if (debug) {
          console.log(
            "[AI-Message][Body-Quality] 质量检查警告:",
            validation.warnings,
          );
        }
      }
    }
  }

  const message = finalHeader + (enableBody && body ? `\n\n${body}` : "");

  if (zendaoInfo) {
    zendaoInfo.commitMessage = message;
    zendaoInfo.commitMessageWithoutTemplate = message;
  }

  let finalTemplate = zendaoInfo ? zenndaoTemplate : template;

  if (!finalTemplate) {
    return message;
  }

  // 禅道数据异常，模版直接实效，则使用message作为模版
  if (zendaoInfo && zenndaoTemplate && !zendaoInfo.description) {
    return message;
  }

  const finalLines = message.split(/\r?\n/).filter((l) => l.trim().length > 0);
  outputChannel.appendLine(`Final template: ${finalTemplate}`);
  if (finalLines.length > 0) {
    finalTemplate = finalTemplate.replace(/\\n/g, "\n").replace(/\\r/g, "\r");
  }

  // 替换模板中的占位符
  let result = finalTemplate
    .replace(/{message}/g, message)
    .replace(/{header}/g, finalHeader)
    .replace(/{body}/g, body);

  if (zendaoInfo?.id) {
    result = result.replace(/{zendaoId}/g, zendaoInfo.id);
  }

  if (zendaoInfo?.type) {
    result = result.replace(/{zendaoType}/g, "BUG");
  }

  if (zendaoInfo?.description) {
    result = result.replace(/{zendaoDescription}/g, zendaoInfo.description);
  }

  outputChannel.appendLine(`[DEBUG] Final commit message result: ${result}`);
  if (zendaoInfo) {
    zendaoInfo.commitMessage = result;
  }
  return result;
}

/**
 * 智能分析diff内容生成详细的body描述
 */
function generateIntelligentBody(diff: string, changedFiles: any[]): string {
  const bodyLines: string[] = [];

  // 分析diff内容
  const diffAnalysis = analyzeDiffContent(diff);
  const fileAnalysis = analyzeFileChanges(changedFiles);

  // 根据分析结果生成不同类型的body内容
  if (diffAnalysis.newFunctions.length > 0) {
    const funcs = diffAnalysis.newFunctions.slice(0, 3);
    bodyLines.push(`- 新增函数: ${funcs.join(", ")}`);
  }

  if (diffAnalysis.modifiedFunctions.length > 0) {
    const funcs = diffAnalysis.modifiedFunctions.slice(0, 3);
    bodyLines.push(`- 修改函数: ${funcs.join(", ")}`);
  }

  if (diffAnalysis.hasImportChanges) {
    bodyLines.push("- 更新依赖导入关系");
  }

  if (diffAnalysis.hasConfigChanges) {
    bodyLines.push("- 调整配置参数");
  }

  if (diffAnalysis.hasDocChanges) {
    bodyLines.push("- 更新文档和注释");
  }

  // 添加代码量统计
  if (diffAnalysis.linesAdded > 0 || diffAnalysis.linesDeleted > 0) {
    const statsText = `- 代码变更: +${diffAnalysis.linesAdded} -${diffAnalysis.linesDeleted} 行`;
    bodyLines.push(statsText);
  }

  // 添加影响范围分析
  if (fileAnalysis.affectedModules.length > 0) {
    const modules = fileAnalysis.affectedModules.slice(0, 3);
    bodyLines.push(`- 影响模块: ${modules.join(", ")}`);
  }

  // 如果没有生成任何内容，使用基础文件变更信息
  if (bodyLines.length === 0) {
    return generateBasicBody(changedFiles);
  }

  return bodyLines.join("\n");
}

/**
 * 生成基础body内容（回退方案）
 */
function generateBasicBody(changedFiles: any[]): string {
  const filesByType = changedFiles.reduce((acc: any, file: any) => {
    const status = file.status || "M";
    if (!acc[status]) {
      acc[status] = [];
    }
    acc[status].push(file.path || file);
    return acc;
  }, {});

  const bodyLines: string[] = [];
  if (filesByType["A"]) {
    bodyLines.push(`- 新增文件: ${filesByType["A"].slice(0, 3).join(", ")}`);
  }
  if (filesByType["M"]) {
    bodyLines.push(`- 修改文件: ${filesByType["M"].slice(0, 3).join(", ")}`);
  }
  if (filesByType["D"]) {
    bodyLines.push(`- 删除文件: ${filesByType["D"].slice(0, 3).join(", ")}`);
  }

  return bodyLines.join("\n");
}

/**
 * 分析diff内容，提取关键信息
 */
function analyzeDiffContent(diff: string) {
  const analysis = {
    linesAdded: 0,
    linesDeleted: 0,
    newFunctions: [] as string[],
    modifiedFunctions: [] as string[],
    hasImportChanges: false,
    hasConfigChanges: false,
    hasDocChanges: false,
  };

  const lines = diff.split("\n");

  for (const line of lines) {
    // 统计新增和删除行数
    if (line.startsWith("+") && !line.startsWith("+++")) {
      analysis.linesAdded++;

      // 检测新增函数
      const funcMatch = line.match(
        /^\+.*(?:function|def|const|let|var)\s+(\w+)/,
      );
      if (funcMatch && funcMatch[1]) {
        analysis.newFunctions.push(funcMatch[1]);
      }

      // 检测导入变更
      if (line.match(/^\+.*(?:import|require|from)/)) {
        analysis.hasImportChanges = true;
      }

      // 检测配置变更
      if (line.match(/^\+.*(?:config|settings|options|parameters)/i)) {
        analysis.hasConfigChanges = true;
      }

      // 检测文档变更
      if (line.match(/^\+.*(?:\/\*|\/\/|#|<!--|"""|\*)/)) {
        analysis.hasDocChanges = true;
      }
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      analysis.linesDeleted++;

      // 检测修改的函数（删除+新增同一函数名）
      const funcMatch = line.match(
        /^-.*(?:function|def|const|let|var)\s+(\w+)/,
      );
      if (funcMatch && funcMatch[1]) {
        analysis.modifiedFunctions.push(funcMatch[1]);
      }
    }
  }

  // 去重
  analysis.newFunctions = [...new Set(analysis.newFunctions)];
  analysis.modifiedFunctions = [...new Set(analysis.modifiedFunctions)];

  return analysis;
}

/**
 * 分析文件变更，提取模块信息
 */
function analyzeFileChanges(changedFiles: any[]) {
  const analysis = {
    affectedModules: [] as string[],
  };

  for (const file of changedFiles) {
    const path = file.path || file;
    const pathParts = path.split("/");

    // 提取模块名
    if (pathParts.length > 1) {
      const module = pathParts[0];
      if (!analysis.affectedModules.includes(module)) {
        analysis.affectedModules.push(module);
      }
    }

    // 特殊文件类型识别
    if (path.includes("package.json")) {
      analysis.affectedModules.push("dependencies");
    } else if (path.includes("config") || path.includes(".config.")) {
      analysis.affectedModules.push("config");
    } else if (
      path.includes("test") ||
      path.includes(".test.") ||
      path.includes(".spec.")
    ) {
      analysis.affectedModules.push("tests");
    }
  }

  return analysis;
}

/**
 * Body质量检查和优化
 */
function validateAndOptimizeBody(body: string): {
  body: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  let optimizedBody = body;

  // 长度检查
  const lines = body.split("\n").filter((line) => line.trim());
  if (lines.length === 0) {
    warnings.push("Body内容为空");
    return { body: optimizedBody, warnings };
  }

  if (lines.length > 10) {
    warnings.push("Body内容过长，建议简化");
    optimizedBody = lines.slice(0, 10).join("\n");
  }

  // 每行长度检查（Conventional Commits建议每行不超过72字符）
  const longLines = lines.filter((line) => line.length > 72);
  if (longLines.length > 0) {
    warnings.push(`${longLines.length}行超过72字符`);
  }

  // 重复内容检查
  const uniqueLines = [...new Set(lines)];
  if (uniqueLines.length !== lines.length) {
    warnings.push("检测到重复内容");
    optimizedBody = uniqueLines.join("\n");
  }

  // 格式标准化
  optimizedBody = optimizedBody
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      // 确保项目符号格式统一
      if (
        trimmed &&
        !trimmed.startsWith("-") &&
        !trimmed.startsWith("*") &&
        !trimmed.startsWith("•")
      ) {
        return `- ${trimmed}`;
      }
      return trimmed.startsWith("-")
        ? trimmed
        : `- ${trimmed.substring(1).trim()}`;
    })
    .filter((line) => line.trim())
    .join("\n");

  // 内容质量检查
  const hasOnlyFileList = lines.every(
    (line) =>
      line.includes("新增文件") ||
      line.includes("修改文件") ||
      line.includes("删除文件") ||
      line.includes("Add files") ||
      line.includes("Modify files") ||
      line.includes("Delete files"),
  );

  if (hasOnlyFileList && lines.length === 1) {
    warnings.push("建议添加更详细的变更说明");
  }

  return { body: optimizedBody, warnings };
}
