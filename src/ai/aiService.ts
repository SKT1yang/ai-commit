import * as vscode from "vscode";
import { AIProvider, AIConfig, StreamOptions } from "./aiInterface";
import { SvnFile } from "../vcs/svnService";
import { AIProviderFactory } from "./aiProviderFactory";
import { FALLBACK_PRIORITIES, CONFIG_KEYS } from "./utils/constants";

export class AIService {
  private provider: AIProvider | null = null;
  private config: AIConfig;
  private isRefreshing: boolean = false;
  private configChangeTimer: NodeJS.Timeout | undefined;

  constructor() {
    this.config = AIProviderFactory.getConfigFromSettings();
    this.initializeProvider();

    // 监听配置变化
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration("aiMessage.ai")) {
        this.handleConfigChange();
      }
    });
  }

  /**
   * 初始化AI提供者
   */
  private async initializeProvider(): Promise<void> {
    try {
      this.provider = await AIProviderFactory.createProvider(this.config);
    } catch (error) {
      console.error("创建AI提供商失败:", error);
      this.provider = null;
    }
  }

  /**
   * 处理配置变化
   */
  private async handleConfigChange(): Promise<void> {
    if (this.isRefreshing) {
      return;
    }

    // 防抖处理，避免频繁刷新
    if (this.configChangeTimer) {
      clearTimeout(this.configChangeTimer);
    }

    this.configChangeTimer = setTimeout(async () => {
      this.isRefreshing = true;
      try {
        this.config = AIProviderFactory.getConfigFromSettings();
        await this.initializeProvider();
      } finally {
        this.isRefreshing = false;
      }
    }, 500);
  }

  /**
   * 获取当前提供者
   */
  getCurrentProvider(): AIProvider | null {
    return this.provider;
  }

  /**
   * 获取当前提供者名称
   */
  getCurrentProviderName(): string {
    return this.provider?.name || "未配置";
  }

  /**
   * 生成提交信息
   */
  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    zendaoPrompt?: string,
  ): Promise<string> {
    await this.ensureProviderAvailable();

    try {
      return await this.provider!.generateCommitMessage(
        diff,
        changedFiles,
        zendaoPrompt,
      );
    } catch (error) {
      console.error(`AI提供商 ${this.provider!.name} 生成失败:`, error);
      return await this.handleGenerationError(diff, changedFiles, zendaoPrompt);
    }
  }

  /**
   * 流式生成提交信息
   */
  async generateCommitMessageWithStream(
    diff: string,
    changedFiles: SvnFile[],
    options: StreamOptions,
  ): Promise<string> {
    await this.ensureProviderAvailable();

    try {
      // 优先使用流式生成
      if (
        typeof this.provider!.generateCommitMessageWithStream === "function"
      ) {
        return await this.provider!.generateCommitMessageWithStream(
          diff,
          changedFiles,
          options,
        );
      }
      // 尝试找出支持流式生成的提供者
      const streamProvider = await this.getStreamCapableProvider([
        this.provider!.name,
      ]);
      if (streamProvider && streamProvider.generateCommitMessageWithStream) {
        return await streamProvider.generateCommitMessageWithStream(
          diff,
          changedFiles,
          options,
        );
      }
      throw new Error("无 AI 提供商支持流式生成");
    } catch (error) {
      console.error("流式生成提交信息失败:", error);
      throw new Error(error instanceof Error ? error.message : "未知错误");
    }
  }

  /**
   * 尽可能找出支持流式生成的提供者
   */
  async getStreamCapableProvider(excludeNames?: string[]): Promise<AIProvider | null> {
    const availableProviders = await AIProviderFactory.getAvailableProviders(
      this.config,
    );

    for (const provider of availableProviders) {
      if (excludeNames && excludeNames.includes(provider.name)) {
        continue;
      }
      if (typeof provider.generateCommitMessageWithStream === "function") {
        return provider;
      }
    }

    return null;
  }

  /**
   * 获取所有提供者的状态
   */
  async getProviderStatus(): Promise<
    Array<{ name: string; available: boolean; error?: string }>
  > {
    return await AIProviderFactory.getProviderStatus();
  }

  /**
   * 确保提供者可用，如不可用则尝试备用方案
   */
  private async ensureProviderAvailable(): Promise<void> {
    if (!this.provider) {
      await this.initializeProvider();
    }

    if (!this.provider) {
      throw new Error("未配置可用的AI提供商");
    }

    const isAvailable = await this.provider.isAvailable();
    if (!isAvailable) {
      const fallbackProvider = await this.getFallbackProvider();
      if (fallbackProvider) {
        this.provider = fallbackProvider;
      } else {
        throw new Error(`AI提供商 ${this.provider.name} 不可用且无备用提供商`);
      }
    }
  }

  /**
   * 处理生成错误，尝试备用方案
   */
  private async handleGenerationError(
    diff: string,
    changedFiles: SvnFile[],
    zendaoPrompt?: string,
  ): Promise<string> {
    // 尝试备用提供者
    const fallbackProvider = await this.getFallbackProvider();
    if (fallbackProvider) {
      console.log(`使用备用提供商: ${fallbackProvider.name}`);
      try {
        return await fallbackProvider.generateCommitMessage(
          diff,
          changedFiles,
          zendaoPrompt,
        );
      } catch (fallbackError) {
        console.error("备用提供商生成失败:", fallbackError);
      }
    }

    // 检查是否启用回退功能
    const enableFallback = vscode.workspace
      .getConfiguration("aiMessage")
      .get(CONFIG_KEYS.AI.ENABLE_FALLBACK, true);

    if (enableFallback) {
      return this.generateFallbackMessage(diff, changedFiles);
    }

    throw new Error("所有AI提供商均不可用");
  }

  /**
   * 获取备用提供者
   */
  private async getFallbackProvider(): Promise<AIProvider | null> {
    const availableProviders = await AIProviderFactory.getAvailableProviders(
      this.config,
    );

    // 按优先级查找备用提供者
    for (const priority of FALLBACK_PRIORITIES) {
      const provider = availableProviders.find((p) => p.name === priority);
      if (provider && provider !== this.provider) {
        return provider;
      }
    }

    return null;
  }

  /**
   * 生成基于规则的后备提交信息
   */
  private generateFallbackMessage(
    diff: string,
    changedFiles: SvnFile[],
  ): string {
    const { type, emoji, subject } = this.analyzeChanges(changedFiles);
    const scope = this.extractScope(changedFiles);

    return `${emoji} ${type}(${scope || "general"}): ${subject}`;
  }

  /**
   * 分析文件变更以确定提交类型
   */
  private analyzeChanges(changedFiles: SvnFile[]): {
    type: string;
    emoji: string;
    subject: string;
  } {
    const fileTypes = new Set(
      changedFiles.map((f) => f.path.split(".").pop()?.toLowerCase()),
    );
    const operations = new Set(changedFiles.map((f) => f.status));

    if (fileTypes.has("md") || fileTypes.has("txt")) {
      return { type: "docs", emoji: "📝", subject: "更新文档" };
    }

    if (
      fileTypes.has("json") &&
      changedFiles.some((f) => f.path.includes("package.json"))
    ) {
      return { type: "build", emoji: "📦", subject: "更新依赖配置" };
    }

    if (operations.has("A")) {
      return { type: "feat", emoji: "✨", subject: "添加新功能" };
    }

    if (operations.has("D")) {
      return { type: "chore", emoji: "🔧", subject: "删除文件" };
    }

    if (operations.has("M")) {
      return { type: "fix", emoji: "🐛", subject: "修复问题" };
    }

    return { type: "chore", emoji: "🔧", subject: "更新代码" };
  }

  /**
   * 从变更文件中提取范围
   */
  private extractScope(changedFiles: SvnFile[]): string {
    if (changedFiles.length === 0) {
      return "";
    }

    // 尝试从目录结构提取范围
    const paths = changedFiles.map((f) => f.path);
    const commonPath = this.findCommonPrefix(paths);

    if (commonPath) {
      const segments = commonPath.split("/").filter(Boolean);
      return segments[segments.length - 1] || "";
    }

    return "";
  }

  /**
   * 查找字符串数组的共同前缀
   */
  private findCommonPrefix(strings: string[]): string {
    if (strings.length === 0) {
      return "";
    }

    const sorted = strings.sort();
    const first = sorted[0];
    const last = sorted[sorted.length - 1];

    let i = 0;
    while (i < first.length && i < last.length && first[i] === last[i]) {
      i++;
    }

    return first.substring(0, i);
  }

  /**
   * 清理资源
   */
  dispose(): void {
    if (this.configChangeTimer) {
      clearTimeout(this.configChangeTimer);
    }
  }
}
