export function getEmojiMap() {
  return new Map([
    ["✨", ["feat"]],
    ["🐛", ["fix"]],
    ["📝", ["docs"]],
    ["🎨", ["style"]],
    ["♻️", ["refactor"]],
    ["⚡", ["perf"]],
    ["✅", ["test"]],
    ["📦", ["build"]],
    ["🌐", ["i18n"]],
    ["🔧", ["chore"]],
    ["👷", ["ci"]],
  ]);
}

export function getEmojiByText(text: string) {
  const map = getEmojiMap();
  for (const [emoji, keywords] of map) {
    if (keywords.includes(text)) {
      return emoji;
    }
  }
  return "";
}

export function getTextByEmoji(emoji: string) {
  return getEmojiMap().get(emoji)?.[0] || "";
}
/**
 * <img src="/file-read-25647.png" alt="chore" />
    <img src="/file-read-25648.png" alt="build" />
    <img src="/file-read-25649.png" alt="docs" />
    <img src="/file-read-25650.png" alt="feature" />
    <img src="/file-read-25651.png" alt="fix" />
    <img src="/file-read-25652.png" alt="i18n" />
    <img src="/file-read-25653.png" alt="perf" />
    <img src="/file-read-25654.png" alt="refactor" />
    <img src="/file-read-25655.png" alt="style" />
    <img src="/file-read-25656.png" alt="test" />
    禅道富文本支持特定emoji，因此需将emoji转换为对应的图片
 * @param emoji 
 * @returns 
 */
export function convertEmojiToImg(emoji: string) {
  switch (emoji) {
    case "✨":
      return '<img src="/file-read-25650.png" alt="feat" />';
    case "🐛":
      return '<img src="/file-read-25651.png" alt="fix" />';
    case "📝":
      return '<img src="/file-read-25649.png" alt="docs" />';
    case "🎨":
      return '<img src="/file-read-25655.png" alt="style" />';
    case "♻️":
      return '<img src="/file-read-25654.png" alt="refactor" />';
    case "⚡":
      return '<img src="/file-read-25653.png" alt="perf" />';
    case "✅":
      return '<img src="/file-read-25656.png" alt="test" />';
    case "📦":
      return '<img src="/file-read-25648.png" alt="build" />';
    case "🌐":
      return '<img src="/file-read-25652.png" alt="i18n" />';
    case "🔧":
      return '<img src="/file-read-25647.png" alt="chore" />';
    case "👷":
      return '<img src="/file-read-25647.png" alt="chore" />';
    default:
      return '<img src="/file-read-25650.png" alt="feat" />';
  }
}

/**
 * 将html文本里所有特定的emoji转换为对应的图片链接
 * @param htmlString html文本
 * @returns 转换后的html文本
 */
export function convertAllEmoji(htmlString: string): string {
  // 获取所有emoji并创建正则表达式
  const emojis = Array.from(getEmojiMap().keys());

  // 转义emoji中的特殊字符并创建匹配所有emoji的正则表达式
  const escapedEmojis = emojis.map((emoji) =>
    emoji.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
  );

  // 创建匹配所有emoji的正则表达式
  const regex = new RegExp(escapedEmojis.join("|"), "g");

  // 使用replace方法和回调函数进行替换
  return htmlString.replace(regex, (matchedEmoji) => {
    return convertEmojiToImg(matchedEmoji);
  });
}
