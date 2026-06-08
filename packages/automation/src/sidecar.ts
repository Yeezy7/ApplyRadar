import { createInterface } from "node:readline";
import { chromium, type BrowserContext } from "playwright";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";

interface CheckRequest {
  command: string;
  targetId?: string;
  statusUrl?: string;
  profileDir?: string;
  domain?: string;
  url?: string;
  // Batch check support
  targets?: Array<{
    targetId: string;
    statusUrl: string;
  }>;
}

interface CheckResponse {
  success: boolean;
  targetId?: string;
  loginState?: string;
  rawStatus?: string;
  normalizedStatus?: string;
  confidence?: number;
  pageText?: string;
  textHash?: string;
  pageTitle?: string;
  error?: string;
}

interface BatchCheckResponse {
  results: CheckResponse[];
}

let context: BrowserContext | null = null;

function log(msg: string) {
  process.stderr.write(`[sidecar] ${msg}\n`);
}

function killExistingChrome(profileDir: string) {
  try {
    const escapedPath = profileDir.replace(/\s/g, "\\ ");
    execSync(`pkill -f "${escapedPath}" 2>/dev/null || true`, { timeout: 5000 });
    execSync("sleep 1", { timeout: 3000 });
  } catch (e) {
    // Ignore errors
  }
}

async function extractPageText(page: any): Promise<string> {
  let pageText = "";

  // Method 1: innerText
  try {
    pageText = await page.evaluate(() => document.body?.innerText || "");
  } catch (e) {
    // ignore
  }

  // Method 2: If empty, try textContent
  if (!pageText || pageText.trim().length === 0) {
    try {
      pageText = await page.evaluate(() => document.body?.textContent || "");
    } catch (e) {
      // ignore
    }
  }

  return pageText || "";
}

function detectLoginState(url: string, text: string): string {
  const lowerUrl = url.toLowerCase();
  const lowerText = text.toLowerCase();

  const hasAny = (patterns: Array<string | RegExp>) =>
    patterns.some((pattern) =>
      typeof pattern === "string" ? lowerText.includes(pattern) : pattern.test(lowerText)
    );

  if (hasAny([
    "captcha",
    "recaptcha",
    "hcaptcha",
    "verify you are human",
    "security check",
    "验证码",
    "人机验证",
    "安全验证",
    "滑块验证",
  ])) {
    return "captcha_required";
  }

  if (hasAny([
    "two-factor",
    "two factor",
    "2fa",
    "mfa",
    "multi-factor",
    "verification code",
    "authenticator",
    "二次验证",
    "两步验证",
    "多因素验证",
    "动态验证码",
  ])) {
    return "mfa_required";
  }

  if (hasAny([
    "account locked",
    "account disabled",
    "account suspended",
    "blocked account",
    "账户已锁定",
    "账号已锁定",
    "账户被禁用",
    "账号被禁用",
    "账号异常",
  ])) {
    return "blocked";
  }

  if (
    lowerUrl.includes("login") ||
    lowerUrl.includes("signin") ||
    lowerUrl.includes("auth") ||
    lowerUrl.includes("sso") ||
    hasAny([
      "sign in",
      "log in",
      "login",
      "email address",
      "password",
      "forgot password",
      "session expired",
      "please authenticate",
      "please sign in",
      "登录",
      "登陆",
      "请输入密码",
      "忘记密码",
      "会话已过期",
      "请先登录",
      "重新登录",
    ])
  ) {
    return "expired";
  }

  return "valid";
}

