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

    // 打印前 3 个 cookie 的关键字段用于调试
    console.log(`[${new Date().toISOString()}] [worker] Received ${raw.length} cookies, sample:`, raw.slice(0, 3).map((c: any) => ({
      name: c.name,
      domain: c.domain,
      hostOnly: c.hostOnly,
      url: c.url,
      path: c.path,
    })));

    const valid: any[] = [];

    for (const c of raw) {
      try {
        if (!c.name || !c.value) continue;

        const cookie: any = {
          name: c.name,
          value: c.value,
          path: c.path || '/',
          httpOnly: c.httpOnly || false,
          secure: c.secure || false,
        };

        // 必须有 domain 或 url
        if (c.domain && c.domain !== '.') {
          cookie.domain = c.domain;
          const d = c.domain.startsWith('.') ? c.domain.slice(1) : c.domain;
          if (d) cookie.url = `http://${d}${cookie.path || '/'}`;
        } else if (c.url) {
          cookie.url = c.url;
        } else {
          continue;
        }

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
      } catch {
        // 跳过有问题的 cookie
      }
    }

    if (valid.length > 0) {
      console.log(`[${new Date().toISOString()}] [worker] About to inject ${valid.length} cookies:`, valid.map(c => ({
        name: c.name,
        domain: c.domain,
        url: c.url,
      })));
      await context.addCookies(valid);
      console.log(`[${new Date().toISOString()}] [worker] Injected ${valid.length}/${raw.length} cookies`);
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
