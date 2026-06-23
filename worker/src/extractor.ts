import { createHash } from "node:crypto";
import type { Page } from "playwright";

export async function extractPageText(page: Page): Promise<string> {
  try {
    const text = await page.evaluate(() => {
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        {
          acceptNode(node) {
            const parent = node.parentElement;
            if (!parent) return NodeFilter.FILTER_REJECT;
            const style = window.getComputedStyle(parent);
            if (style.display === "none" || style.visibility === "hidden") {
              return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
          },
        }
      );

      const texts: string[] = [];
      while (walker.nextNode()) {
        const text = walker.currentNode.textContent?.trim();
        if (text) {
          texts.push(text);
        }
      }
      return texts.join("\n");
    });

    return text || "";
  } catch {
    return "";
  }
}

export function computeHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function getPageTitle(page: Page): Promise<string> {
  try {
    return await page.title();
  } catch {
    return "";
  }
}

// 优化：接受可选的预提取文本，避免重复调用 extractPageText
export async function detectLoginState(page: Page, preExtractedText?: string): Promise<string> {
  try {
    const url = page.url();
    const text = preExtractedText || await extractPageText(page);
    const lowerText = text.toLowerCase();
    const lowerUrl = url.toLowerCase();

    // 安全：URL 匹配时排除常见误报路径（OAuth 回调、登录成功页、作者页等）
    const LOGIN_URL_EXCLUDES = [
      '/oauth/', '/callback', '/login-success', '/login_ok', '/loginpage=false',
      '/author/', '/authored', '/authenticated', '/auth-callback', '/auth/confirm',
    ];
    const isLoginUrl =
      (lowerUrl.includes("/login") || lowerUrl.includes("/signin") || lowerUrl.includes("/sign-in")) &&
      !LOGIN_URL_EXCLUDES.some(ex => lowerUrl.includes(ex));

    // 安全：单独 URL 不足以判定过期，需结合密码输入框或登录关键词
    const hasPasswordField = await page.evaluate(() =>
      document.querySelectorAll('input[type="password"]').length > 0
    );

    // URL 看起来像登录页 + 页面有密码输入框 → 确认过期
    if (isLoginUrl && hasPasswordField) {
      return "expired";
    }

    if (
      lowerText.includes("captcha") ||
      lowerText.includes("recaptcha") ||
      lowerText.includes("verify you are human") ||
      lowerText.includes("人机验证") ||
      lowerText.includes("滑动验证") ||
      lowerText.includes("请完成安全验证")
    ) {
      return "captcha_required";
    }

    if (
      lowerText.includes("two-factor") ||
      lowerText.includes("2fa") ||
      lowerText.includes("verification code") ||
      lowerText.includes("multi-factor") ||
      lowerText.includes("二次验证") ||
      lowerText.includes("短信验证码")
    ) {
      return "mfa_required";
    }

    if (
      lowerText.includes("account locked") ||
      lowerText.includes("account suspended") ||
      lowerText.includes("access denied") ||
      lowerText.includes("账号被锁定") ||
      lowerText.includes("账号已冻结") ||
      lowerText.includes("访问被拒绝")
    ) {
      return "blocked";
    }

    // 安全：单独密码输入框不够，需结合登录关键词才判定过期
    // （有些站点的修改密码页、注册页也有密码框但不是"过期"）
    if (hasPasswordField) {
      const hasLoginContext =
        lowerText.includes("登录") || lowerText.includes("login") ||
        lowerText.includes("sign in") || lowerText.includes("signin") ||
        lowerText.includes("请登录") || lowerText.includes("账号登录");
      if (hasLoginContext) {
        return "expired";
      }
    }

    // 中文登录页面检测：页面含"登录"相关文字但不含"投递"/"申请"等求职关键词
    const hasLoginKeyword =
      lowerText.includes("请登录") ||
      lowerText.includes("去登录") ||
      lowerText.includes("立即登录") ||
      lowerText.includes("用户登录") ||
      lowerText.includes("账号登录") ||
      lowerText.includes("登录/注册") ||
      lowerText.includes("登录注册") ||
      lowerText.includes("登录 |") ||
      lowerText.includes("| 登录");
    const hasJobKeyword =
      lowerText.includes("我的投递") ||
      lowerText.includes("投递状态") ||
      lowerText.includes("申请记录") ||
      lowerText.includes("我的申请") ||
      lowerText.includes("mydeliver") ||
      lowerText.includes("application status");

    if (hasLoginKeyword && !hasJobKeyword) {
      return "expired";
    }

    // URL 含 hash 路由（如 #/myDeliver）但页面是首页内容，说明未登录被重定向
    if (lowerUrl.includes("#/") && hasLoginKeyword) {
      return "expired";
    }

    return "valid";
  } catch {
    return "unknown";
  }
}
