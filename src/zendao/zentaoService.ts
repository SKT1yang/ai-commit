import * as fs from "fs";
import { ZendaoConfig } from "./zendaoInterface";
import { ZendaoResponse } from "./ZendaoResponse";

export class ZentaoService {
  cookie: string;
  config: ZendaoConfig;

  constructor() {
    this.cookie = "";
    this.config = new ZendaoConfig();
  }

  // 登录
  async login() {
    if (!(await this.config.validate())) {
      return;
    }

    try {
      // 构造登录请求
      const loginUrl = `http://${this.config.host}/user-login.html`;
      const body = new URLSearchParams({
        account: this.config.account,
        password: this.config.password,
        referer: `http://${this.config.host}/my/`,
      });

      // 发送登录请求
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: {
          ...this.getHeaders(this.config.host),
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://${this.config.host}/user-login.html`,
        },
        body,
      });

      // 从响应中提取Cookie
      const setCookieHeader = response.headers.get("set-cookie");
      if (setCookieHeader) {
        // 提取第一个Cookie（通常为zt_login）
        const [firstCookie] = setCookieHeader.split(";");
        this.cookie = firstCookie;
        console.log("Login successful. Cookie set.");
      } else {
        throw new Error("No cookie received after login");
      }
    } catch (error) {
      console.error("Login failed:", error);
      throw error;
    }
  }

  async buildZendaoPrompt(bugId: number): Promise<string> {
    const bugInfo = await this.getBugById(bugId);

    // id: string; // Bug ID 或任务 ID
    // title: string; // 标题
    // status: string; // 状态 "active", "resolved", "closed"
    // assignedTo: string; // 指派给
    // openedBy: string; // 创建人
    // openedDate: string; // 创建时间
    // lastEditedDate: string; // 最后编辑时间
    // steps: string; // 重现步骤

    // product: string; // 所属产品： 工业安全综合管理平台
    // module: string; // 所属模块： 策略管理 -> 工控安全审计
    // type: string; // Bug 类型："function", "performance", "security", "usability", "interface", "compatibility", "other"
    // severity: string; // 严重程度 "1", "2", "3", "4", "5"; "3":一般
    // priority: string; // 优先级 "1", "2", "3", "4", "5"

    // description: string; // 精简描述: BUG #17963  广利核维护平台V1.3：流量分析页面，日流量趋势和时流量趋势图，点击图例后，鼠标放置在图上，图会卡住，刷新后复原 - 工业安全综合管理平台

    let productName = "";
    bugInfo.products &&
      Object.keys(bugInfo.products).forEach((key) => {
        if (key === bugInfo.productID) {
          // 找到匹配的产品ID，获取产品名称
          productName = bugInfo.products[key];
        }
      });

    let module = (bugInfo?.modulePath ?? [])
      .map((mod) => mod.name)
      .join(" -> ");

    let security = "";
    switch (bugInfo?.bug?.severity) {
      case "1":
        security = "致命";
        break;
      case "2":
        security = "严重";
        break;
      case "3":
        security = "一般";
        break;
      case "4":
        security = "次要";
        break;
      default:
        security = "一般";
        break;
    }

    return `## 来自禅道的提示:
缺陷ID: ${bugInfo?.bug.id}
标题: ${bugInfo?.bug.title}
状态: ${bugInfo?.bug.status}
指派给: ${bugInfo?.bug.assignedTo}
创建人: ${bugInfo?.bug.openedBy}
创建日期: ${bugInfo?.bug.openedDate}
最后编辑日期: ${bugInfo?.bug.lastEditedDate}
类型: ${bugInfo?.bug.type}
严重性: ${bugInfo?.bug.severity}
优先级: ${bugInfo?.bug.pri}
产品: ${productName}
模块: ${module}
重现步骤: ${bugInfo?.bug.steps}
描述: ${bugInfo?.title}
请根据以上提供的信息，优化commit的分析和建议。`;
  }

  async getBugById(bugId: number): Promise<ZendaoResponse> {
    if (!(await this.config.validate())) {
      throw new Error("Invalid configuration");
    }

    if (!bugId) {
      throw new Error("Please provide a valid bug ID");
    }

    if (!this.cookie) {
      throw new Error("Please call login() first");
    }

    try {
      const createUrl = `http://${this.config.host}/bug-view-${bugId}.json`;

      const response: Response = await fetch(createUrl, {
        method: "GET",
        headers: {
          ...this.getHeaders(this.config.host),
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://${this.config.host}/bug.json`,
          Cookie: this.cookie,
        },
      });

      // 检查响应
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const text = await response.text(); // 获取原始文本
      const json = JSON.parse(text);
      const decodedJson = this.decodeChinese(json); // 解码中文
      return JSON.parse(decodedJson.data) as ZendaoResponse;
    } catch (error) {
      console.error("Get bug failed:", error);
      throw error;
    }
  }

  // 解码中文
  private decodeChinese(obj: any): any {
    if (typeof obj === "string") {
      return obj.replace(/\\u([0-9a-fA-F]{4})/g, function (match, hex) {
        return String.fromCharCode(parseInt(hex, 16));
      });
    }

    if (obj && typeof obj === "object") {
      Object.keys(obj).forEach((key) => {
        if (typeof obj[key] === "string") {
          obj[key] = obj[key].replace(
            /\\u([0-9a-fA-F]{4})/g,
            function (match, hex) {
              return String.fromCharCode(parseInt(hex, 16));
            },
          );
        } else if (typeof obj[key] === "object") {
          obj[key] = this.decodeChinese(obj[key]);
        }
      });
    }
    return obj;
  }

  // 关闭会话
  closeSession() {
    this.cookie = "";
  }

  private getHeaders(host: string): Record<string, any> {
    const headers: Record<string, any> = {
      Accept: "application/json, text/plain, */*",
      "Accept-Encoding": "gzip, deflate",
      "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
      "Cache-Control": "max-age=0",
      Connection: "keep-alive",
      Host: host,
      "Upgrade-Insecure-Requests": "1",
      "User-Agent":
        "Mozilla/5.0 (Windows NT 6.3; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/71.0.3578.98 Safari/537.36",
    };

    return headers;
  }
}
