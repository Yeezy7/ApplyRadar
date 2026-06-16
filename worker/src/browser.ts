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

    const cookies = raw
      .filter(c => c.name && c.value && (c.domain || c.url))
      .map(c => {
        const cookie: any = {
          name: c.name,
          value: c.value,
          path: c.path || '/',
          httpOnly: c.httpOnly || false,
          secure: c.secure || false,
        };

        // 提供 domain 或 url
        if (c.domain) {
          cookie.domain = c.domain;
        } else if (c.url) {
          cookie.url = c.url;
        }

        // 如果有 domain 但没有 url，生成一个 url
        if (cookie.domain && !cookie.url) {
          const d = cookie.domain.startsWith('.') ? cookie.domain.slice(1) : cookie.domain;
          cookie.url = `http://${d}${cookie.path}`;
        }

        // expirationDate (Chrome) → expires (Playwright)
        if (c.expirationDate) {
          cookie.expires = c.expirationDate;
        }

        // sameSite 转换
        if (c.sameSite) {
          const s = c.sameSite.toLowerCase();
          if (s === 'unspecified' || s === 'no_restriction') cookie.sameSite = 'None';
          else if (s === 'lax') cookie.sameSite = 'Lax';
          else if (s === 'strict') cookie.sameSite = 'Strict';
        }

        return cookie;
      });

    if (cookies.length > 0) {
      await context.addCookies(cookies);
      console.log(`[worker] Injected ${cookies.length} cookies`);
    }
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
