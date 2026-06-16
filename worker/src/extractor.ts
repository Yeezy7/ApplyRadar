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

export async function detectLoginState(page: Page): Promise<string> {
  try {
    const url = page.url();
    const text = await extractPageText(page);
    const lowerText = text.toLowerCase();
    const lowerUrl = url.toLowerCase();

    if (
      lowerUrl.includes("login") ||
      lowerUrl.includes("signin") ||
      lowerUrl.includes("sign-in") ||
      lowerUrl.includes("auth")
    ) {
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

    const hasLoginForm = await page.evaluate(() => {
      const inputs = document.querySelectorAll('input[type="password"]');
      return inputs.length > 0;
    });

    if (hasLoginForm) {
      return "expired";
    }

    // 中文登录页面检测：页面含"登录"相关文字但不含"投递"/"申请"等求职关键词
    const hasLoginKeyword =
      lowerText.includes("请登录") ||
      lowerText.includes("去登录") ||
      lowerText.includes("立即登录") ||
      lowerText.includes("用户登录") ||
      lowerText.includes("账号登录");
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

    return "valid";
  } catch {
    return "unknown";
  }
}
