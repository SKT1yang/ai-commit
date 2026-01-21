
import * as vscode from "vscode";
import { setScmInputBoxValue } from "./setScmInputBoxValue";
import { showCommitMessagePreview } from "./showCommitMessagePreview";
import { handleError } from "./handleError";

export async function handleCommitMessageGenerated(commitMessage: string) {
  try {
    // 优先尝试填充到SCM输入框
    const success = await setScmInputBoxValue(commitMessage);

    if (success) {
      vscode.window
        .showInformationMessage(
          "✅ 提交信息已生成并填充到Source Control输入框！",
          "查看信息",
        )
        .then((action) => {
          if (action === "查看信息") {
            showCommitMessagePreview(commitMessage);
          }
        });
    } else {
      // 回退到剪贴板方式
      await vscode.env.clipboard.writeText(commitMessage);

      const action = await vscode.window.showInformationMessage(
        "提交信息已生成并复制到剪贴板！",
        { modal: false },
        "查看信息",
        "编辑信息",
        "提交说明",
      );

      switch (action) {
        case "查看信息":
          await showCommitMessagePreview(commitMessage);
          break;
        case "编辑信息":
          await editCommitMessage(commitMessage);
          break;
        case "提交说明":
          await showCommitHelp();
          break;
      }
    }
  } catch (error) {
    await handleError("处理生成的提交信息时发生错误", error);
  }
}


async function editCommitMessage(commitMessage: string) {
  try {
    const editedMessage = await vscode.window.showInputBox({
      title: "编辑提交信息",
      value: commitMessage,
      prompt: "修改提交信息后按回车确认",
      ignoreFocusOut: true,
    });

    if (editedMessage !== undefined && editedMessage.trim().length > 0) {
      await vscode.env.clipboard.writeText(editedMessage.trim());
      vscode.window.showInformationMessage("编辑后的提交信息已复制到剪贴板！");
    }
  } catch (error) {
    await handleError("编辑提交信息时发生错误", error);
  }
}


async function showCommitHelp() {
  const helpMessage = `## 如何使用生成的提交信息

1. **已复制到剪贴板** - 提交信息已自动复制，可直接粘贴使用

2. **SVN提交步骤**:
   - 打开终端或SVN客户端
   - 使用 \`svn commit -m "粘贴提交信息"\`
   - 或在SVN GUI中粘贴到提交信息框

3. **提交信息格式** - 遵循 Conventional Commits 规范:
   - \`feat: 新功能\`
   - \`fix: 错误修复\`
   - \`docs: 文档更新\`
   - \`style: 代码格式化\`
   - \`refactor: 代码重构\`

4. **快捷键**:
   - Cmd+Alt+G: 生成提交信息
   - Cmd+Alt+Q: 快速生成`;

  try {
    const document = await vscode.workspace.openTextDocument({
      content: helpMessage.trim(),
      language: "markdown",
    });

    await vscode.window.showTextDocument(document, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside,
    });
  } catch (error) {
    console.error("显示帮助信息时发生错误:", error);
    vscode.window.showInformationMessage("请参考扩展说明或联系支持");
  }
}

