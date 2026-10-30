import * as vscode from "vscode";
import { SvnFile } from "../vcs/svnService";
import type { ZendaoInfo } from "../zendao/zendaoInterface";

export interface AIProvider {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string>;
  generateCommitMessageWithStream?(
    diff: string,
    changedFiles: SvnFile[],
    options?: StreamGenerateOptions,
  ): Promise<string>;

  /**
   * 生成bug 问题原因
   */
  generateReason(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string>;
}

export interface StreamGenerateOptions {
  fallbackToOutput?: boolean; // 当SCM输入框不可写时，是否回退到输出通道
  zendaoInfo?: ZendaoInfo;
  progress: vscode.Progress<{ increment?: number; message?: string }>;
  repoRoot?: string; // 目标仓库根目录，用于精确定位 SCM 输入框
}

export interface GenerateOptions {
  zendaoInfo?: ZendaoInfo;
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

  // 请求策略配置（超时按流程区分：思考型模型生成 commit 更慢）
  commitTimeout?: number;
  bugReasonTimeout?: number;
  requestRetryCount?: number;
  /** 是否在请求中携带关思考参数（服务端不支持时不应发送，避免 400） */
  disableThinking?: boolean;
}

export interface APIResponse {
  success: boolean;
  data?: string;
  error?: string;
}
