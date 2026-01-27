export function getjsScript() {
  const jsScript = `
          (function() {
            'use strict';
    
            // 获取VS Code API (如果存在)
            const vscode = acquireVsCodeApi();
    
            // 页面加载完成后初始化
            document.addEventListener('DOMContentLoaded', () => {
              // 绑定按钮事件
              document.getElementById('btnAlert').addEventListener('click', () => {
                // 向VS Code发送消息
                vscode.postMessage({
                  command: 'alert',
                  text: 'Hello from the webview!'
                });
              });
    
              document.getElementById('btnEcho').addEventListener('click', () => {
                const inputText = document.getElementById('textInput').value || 'Empty text';
                
                // 向VS Code发送消息
                vscode.postMessage({
                  command: 'echo',
                  text: inputText
                });
              });
    
              // 监听来自VS Code的消息
              window.addEventListener('message', event => {
                const message = event.data;
                
                switch(message.command) {
                  case 'echoResult':
                    document.getElementById('result').innerHTML = '<p>Received: ' + message.text + '</p>';
                    break;
                }
              });
            });
          })();
        `;
  return jsScript;
}
