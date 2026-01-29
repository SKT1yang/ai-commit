import * as vscode from "vscode";
import type { GenerateOptions, StreamGenerateOptions } from "../aiInterface";
import type { SvnFile } from "../../vcs/svnService";
import { setScmInputBoxValue } from "../../utils/setScmInputBoxValue";
import { BaseProvider } from "./baseProvider";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt, buildBugReasonPrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { outputChannel } from "../../utils/outputChannel";

/**
 * 流式生成提交信息并实时更新到SCM输入框
 */

export class CopilotProvider extends BaseProvider {
  readonly name = PROVIDER_NAMES.COPILOT;

  async isAvailable(): Promise<boolean> {
    try {
      let model = await this.getAvailableModel();
      if (model) {
        const messages = [
          vscode.LanguageModelChatMessage.User("测试可用性,请忽略此消息。"),
        ];

        const response = await model.sendRequest(
          messages,
          {},
          new vscode.CancellationTokenSource().token,
        );

        let result = "";
        for await (const fragment of response.text) {
          result += fragment;
        }
        return result.trim().length > 0;
      }
      return false;
    } catch (error) {
      console.error(`${PROVIDER_NAMES.COPILOT}可用性检查失败:`, error);
      return false;
    }
  }

  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    options?: StreamGenerateOptions,
  ): Promise<string> {
    try {
      let model = await this.getAvailableModel();

      const prompt = buildBasePrompt(diff, changedFiles, options);
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];

      const response = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token,
      );

      let result = "";
      for await (const fragment of response.text) {
        result += fragment;
      }
      const raw = extractCommitMessage(result.trim());
      return enforceConventionalCommit(
        raw,
        changedFiles,
        diff,
        options?.zendaoInfo,
      );
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.COPILOT);
    }
  }

  async generateCommitMessageWithStream(
    diff: string,
    changedFiles: SvnFile[],
    options?: StreamGenerateOptions,
  ): Promise<string> {
    try {
      let model = await this.getAvailableModel();

      // 构建提示信息
      const prompt = buildBasePrompt(diff, changedFiles, options);
      const messages = [vscode.LanguageModelChatMessage.User(prompt)];

      // 开始流式请求
      const response = await model.sendRequest(
        messages,
        {},
        new vscode.CancellationTokenSource().token,
      );
      const debug = vscode.workspace
        .getConfiguration("aiMessage")
        .get<boolean>("debug.enableStreamingLog", false);
      if (debug) {
        console.log("[AI-Message][Stream] 启动流式，会话模型:", model.id);
      }

      let result = "";
      let lastUpdateTime = Date.now();
      const updateInterval = 200; // 每200ms更新一次界面
      let fragmentCount = 0;
      let firstChunkTime: number | null = null;
      const startTime = Date.now();

      for await (const fragment of response.text) {
        fragmentCount++;
        if (firstChunkTime === null) {
          firstChunkTime = Date.now();
        }
        result += fragment;
        if (debug) {
          console.log(
            `[AI-Message][Stream] 片段#${fragmentCount} 长度=${fragment.length} 累计=${result.length}`,
          );
        }

        // 定期更新输入框，避免过于频繁的UI更新
        const now = Date.now();
        if (now - lastUpdateTime > updateInterval) {
          const displayText =
            result.length > 10
              ? `🤖 AI正在生成...\n\n${result}${
                  result.endsWith("\n") ? "" : "..."
                }`
              : "🤖 AI正在思考...";

          const ok = await setScmInputBoxValue(displayText);
          if (debug && !ok && !options?.fallbackToOutput) {
            console.log(
              "[AI-Message][Stream] SCM写入失败但未启用fallbackToOutput",
            );
          }
          if (!ok && options?.fallbackToOutput) {
            outputChannel.show(true);
            outputChannel.replace
              ? outputChannel.replace(displayText)
              : (function () {
                  // 没有replace方法时简单清屏再写
                  outputChannel.clear();
                  outputChannel.append(displayText);
                })();
            if (debug) {
              console.log(
                "[AI-Message][Stream] 已写入OutputChannel (fallback)",
              );
            }
          }
          lastUpdateTime = now;

          // 更新进度
          const progressIncrement = Math.min(85 + result.length / 10, 95);
          options?.progress.report({
            increment: progressIncrement,
            message: "实时生成中...",
          });
        }
      }

      // 最终处理和设置完整结果
      if (result.trim()) {
        if (debug) {
          const totalMs = Date.now() - startTime;
          const ttfb = firstChunkTime ? firstChunkTime - startTime : -1;
          console.log(
            `[AI-Message][Stream] 完成，总片段=${fragmentCount}, 总长度=${result.length}, 首字节(ms)=${ttfb}, 总耗时(ms)=${totalMs}`,
          );
        }
        // 提取提交信息（去掉可能的前缀和格式）
        const raw = extractCommitMessage(result.trim());
        const formatted = enforceConventionalCommit(
          raw,
          changedFiles,
          diff,
          options?.zendaoInfo,
        );
        const finalOk = await setScmInputBoxValue(formatted);
        if (!finalOk && options?.fallbackToOutput) {
          outputChannel.show(true);
          outputChannel.appendLine("\n=== 最终提交信息 ===");
          outputChannel.appendLine(formatted);
          if (debug) {
            console.log("[AI-Message][Stream] 最终结果写入OutputChannel");
          }
        }
        options?.progress.report({ increment: 100, message: "完成！" });
        return formatted;
      } else {
        throw new Error("生成的内容为空");
      }
    } catch (error) {
      console.error(`${PROVIDER_NAMES.COPILOT}流式生成失败:`, error);
      throw error;
    }
  }

  async generateReason(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string> {
    let model = await this.getAvailableModel();

    const prompt = buildBugReasonPrompt(diff, changedFiles, options);
    const messages = [vscode.LanguageModelChatMessage.User(prompt)];

    const response = await model.sendRequest(
      messages,
      {},
      new vscode.CancellationTokenSource().token,
    );

    let result = "";
    for await (const fragment of response.text) {
      result += fragment;
    }

    return result;
  }

  private async getAvailableModel() {
    // 尝试获取 Copilot 模型
    const models = await vscode.lm.selectChatModels({
      vendor: "copilot",
      family: "gpt-4o", // 优先使用 GPT-4o
    });

    // 如果没有 GPT-4o，尝试其他模型
    let model = models[0];
    if (!model) {
      const fallbackModels = await vscode.lm.selectChatModels({
        vendor: "copilot",
      });
      model = fallbackModels[0];
    }

    if (!model) {
      throw new Error(
        `没有可用的 ${PROVIDER_NAMES.COPILOT} 模型。请确保已安装并登录 GitHub Copilot。`,
      );
    }

    return model;
  }
}
