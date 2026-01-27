import * as vscode from 'vscode';
import { getCssStyle } from './css';
import { getjsScript } from './javascript';

export class WebviewPanel {
  private static instance: WebviewPanel | null = null;

  public static getInstance(context: vscode.ExtensionContext): WebviewPanel {
    if (!WebviewPanel.instance) {
      WebviewPanel.instance = new WebviewPanel(context);
    }
    return WebviewPanel.instance;
  }

  private panel: vscode.WebviewPanel | undefined;
  private disposables: vscode.Disposable[] = [];

  private constructor(private context: vscode.ExtensionContext) {}

  public async show(): Promise<void> {
    if (this.panel) {
      this.panel.reveal();
      return;
    }

    this.panel = vscode.window.createWebviewPanel(
      'sampleWebview',
      'Sample Webview',
      vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true
      }
    );

    this.panel.webview.html = this.getWebviewContent(this.panel.webview);

    this.panel.onDidDispose(() => {
      this.dispose();
    }, null, this.disposables);

    // 处理来自Webview的消息
    this.panel.webview.onDidReceiveMessage((message) => {
      switch (message.command) {
        case 'alert':
          vscode.window.showInformationMessage(message.text);
          return;
        case 'echo':
          this.sendMessage({
            command: 'echoResult',
            text: `Echo: ${message.text}`
          });
          return;
      }
    }, undefined, this.disposables);
  }

  private getWebviewContent(webview: vscode.Webview): string {

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <style>${getCssStyle()}</style>
        <title>Sample Webview</title>
      </head>
      <body>
        <h1>Sample Webview Page</h1>
        <p>This is a sample webview page in VSCode extension.</p>
        
        <div id="status">Status: Ready</div>
        
        <button id="btnAlert">Show Alert</button>
        <button id="btnEcho">Send Message to Extension</button>
        <input type="text" id="textInput" placeholder="Enter some text">
        
        <div id="result"></div>
        
        <script>${getjsScript()}</script>
      </body>
      </html>
    `;
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