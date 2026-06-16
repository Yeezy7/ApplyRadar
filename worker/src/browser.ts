import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";
import path from "node:path";

const PROFILES_DIR = process.env.PROFILES_DIR || "./profiles";

export async function launchBrowser(targetId: string): Promise<BrowserContext> {
  const fullProfileDir = path.resolve(PROFILES_DIR, targetId);
  fs.mkdirSync(fullProfileDir, { recursive: true });

  const context = await chromium.launchPersistentContext(fullProfileDir, {
    headless: true,
    viewport: { width: 1280, height: 800 },
    args: [
      "--disable-blink-features=AutomationControlled",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-gpu",
      "--disable-dev-shm-usage",
    ],
  });

  return context;
}

export async function injectCookies(context: BrowserContext, cookiesJson: string): Promise<void> {
  if (!cookiesJson) return;
  try {
    const raw = JSON.parse(cookiesJson);
    if (!Array.isArray(raw) || raw.length === 0) return;

    // 转换 Chrome Cookie 格式为 Playwright 格式
    const cookies = raw.map(c => {
      const cookie: any = {
        name: c.name,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        httpOnly: c.httpOnly || false,
        secure: c.secure || false,
      };

      // expirationDate (Chrome, seconds) → expires (Playwright, seconds)
      if (c.expirationDate) {
        cookie.expires = c.expirationDate;
      }

      // sameSite: "unspecified" → "None", "lax" → "Lax", "strict" → "Strict"
      if (c.sameSite) {
        const s = c.sameSite.toLowerCase();
        if (s === 'unspecified' || s === 'no_restriction') cookie.sameSite = 'None';
        else if (s === 'lax') cookie.sameSite = 'Lax';
        else if (s === 'strict') cookie.sameSite = 'Strict';
      }

      // 需要 url 或 domain+path 来设置 cookie
      if (cookie.domain && cookie.domain.startsWith('.')) {
        cookie.url = `http://${cookie.domain.slice(1)}${cookie.path}`;
      }

      return cookie;
    });

    await context.addCookies(cookies);
    console.log(`[worker] Injected ${cookies.length} cookies`);
  } catch (e) {
    console.error('[worker] Failed to inject cookies:', e);
  }
}

export async function getPage(ctx: BrowserContext, url: string): Promise<Page> {
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  return page;
}

export async function closeBrowser(context: BrowserContext): Promise<void> {
  await context.close().catch(() => {});
}
