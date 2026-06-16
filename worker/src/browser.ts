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

    const valid: any[] = [];

    for (const c of raw) {
      try {
        if (!c.name || !c.value) continue;

        // 构建 url
        let url = c.url;
        if (!url && c.domain) {
          const d = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
          if (d) url = `https://${d}${c.path || '/'}`;
        }
        if (!url) continue;

        const cookie: any = {
          name: c.name,
          value: c.value,
          url,
          path: c.path || '/',
          httpOnly: c.httpOnly || false,
          secure: c.secure !== undefined ? c.secure : true,
        };

        // expirationDate → expires
        if (c.expirationDate && typeof c.expirationDate === 'number') {
          cookie.expires = c.expirationDate;
        }

        // sameSite 转换
        if (c.sameSite) {
          const s = String(c.sameSite).toLowerCase();
          if (s === 'unspecified' || s === 'no_restriction') cookie.sameSite = 'None';
          else if (s === 'lax') cookie.sameSite = 'Lax';
          else if (s === 'strict') cookie.sameSite = 'Strict';
        }

        valid.push(cookie);
      } catch {}
    }

    if (valid.length > 0) {
      // 逐个添加，定位哪个 cookie 有问题
      for (const cookie of valid) {
        try {
          console.log(`[${new Date().toISOString()}] [worker] Adding cookie:`, JSON.stringify(cookie));
          await context.addCookies([cookie]);
        } catch (e) {
          console.error(`[${new Date().toISOString()}] [worker] Failed to add cookie "${cookie.name}":`, e.message);
        }
      }
      console.log(`[${new Date().toISOString()}] [worker] Cookie injection complete`);
    } else {
      console.warn(`[${new Date().toISOString()}] [worker] No valid cookies to inject (of ${raw.length})`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [worker] Failed to inject cookies:`, e);
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
