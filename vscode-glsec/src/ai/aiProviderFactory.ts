import * as vscode from "vscode";
import { AIProvider, AIConfig } from "./aiInterface";
import { CopilotProvider } from "./providers/copilotProvider";
import { OllamaProvider } from "./providers/ollamaProvider";
import { QianwenProvider } from "./providers/qianwenProvider";
import { WenxinProvider } from "./providers/wenxinProvider";
import { ZhipuProvider } from "./providers/zhipuProvider";
import { CustomProvider } from "./providers/customProvider";
import { CONFIG_KEYS } from "./utils/constants";

export class AIProviderFactory {
  private static readonly providers: Map<string, AIProvider> = new Map();

  /**
   * 根据配置创建或获取AI提供者实例
   */
  static async createProvider(config: AIConfig): Promise<AIProvider> {
    const key = this.generateProviderKey(config);

    if (this.providers.has(key)) {
      return this.providers.get(key)!;
    }

    const provider = this.instantiateProvider(config);
    this.providers.set(key, provider);
    return provider;
  }

  /**
   * 获取所有可用的AI提供者
   */
  static async getAvailableProviders(config: AIConfig): Promise<AIProvider[]> {
    const allProviders = this.createAllProviderInstances(config);
    const availabilityChecks = allProviders.map(async (provider) => ({
      provider,
      available: await this.checkProviderAvailability(provider),
    }));

    const results = await Promise.allSettled(availabilityChecks);

    return results
      .filter(
        (
          result,
        ): result is PromiseFulfilledResult<{
          provider: AIProvider;
          available: boolean;
        }> => result.status === "fulfilled" && result.value.available,
      )
      .map((result) => result.value.provider);
  }

  /**
   * 从VSCode设置获取配置
   */
  static getConfigFromSettings(): AIConfig {
    const config = vscode.workspace.getConfiguration("aiMessage");

    return {
      provider: config.get(CONFIG_KEYS.AI.PROVIDER, "copilot") as any,
      timeout: config.get(CONFIG_KEYS.AI.TIMEOUT, 30000),

      // 提交信息格式配置
      enableEmoji: config.get(CONFIG_KEYS.COMMIT.ENABLE_EMOJI, true),
      enableBody: config.get(CONFIG_KEYS.COMMIT.ENABLE_BODY, true),
      enableScope: config.get(CONFIG_KEYS.COMMIT.ENABLE_SCOPE, true),
      language: config.get(CONFIG_KEYS.COMMIT.LANGUAGE, "简体中文"),

      // 各提供者配置
      ollamaEndpoint: config.get(
        CONFIG_KEYS.AI.OLLAMA_ENDPOINT,
        "http://localhost:11434",
      ),
      ollamaModel: config.get(CONFIG_KEYS.AI.OLLAMA_MODEL, "qwen2.5:7b"),

      qianwenApiKey: config.get(CONFIG_KEYS.AI.QIANWEN_API_KEY, ""),
      qianwenModel: config.get(CONFIG_KEYS.AI.QIANWEN_MODEL, "qwen-plus"),

      wenxinApiKey: config.get(CONFIG_KEYS.AI.WENXIN_API_KEY, ""),
      wenxinSecretKey: config.get(CONFIG_KEYS.AI.WENXIN_SECRET_KEY, ""),
      wenxinModel: config.get(CONFIG_KEYS.AI.WENXIN_MODEL, "ernie-3.5-8k"),

      zhipuApiKey: config.get(CONFIG_KEYS.AI.ZHIPU_API_KEY, ""),
      zhipuModel: config.get(CONFIG_KEYS.AI.ZHIPU_MODEL, "glm-4"),

      customEndpoint: config.get(CONFIG_KEYS.AI.CUSTOM_ENDPOINT, ""),
      customApiKey: config.get(CONFIG_KEYS.AI.CUSTOM_API_KEY, ""),
      customModel: config.get(CONFIG_KEYS.AI.CUSTOM_MODEL, ""),
    };
  }

  /**
   * 清理缓存的提供者实例
   */
  static clearCache(): void {
    this.providers.clear();
  }

  /**
   * 获取提供者状态信息
   */
  static async getProviderStatus(): Promise<
    Array<{ name: string; available: boolean; error?: string }>
  > {
    const config = this.getConfigFromSettings();
    const allProviders = this.createAllProviderInstances(config);

    const statusPromises = allProviders.map(async (provider) => {
      try {
        const available = await provider.isAvailable();
        return { name: provider.name, available };
      } catch (error) {
        return {
          name: provider.name,
          available: false,
          error: error instanceof Error ? error.message : "未知错误",
        };
      }
    });

    return Promise.all(statusPromises);
  }

  /**
   * 根据配置生成提供者缓存键
   */
  private static generateProviderKey(config: AIConfig): string {
    const relevantConfig = {
      provider: config.provider,
      ollamaEndpoint: config.ollamaEndpoint,
      ollamaModel: config.ollamaModel,
      qianwenModel: config.qianwenModel,
      wenxinModel: config.wenxinModel,
      zhipuModel: config.zhipuModel,
      customModel: config.customModel,
    };
    return `${config.provider}-${JSON.stringify(relevantConfig)}`;
  }

  /**
   * 实例化具体的AI提供者
   */
  private static instantiateProvider(config: AIConfig): AIProvider {
    switch (config.provider) {
      case "copilot":
        return new CopilotProvider();
      case "ollama":
        return new OllamaProvider(config);
      case "qianwen":
        return new QianwenProvider(config);
      case "wenxin":
        return new WenxinProvider(config);
      case "zhipu":
        return new ZhipuProvider(config);
      case "custom":
        return new CustomProvider(config);
      default:
        throw new Error(`不支持的AI提供商: ${config.provider}`);
    }
  }

  /**
   * 创建所有提供者实例
   */
  private static createAllProviderInstances(config: AIConfig): AIProvider[] {
    return [
      new CopilotProvider(),
      new OllamaProvider(config),
      new QianwenProvider(config),
      new WenxinProvider(config),
      new ZhipuProvider(config),
      new CustomProvider(config),
    ];
  }

  /**
   * 检查提供者可用性，包含错误处理
   */
  private static async checkProviderAvailability(
    provider: AIProvider,
  ): Promise<boolean> {
    try {
      return await provider.isAvailable();
    } catch (error) {
      console.warn(`检查AI提供商 ${provider.name} 可用性时出错:`, error);
      return false;
    }
  }
}
