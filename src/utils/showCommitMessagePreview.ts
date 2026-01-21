import * as vscode from "vscode";

export async function showCommitMessagePreview(commitMessage: string) {
  try {
    const document = await vscode.workspace.openTextDocument({
      content: commitMessage,
      language: "plaintext",
    });

    await vscode.window.showTextDocument(document, {
      preview: true,
      viewColumn: vscode.ViewColumn.Beside,
    });
  } catch (error) {
    console.error("显示提交信息预览时发生错误:", error);
    vscode.window.showInformationMessage(
      `生成的提交信息：\n\n${commitMessage}`,
      { modal: true },
    );
  }
}