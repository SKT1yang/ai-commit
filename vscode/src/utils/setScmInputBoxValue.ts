import * as vscode from "vscode";
import * as path from "path";

/**
 * 尝试将提交信息设置到 SCM 输入框中。
 *
 * @param message    要写入的提交信息
 * @param repoRoot   目标仓库的根目录（绝对路径）。
 *                   传入时精确写入该仓库的输入框；
 *                   不传时保持旧行为（回退到第一个仓库 / 通用 SCM 输入框）。
 */
export async function setScmInputBoxValue(
  message: string,
  repoRoot?: string,
): Promise<boolean> {
  // 聚焦 SCM 面板并忽略错误（无论走哪个方法都可能需要）
  const focusScm = async () => {
    try {
      await vscode.commands.executeCommand("workbench.scm.focus");
    } catch {
      // no-op
    }
  };

  // 规范化路径用于比较：统一分隔符 + 小写（Windows 盘符大小写不一致，git rev-parse 可能返回小写盘符）
  const normalizeForCompare = (p: string): string =>
    path.normalize(p).toLowerCase();

  try {
    // 方法 1：尝试 Git 扩展 API
    const gitExtension = vscode.extensions.getExtension("vscode.git")?.exports;

    if (gitExtension && gitExtension.getAPI) {
      const git = gitExtension.getAPI(1);
      if (git && git.repositories && git.repositories.length > 0) {
        // 精确匹配（有 repoRoot 时），否则回退到第一个仓库
        const targetNorm = repoRoot ? normalizeForCompare(repoRoot) : null;
        const repo = repoRoot
          ? git.repositories.find(
              (r: { rootUri: { fsPath: string } }) =>
                normalizeForCompare(r.rootUri.fsPath) === targetNorm,
            )
          : git.repositories[0];

        if (repo && repo.inputBox) {
          repo.inputBox.value = message;
          console.log(
            repoRoot
              ? `通过 Git API 成功设置提交信息到仓库 ${repoRoot}`
              : "通过 Git API 成功设置提交信息（回退到第一个仓库）",
          );
          await focusScm();
          return true;
        }
      }
    }

    // 方法 2：尝试 SVN 扩展 API（仅在未传 repoRoot 或仍未成功时回退）
    if (!repoRoot) {
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
              console.log("通过 SVN API 成功设置提交信息");
              await focusScm();
              return true;
            }
          }
        } catch (svnError) {
          console.log("SVN API 调用失败:", svnError);
        }
      }

      // 方法 3：尝试通用 SCM API（没有 repoRoot 时才回退）
      try {
        const scm = vscode.scm;
        if (scm && scm.inputBox) {
          scm.inputBox.value = message;
          console.log("通过通用 SCM API 成功设置提交信息");
          await focusScm();
          return true;
        }
      } catch (genericError) {
        console.log("通用 SCM API 调用失败:", genericError);
      }
    }

    console.log("未能通过 API 直接设置 SCM 提交信息");
    return false;
  } catch (error) {
    console.log("设置 SCM 输入框失败:", error);
    return false;
  }
}