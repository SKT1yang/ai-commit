import * as vscode from "vscode";
import { SvnFile } from "../vcs/svnService";

export interface AIProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    zendaoPrompt?: string,
  ): Promise<string>;
  generateCommitMessageWithStream?(
    diff: string,
    changedFiles: SvnFile[],
    options?: StreamOptions
  ): Promise<string>;
}

export interface StreamOptions {
  fallbackToOutput?: boolean; // 当SCM输入框不可写时，是否回退到输出通道
  zendaoPrompt?: string; // 禅道提示词
  progress: vscode.Progress<{ increment?: number; message?: string }>,
}

export interface AIConfig {
  provider: "copilot" | "ollama" | "qianwen" | "wenxin" | "zhipu" | "custom";
  timeout: number;

  // 提交信息格式配置
  enableEmoji?: boolean;
  enableBody?: boolean;
  enableScope?: boolean;
  language?: string;

  // Ollama配置
  ollamaEndpoint?: string;
  ollamaModel?: string;

  // 通义千问配置
  qianwenApiKey?: string;
  qianwenModel?: string;

  // 文心一言配置
  wenxinApiKey?: string;
  wenxinSecretKey?: string;
  wenxinModel?: string;

  // 智谱AI配置
  zhipuApiKey?: string;
  zhipuModel?: string;

  // 自定义配置
  customEndpoint?: string;
  customApiKey?: string;
  customModel?: string;
}

export interface APIResponse {
  success: boolean;
  data?: string;
  error?: string;
}
