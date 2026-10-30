/**
 * vscode 模块打桩，仅供 scripts/model-benchmark.mjs 通过 esbuild alias 复用 TS 源码时使用。
 * 只实现被复用模块在模块加载/执行期实际触达的 API，全部返回无副作用默认值。
 */

const outputChannel = {
  appendLine() {},
  show() {},
  hide() {},
  clear() {},
  dispose() {},
};

const workspace = {
  getConfiguration() {
    return {
      get(_key, defaultValue) {
        return defaultValue;
      },
      update: async () => {},
      has: () => false,
      inspect: () => undefined,
    };
  },
};

const window = {
  createOutputChannel() {
    return outputChannel;
  },
};

export { window, workspace };
export default { window, workspace };
