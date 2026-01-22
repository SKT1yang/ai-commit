import type { SvnFile } from "../../vcs/svnService";
import type { ZendaoInfo } from "../../zendao/zendaoInterface";
import { outputChannel } from "../../utils/outputChannel";
import { MAX_DIFF_CHARS, MAX_DIFF_FILES } from "../utils/constants";

type BuildPromptFunction = (
  diff: string,
  changedFiles: SvnFile[],
  options?: PromptOptions,
) => string;

type PromptOptions = {
  zendaoInfo?: ZendaoInfo;
  language?: string;
};

export const buildBasePrompt: BuildPromptFunction = (
  diff,
  changedFiles,
  options,
) => {
  return buildPromptByChinese(diff, changedFiles, options);
};

const buildPromptByChinese: BuildPromptFunction = (
  diff,
  changedFiles,
  options,
) => {
  outputChannel.appendLine(`[${new Date().toLocaleString()}] 获取中文提示词`);
  const { zendaoInfo, language = "中文" } = options || {};

  // 分析文件类型和变更类型
  const fileAnalysis = analyzeChanges(changedFiles);
  const filesDescription = buildFileDescriptionPrompt(changedFiles);

  const diffPropmt = buildDiffPropmt(diff, changedFiles);
  const zendaoPrompt = zendaoInfo?.shouldProcessZendao
    ? buildZendaoPropmt(zendaoInfo)
    : "";

  return `# AI Message Generator

你是一个专业的代码提交信息生成专家。请根据代码变更生成一条符合 Conventional Commits 规范的提交信息

**CRITICAL INSTRUCTION: 您必须严格遵循以下要求**

1. 仅输出符合Conventional Commits规范的${language}提交信息
2. 使用标准的 \`<emoji><type>(<scope>): <subject>\` 格式
3. type必须是: feat, fix, docs, style, refactor, perf, test, chore, build, ci, i18n 之一
4. subject必须简洁明了，不超过50个字符
5. 不包含任何解释或附加文本
6. 严格按照示例中显示的格式
7. 必须用${language}描述
8. 仅输出${language}的提交信息
9. 技术术语和scope等术语使用英文
10. 使用单行换行(\\n)，不要双行换行(\\n\\n)
11. 最多16行，每行直接换行不要隔行
12. 文件差异过大或者文件数量过多时，包含一行代码差异过大提交说明或猜测


## 必须执行的操作 (MUST DO)

1. **深度分析变更意图**: 根据文件路径、文件名、内容和差异代码，确定这次提交的真实意图
2. **识别修改模块**: 明确标识被修改的模块/文件
3. **确定变更类型**: 基于实际变更内容选择最合适的提交类型
4. **评估影响范围**: 考虑对现有逻辑、数据结构或外部API的影响
5. **识别风险和依赖**: 确定是否需要额外的文档、测试或存在潜在风险
6. **限制语言**: 所有内容均使用${language}，仅在 scope 和技术术语中使用英语
7. **限制格式**: 严格遵循示例所示的格式模板
8. **限制表情符号**: 包含适当的emoji表情符号
9. **保证每个文件一个提交信息**: 为每个文件创建单独的提交信息

## 禁止操作 (MUST NOT DO)

1. 不要包含任何解释、问候或附加文本
2. 不要使用英语书写（技术术语和 scope 除外）
3. 不要添加任何格式说明或元数据
4. 不要在输出中包含三个反引号 (\`\`\`)
5. 不要添加任何评论或问题
6. 不要偏离要求的格式

## 格式规范

### 格式模板

**标准格式**: \`<emoji><type>(<scope>): <subject>\`

**带详细说明的格式**:
\`\`\`
<emoji><type>(<scope>): <subject>

<body>
\`\`\`


### subject 规范

- 破坏性变更使用 !：\`feat(auth)!: ...\`
- scope 必须使用英语
- 使用祈使语气
- 首字母不大写
- 结尾不加句号
- 最长 50 个字符
- 正文必须在描述后空一行开始
> 如果无法明确归类到特定模块或功能，可以使用 core 或 misc 作为默认 scope

### body 规范

- 破坏性变更必须包含详细的影响说明
- 使用短横线 "-" 作为列表项符号
- 每行最长 72 个字符
- 解释修改内容及原因
- 使用【】对不同类型的变更进行分类

## 提交类型参考

| Type     | Emoji | Description          | Example Scopes      |
| -------- | ----- | -------------------- | ------------------- |
| feat     | ✨    | New feature          | user, payment       |
| fix      | 🐛    | Bug fix              | auth, data          |
| docs     | 📝    | Documentation        | README, API         |
| style    | 💄    | Code style           | formatting          |
| refactor | ♻️    | Code refactoring     | utils, helpers      |
| perf     | ⚡    | Performance          | query, cache        |
| test     | ✅    | Testing              | unit, e2e           |
| build    | 📦    | Build system         | webpack, npm        |
| ci       | 👷    | CI config            | Travis, Jenkins     |
| chore    | 🔧    | Other changes        | scripts, config     |
| i18n     | 🌐    | Internationalization | locale, translation |

### 类型检测指南

在生成提交信息时，始终考虑文件状态和内容变更：

### 文件状态分类
请分析文件变更——包括文件路径、文件名、文件内容和差异代码片段——并确定此次提交的目的。
然后，根据变更的实际意图从类型参考列表中选择最合适的提交类型（type），而不仅仅是基于文件扩展名或文件名。
提交类型必须反映变更的**真实目的**。

## 变更文件信息 (${changedFiles.length}个文件)

${filesDescription}

## 变更分析:

${fileAnalysis}

${diffPropmt}

${zendaoPrompt}

## 输出示例

### 示例：包含body的功能实现 
\`\`\`
✨ feat(auth): 实现JWT用户认证系统

- 替换传统token认证为JWT认证
-【Breaking Change】旧token格式不再支持
-【迁移】客户端需要更新认证逻辑
- 实现token刷新机制
\`\`\`

### 示例：包含详细说明的错误修复
\`\`\`
� fix(billing): 修复折扣计算逻辑错误

- 修正了百分比折扣计算中的舍入错误
- 确保折扣金额不超过订单总额
- 添加边界值检查防止负数折扣
\`\`\`

### 示例：代码重构
\`\`\`
♻️ refactor(user): 重构用户配置模块提高可读性

- 重构了用户配置模块代码以提高可读性和可维护性
- 将通用逻辑提取为辅助函数
\`\`\`

## 自我验证清单

1. 语言检查：是否 100% 使用${language}（scope 和技术术语除外）？
2. 格式检查：是否严格遵循 "<emoji> <type>(<scope>): <subject>" 格式？
3. 内容检查：是否仅包含提交信息，无额外文本？
4. 一致性检查：对于多个文件，格式是否一致？
5. 完整性检查：是否包含所有必要信息？
6. 正文检查：正文是否解释了修改内容及原因？
7. 影响检查：是否考虑了其对现有逻辑、数据结构或外部 API 的影响？
8. 文档检查：是否指出了是否需要额外文档或测试？
9. 风险检查：是否提及了潜在风险或不确定性以及如何缓解？

## 重要提醒

- 现在请基于以上分析，生成描述代码变更的提交信。
- 仅返回提交信息，不要任何其他描述文本！
- 严格遵循上文示例所示的格式。

`;
};

