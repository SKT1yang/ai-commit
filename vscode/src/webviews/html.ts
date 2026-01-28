import { convertAllEmoji } from "../utils/emoji";

export function getCommentHtmlString(
  reason: string,
  solution: string,
  modules: string,
  commitPath: string,
) {
  // 保持换行
  reason = reason.replace(/\n/g, "<br>");
  solution = solution.replace(/\n/g, "<br>");
  modules = modules.replace(/\n/g, "<br>");
  commitPath = commitPath.replace(/\n/g, "<br>");
  const result = `<div class="issue-report">
      <div class="report-section">
        <div class="section-header">
          <h3>问题原因</h3>
        </div>
        <div class="section-content reason-content">
          ${reason}
        </div>
      </div>
      
      <div class="report-section">
        <div class="section-header">
          <h3>解决方案</h3>
        </div>
        <div class="section-content solution-content">
          ${solution}
        </div>
      </div>
      
      <div class="report-section">
        <div class="section-header">
          <h3>影响模块</h3>
        </div>
        <div class="section-content modules-content">
          ${modules}
        </div>
      </div>
      
      <div class="report-section">
        <div class="section-header">
          <h3>提交记录</h3>
        </div>
        <div class="section-content commit-content">
          <a href="${commitPath}" class="commit-link" target="_blank">
            📝 ${commitPath}
          </a>
        </div>
      </div>
    </div>
    <style>
    .issue-report {
      display: flex;
      flex-direction: column;
      gap: 20px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      background-color: #f8f9fa;
      border-radius: 8px;
      padding: 24px;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
    }

    .report-section {
      background-color: white;
      border-radius: 6px;
      border: 1px solid #e1e4e8;
      overflow: hidden;
    }

    .section-header {
      background-color: #f6f8fa;
      padding: 12px 16px;
      border-bottom: 1px solid #e1e4e8;
      margin: 0;
    }
    
    .section-header h3 {
      margin: 0;
      font-size: 14px;
      font-weight: 600;
      color: #24292e;
      letter-spacing: 0.5px;
    }
    
    .section-content {
      padding: 16px;
      line-height: 1.5;
      color: #24292e;
      font-size: 14px;
    }
    
    .reason-content {
      color: #d73a49;
      background-color: #fff5f5;
    }
    
    .solution-content {
      color: #22863a;
      background-color: #f0fff4;
    }
    
    .modules-content {
      color: #005cc5;
      background-color: #f1f8ff;
    }
    
    .commit-content {
      background-color: #f8f9fa;
      border-top: 1px solid #e1e4e8;
    }
    
    .commit-link {
      color: #0366d6;
      text-decoration: none;
      font-size: 13px;
      font-weight: 500;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 10px;
      border-radius: 4px;
      background-color: #f6f8fa;
      border: 1px solid #e1e4e8;
      transition: all 0.2s ease;
    }
    
    .commit-link:hover {
      background-color: #0366d6;
      color: white;
      text-decoration: none;
      border-color: #0366d6;
    }
    
    .commit-link:active {
      background-color: #005cc5;
      border-color: #005cc5;
    }
    </style>
    `;

  return convertAllEmoji(result);
}
