export function getjsScript() {
  const jsScript = `
(function () {
  "use strict";

  // 获取VS Code API (如果存在)
  const vscode = acquireVsCodeApi();

  // 页面加载完成后初始化
  document.addEventListener("DOMContentLoaded", () => {
    const originalText = submitBtn.textContent;
    // 绑定按钮事件
    document.getElementById("submit-btn").addEventListener("click", () => {
      // 提交评论
      const reason = document.getElementById("reason").value;
      const solution = document.getElementById("solution").value;
      const modules = document.getElementById("modules").value;
      const commitPath = document.getElementById("commitPath").value;
      
      // 显示提交按钮的loading状态
      const submitBtn = document.getElementById("submit-btn");
      submitBtn.disabled = true;
      submitBtn.textContent = "提交中...";

      vscode.postMessage({
        command: "submit",
        data: {
          reason,
          solution,
          modules,
          commitPath,
        }
      });
    });

    document.getElementById("cancel-btn").addEventListener("click", () => {
      console.log("cancel");
      // 主动关闭
      vscode.postMessage({
        command: "cancel",
      });
    });

    // 监听来自VS Code的消息
    window.addEventListener("message", (event) => {
      const message = event.data;

      switch (message.command) {
        case "resetSubmitButton":
          // 恢复提交按钮的状态
          const submitBtn = document.getElementById("submit-btn");
          submitBtn.disabled = false;
          if (originalText) {
            submitBtn.textContent = originalText;
          } else {
            submitBtn.textContent = "提交评论";
          }
          break;
      }
    });
  });
})();

        `;
  return jsScript;
}
