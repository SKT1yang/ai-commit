import { exec, execSync } from "child_process";
import { promisify } from "util";
import * as vscode from "vscode";
import * as path from "path";
import * as fs from "fs";
import { IVersionControlService, VcsStatus, VcsFile } from "./vcsInterface";
import { outputChannel } from "../utils/outputChannel";

const execAsync = promisify(exec);

export class GitService implements IVersionControlService {
  private workspaceRoot: string;
  private gitPath: string;

  constructor() {
    this.workspaceRoot = this.resolveWorkspaceRoot();
    this.gitPath = this.resolveGitPath();
    console.log("GitService 初始化: 工作区根目录 =", this.workspaceRoot);
    console.log("GitService 初始化: 使用的 git 可执行文件 =", this.gitPath);
  }

  /**
   * 解析并返回当前 VS Code 工作区的根目录路径。
   * 优先使用当前活动编辑器文件所在的工作区文件夹，否则返回第一个工作区文件夹的路径。
   * 如果没有打开任何工作区则返回空字符串。
   */
  private resolveWorkspaceRoot(): string {
    const folders = vscode.workspace.workspaceFolders;
    console.log("GitService 获取工作区根目录:", folders);
    if (!folders || folders.length === 0) {
      return "";
    }
    const active = vscode.window.activeTextEditor?.document.uri;
    if (active) {
      const f = vscode.workspace.getWorkspaceFolder(active);
      if (f) {
        return f.uri.fsPath;
      }
    }
    return folders[0].uri.fsPath;
  }

  /**
   * 尝试解析可用的 `git` 可执行文件路径。
   * 优先使用扩展配置 `aiMessage.git.path`，其次检查常见安装路径（包括 Homebrew 路径），
   * 最后回退到系统 PATH 中的 `git`。
   */
  private resolveGitPath(): string {
    // 允许用户在设置中指定 git 可执行文件路径
    const cfg = vscode.workspace.getConfiguration("aiMessage");
    const userPath = (cfg.get<string>("git.path", "") || "").trim();
    if (userPath && fs.existsSync(userPath)) {
      return userPath;
    }

    // 常见安装路径（macOS/Homebrew、常规路径）
    const commonPaths = [
      "/usr/bin/git",
      "/usr/local/bin/git",
      "/opt/homebrew/bin/git",
      "git", // 依赖系统PATH
    ];

    for (const candidatePath of commonPaths) {
      try {
        if (candidatePath === "git") {
          // 测试系统PATH中的git
          execSync("which git", { stdio: "ignore" });
          return candidatePath;
        } else if (fs.existsSync(candidatePath)) {
          return candidatePath;
        }
      } catch {
        // 继续尝试下一个路径
      }
    }

    // 默认依赖系统PATH
    return "git";
  }

  getVcsType(): "git" | "svn" {
    return "git";
  }

  /**
   * 检查 `workspaceRoot` 是否为一个 Git 仓库。
   * 使用 `git rev-parse --is-inside-work-tree` 命令检测。
   * 返回一个布尔值，表示当前目录是否在 Git 工作树中。
   */
  async isInRepository(): Promise<boolean> {
    if (!this.workspaceRoot) {
      console.log("Git检测: 没有工作区");
      return false;
    }

    console.log(`Git检测: 检查目录 ${this.workspaceRoot}`);

    try {
      const { stdout } = await execAsync(
        `${this.gitPath} rev-parse --is-inside-work-tree`,
        { cwd: this.workspaceRoot },
      );
      const isGitRepo = stdout.trim() === "true";
      console.log("Git检测: git rev-parse 结果:", isGitRepo);
      return isGitRepo;
    } catch (error) {
      console.log("Git检测: 不是Git仓库或 git 命令不可用:", error);
      return false;
    }
  }

