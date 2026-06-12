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
      lowerText.includes("verify you are human")
    ) {
      return "captcha_required";
    }

    if (
      lowerText.includes("two-factor") ||
      lowerText.includes("2fa") ||
      lowerText.includes("verification code") ||
      lowerText.includes("multi-factor")
    ) {
      return "mfa_required";
    }

    if (
      lowerText.includes("account locked") ||
      lowerText.includes("account suspended") ||
      lowerText.includes("access denied")
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

    return "valid";
  } catch {
    return "unknown";
  }
}
