import { launchBrowser, getPage, closeBrowser, injectCookies } from "./browser.js";
import { extractPageText, computeHash, detectLoginState, getPageTitle } from "./extractor.js";

// 从页面全文中提取状态相关段落（比盲截 1000 字更精准）
function extractStatusSection(text: string, maxLength: number = 5000): string {
  if (!text) return '';
  if (text.length <= maxLength) return text;

  // 状态相关的关键词（中英文）
  const STATUS_KEYWORDS = [
    /状态[：:]\s*.+/g,
    /进度[：:]\s*.+/g,
    /阶段[：:]\s*.+/g,
    /result[：:]\s*.+/gi,
    /status[：:]\s*.+/gi,
    /stage[：:]\s*.+/gi,
    /面试|笔试|测评|offer|录用|拒绝|待处理|已通过|已投递|简历筛选/gi,
    /interview|assessment|offer|rejected|pending|applied|review/gi,
    /一面|二面|三面|终面|HR面|技术面/gi,
  ];

  const lines = text.split(/\n/).map(l => l.trim()).filter(Boolean);
  const matchedLines: string[] = [];

  for (const line of lines) {
    for (const regex of STATUS_KEYWORDS) {
      // 重置 lastIndex 因为 regex 是带 g 标志的
      regex.lastIndex = 0;
      if (regex.test(line)) {
        matchedLines.push(line);
        break;
      }
    }
  }

  if (matchedLines.length > 0) {
    const result = matchedLines.join('\n');
    return result.length > maxLength ? result.substring(0, maxLength) : result;
  }

  // 没有匹配到关键词，回退到截取前 maxLength 字符
  return text.substring(0, maxLength);
}

export interface CheckTarget {
  id: string;
  user_id: string;
  domain: string;
  status_url: string;
  ats_type: string;
  last_text_hash: string | null;
  session_cookies: string | null;
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

    // 注入用户提供的 cookies
    if (target.session_cookies) {
      await injectCookies(context, target.session_cookies);
    }

    const page = await getPage(context, target.status_url);

    // Wait for page to stabilize（用 networkidle 替代固定 2 秒，更快且更可靠）
    await page.waitForLoadState('networkidle', { timeout: 15000 }).catch(() => {});

    // 先提取文本，再传给 detectLoginState 避免重复提取
    const [text, title] = await Promise.all([
      extractPageText(page),
      getPageTitle(page),
    ]);
    const loginState = await detectLoginState(page, text);

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

    // 提取状态相关段落（比盲截 1000 字更精准，避免丢失关键状态信息）
    const rawStatus = extractStatusSection(text);

    return {
      targetId: target.id,
      success: true,
      loginState: "valid",
      rawStatus,
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
