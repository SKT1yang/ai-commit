/**
 * 处理API错误的统一方法
 */
export function handleApiError(error: any, providerName: string): never {
  console.error(`${providerName} API调用失败:`, error);
  if (error instanceof Error) {
    if (error.name === "AbortError") {
      throw new Error(`${providerName} API请求超时`);
    }
    throw new Error(`${providerName}生成失败: ${error.message}`);
  }
  throw new Error(`${providerName}生成失败: 未知错误`);
}
