import { AIConfig, GenerateOptions } from "../aiInterface";
import { BaseProvider } from "./baseProvider";
import { SvnFile } from "../../vcs/svnService";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
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

    const model = this.config?.customModel || "gpt-3.5-turbo";
    const prompt = buildBasePrompt(diff, changedFiles, options);

    outputChannel.appendLine(`[Custom generateCommitMessage]: ${this.name}: ${prompt}`);
    try {
      const response = await fetchWithTimeout(
        this.config.customEndpoint,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config.customApiKey}`,
          },
          body: JSON.stringify({
            model: model,
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        },
        this.config?.timeout || 30000,
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${PROVIDER_NAMES.CUSTOM} 错误: ${response.status} ${errorData}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
          text?: string;
        }>;
        error?: {
          message?: string;
          type?: string;
        };
        result?: string;
        response?: string;
      };

      if (data.error) {
        throw new Error(
          `${PROVIDER_NAMES.CUSTOM} 错误: ${data.error.message || data.error.type || "未知错误"}`,
        );
      }

      let content = "";
      if (data.choices?.[0]?.message?.content) {
        content = data.choices[0].message.content;
      } else if (data.choices?.[0]?.text) {
        content = data.choices[0].text;
      } else if (data.result) {
        content = data.result;
      } else if (data.response) {
        content = data.response;
      }

      if (!content) {
        throw new Error(`${PROVIDER_NAMES.CUSTOM}返回了空响应`);
      }

      outputChannel.appendLine(`[customProvider generateCommitMessage] ${PROVIDER_NAMES.CUSTOM} 响应: ${content}`);
      const raw = extractCommitMessage(content.trim());
      return enforceConventionalCommit(raw, changedFiles, diff, options?.zendaoInfo);
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.CUSTOM);
    }
  }
}
