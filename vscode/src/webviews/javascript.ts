export function getjsScript() {
  const jsScript = `
          (function() {
            'use strict';
    
            // 获取VS Code API (如果存在)
            const vscode = acquireVsCodeApi();
    
            // 页面加载完成后初始化
            document.addEventListener('DOMContentLoaded', () => {
              // 绑定按钮事件
              document.getElementById('submit-btn').addEventListener('click', () => {
                // 提交评论
                const reason = document.getElementById('reason').value;
                const solution = document.getElementById('solution').value;
                const modules = document.getElementById('modules').value;
                const commitPath = document.getElementById('commitPath').value;
                vscode.postMessage({
                  command: 'submit',
                  data: {
                    reason,
                    solution,
                    modules,
                    commitPath
                  }
                });
              });
    
              document.getElementById('cancel-btn').addEventListener('click', () => {
                console.log('cancel');
                // 主动关闭
                vscode.postMessage({
                  command: 'cancel'
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