function extractStatusFromText(text: string): { rawStatus: string; normalizedStatus: string; confidence: number } | null {
  const normalizedText = text.replace(/\s+/g, " ").trim();
  const lowerText = normalizedText.toLowerCase();

  const rules: Array<{ status: string; confidence: number; patterns: Array<string | RegExp> }> = [
    {
      status: "offer",
      confidence: 0.86,
      patterns: [
        "offer extended",
        "offer letter",
        "congratulations",
        "we would like to offer",
        "录用",
        "已发 offer",
        "offer",
        "恭喜",
      ],
    },
    {
      status: "rejected",
      confidence: 0.9,
      patterns: [
        "not selected",
        "not moving forward",
        "no longer under consideration",
        "unsuccessful",
        "rejected",
        "declined",
        "很遗憾",
        "未通过",
        "不匹配",
        "已拒绝",
        "未被录用",
      ],
    },
    {
      status: "final_interview",
      confidence: 0.78,
      patterns: [
        "final interview",
        "final round",
        "onsite interview",
        "终面",
        "最终面试",
      ],
    },
    {
      status: "interview",
      confidence: 0.82,
      patterns: [
        "interview",
        "schedule a call",
        "phone screen",
        "面试",
        "约面",
        "视频面",
        "电话面",
      ],
    },
    {
      status: "assessment",
      confidence: 0.82,
      patterns: [
        "assessment",
        "coding challenge",
        "take home",
        "online test",
        "测评",
        "笔试",
        "在线测试",
        "作业",
      ],
    },
    {
      status: "under_review",
      confidence: 0.8,
      patterns: [
        "under review",
        "in review",
        "reviewing",
        "being reviewed",
        "审核中",
        "筛选中",
        "评估中",
        "处理中",
      ],
    },
    {
      status: "received",
      confidence: 0.78,
      patterns: [
        "application received",
        "received your application",
        "we received",
        "已收到",
        "已接收",
        "简历已收",
      ],
    },
    {
      status: "applied",
      confidence: 0.74,
      patterns: [
        "submitted",
        "application submitted",
        "applied",
        "已投递",
        "已提交",
        "投递成功",
      ],
    },
    {
      status: "withdrawn",
      confidence: 0.9,
      patterns: [
        "withdrawn",
        "you withdrew",
        "candidate withdrew",
        "已撤回",
        "已撤销",
      ],
    },
  ];

  for (const rule of rules) {
    for (const pattern of rule.patterns) {
      const matched = typeof pattern === "string"
        ? lowerText.includes(pattern.toLowerCase())
        : pattern.test(lowerText);
      if (matched) {
        const rawStatus = typeof pattern === "string" ? pattern : pattern.source;
        return {
          rawStatus,
          normalizedStatus: rule.status,
          confidence: rule.confidence,
        };
      }
    }
  }

  return null;
}

async function handleCheck(req: CheckRequest): Promise<CheckResponse> {
  try {
    const { statusUrl, profileDir, targetId } = req;
    if (!statusUrl || !profileDir) {
      return { success: false, error: "Missing statusUrl or profileDir" };
    }

    // Ensure profile directory exists
    fs.mkdirSync(profileDir, { recursive: true });

    // Kill any existing Chrome processes using this profile
    killExistingChrome(profileDir);

    // Close any existing context
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    // Launch browser
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });

    // Navigate to the page
    const page = await context.newPage();
    await page.goto(statusUrl, { waitUntil: "load", timeout: 30000 });

    // Wait for page to render
    await page.waitForTimeout(3000);

    // Extract text
    let pageText = await extractPageText(page);

    // If empty, wait more and try again
    if (!pageText || pageText.trim().length === 0) {
      await page.waitForTimeout(2000);
      pageText = await extractPageText(page);
    }

    const textHash = createHash("sha256").update(pageText || "").digest("hex");
    const pageTitle = await page.title().catch(() => "");
    const loginState = detectLoginState(page.url(), pageText || "");
    const ruleStatus = loginState === "valid" ? extractStatusFromText(pageText || "") : null;

    await context.close();
    context = null;

    return {
      success: true,
      targetId,
      loginState,
      rawStatus: ruleStatus?.rawStatus,
      normalizedStatus: ruleStatus?.normalizedStatus,
      confidence: ruleStatus?.confidence,
      pageText: (pageText || "").slice(0, 10000),
      textHash,
      pageTitle,
    };
  } catch (e: any) {
    log(`Error in handleCheck: ${e.message}`);
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    return {
      success: false,
      targetId: req.targetId,
      error: String(e),
    };
  }
}