  /**
   * 获取仓库当前状态（未暂存/暂存/未跟踪等），并解析为 `VcsStatus`。
   * 如果不在仓库中或命令出错，返回 isRepository=false 的默认结构。
   */
  async getStatus(): Promise<VcsStatus> {
    if (!(await this.isInRepository())) {
      return {
        isRepository: false,
        changedFiles: [],
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    }

    try {
      const { stdout } = await execAsync(
        `"${this.gitPath}" status --porcelain`,
        { cwd: this.workspaceRoot },
      );
      const changedFiles = this.parseGitStatus(stdout);

      return {
        isRepository: true,
        changedFiles,
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    } catch (error) {
      console.error("Error getting Git status:", error);
      return {
        isRepository: false,
        changedFiles: [],
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    }
  }

  /**
   * 获取VS Code Source Control中的变更（不包括ignore-on-commit的文件）
   */
  /**
   * 获取 VS Code Source Control 中显示的变更（会过滤掉 ignore-on-commit 模式的文件）。
   * 返回 `VcsStatus` 格式，包含经过过滤的变更文件列表。
   */
  async getSourceControlChanges(): Promise<VcsStatus> {
    if (!(await this.isInRepository())) {
      return {
        isRepository: false,
        changedFiles: [],
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    }

    try {
      const gitStatus = await this.getStatus();
      const filteredFiles = await this.filterIgnoreOnCommitFiles(
        gitStatus.changedFiles,
      );

      console.log(`原始变更文件: ${gitStatus.changedFiles.length}个`);
      console.log(`过滤后文件: ${filteredFiles.length}个`);

      return {
        isRepository: true,
        changedFiles: filteredFiles,
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    } catch (error) {
      console.error("Error getting Git source control changes:", error);
      return {
        isRepository: false,
        changedFiles: [],
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    }
  }

  /**
   * 根据 ignore-on-commit 模式（来自 VS Code 设置或 .gitignore）过滤文件列表。
   * 支持简单的 glob 模式（`*` 和 `**`）。
   * 返回经过过滤的 `VcsFile[]`。
   */
  private async filterIgnoreOnCommitFiles(
    allFiles: VcsFile[],
  ): Promise<VcsFile[]> {
    if (!allFiles.length) {
      return [];
    }

    try {
      const ignorePatterns = await this.loadIgnorePatterns();
      if (!ignorePatterns.length) {
        return allFiles;
      }

      const filteredFiles: VcsFile[] = [];

      for (const file of allFiles) {
        const shouldIgnore = ignorePatterns.some((pattern) => {
          try {
            // 简单的glob模式匹配（支持*和**）
            const regexPattern = pattern
              .replace(/[.+^${}()|[\]\\]/g, "\\$&") // 转义正则特殊字符
              .replace(/\\\*\\\*/g, ".*") // ** 匹配任意深度路径
              .replace(/\\\*/g, "[^/]*"); // * 匹配单级路径

            const regex = new RegExp(`^${regexPattern}$`);
            return regex.test(file.path);
          } catch {
            return false;
          }
        });

        if (!shouldIgnore) {
          filteredFiles.push(file);
        }
      }

      console.log(`忽略模式: ${ignorePatterns.join(", ")}`);
      console.log(`过滤前: ${allFiles.length}个文件`);
      console.log(`过滤后: ${filteredFiles.length}个文件`);

      return filteredFiles;
    } catch (error) {
      console.warn("过滤ignore-on-commit文件时发生错误，返回所有文件:", error);
      return allFiles;
    }
  }

  /**
   * 从 VS Code 的 `git.ignoreOnCommit` 设置和仓库根目录下的 `.gitignore` 文件中加载忽略模式。
   * 返回去重后的模式数组。
   */
  private async loadIgnorePatterns(): Promise<string[]> {
    const patterns: string[] = [];

    try {
      // 1. 从VS Code设置读取忽略模式
      const config = vscode.workspace.getConfiguration("git");
      const vscodePatterns = config.get<string[]>("ignoreOnCommit", []);
      if (vscodePatterns && vscodePatterns.length > 0) {
        patterns.push(...vscodePatterns);
        console.log("从VS Code设置加载了ignore-on-commit模式:", vscodePatterns);
      }

      // 2. 从.gitignore文件读取（可选）
      const gitignorePath = path.join(this.workspaceRoot, ".gitignore");
      if (fs.existsSync(gitignorePath)) {
        const gitignoreContent = fs.readFileSync(gitignorePath, "utf-8");
        const gitignorePatterns = gitignoreContent
          .split("\n")
          .map((line) => line.trim())
          .filter((line) => line && !line.startsWith("#"));

        patterns.push(...gitignorePatterns);
        console.log("从.gitignore加载了模式:", gitignorePatterns);
      }
    } catch (error) {
      console.warn("加载忽略模式时发生错误:", error);
    }

    return [...new Set(patterns)]; // 去重
  }

  /**
   * 获取“准备提交”的变更：优先返回暂存区的文件，如果暂存区为空则返回工作区变更（已过滤 ignore-on-commit）。
   */
  async getCommitReadyChanges(): Promise<VcsStatus> {
    // 对于Git，获取暂存区的文件（准备提交的文件）
    // 如果暂存区为空，则获取工作区变更但排除忽略的文件
    const stagedChanges = await this.getStagedChanges();
    if (stagedChanges.changedFiles.length > 0) {
      console.log(
        `Git: 使用暂存区文件 (${stagedChanges.changedFiles.length}个)`,
      );
      return stagedChanges;
    }

    // 如果没有暂存的文件，返回工作区变更
    const workingChanges = await this.getSourceControlChanges();
    console.log(
      `Git: 使用工作区变更 (${workingChanges.changedFiles.length}个)`,
    );
    return workingChanges;
  }

  /**
   * 获取暂存区的变更（已经准备提交的文件）
   */
  /**
   * 获取暂存区（index）中的变更文件，并解析为 `VcsStatus`。
   * 使用 `git diff --cached --name-status` 获取文件及其状态。
   */
  private async getStagedChanges(): Promise<VcsStatus> {
    if (!(await this.isInRepository())) {
      return {
        isRepository: false,
        changedFiles: [],
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    }

    try {
      // 获取暂存区状态
      const { stdout } = await execAsync(
        `"${this.gitPath}" diff --cached --name-status`,
        { cwd: this.workspaceRoot },
      );
      const stagedFiles = this.parseStagedStatus(stdout);

      return {
        isRepository: true,
        changedFiles: stagedFiles,
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    } catch (error) {
      console.error("Error getting staged changes:", error);
      return {
        isRepository: false,
        changedFiles: [],
        workingDirectory: this.workspaceRoot,
        vcsType: "git",
      };
    }
  }

  /**
   * 获取指定文件或整个仓库相对于 HEAD 的 diff 文本。
   * - 如果传入 `filePath`，则仅返回该文件的 diff；
   * - 否则返回所有变更的 diff。
   * 返回 diff 字符串，若不在仓库中则抛出错误。
   */
  async getDiff(filePath?: string): Promise<string> {
    if (!(await this.isInRepository())) {
      throw new Error("当前目录不是Git仓库");
    }

    try {
      let command: string;
      if (filePath) {
        // 获取特定文件的差异
        command = `"${this.gitPath}" diff HEAD -- "${filePath}"`;
      } else {
        // 获取所有暂存和未暂存的变更
        command = `"${this.gitPath}" diff HEAD`;
      }

      const result = await this.execWithEncoding(command);
      return result.stdout || "";
    } catch (error) {
      console.error("Git diff 错误:", error);
      throw new Error(`Git diff 失败: ${error}`);
    }
  }

  /**
   * 解析 `git status --porcelain` 的输出为 `VcsFile[]`。
   * 每行以两字符状态码开头，后跟文件路径。
   */
  private parseGitStatus(statusOutput: string): VcsFile[] {
    if (!statusOutput.trim()) {
      return [];
    }

    const files: VcsFile[] = [];
    const lines = statusOutput.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      if (line.length >= 3) {
        const status = line.substring(0, 2);
        const filePath = line.substring(3);
        const fullPath = path.join(this.workspaceRoot, filePath);

        files.push({
          status: this.translateGitStatus(status),
          path: filePath,
          fullPath: fullPath,
        });
      }
    }

    return files;
  }

  /**
   * 将 `git status --porcelain` 的两字符状态码翻译为更友好的字符串描述。
   */
  private translateGitStatus(status: string): string {
    // Git状态码到描述的映射
    const statusMap: { [key: string]: string } = {
      "A ": "added", // 新增文件（已暂存）
      "M ": "modified", // 修改文件（已暂存）
      "D ": "deleted", // 删除文件（已暂存）
      "R ": "renamed", // 重命名文件（已暂存）
      "C ": "copied", // 复制文件（已暂存）
      " M": "modified", // 修改文件（未暂存）
      " D": "deleted", // 删除文件（未暂存）
      "??": "untracked", // 未跟踪文件
      AM: "added", // 新增后修改
      MM: "modified", // 暂存后再修改
      AD: "added", // 新增后删除
      MD: "modified", // 修改后删除
      UU: "conflict", // 冲突文件
    };

    return statusMap[status] || `unknown(${status})`;
  }

  /**
   * 执行给定的 git 命令并以 UTF-8 编码返回结果。
   * 该方法用于需要更大 buffer 或明确编码的场景。
   */
  private async execWithEncoding(command: string): Promise<{ stdout: string }> {
    try {
      console.log("执行Git命令:", command);

      return await execAsync(command, {
        cwd: this.workspaceRoot,
        encoding: "utf8",
        maxBuffer: 1024 * 1024 * 500, // 500MB buffer
      });
    } catch (error: any) {
      console.error("Git命令执行失败:", error);
      throw error;
    }
  }

  /**
   * 解析 `git diff --cached --name-status` 的输出为 `VcsFile[]`。
   * 输出每行以状态码开头，使用制表符分隔状态码和路径。
   */
  private parseStagedStatus(statusOutput: string): VcsFile[] {
    if (!statusOutput.trim()) {
      return [];
    }

    const files: VcsFile[] = [];
    const lines = statusOutput.split("\n").filter((line) => line.trim());

    for (const line of lines) {
      const parts = line.split("\t");
      if (parts.length >= 2) {
        const status = parts[0];
        const filePath = parts[1];
        const fullPath = path.join(this.workspaceRoot, filePath);

        files.push({
          status: this.translateStagedStatus(status),
          path: filePath,
          fullPath,
        });
      }
    }

    return files;
  }

  /**
   * 将 `git diff --cached --name-status` 返回的单字符状态码翻译为描述字符串。
   */
  private translateStagedStatus(status: string): string {
    // Git diff --cached 状态码映射
    const statusMap: { [key: string]: string } = {
      A: "added", // 新增文件
      M: "modified", // 修改文件
      D: "deleted", // 删除文件
      R: "renamed", // 重命名文件
      C: "copied", // 复制文件
    };

    return statusMap[status] || `staged(${status})`;
  }

  async commit(message: string): Promise<string> {
    // 判断暂存区没有文件，将工作区文件暂存
    if (!(await this.hasStagedFiles())) {
      await execAsync(`${this.gitPath} add .`, {
        cwd: this.workspaceRoot,
      });
    }

    await execAsync(`${this.gitPath} commit -m "${message}"`, {
      cwd: this.workspaceRoot,
    });
    outputChannel.appendLine("提交成功");
    return await this.getLatestCommitHash();
  }

  private async getLatestCommitHash(): Promise<string> {
    try {
      outputChannel.appendLine("获取Git提交哈希...");
      const { stdout } = await execAsync(`${this.gitPath} rev-parse HEAD`, {
        cwd: this.workspaceRoot,
      });
      outputChannel.appendLine(`Git提交哈希: ${stdout.trim()}`);
      return stdout.trim();
    } catch (error) {
      console.error("获取 Git 提交哈希失败:", error);
      return "";
    }
  }

  /**
   * 获取Git远程仓库地址
   * @returns Promise<Record<string, string>> 包含远程仓库名称和对应URL的对象
   */
  async getRemoteUrl(): Promise<Record<string, string>> {
    if (!(await this.isInRepository())) {
      return {};
    }

    try {
      const { stdout } = await execAsync(`${this.gitPath} remote -v`, {
        cwd: this.workspaceRoot,
      });

      const remotes: Record<string, string> = {};
      const lines = stdout.trim().split("\n");

      for (const line of lines) {
        if (!line) {
          continue;
        }

        // 匹配格式: origin  https://github.com/user/repo.git (fetch) 或 (push)
        const match = line.match(/^(\w+)\s+(.+?)\s+\((fetch|push)\)$/);
        if (match) {
          const [, name, url] = match;
          if (!remotes[name]) {
            remotes[name] = url;
          }
        }
      }

      return remotes;
    } catch (error) {
      console.error("获取 Git 远程仓库地址失败:", error);
      return {};
    }
  }

  async hasStagedFiles() {
    try {
      const { stdout } = await execAsync(
        `${this.gitPath} diff --cached --name-only`,
        {
          cwd: this.workspaceRoot,
        },
      );
      return stdout.trim().length > 0;
    } catch (error) {
      console.error("检查暂存区文件失败:", error);
      return false;
    }
  }
}
