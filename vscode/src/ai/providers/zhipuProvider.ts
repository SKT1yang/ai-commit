import { AIConfig } from "../aiInterface";
import { SvnFile } from "../../vcs/svnService";
import { BaseProvider } from "./baseProvider";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export class ZhipuProvider extends BaseProvider {
  readonly name = PROVIDER_NAMES.ZHIPU;

  constructor(config: AIConfig) {
    super(config);
  }

  async isAvailable(): Promise<boolean> {
    return !!this.config?.zhipuApiKey;
  }

  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    zendaoPrompt?: string,
  ): Promise<string> {
    if (!this.config?.zhipuApiKey) {
      throw new Error(`请配置${PROVIDER_NAMES.ZHIPU} API Key`);
    }

    const model = this.config?.zhipuModel || "glm-4";
    const prompt = buildBasePrompt(diff, changedFiles, { zendaoPrompt });

    try {
      const response = await fetchWithTimeout(
        "https://open.bigmodel.cn/api/paas/v4/chat/completions",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.config?.zhipuApiKey}`,
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
            top_p: 0.9,
            max_tokens: 2000,
          }),
        },
        this.config?.timeout || 30000,
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${PROVIDER_NAMES.ZHIPU} API错误: ${response.status} ${errorData}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{
          message?: {
            content?: string;
          };
        }>;
        error?: {
          code?: string;
          message?: string;
        };
      };

      if (data.error) {
        throw new Error(
          `${PROVIDER_NAMES.ZHIPU} API错误: ${data.error.message || data.error.code || "未知错误"}`,
        );
      }

      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        throw new Error(`${PROVIDER_NAMES.ZHIPU}返回了空响应`);
      }

      const raw = extractCommitMessage(content.trim());
      return enforceConventionalCommit(raw, changedFiles, diff);
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.ZHIPU);
    }
  }
}