async function handleBatchCheck(req: CheckRequest): Promise<BatchCheckResponse> {
  const { profileDir, domain, targets } = req;
  const results: CheckResponse[] = [];

  if (!profileDir || !targets || targets.length === 0) {
    return {
      results: targets?.map(t => ({
        success: false,
        targetId: t.targetId,
        error: "Missing profileDir or targets",
      })) || [],
    };
  }

  try {
    // Ensure profile directory exists
    fs.mkdirSync(profileDir, { recursive: true });

    // Kill any existing Chrome processes
    killExistingChrome(profileDir);

    // Close any existing context
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    // Launch browser once for all targets
    log(`Launching browser for batch check of ${targets.length} targets`);
    context = await chromium.launchPersistentContext(profileDir, {
      headless: true,
      viewport: { width: 1280, height: 800 },
    });

    // Check each target
    for (const target of targets) {
      try {
        log(`Checking target: ${target.targetId} - ${target.statusUrl}`);

        const page = await context.newPage();
        await page.goto(target.statusUrl, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(3000);

        let pageText = await extractPageText(page);

        if (!pageText || pageText.trim().length === 0) {
          await page.waitForTimeout(2000);
          pageText = await extractPageText(page);
        }

        const textHash = createHash("sha256").update(pageText || "").digest("hex");
        const pageTitle = await page.title().catch(() => "");
        const loginState = detectLoginState(page.url(), pageText || "");
        const ruleStatus = loginState === "valid" ? extractStatusFromText(pageText || "") : null;

        results.push({
          success: true,
          targetId: target.targetId,
          loginState,
          rawStatus: ruleStatus?.rawStatus,
          normalizedStatus: ruleStatus?.normalizedStatus,
          confidence: ruleStatus?.confidence,
          pageText: (pageText || "").slice(0, 10000),
          textHash,
          pageTitle,
        });

        // Close the page after extracting
        await page.close().catch(() => {});

        // Small delay between checks on the same domain
        await new Promise(resolve => setTimeout(resolve, 1000));

      } catch (e: any) {
        log(`Error checking target ${target.targetId}: ${e.message}`);
        results.push({
          success: false,
          targetId: target.targetId,
          error: String(e),
        });
      }
    }

    // Close browser after all checks
    await context.close().catch(() => {});
    context = null;

    log(`Batch check complete: ${results.filter(r => r.success).length}/${targets.length} successful`);

  } catch (e: any) {
    log(`Error in handleBatchCheck: ${e.message}`);
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    // Fill in any missing results with errors
    const completedIds = new Set(results.map(r => r.targetId));
    for (const target of targets) {
      if (!completedIds.has(target.targetId)) {
        results.push({
          success: false,
          targetId: target.targetId,
          error: String(e),
        });
      }
    }
  }

  return { results };
}

async function handleOpenLogin(req: CheckRequest): Promise<CheckResponse> {
  try {
    const { statusUrl, profileDir } = req;
    if (!statusUrl || !profileDir) {
      return { success: false, error: "Missing statusUrl or profileDir" };
    }

    fs.mkdirSync(profileDir, { recursive: true });
    killExistingChrome(profileDir);

    if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
    });

    const page = await context.newPage();
    await page.goto(statusUrl, { waitUntil: "domcontentloaded", timeout: 30000 });

    return new Promise<CheckResponse>((resolve) => {
      context!.on("close", () => {
        context = null;
        resolve({
          success: true,
          loginState: "unknown",
        });
      });
    });
  } catch (e: any) {
    log(`Error in handleOpenLogin: ${e.message}`);
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    return {
      success: false,
      error: String(e),
    };
  }
}

async function handleFetchPage(req: CheckRequest): Promise<CheckResponse> {
  try {
    const { url } = req;
    if (!url) {
      return { success: false, error: "Missing url" };
    }

    log(`Fetching page: ${url}`);

    // Close any existing context
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }

    // Launch headless browser
    context = await chromium.launchPersistentContext(
      fs.mkdtempSync("/tmp/applyradar-fetch-"),
      { headless: true, viewport: { width: 1280, height: 800 } }
    );

    const page = await context.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
    await page.waitForTimeout(2000);

    const pageText = await extractPageText(page);
    const pageTitle = await page.title().catch(() => "");

    await context.close();
    context = null;

    log(`Fetched ${pageText.length} chars from ${url}`);

    return {
      success: true,
      pageText: pageText.slice(0, 15000),
      pageTitle,
    };
  } catch (e: any) {
    log(`Error in handleFetchPage: ${e.message}`);
    if (context) {
      await context.close().catch(() => {});
      context = null;
    }
    return { success: false, error: String(e) };
  }
}

async function processRequest(req: CheckRequest): Promise<CheckResponse | BatchCheckResponse> {
  log(`Processing command: ${req.command}`);
  switch (req.command) {
    case "check":
      return handleCheck(req);
    case "batch_check":
      return handleBatchCheck(req);
    case "open_login":
      return handleOpenLogin(req);
    case "fetch_page":
      return handleFetchPage(req);
    case "close":
      if (context) {
        await context.close().catch(() => {});
        context = null;
      }
      return { success: true };
    default:
      return { success: false, error: `Unknown command: ${req.command}` };
  }
}

// Read JSON lines from stdin
log("Sidecar started, waiting for input...");
const rl = createInterface({ input: process.stdin });

rl.on("line", async (line) => {
  log(`Received input: ${line.slice(0, 100)}...`);
  try {
    const req: CheckRequest = JSON.parse(line);
    const res = await processRequest(req);
    const output = JSON.stringify(res);
    log(`Writing output: ${output.slice(0, 100)}...`);
    process.stdout.write(output + "\n");
  } catch (e: any) {
    log(`Parse error: ${e.message}`);
    process.stdout.write(
      JSON.stringify({ success: false, error: `Parse error: ${e}` }) + "\n"
    );
  }
});

rl.on("close", () => {
  log("stdin closed");
  if (context) {
    context.close().catch(() => {});
  }
  process.exit(0);
});
