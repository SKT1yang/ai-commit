import { AIConfig, GenerateOptions } from "../aiInterface";
import { BaseProvider } from "./baseProvider";
import { SvnFile } from "../../vcs/svnService";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt, buildBugReasonPrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import {
  cleanModelOutput,
  extractResponseContent,
} from "../utils/cleanModelOutput";
import { outputChannel } from "../../utils/outputChannel";

export class CustomProvider extends BaseProvider {
  readonly name = PROVIDER_NAMES.CUSTOM;

  constructor(config: AIConfig) {
    super(config);
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.config?.customEndpoint && this.config?.customApiKey);
  }

  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.config?.customEndpoint) {
      throw new Error(`请配置${PROVIDER_NAMES.CUSTOM}接口地址`);
    }

    if (!this.config?.customApiKey) {
      throw new Error(`请配置${PROVIDER_NAMES.CUSTOM} API Key`);
    }

    const prompt = buildBasePrompt(diff, changedFiles, options);
    outputChannel.appendLine(
      `[Custom generateCommitMessage]: ${this.name}: ${prompt}`,
    );

    try {
      // 生成提交信息比 BUG 原因分析更慢（思考型模型），超时走分流程配置
      const content = await this.requestChatCompletion(prompt, {
        temperature: 0.3,
        maxTokens: 4096,
        timeout: this.config?.commitTimeout || this.config?.timeout || 30000,
      });

      const raw = extractCommitMessage(content.trim());
      return enforceConventionalCommit(
        raw,
        changedFiles,
        diff,
        options?.zendaoInfo,
      );
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.CUSTOM);
    }
  }

  async generateReason(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.config?.customEndpoint) {
      throw new Error(`请配置${PROVIDER_NAMES.CUSTOM}接口地址`);
    }

    if (!this.config?.customApiKey) {
      throw new Error(`请配置${PROVIDER_NAMES.CUSTOM} API Key`);
    }

    const prompt = buildBugReasonPrompt(diff, changedFiles, options);
    outputChannel.appendLine(`[Custom generateReason]: ${this.name}: ${prompt}`);

    try {
      return await this.requestChatCompletion(prompt, {
        temperature: 0.3,
        maxTokens: 2000,
        timeout: this.config?.bugReasonTimeout || this.config?.timeout || 30000,
      });
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.CUSTOM);
    }
  }

  /**
   * 发送 OpenAI 兼容的对话请求并返回清洗后的正文。
   * 统一处理：非流式请求、SSE 防御、reasoning_content 降级、<think> 剥离、重试
   */
  private async requestChatCompletion(
    prompt: string,
    params: { temperature: number; maxTokens: number; timeout: number },
  ): Promise<string> {
    const endpoint = this.config?.customEndpoint;
    const apiKey = this.config?.customApiKey;
    if (!endpoint || !apiKey) {
      throw new Error(`请配置${PROVIDER_NAMES.CUSTOM}接口地址和 API Key`);
    }
    const model = this.config?.customModel || "gpt-3.5-turbo";

    const body: Record<string, unknown> = {
      model: model,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
      // 必须非流式：本扩展按整体 JSON 解析响应。
      // 曾经写死 stream:true 导致服务端返回 SSE 而解析失败
      stream: false,
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    };
    if (this.config?.disableThinking) {
      // 实测（scripts/model-benchmark.mjs P5）：本端点仅支持 chat_template_kwargs
      // 方式关思考，顶层 enable_thinking 会被静默忽略；关思考后 p50 从 ~48s 降至 ~8s
      body.chat_template_kwargs = { enable_thinking: false };
    }

    const response = await fetchWithTimeout(
      endpoint,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      },
      params.timeout,
      { retries: this.config?.requestRetryCount ?? 0 },
    );

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(
        `${PROVIDER_NAMES.CUSTOM} 错误: ${response.status} ${errorData}`,
      );
    }

    // 防御：端点/网关若忽略 stream:false 返回 SSE，整体解析必然失败，给出明确提示
    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("text/event-stream")) {
      throw new Error(
        `${PROVIDER_NAMES.CUSTOM} 服务端返回了流式（SSE）响应，请检查端点配置`,
      );
    }

    const data = (await response.json()) as {
      error?: { message?: string; type?: string };
    };
    if (data?.error) {
      throw new Error(
        `${PROVIDER_NAMES.CUSTOM} 错误: ${data.error.message || data.error.type || "未知错误"}`,
      );
    }

    const content = cleanModelOutput(extractResponseContent(data));
    if (!content) {
      throw new Error(`${PROVIDER_NAMES.CUSTOM}返回了空响应`);
    }

    outputChannel.appendLine(
      `[customProvider requestChatCompletion] ${PROVIDER_NAMES.CUSTOM} 响应: ${content}`,
    );
    return content;
  }
}
