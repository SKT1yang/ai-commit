import * as vscode from "vscode";

export async function handleError(context: string, error: any) {
  const errorMessage = error instanceof Error ? error.message : String(error);

  console.error(`${context}:`, error);

  const action = await vscode.window.showErrorMessage(
    `${context}: ${errorMessage}`,
    "重试",
    "报告问题",
  );

  if (action === "重试") {
    vscode.commands.executeCommand("ai-message.generateCommitMessage");
  } else if (action === "报告问题") {
    vscode.env.openExternal(
      vscode.Uri.parse("https://github.com/jianxiaofei/AI-message/issues"),
    );
  }
}