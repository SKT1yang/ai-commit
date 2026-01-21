import { AIConfig } from "../aiInterface";
import { SvnFile } from "../../vcs/svnService";
import { BaseProvider } from "./baseProvider";
import { PROVIDER_NAMES } from "../utils/constants";
import { buildBasePrompt } from "../utils/buildPrompt";
import { extractCommitMessage } from "../utils/extractCommitMessage";
import { enforceConventionalCommit } from "../utils/enforceConventionalCommit";
import { handleApiError } from "../utils/handleApiError";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";

export class WenxinProvider extends BaseProvider {
  readonly name = PROVIDER_NAMES.WENXIN;
  private accessToken: string | null = null;
  private tokenExpireTime: number = 0;

  constructor(config: AIConfig) {
    super(config);
  }

  async isAvailable(): Promise<boolean> {
    return !!(this.config?.wenxinApiKey && this.config?.wenxinSecretKey);
  }

  async generateCommitMessage(
    diff: string,
    changedFiles: SvnFile[],
    zendaoPrompt?: string,
  ): Promise<string> {
    if (!this.config?.wenxinApiKey || !this.config?.wenxinSecretKey) {
      throw new Error(`请配置${PROVIDER_NAMES.WENXIN} API Key和Secret Key`);
    }

    try {
      const accessToken = await this.getAccessToken();
      const model = this.config?.wenxinModel || "ernie-3.5-8k";
      const prompt = buildBasePrompt(diff, changedFiles, { zendaoPrompt });

      // 根据模型确定API端点
      const modelEndpoints: { [key: string]: string } = {
        "ernie-4.0-8k": "completions_pro",
        "ernie-3.5-8k": "completions",
        "ernie-speed-8k": "ernie_speed",
        "ernie-lite-8k": "ernie-lite-8k",
        "ernie-tiny-8k": "ernie-tiny-8k",
      };

      const endpoint = modelEndpoints[model] || "completions";

      const response = await fetchWithTimeout(
        `https://aip.baidubce.com/rpc/2.0/ai_custom/v1/wenxinworkshop/chat/${endpoint}?access_token=${accessToken}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            messages: [
              {
                role: "user",
                content: prompt,
              },
            ],
            temperature: 0.3,
            top_p: 0.9,
            penalty_score: 1.0,
          }),
        },
        this.config?.timeout || 30000,
      );

      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`${PROVIDER_NAMES.WENXIN} API错误: ${response.status} ${errorData}`);
      }

      const data = (await response.json()) as {
        result?: string;
        error_code?: number;
        error_msg?: string;
      };

      if (data.error_code) {
        throw new Error(`${PROVIDER_NAMES.WENXIN} API错误: ${data.error_msg || "未知错误"}`);
      }

      if (!data.result) {
        throw new Error(`${PROVIDER_NAMES.WENXIN}返回了空响应`);
      }

      const raw = extractCommitMessage(data.result.trim());
      return enforceConventionalCommit(raw, changedFiles, diff);
    } catch (error) {
      handleApiError(error, PROVIDER_NAMES.WENXIN);
    }
  }

  private async getAccessToken(): Promise<string> {
    // 检查token是否已过期
    if (this.accessToken && Date.now() < this.tokenExpireTime) {
      return this.accessToken;
    }

    try {
      const response = await fetchWithTimeout(
        `https://aip.baidubce.com/oauth/2.0/token?grant_type=client_credentials&client_id=${this.config?.wenxinApiKey}&client_secret=${this.config?.wenxinSecretKey}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
        },
        10000,
      );

      if (!response.ok) {
        throw new Error(`获取access token失败: ${response.status}`);
      }

      const data = (await response.json()) as {
        access_token?: string;
        expires_in?: number;
        error?: string;
        error_description?: string;
      };

      if (data.error) {
        throw new Error(
          `获取access token失败: ${data.error_description || data.error}`,
        );
      }

      if (!data.access_token) {
        throw new Error("未获取到access token");
      }

      this.accessToken = data.access_token;
      // 提前5分钟过期
      this.tokenExpireTime =
        Date.now() + (data.expires_in || 3600) * 1000 - 5 * 60 * 1000;

      return this.accessToken;
    } catch (error) {
      throw new Error(
        `获取${PROVIDER_NAMES.WENXIN} access token失败: ${error instanceof Error ? error.message : "未知错误"}`,
      );
    }
  }
}
