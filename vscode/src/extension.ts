import * as vscode from "vscode";
import { VcsFactory } from "./vcs/vcsFactory";
import { IVersionControlService } from "./vcs/vcsInterface";
import { AIService } from "./ai/aiService";
import { setScmInputBoxValue } from "./utils/setScmInputBoxValue";
import { showCommitMessagePreview } from "./utils/showCommitMessagePreview";
import { handleError } from "./utils/handleError";
import { ZentaoService } from "./zendao/zentaoService";
import type { ZendaoInfo } from "./zendao/zendaoInterface";
import { outputChannel } from "./utils/outputChannel";
import { isPositiveInteger } from "./utils";

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
  const generateCommand = vscode.commands.registerCommand(
    "ai-message.generateCommitMessage",
    handleGenerateCommitMessage,
  );

  const zendaoCommand = vscode.commands.registerCommand(
    "ai-message.generateZendaoCommitMessage",
    handleGenerateZendaoCommitMessage,
  );

  const quickCommand = vscode.commands.registerCommand(
    "ai-message.quickCommit",
    handleQuickCommit,
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

async function handleGenerateCommitMessage(zendaoInfo?: ZendaoInfo) {
  try {
    await unifiedGenerateCommit(zendaoInfo);
  } catch (error) {
    await handleError("生成提交信息时发生错误", error);
  }
}

// 统一的提交信息生成流程（带流式 & 回退 & 格式化）
async function unifiedGenerateCommit(zendaoInfo?: ZendaoInfo) {
  await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "生成提交信息",
      cancellable: false,
    },
    async (progress) => {
      progress.report({ increment: 0, message: "检查仓库..." });
      const vcs = await validateVcsRepository();
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
      const scmWritable = await setScmInputBoxValue(initMsg);
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
          (await setScmInputBoxValue(formatted)) ||
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

async function handleGenerateZendaoCommitMessage() {
  try {
    const idString = await vscode.window.showInputBox({
      title: "请输入禅道Bug或任务编号",
      value: "",
      prompt: "输入编号后按回车生成提交信息",
      ignoreFocusOut: true,
    });

    if (idString && isPositiveInteger(idString)) {
      const zendaoService = new ZentaoService();
      await zendaoService.login();
      const zendaoInfo = await zendaoService.buildZendaoInfo(
        parseInt(idString),
      );
      zendaoInfo.shouldProcessZendao = true;
      handleGenerateCommitMessage(zendaoInfo);
    } else {
      outputChannel.appendLine(
        `[Zendao] 获取禅道信息失败,执行基础提交信息生成`,
      );
      handleGenerateCommitMessage();
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

async function handleQuickCommit() {
  try {
    vscode.window.showInformationMessage("正在快速生成提交信息...");

    const vcs = await validateVcsRepository();
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

    // 尝试填充到SCM输入框，否则复制到剪贴板
    const success = await setScmInputBoxValue(commitMessage);

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

async function validateVcsRepository(): Promise<IVersionControlService | null> {
  try {
    vcsService = await VcsFactory.createService();
    if (!vcsService) {
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

    const vcsType = vcsService.getVcsType();
    console.log(`检测到${vcsType.toUpperCase()}仓库`);
    return vcsService;
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
