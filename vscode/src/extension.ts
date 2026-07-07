import * as vscode from "vscode";
import { GitService } from "./vcs/gitService";
import { SvnService } from "./vcs/svnService";
import { IVersionControlService } from "./vcs/vcsInterface";
import { AIService } from "./ai/aiService";
import { setScmInputBoxValue } from "./utils/setScmInputBoxValue";
import { showCommitMessagePreview } from "./utils/showCommitMessagePreview";
import { handleError } from "./utils/handleError";
import { ZentaoService } from "./zendao/zentaoService";
import type { ZendaoInfo } from "./zendao/zendaoInterface";
import { outputChannel } from "./utils/outputChannel";
import { isPositiveInteger } from "./utils";

/**
 * 每个已发现仓库根目录缓存一个 service 实例。
 * 这样每个 repository 的按钮点击都会拿到属于自己仓库的 service。
 */
const services = new Map<string, IVersionControlService>();

/**
 * 当前仓库的 service（由最近一次 validateVcsRepository() 写入）。
 * 保持对旧代码的兼容：其他模块通过 vcsService 访问"当前仓库"。
 */
let vcsService: IVersionControlService | null = null;

let aiService: AIService;

export function activate(context: vscode.ExtensionContext) {
  console.log("AI-message is now active!");

  initializeServices();
  registerCommands(context);
}

function initializeServices() {
  aiService = new AIService();
}

function registerCommands(context: vscode.ExtensionContext) {
  // 仅用于诊断的日志：安全地打印参数类型与关键字段（避免 JSON 序列化炸掉整个命令）
  const logArgsSafe = (label: string, args: ReadonlyArray<unknown>) => {
    try {
      const summary = args.map((a) => {
        if (a === null || a === undefined) return String(a);
        if (typeof a !== "object") return typeof a;
        const obj = a as Record<string, unknown>;
        const keys = Object.keys(obj).slice(0, 12);
        const hasUri = "uri" in obj ? "uri=" + String(obj.uri) : "";
        const hasRootUri = "rootUri" in obj ? "rootUri=" + String(obj.rootUri) : "";
        return `{${keys.join(",")}} ${hasUri} ${hasRootUri}`;
      });
      const msg = `[AI-Message:ARGS] ${label}: count=${args.length} | ${summary.join(" | ")}`;
      console.log(msg);
      try { outputChannel.appendLine(msg); } catch { /* ignore */ }
    } catch (e) {
      console.log("[AI-Message:ARGS] " + label + ": <log failed " + e + ">");
    }
  };

  const generateCommand = vscode.commands.registerCommand(
    "ai-message.generateCommitMessage",
    (...args) => {
      logArgsSafe("generateCommitMessage", args);
      return handleGenerateCommitMessage(args);
    },
  );

  const zendaoCommand = vscode.commands.registerCommand(
    "ai-message.generateZendaoCommitMessage",
    (...args) => {
      logArgsSafe("generateZendaoCommitMessage", args);
      return handleGenerateZendaoCommitMessage(args);
    },
  );

  const quickCommand = vscode.commands.registerCommand(
    "ai-message.quickCommit",
    (...args) => {
      logArgsSafe("quickCommit", args);
      return handleQuickCommit(args);
    },
  );

  const configureCommand = vscode.commands.registerCommand(
    "ai-message.configureAI",
    handleConfigureAI,
  );

  context.subscriptions.push(
    generateCommand,
    zendaoCommand,
    quickCommand,
    configureCommand,
  );
}

// ====================================================================================
// 常规提交信息生成
// ====================================================================================
// handleGenerateCommitMessage
// ====================================================================================

async function handleGenerateCommitMessage(
  cmdArgs: ReadonlyArray<unknown>,
  zendaoInfo?: ZendaoInfo,
) {
  try {
    await unifiedGenerateCommit(cmdArgs, zendaoInfo);
  } catch (error) {
    await handleError("生成提交信息时发生错误", error);
  }
}

/**
 * 统一的提交信息生成流程（带流式 & 回退 & 格式化）。
 *
 * @param cmdArgs VSCode 命令透传的参数（包含 SCM 按钮的 rootUri）
 * @param zendaoInfo 可选的禅道任务信息
 */
