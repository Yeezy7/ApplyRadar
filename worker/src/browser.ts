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

        const domain = c.domain?.startsWith('.') ? c.domain.slice(1) : c.domain;
        if (!domain) continue;

        const cookie: any = {
          name: c.name,
          value: c.value,
          domain,
          path: c.path || '/',
        };

        if (c.httpOnly) cookie.httpOnly = true;
        if (c.secure) cookie.secure = true;
        if (c.expirationDate && typeof c.expirationDate === 'number') {
          cookie.expires = c.expirationDate;
        }

        valid.push(cookie);
      } catch {}
    }

    if (valid.length > 0) {
      console.log(`[${new Date().toISOString()}] [worker] Adding ${valid.length} cookies`);
      for (const cookie of valid) {
        try {
          await context.addCookies([cookie]);
        } catch (e) {
          console.error(`[${new Date().toISOString()}] [worker] Failed cookie "${cookie.name}":`, String(e));
        }
      }
      console.log(`[${new Date().toISOString()}] [worker] Done`);
    }
  } catch (e) {
    console.error(`[${new Date().toISOString()}] [worker] injectCookies error:`, e);
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
