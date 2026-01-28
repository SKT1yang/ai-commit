import * as vscode from "vscode";
import { getCssStyle } from "./css";
import { getjsScript } from "./javascript";
import { ZendaoInfo } from "../zendao/zendaoInterface";
import { ZendaoService } from "../zendao/zentaoService";

export class WebviewPanel {
  private static instance: WebviewPanel | null = null;
  private zendaoInfo: ZendaoInfo;
  private zendaoService: ZendaoService;

  public static getInstance(
    zendaoInfo: ZendaoInfo,
    zendaoService: ZendaoService,
  ): WebviewPanel {
    if (!WebviewPanel.instance) {
      WebviewPanel.instance = new WebviewPanel(zendaoInfo, zendaoService);
    }
    return WebviewPanel.instance;
  }

  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(zendaoInfo: ZendaoInfo, zendaoService: ZendaoService) {
    this.zendaoInfo = zendaoInfo;
    this.zendaoService = zendaoService;
  }

  public async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }
    this.panel = vscode.window.createWebviewPanel(
      "zendao-comment",
      "提交禅道评论",
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
      },
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.onDidDispose(
      () => {
        this.dispose();
      },
      null,
      this.disposables,
    );

    // 处理来自Webview的消息
    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case "submit":
            if (!this.zendaoInfo.id) {
              vscode.window.showErrorMessage("请选择禅道Bug");
              return;
            }
            if (!message.data) {
              vscode.window.showErrorMessage("请填写数据异常");
              return;
            }
            const { reason, solution, modules, commitPath } = message.data;
            const comment = `问题原因: 
            ${reason}
            解决方案: 
            ${solution}
            影响模块: 
            ${modules}
            提交记录: 
            ${commitPath}`;
            await this.zendaoService.commentBug(this.zendaoInfo.id, comment);
            this.dispose();
            return;
          case "cancel":
            this.dispose();
            return;
        }
      },
      undefined,
      this.disposables,
    );
  }

  private getWebviewContent(webview: vscode.Webview): string {
    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${getCssStyle()}</style>
        <title>提交禅道评论</title>
      </head>
      <body>
        <div class="container">
          <div class="content">
            <div class="title" 
              title="${this.zendaoInfo.title}">
              ${this.zendaoInfo.title}
            </div>
          </div>
          <div class="comment">
            <div class="form">
              <label for="reason">
                <span class="required">*</span>
                <span class="label">问题原因：</span>
              </label>
              <textarea 
                id="reason" 
                name="reason" 
                rows="4" 
                placeholder="请填写问题原因"
                required
              >${this.zendaoInfo?.comment?.reason}</textarea>
              <label for="solution">
                <span class="required">*</span>
                <span class="label">解决方案：</span>
              </label>
              <textarea 
                id="solution" 
                name="solution" 
                rows="6" 
                placeholder="请填写解决方案"
                required
              >${this.zendaoInfo?.comment?.solution}</textarea>
              <label for="modules">
                <span class="required">*</span>
                <span class="label">影响模块：</span>
              </label>
              <textarea 
                id="modules" 
                name="modules" 
                rows="1" 
                placeholder="请填写影响模块"
                required
              >${this.zendaoInfo?.comment?.modules}</textarea>
              <label for="commitPath">
                <span class="required">*</span>
                <span class="label">提交记录：</span>
              </label>
              <textarea 
                id="commitPath" 
                name="commitPath" 
                rows="1" 
                placeholder="请填写版本控制提交记录url"
                required
              >${this.zendaoInfo?.comment?.commitUrl}</textarea>
              <button class="primary" type="submit" id="submit-btn">提交评论</button>
              <button id="cancel-btn">取消</button>
            </div>
          </div>
        </div>
        
        <script>${getjsScript()}</script>
      </body>
      </html>
    `;
  }

  private getDefaultComment(): string {
    return "";
  }

  public sendMessage(message: any): void {
    if (this.panel) {
      this.panel.webview.postMessage(message);
    }
  }

  public dispose(): void {
    WebviewPanel.instance = null;

    if (this.panel) {
      this.panel.dispose();
    }

    while (this.disposables.length) {
      const disposable = this.disposables.pop();
      if (disposable) {
        disposable.dispose();
      }
    }
  }
}
