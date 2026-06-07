import { chromium, type BrowserContext, type Page } from "playwright";
import fs from "node:fs";

let context: BrowserContext | null = null;

export async function launchBrowser(profileDir: string, headless: boolean = true): Promise<BrowserContext> {
  // Close existing context if any
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }

  // Ensure profile directory exists
  fs.mkdirSync(profileDir, { recursive: true });

  if (headless) {
    // For check mode: use visible browser but minimized to avoid headless detection
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
        "--start-minimized",
      ],
    });
  } else {
    // For login mode: use visible browser
    context = await chromium.launchPersistentContext(profileDir, {
      headless: false,
      viewport: { width: 1280, height: 800 },
      args: [
        "--disable-blink-features=AutomationControlled",
        "--no-first-run",
        "--no-default-browser-check",
      ],
    });
  }

  return context;
}

export async function getPage(ctx: BrowserContext, url: string): Promise<Page> {
  const pages = ctx.pages();
  // Try to find existing page with same URL
  const existing = pages.find((p) => p.url().startsWith(url));
  if (existing) {
    return existing;
  }
  // Create new page
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  return page;
}

export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close().catch(() => {});
    context = null;
  }
}

export async function openPageForLogin(profileDir: string, url: string): Promise<void> {
  // Login needs visible browser for user interaction
  const ctx = await launchBrowser(profileDir, false);
  const page = await ctx.newPage();
  await page.goto(url, { waitUntil: "domcontentloaded" });

  // Wait for the browser to be closed by the user
  return new Promise<void>((resolve) => {
    ctx.on("close", () => {
      context = null;
      resolve();
    });
  });
}
