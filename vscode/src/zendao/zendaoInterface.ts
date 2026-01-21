import * as vscode from "vscode";

export class ZendaoConfig {
  private config: vscode.WorkspaceConfiguration;

  constructor() {
    this.config = vscode.workspace.getConfiguration("aiMessage.zendao");
  }

  get host(): string {
    return this.config.get("host", "");
  }

  get account(): string {
    return this.config.get("account", "");
  }

  get password(): string {
    return this.config.get("password", "");
  }

  get isValid(): boolean {
    return !!this.host && !!this.account && !!this.password;
  }

  async validate(): Promise<boolean> {
    if (this.isValid) {
      return true;
    }

    const missingFields: string[] = [];
    if (!this.host) {
      missingFields.push("主机地址");
    }
    if (!this.account) {
      missingFields.push("账号");
    }
    if (!this.password) {
      missingFields.push("密码");
    }

    const message = `禅道配置不完整，请配置以下字段：${missingFields.join("、")}`;

    const result = await vscode.window.showErrorMessage(
      message,
      "立即配置",
      "稍后配置",
    );

    if (result === "立即配置") {
      vscode.commands.executeCommand(
        "workbench.action.openSettings",
        "aiMessage.zendao",
      );
    }

    return false;
  }

  async updateConfig(): Promise<boolean> {
    const host = await vscode.window.showInputBox({
      title: "禅道主机地址",
      placeHolder: "例如：192.168.100.80 或 zen.example.com",
      value: this.host,
      validateInput: (value) => {
        if (!value || value.trim() === "") {
          return "主机地址不能为空";
        }
        return null;
      },
    });

    if (host === undefined) {
      return false;
    }

    const account = await vscode.window.showInputBox({
      title: "禅道账号",
      placeHolder: "例如：admin",
      value: this.account,
      validateInput: (value) => {
        if (!value || value.trim() === "") {
          return "账号不能为空";
        }
        return null;
      },
    });

    if (account === undefined) {
      return false;
    }

    const password = await vscode.window.showInputBox({
      title: "禅道密码",
      placeHolder: "输入密码",
      value: this.password,
      password: true,
      validateInput: (value) => {
        if (!value || value.trim() === "") {
          return "密码不能为空";
        }
        return null;
      },
    });

    if (password === undefined) {
      return false;
    }

    // 保存配置
    await this.config.update(
      "host",
      host.trim(),
      vscode.ConfigurationTarget.Global,
    );
    await this.config.update(
      "account",
      account.trim(),
      vscode.ConfigurationTarget.Global,
    );
    await this.config.update(
      "password",
      password.trim(),
      vscode.ConfigurationTarget.Global,
    );

    return true;
  }
}

// // 使用示例
// const disposable = vscode.commands.registerCommand('ai-message.generateZendaoCommitMessage', async () => {
//   const zenDaoConfig = new ZenDaoConfig();

//   if (!await zenDaoConfig.validate()) {
//     return;
//   }

//   // 执行禅道相关逻辑
//   vscode.window.showInformationMessage('正在从禅道获取任务信息...');

//   try {
//     // 调用禅道 API 的逻辑
//     const taskInfo = await fetchZenDaoTask(zenDaoConfig.host, zenDaoConfig.account, zenDaoConfig.password);
//     // ... 其他逻辑
//   } catch (error) {
//     vscode.window.showErrorMessage(`禅道连接失败: ${error.message}`);
//   }
// });

// const configureDisposable = vscode.commands.registerCommand('ai-message.configureZenDao', async () => {
//   const zenDaoConfig = new ZenDaoConfig();
//   const success = await zenDaoConfig.updateConfig();

//   if (success) {
//     vscode.window.showInformationMessage('禅道配置已更新');
//   }
// });
