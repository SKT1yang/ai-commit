import { ZendaoConfig, ZendaoInfo } from "./zendaoInterface";
import { ZendaoResponse } from "./zendaoResponse";
import { outputChannel } from "../utils/outputChannel";

export class ZendaoService {
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
      outputChannel.appendLine("[Zendao] 正在登录...");
      const response = await fetch(loginUrl, {
        method: "POST",
        headers: {
          ...this.getHeaders(this.config.host),
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://${this.config.host}/user-login.html`,
        },
        body,
      });
      outputChannel.appendLine(
        `[Zendao] 登录后: ${response.status} ${response.statusText}`,
      );

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

  async buildZendaoInfo(id: number): Promise<ZendaoInfo> {
    const response = await this.getBugById(id);
    const bug = response?.bug ?? {};
    outputChannel.appendLine(
      `[Zendao]: 构建ZendaoInfo：${JSON.stringify(bug, null, 2)}`,
    );

    let productName = "";
    if (response.products) {
      Object.keys(response.products).forEach((key) => {
        if (key === response.productID) {
          // 找到匹配的产品ID，获取产品名称
          productName = response.products[key];
        }
      });
    }

    let module = (response?.modulePath ?? [])
      .map((mod) => mod.name)
      .join(" -> ");

    let security = "";
    switch (bug?.severity) {
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

    let zendaoInfo: ZendaoInfo = {
      prompt: "",

      id: bug.id,
      title: bug.title,
      status: bug.status,
      assignedTo: bug.assignedTo,
      openedBy: bug.openedBy,
      openedDate: bug.openedDate,
      lastEditedDate: bug.lastEditedDate,
      type: bug.type,
      severity: security,
      priority: bug.pri,
      steps: bug.steps,

      product: productName,
      module,

      description: response.title,
    };
    outputChannel.appendLine(
      `[Zendao] 禅道信息: ${JSON.stringify(zendaoInfo)}`,
    );
    return zendaoInfo;
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
      const url = `http://${this.config.host}/bug-view-${bugId}.json`;
      outputChannel.appendLine(
        `[ZendaoService]: fetchBugInfo config: ${JSON.stringify(this.config)}`,
      );
      outputChannel.appendLine(`Fetching bug info from url: ${url}`);
      outputChannel.appendLine(`Cookie: ${this.cookie}`);

      const response: Response = await fetch(url, {
        method: "GET",
        headers: {
          ...this.getHeaders(this.config.host),
          "Content-Type": "application/json; charset=UTF-8",
          Referer: `http://${this.config.host}/bug.json`,
          Cookie: this.cookie,
        },
      });

      // 检查响应
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const text = await response.text(); // 获取原始文本
      outputChannel.appendLine(`[Zendao] 获取bug原始文本信息：${text}`);
      const json = JSON.parse(text);
      const decodedJson = this.decodeChinese(json); // 解码中文
      return JSON.parse(decodedJson.data) as ZendaoResponse;
    } catch (error) {
      console.error("Get bug failed:", error);
      throw error;
    }
  }

  async commentBug(bugId: string, comment: string) {
    if (!(await this.config.validate())) {
      throw new Error("Invalid configuration");
    }

    if (!bugId) {
      throw new Error("Please provide a valid bug ID");
    }

    if (!this.cookie) {
      throw new Error("Please call login() first");
    }

    const uid = await this.getUid(bugId);

    try {
      const url = `http://${this.config.host}/action-comment-bug-${bugId}.json`;
      const body = new URLSearchParams({
        comment,
        uid,
      });

      const response: Response = await fetch(url, {
        method: "POST",
        headers: {
          ...this.getHeaders(this.config.host),
          "Content-Type": "application/x-www-form-urlencoded",
          Referer: `http://${this.config.host}/action-comment-bug-${bugId}.html`,
          Cookie: this.cookie,
        },
        body,
      });

      // 检查响应
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
    } catch (error) {
      console.error("comment bug failed:", error);
      throw error;
    }
  }

  async getUid(bugId: string) {
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
      const url = `http://${this.config.host}/bug-view-${bugId}.html`;

      const response: Response = await fetch(url, {
        method: "GET",
        headers: {
          ...this.getHeaders(this.config.host),
          "Content-Type": "text/html; Language=UTF-8;charset=UTF-8",
          Referer: `http://${this.config.host}/bug-view-${bugId}.html`,
          Cookie: this.cookie,
        }
      });

      // 检查响应
      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }

      const html = await response.text();
      return this.extractKuidFromHtml(html);
    } catch (error) {
      console.error("comment bug failed:", error);
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

  extractKuidFromHtml(html: string): string {
  // 尝试多种可能的kuid定义模式
  const patterns = [
    // var kuid = 'value'
    /var\s+kuid\s*=\s*['"]([^'"]+)['"]/,
    // let kuid = 'value'
    /let\s+kuid\s*=\s*['"]([^'"]+)['"]/,
    // const kuid = 'value'
    /const\s+kuid\s*=\s*['"]([^'"]+)['"]/,
    // kuid: 'value' (在对象中)
    /kuid\s*:\s*['"]([^'"]+)['"]/,
    // "kuid": "value" (在JSON中)
    /["']kuid["']\s*:\s*["']([^"']+)["']/
  ];
  
  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }
  
  throw new Error('kuid not found in HTML');
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