async function unifiedGenerateCommit(
  cmdArgs: ReadonlyArray<unknown>,
  zendaoInfo?: ZendaoInfo,
) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "生成提交信息",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "检查仓库..." });
      const vcs = await validateVcsRepository(cmdArgs);
      if (!vcs) {
        return;
      }

      progress.report({ increment: 20, message: "收集变更..." });
      const changes = await getVcsChanges();
      if (!changes) {
        return;
      }

      // 获取待提交文件列表（排除ignore）
      const status = await vcsService!.getCommitReadyChanges();
      const changedFiles = status.changedFiles;

      progress.report({ increment: 40, message: "准备流式..." });
      const initMsg = "🤖 正在分析 " + changedFiles.length + " 个文件变更...";
      const targetRepoRoot = vcsService!.getWorkingDirectory();
      const scmWritable = await setScmInputBoxValue(initMsg, targetRepoRoot);
      const debug = vscode.workspace
        .getConfiguration("aiMessage")
        .get<boolean>("debug.enableStreamingLog", false);
      if (!scmWritable && debug) {
        console.log("[AI-Message] SCM输入框不可写，将使用输出通道");
      }

      progress.report({ increment: 55, message: "模型流式生成中..." });
      try {
        await aiService.generateCommitMessageWithStream(changes, changedFiles, {
          progress,
          fallbackToOutput: !scmWritable,
          zendaoInfo,
          repoRoot: targetRepoRoot,
        });
        progress.report({ increment: 100, message: "完成" });
        vscode.window.showInformationMessage("✅ 提交信息已生成");
      } catch (e) {
        if (debug) {
          console.error("[AI-Message] 流式生成失败，尝试普通生成", e);
        }
        const formatted = await aiService.generateCommitMessage(
          changes,
          changedFiles,
          {
            zendaoInfo,
          },
        );
        outputChannel.appendLine(
          `[AI-Message] formatted value: ${formatted} / ${typeof formatted}`,
        );
        if (formatted) {
          (await setScmInputBoxValue(formatted, targetRepoRoot)) ||
            vscode.env.clipboard.writeText(formatted);
          vscode.window.showInformationMessage(
            "⚠️ 已使用非流式方式生成提交信息",
          );
        } else {
          vscode.window.showErrorMessage("无法生成提交信息");
        }
      }
    },
  );
}

// ====================================================================================
// 禅道提交信息生成
// ====================================================================================
// handleGenerateZendaoCommitMessage
// ====================================================================================

async function handleGenerateZendaoCommitMessage(
  cmdArgs: ReadonlyArray<unknown>,
) {
  try {
    const idString = await vscode.window.showInputBox({
      title: "请输入禅道Bug或任务编号",
      value: "",
      prompt: "输入编号后按回车生成提交信息",
      ignoreFocusOut: true,
    });
    // cancel input 什么也不做
    if (idString === undefined) {
      return;
    }

    if (isPositiveInteger(idString)) {
      const zendaoService = new ZentaoService();
      await zendaoService.login();
      const zendaoInfo = await zendaoService.buildZendaoInfo(
        parseInt(idString),
      );
      zendaoInfo.shouldProcessZendao = true;
      handleGenerateCommitMessage(cmdArgs, zendaoInfo);
    } else {
      outputChannel.appendLine(
        `[Zendao] 获取禅道信息失败,执行基础提交信息生成`,
      );
      handleGenerateCommitMessage(cmdArgs);
    }
  } catch (error) {
    await handleError("编辑提交信息时发生错误", error);
  }
}

// ====================================================================================
// 快速提交信息生成
// ====================================================================================
// handleQuickCommit 不走ai，直接根据变更生成简单提交信息
// ====================================================================================

async function handleQuickCommit(cmdArgs: ReadonlyArray<unknown>) {
  try {
    vscode.window.showInformationMessage("正在快速生成提交信息...");

    const vcs = await validateVcsRepository(cmdArgs);
    if (!vcs) {
      return;
    }

    const changes = await getVcsChanges();
    if (!changes) {
      return;
    }

    const commitMessage = await generateQuickCommitMessage(changes);
    if (!commitMessage) {
      return;
    }

    // 精确填充到本次点击所对应仓库的 SCM 输入框，否则回退到剪贴板
    const quickRepoRoot = vcs.getWorkingDirectory();
    const success = await setScmInputBoxValue(commitMessage, quickRepoRoot);

    if (success) {
      vscode.window
        .showInformationMessage(
          "✅ 提交信息已快速生成并填充到Source Control！",
          "查看",
        )
        .then((selection) => {
          if (selection === "查看") {
            showCommitMessagePreview(commitMessage);
          }
        });
    } else {
      await vscode.env.clipboard.writeText(commitMessage);
      vscode.window
        .showInformationMessage("提交信息已复制到剪贴板！", "查看")
        .then((selection) => {
          if (selection === "查看") {
            showCommitMessagePreview(commitMessage);
          }
        });
    }
  } catch (error) {
    await handleError("快速生成提交信息时发生错误", error);
  }
}

