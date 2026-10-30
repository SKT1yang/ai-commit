import Module from "node:module";

/**
 * 在 node --test 环境下给 require("vscode") 打桩，
 * 使依赖 outputChannel / workspace 配置的纯函数模块可在无 VSCode 环境下加载。
 * 必须在 require 被测模块之前调用（每个测试进程只能安装一次）。
 *
 * @param configOverrides 工作区配置覆盖表，键为完整路径
 *   （如 "aiMessage.zendao.commitTemplate"），未命中时 get 返回默认值
 */
export function installVscodeMock(
  configOverrides: Record<string, unknown> = {},
): void {
  const moduleAny = Module as any;
  if (moduleAny.__vscodeMockInstalled) {
    return;
  }
  moduleAny.__vscodeMockInstalled = true;

  const originalLoad = moduleAny._load;
  moduleAny._load = function (request: string, parent: unknown, isMain: boolean) {
    if (request === "vscode") {
      return {
        window: {
          createOutputChannel: () => ({
            appendLine() {},
            show() {},
            hide() {},
            clear() {},
            dispose() {},
          }),
        },
        workspace: {
          getConfiguration: (section: string = "") => ({
            get: (key: string, defaultValue: unknown) => {
              const fullKey = section ? `${section}.${key}` : key;
              return fullKey in configOverrides
                ? configOverrides[fullKey]
                : defaultValue;
            },
          }),
        },
      };
    }
    return originalLoad.call(this, request, parent, isMain);
  };
}
