// 常量定义文件，供多个模块使用
export const PROVIDER_NAMES = {
  COPILOT: "GitHub Copilot",
  OLLAMA: "Ollama",
  QIANWEN: "通义千问",
  WENXIN: "文心一言",
  ZHIPU: "智谱AI",
  CUSTOM: "自定义API",
} as const;

export const FALLBACK_PRIORITIES = [
  PROVIDER_NAMES.CUSTOM,
  PROVIDER_NAMES.COPILOT,
  PROVIDER_NAMES.OLLAMA,
  PROVIDER_NAMES.QIANWEN,
  PROVIDER_NAMES.WENXIN,
  PROVIDER_NAMES.ZHIPU,
] as const;

export const CONFIG_KEYS = {
  AI: {
    PROVIDER: "ai.provider",
    TIMEOUT: "ai.timeout",
    ENABLE_FALLBACK: "ai.enableFallback",
    OLLAMA_ENDPOINT: "ai.ollamaEndpoint",
    OLLAMA_MODEL: "ai.ollamaModel",
    QIANWEN_API_KEY: "ai.qianwenApiKey",
    QIANWEN_MODEL: "ai.qianwenModel",
    WENXIN_API_KEY: "ai.wenxinApiKey",
    WENXIN_SECRET_KEY: "ai.wenxinSecretKey",
    WENXIN_MODEL: "ai.wenxinModel",
    ZHIPU_API_KEY: "ai.zhipuApiKey",
    ZHIPU_MODEL: "ai.zhipuModel",
    CUSTOM_ENDPOINT: "ai.customEndpoint",
    CUSTOM_API_KEY: "ai.customApiKey",
    CUSTOM_MODEL: "ai.customModel",
    COMMIT_TIMEOUT: "ai.commitTimeout",
    BUG_REASON_TIMEOUT: "ai.bugReasonTimeout",
    REQUEST_RETRY_COUNT: "ai.requestRetryCount",
    DISABLE_THINKING: "ai.disableThinking",
  },
  COMMIT: {
    ENABLE_EMOJI: "commit.enableEmoji",
    ENABLE_BODY: "commit.enableBody",
    ENABLE_SCOPE: "commit.enableScope",
    LANGUAGE: "commit.language",
  },
} as const;

export const MAX_DIFF_CHARS = 1024 * 200;
export const MAX_DIFF_FILES = 1000;

/**
 * 进入 prompt 的 diff 截断长度（字符）。
 * 注意与 MAX_DIFF_CHARS（收集阶段的总量上限）不同：
 * prompt 层面远超本地模型的上下文承载，实际截断在 buildDiffPropmt 中生效
 */
export const MAX_PROMPT_DIFF_CHARS = 9000;

/** 禅道重现步骤/描述注入 prompt 前的纯文本截断长度（字符） */
export const MAX_ZENDAO_STEPS_CHARS = 2000;
