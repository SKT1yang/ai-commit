import { AIConfig, GenerateOptions } from "../aiInterface";
import { SvnFile } from "../../vcs/svnService";
import { BaseProvider } from "./baseProvider";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export class OllamaProvider extends BaseProvider {
  readonly name = PROVIDER_NAMES.OLLAMA;

  constructor(config: AIConfig) {
    super(config);
  }

  async isAvailable(): Promise<boolean> {
    try {
      const endpoint = this.config?.ollamaEndpoint || "http://localhost:11434";
      const response = await fetchWithTimeout(
        `${endpoint}/api/tags`,
        {
          method: "GET",
        },
        5000,
      );
      return response.ok;
    } catch (error) {
      console.error(`${PROVIDER_NAMES.OLLAMA}可用性检查失败:`, error);
      return false;
    }
  }

  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    options?: GenerateOptions,
  ): Promise<string> {
    const endpoint = this.config?.ollamaEndpoint || "http://localhost:11434";
    const model = this.config?.ollamaModel || "qwen2.5:7b";

    const prompt = buildBasePrompt(diff, changedFiles, options);

    try {
      const response = await fetchWithTimeout(
        `${endpoint}/api/generate`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: model,
            prompt: prompt,
            stream: false,
            options: {
              temperature: 0.3,
              top_p: 0.9,
              top_k: 40,
            },
          }),
        },
        this.config?.timeout || 30000,
      );

      if (!response.ok) {
        throw new Error(
          `${PROVIDER_NAMES.OLLAMA} API错误: ${response.status} ${response.statusText}`,
        );
      }

      const data = (await response.json()) as { response?: string };

      if (!data.response) {
        throw new Error(`${PROVIDER_NAMES.OLLAMA}返回了空响应`);
      }

      const raw = extractCommitMessage(data.response.trim());
      return enforceConventionalCommit(raw, changedFiles, diff, options?.zendaoInfo);
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.OLLAMA);
    }
  }
}
