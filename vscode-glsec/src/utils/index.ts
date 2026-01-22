/**
 * 判断是否为正整数或正整数字符串
 * @param value 要判断的值
 * @returns 如果是正整数或正整数字符串返回 true，否则返回 false
 */
export function isPositiveInteger(value: unknown): boolean {
  if (value == null) {
    return false;
  }

  // 如果是数字类型
  if (typeof value === "number") {
    return Number.isInteger(value) && value > 0;
  }

  // 如果是字符串类型
  if (typeof value === "string") {
    // 去除首尾空格
    const trimmed = value.trim();

    // 空字符串或只包含空格
    if (trimmed.length === 0) {
      return false;
    }

    // 检查是否全部由数字组成（不能有小数点、负号等）
    if (!/^\d+$/.test(trimmed)) {
      return false;
    }

    // 转换为数字并检查是否为正整数
    const num = Number(trimmed);

    // 检查是否以0开头（排除"0123"这样的情况）
    if (trimmed.length > 1 && trimmed.startsWith("0")) {
      return false;
    }

    return Number.isInteger(num) && num > 0;
  }

  return false;
}