async function generateQuickCommitMessage(
  changes: string,
): Promise<string | null> {
  try {
    if (!vcsService) {
      throw new Error("版本控制服务未初始化");
    }

    // 需要获取变更文件列表
    const status = await vcsService.getCommitReadyChanges();
    const message = await aiService.generateCommitMessage(
      changes,
      status.changedFiles,
    );

    if (!message || message.trim().length === 0) {
      vscode.window.showErrorMessage(
        "无法生成提交信息，请检查GitHub Copilot是否已安装并登录",
      );
      return null;
    }

    return message.trim();
  } catch (error) {
    await handleError("使用AI生成提交信息时发生错误", error);
    return null;
  }
}

// ====================================================================================
// 配置AI
// ====================================================================================
// handleConfigureAI
// ====================================================================================

async function handleConfigureAI() {
  try {
    const status = await aiService.getProviderStatus();
    const currentProvider = aiService.getCurrentProviderName();

    interface ProviderQuickPickItem extends vscode.QuickPickItem {
      provider: string;
    }

    const items: ProviderQuickPickItem[] = [
      {
        label: "$(gear) 查看当前AI提供商状态",
        description: `当前: ${currentProvider}`,
        provider: "status",
      },
      {
        label: "$(settings) 打开AI设置",
        description: "配置AI提供商和参数",
        provider: "settings",
      },
      {
        label: "$(refresh) 测试AI连接",
        description: "检查所有AI提供商的可用性",
        provider: "test",
      },
    ];

    const selection = await vscode.window.showQuickPick(items, {
      placeHolder: "选择AI配置操作",
    });

    if (!selection) {
      return;
    }

    switch (selection.provider) {
      case "status":
        await showProviderStatus(status, currentProvider);
        break;
      case "settings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "aiMessage.ai",
        );
        break;
      case "test":
        await testAIConnection();
        break;
    }
  } catch (error) {
    await handleError("配置AI设置时发生错误", error);
  }
}

async function showProviderStatus(
  status: { name: string; available: boolean; error?: string }[],
  currentProvider: string,
) {
  const statusText = status
    .map((s) => {
      const icon = s.available ? "✅" : "❌";
      const current = s.name === currentProvider ? " (当前)" : "";
      const error = s.error ? ` - ${s.error}` : "";
      return `${icon} ${s.name}${current}${error}`;
    })
    .join("\n");

  await vscode.window.showInformationMessage(
    `AI提供商状态:\n\n${statusText}`,
    { modal: true },
    "确定",
  );
}

async function testAIConnection() {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "测试AI连接",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "正在检查AI提供商..." });

      const status = await aiService.getProviderStatus();
      const available = status.filter((s) => s.available);
      const unavailable = status.filter((s) => !s.available);

      progress.report({ increment: 100, message: "测试完成" });

      let message = `测试完成!\n\n可用的AI提供商 (${available.length}个):\n`;
      message += available.map((s) => `✅ ${s.name}`).join("\n");

      if (unavailable.length > 0) {
        message += `\n\n不可用的AI提供商 (${unavailable.length}个):\n`;
        message += unavailable
          .map((s) => `❌ ${s.name}${s.error ? ` - ${s.error}` : ""}`)
          .join("\n");
      }

      await vscode.window.showInformationMessage(
        message,
        { modal: true },
        "确定",
      );
    },
  );
}
// ====================================================================================
// 版本控制vcs相关
// ====================================================================================
// 多次使用的辅助函数
// ====================================================================================

// ====================================================================================
// 仓库解析（让每个仓库按钮精确作用于自己的仓库）
// ====================================================================================

/**
 * 根据命令参数 / 活动编辑器，确定用户这次点击的是哪个仓库的根目录。
 *
 * 优先级：
 *   1. 命令调用方传入的 sourceControl.rootUri（VSCode SCM 按钮会带上）
 *   2. 活动编辑器所在的 git 仓库
 *   3. 当前缓存的 services 中已有的任一仓库
 *   4. 自动扫描所有工作区文件夹找到的全部仓库
 *
 * 返回仓库根目录字符串；如果无法确定则返回 null。
 */
