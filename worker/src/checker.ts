import { launchBrowser, getPage, closeBrowser } from "./browser.js";
import { extractPageText, computeHash, detectLoginState, getPageTitle } from "./extractor.js";

export interface CheckTarget {
  id: string;
  user_id: string;
  domain: string;
  status_url: string;
  ats_type: string;
  last_text_hash: string | null;
}

export interface CheckResult {
  targetId: string;
  success: boolean;
  loginState: string;
  rawStatus: string | null;
  normalizedStatus: string | null;
  confidence: number;
  pageHash: string | null;
  pageTitle: string | null;
  contentChanged: boolean;
  errorMessage: string | null;
}

export async function checkTarget(target: CheckTarget): Promise<CheckResult> {
  let context = null;

  try {
    context = await launchBrowser(target.id);
    const page = await getPage(context, target.status_url);

    // Wait for page to stabilize
    await page.waitForTimeout(2000);

    const [text, title, loginState] = await Promise.all([
      extractPageText(page),
      getPageTitle(page),
      detectLoginState(page),
    ]);

    const pageHash = computeHash(text);

    // If login is required, return early
    if (loginState !== "valid") {
      return {
        targetId: target.id,
        success: true,
        loginState,
        rawStatus: null,
        normalizedStatus: null,
        confidence: 0,
        pageHash,
        pageTitle: title,
        contentChanged: false,
        errorMessage: loginState === "expired" ? "登录已过期" :
                      loginState === "captcha_required" ? "需要验证码" :
                      loginState === "mfa_required" ? "需要二次验证" :
                      loginState === "blocked" ? "账号被阻止" : null,
      };
    }

    // Check if content has changed
    const contentChanged = !!(target.last_text_hash && target.last_text_hash !== pageHash);

    return {
      targetId: target.id,
      success: true,
      loginState: "valid",
      rawStatus: text.substring(0, 1000),
      normalizedStatus: null,
      confidence: 0,
      pageHash,
      pageTitle: title,
      contentChanged,
      errorMessage: null,
    };
  } catch (error) {
    return {
      targetId: target.id,
      success: false,
      loginState: "unknown",
      rawStatus: null,
      normalizedStatus: null,
      confidence: 0,
      pageHash: null,
      pageTitle: null,
      contentChanged: false,
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  } finally {
    if (context) {
      await closeBrowser(context);
    }
  }
}
