export function getCssStyle() {
  const cssStyle = `
      body {
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, 'Open Sans', 'Helvetica Neue', sans-serif;
        padding: 20px;
        color: var(--vscode-foreground);
        background-color: var(--vscode-editor-background);
      }

      p {
        margin-bottom: 20px;
        line-height: 1.5;
      }

      button {
        border: none;
        padding: 8px 15px;
        margin-right: 10px;
        border-radius: 2px;
        cursor: pointer;
        font-size: 13px;
      }

      .primary:hover {
        background-color: var(--vscode-button-hoverBackground);
      }

      .primary {
        background-color: var(--vscode-button-background);
        color: var(--vscode-button-foreground);
      }

      input[type="text"] {
        display: block;
        width: 100%;
        max-width: 300px;
        padding: 8px;
        margin: 10px 0;
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 2px;
        box-sizing: border-box;
      }

      textarea { 
        display: block;
        width: 100%;
        padding: 8px;
        margin: 10px 0;
        border: 1px solid var(--vscode-input-border);
        background-color: var(--vscode-input-background);
        color: var(--vscode-input-foreground);
        border-radius: 2px;
        resize: vertical;
      }

      .container {
        width: 1200px;
      }

      .content {
      }

      .content .title {
        font-size: 20px;
        font-weight: bold;
      }

      .comment {
      }

      .comment .required {
        color: red;
      }

      .help {
        font-size: 12px;
        color: var(--vscode-foreground);
      }
    `;

  return cssStyle;
}
