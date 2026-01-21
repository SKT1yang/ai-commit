import * as vscode from "vscode";
/**
 * 尝试将提交信息设置到SCM输入框中
 */
export async function setScmInputBoxValue(message: string): Promise<boolean> {
  try {
    // 方法1：尝试Git扩展API
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;

    if (gitExtension && gitExtension.getAPI) {
      const git = gitExtension.getAPI(1);
      if (git && git.repositories.length > 0) {
        const repo = git.repositories[0];
        if (repo.inputBox) {
          repo.inputBox.value = message;
          console.log("通过Git API成功设置提交信息");

          // 尝试聚焦到SCM面板以确保可见性
          try {
            await vscode.commands.executeCommand("workbench.scm.focus");
          } catch (focusError) {
            console.log("聚焦SCM面板失败:", focusError);
          }

          return true;
        }
      }
    }

    // 方法2：尝试SVN扩展API
    const svnExtension = vscode.extensions.getExtension(
      "johnstoncode.svn-scm",
    )?.exports;
    if (svnExtension && svnExtension.getAPI) {
      try {
        const svn = svnExtension.getAPI();
        if (svn && svn.repositories && svn.repositories.length > 0) {
          const repo = svn.repositories[0];
          if (repo.inputBox) {
            repo.inputBox.value = message;
            console.log("通过SVN API成功设置提交信息");

            // 聚焦到SCM面板
            try {
              await vscode.commands.executeCommand("workbench.scm.focus");
            } catch (focusError) {
              console.log("聚焦SCM面板失败:", focusError);
            }

            return true;
          }
        }
      } catch (svnError) {
        console.log("SVN API调用失败:", svnError);
      }
    }

    // 方法3：尝试通用SCM API
    try {
      const scm = vscode.scm;
      if (scm && scm.inputBox) {
        scm.inputBox.value = message;
        console.log("通过通用SCM API成功设置提交信息");

        // 聚焦到SCM面板
        try {
          await vscode.commands.executeCommand("workbench.scm.focus");
        } catch (focusError) {
          console.log("聚焦SCM面板失败:", focusError);
        }

        return true;
      }
    } catch (genericError) {
      console.log("通用SCM API调用失败:", genericError);
    }

    console.log("未能通过API直接设置SCM提交信息");
    return false;
  } catch (error) {
    console.log("设置SCM输入框失败:", error);
    return false;
  }
}