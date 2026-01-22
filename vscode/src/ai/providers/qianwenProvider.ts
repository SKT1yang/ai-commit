import { AIConfig, GenerateOptions } from "../aiInterface";
import { SvnFile } from "../../vcs/svnService";
import { BaseProvider } from "./baseProvider";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export class QianwenProvider extends BaseProvider {
  readonly name = PROVIDER_NAMES.QIANWEN;

  constructor(config: AIConfig) {
    super(config);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config?.qianwenApiKey;
  }

  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string> {
    if (!this.config?.qianwenApiKey) {
      throw new Error(`请配置${PROVIDER_NAMES.QIANWEN} API Key`);
    }

    const model = this.config?.qianwenModel || "qwen-plus";
    const prompt = buildBasePrompt(diff, changedFiles, options);

    try {
      const response = await fetchWithTimeout(
        "https://dashscope.aliyuncs.com/api/v1/services/aigc/text-generation/generation",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config?.qianwenApiKey}`,
          },
          body: JSON.stringify({
            model: model,
            input: {
              messages: [
                {
                  role: "user",
                  content: prompt,
                },
              ],
            },
            parameters: {
              temperature: 0.3,
              top_p: 0.9,
              max_tokens: 2000,
            },
          }),
        },
        this.config?.timeout || 30000,
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${PROVIDER_NAMES.QIANWEN} API错误: ${response.status} ${errorData}`);
      }

      const data = (await response.json()) as {
        output?: {
          text?: string;
          choices?: Array<{ message?: { content?: string } }>;
        };
        code?: string;
        message?: string;
      };

      if (data.code && data.code !== "200") {
        throw new Error(`${PROVIDER_NAMES.QIANWEN} API错误: ${data.message || "未知错误"}`);
      }

      let content = "";
      if (data.output?.text) {
        content = data.output.text;
      } else if (
        data.output?.choices &&
        data.output.choices[0]?.message?.content
      ) {
        content = data.output.choices[0].message.content;
      }

      if (!content) {
        throw new Error(`${PROVIDER_NAMES.QIANWEN}返回了空响应`);
      }

      return enforceConventionalCommit(
        extractCommitMessage(content),
        changedFiles,
        diff,
        options?.zendaoInfo
      );
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.QIANWEN);
    }
  }
}