/**
 * 获取文件状态的中文描述
 */
function getStatusDescription(status: string): string {
  const statusMap: { [key: string]: string } = {
    A: "添加",
    D: "删除",
    M: "修改",
    R: "替换",
    C: "冲突",
    "?": "未跟踪",
    "!": "丢失",
    "~": "类型变更",
  };

  return statusMap[status] || status || "未知状态";
}

/**
 * 分析变更内容
 * @param changedFiles 变更的文件列表
 * @param diff 代码差异
 * @returns 变更分析结果
 */
function analyzeChanges(changedFiles: SvnFile[]): string {
  const analysis: string[] = [];

  // === 1. 文件类型和规模分析 ===
  const fileTypes: { [key: string]: SvnFile[] } = {};
  changedFiles.forEach((file) => {
    const ext = file.path.split(".").pop()?.toLowerCase() || "unknown";
    if (!fileTypes[ext]) {
      fileTypes[ext] = [];
    }
    fileTypes[ext].push(file);
  });

  const fileTypeAnalysis = Object.entries(fileTypes)
    .sort(([, a], [, b]) => b.length - a.length)
    .map(([ext, files]) => `${getFileTypeDescription(ext)}: ${files.length}个`)
    .join(", ");

  analysis.push(`**文件类型分布**: ${fileTypeAnalysis}`);

  // === 2. 变更操作统计 ===
  const statusCounts: { [key: string]: SvnFile[] } = {};
  changedFiles.forEach((file) => {
    if (!statusCounts[file.status]) {
      statusCounts[file.status] = [];
    }
    statusCounts[file.status].push(file);
  });

  const statusAnalysis = Object.entries(statusCounts)
    .map(
      ([status, files]) => `${getStatusDescription(status)}: ${files.length}个`,
    )
    .join(", ");

  analysis.push(`**变更操作**: ${statusAnalysis}`);

  return analysis.join("\n");
}

function getFileTypeDescription(ext: string): string {
  const typeMap: { [key: string]: string } = {
    ts: "TypeScript",
    js: "JavaScript",
    json: "JSON配置",
    md: "文档",
    html: "HTML",
    css: "样式",
    py: "Python",
    java: "Java",
    xml: "XML",
    unknown: "其他",
  };
  return typeMap[ext] || ext.toUpperCase();
}

function buildZendaoPropmt(zendaoInfo: ZendaoInfo) {
  return `## 禅道关联信息
  
缺陷ID: ${zendaoInfo.id}
标题: ${zendaoInfo.title}
状态: ${zendaoInfo.status}
指派给: ${zendaoInfo.assignedTo}
创建人: ${zendaoInfo.openedBy}
创建日期: ${zendaoInfo.openedDate}
最后编辑日期: ${zendaoInfo.lastEditedDate}
类型: ${zendaoInfo.type}
严重性: ${zendaoInfo.severity}
优先级: ${zendaoInfo.priority}
产品: ${zendaoInfo.product}
模块: ${zendaoInfo.module}
重现步骤: ${zendaoInfo.steps}
描述: ${zendaoInfo.description}`;
}

function buildDiffPropmt(diff: string, changedFiles: SvnFile[]) {
  return `## 代码差异

${diff.length > MAX_DIFF_CHARS ? `代码差异过大, 只截取部分内容: \n` : ""}
\`\`\`diff
${diff.length > MAX_DIFF_CHARS ? diff.slice(0, 9000) : diff}
\`\`\``;
}

function buildFileDescriptionPrompt(changedFiles: SvnFile[]) {
  let files =
    changedFiles.length > MAX_DIFF_FILES
      ? changedFiles.slice(0, MAX_DIFF_FILES)
      : changedFiles;
  let description = files
    .map(
      (file) => `${file.path} (${getStatusDescription(file.status)})`,
    )
    .join("\n");
  description =
    files.length > MAX_DIFF_FILES
      ? `文件数量差异过大，只展示${files.length}个文件差异信息：${description}`
      : description;
  return description;
}