async function resolveTargetRepoRoot(
  args?: ReadonlyArray<unknown>,
): Promise<string | null> {
  // 1) 从命令参数中提取 SourceControl rootUri（VSCode SCM 按钮贡献点会传入）
  if (args && args.length > 0) {
    for (const arg of args) {
      if (arg && typeof arg === "object" && "rootUri" in arg) {
        const rootUri = (arg as { rootUri?: unknown }).rootUri;
        if (rootUri && typeof rootUri === "object" && "fsPath" in rootUri) {
          const fsPath = (rootUri as { fsPath?: string }).fsPath;
          if (fsPath) {
            const gitRoot = await GitService.resolveRepoForFile(fsPath);
            if (gitRoot) {
              return gitRoot;
            }
          }
        }
      }
    }
  }

  // 2) 根据活动编辑器定位
  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri) {
    const gitRoot = await GitService.resolveRepoForFile(activeUri.fsPath);
    if (gitRoot) {
      return gitRoot;
    }
  }

  // 3) 缓存中已有的仓库
  if (services.size > 0) {
    const firstRoot = services.keys().next().value;
    if (firstRoot) {
      return firstRoot;
    }
  }

  // 4) 自动扫描所有工作区文件夹
  const allRoots = await GitService.findAllRepoRoots();
  if (allRoots.length === 1) {
    return allRoots[0];
  }
  if (allRoots.length > 1) {
    // 多仓库让用户选择
    const pick = await vscode.window.showQuickPick(allRoots, {
      placeHolder: "选择要用于本次提交的仓库",
      matchOnDescription: false,
    });
    return pick ?? null;
  }

  return null;
}

/**
 * 返回目标仓库的 service 实例（按需懒加载缓存）。
 *
 * @param repoRoot 仓库根目录
 * @returns 针对该仓库的 version control service，找不到则返回 null
 */
async function getServiceForRepo(
  repoRoot: string,
): Promise<IVersionControlService | null> {
  const cached = services.get(repoRoot);
  if (cached) {
    return cached;
  }

  // 尝试 Git
  const gitSvc = new GitService(repoRoot);
  if (await gitSvc.isInRepository()) {
    services.set(repoRoot, gitSvc);
    console.log(`[AI-Message] 缓存 Git 仓库: ${repoRoot}`);
    return gitSvc;
  }

  // 尝试 SVN
  const svnSvc = new SvnService();
  if (await svnSvc.isInRepository()) {
    services.set(repoRoot, svnSvc);
    console.log(`[AI-Message] 缓存 SVN 仓库: ${repoRoot}`);
    return svnSvc;
  }

  return null;
}

/**
 * 校验仓库版本控制系统，并把 `vcsService` 指向本次点击对应的仓库 service。
 *
 * 根据命令参数 + 活动编辑器精确定位用户点击的是哪个仓库。
 */
async function validateVcsRepository(
  args?: ReadonlyArray<unknown>,
): Promise<IVersionControlService | null> {
  try {
    const repoRoot = await resolveTargetRepoRoot(args);
    if (!repoRoot) {
      vscode.window
        .showErrorMessage(
          "当前工作区不是Git或SVN仓库，或版本控制工具不可用",
          "了解更多",
        )
        .then((selection) => {
          if (selection === "了解更多") {
            vscode.env.openExternal(vscode.Uri.parse("https://git-scm.com/"));
          }
        });
      return null;
    }

    const svc = await getServiceForRepo(repoRoot);
    if (!svc) {
      vscode.window
        .showErrorMessage(
          "无法初始化仓库的版本控制服务",
          "了解更多",
        )
        .then((selection) => {
          if (selection === "了解更多") {
            vscode.env.openExternal(vscode.Uri.parse("https://git-scm.com/"));
          }
        });
      return null;
    }

    vcsService = svc;
    const vcsType = svc.getVcsType();
    console.log(`[AI-Message] 检测到${vcsType.toUpperCase()}仓库: ${repoRoot}`);
    return svc;
  } catch (error) {
    await handleError("验证版本控制仓库时发生错误", error);
    return null;
  }
}

async function getVcsChanges(): Promise<string | null> {
  try {
    if (!vcsService) {
      throw new Error("版本控制服务未初始化");
    }

    const diff = await vcsService.getDiff();

    if (!diff || diff.trim().length === 0) {
      vscode.window.showWarningMessage("当前没有需要提交的更改");
      return null;
    }

    return diff;
  } catch (error) {
    await handleError("获取版本控制变更信息时发生错误", error);
    return null;
  }
}

export function deactivate() {
  console.log("AI-message is now deactivated");
}
