import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";

const profileDir = path.join(process.cwd(), "test-profile");
fs.mkdirSync(profileDir, { recursive: true });

console.log("Starting test...");
console.log("Profile dir:", profileDir);

try {
  const context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ["--start-minimized"],
  });

  console.log("Browser launched");

  const page = await context.newPage();
  console.log("New page created");

  const url = "https://hr-campus.vivo.com/personal/deliveryRecord";
  console.log("Navigating to:", url);

  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  console.log("Page loaded");

  await page.waitForTimeout(3000);
  console.log("Waited 3 seconds");

  const title = await page.title();
  console.log("Page title:", title);

  const pageUrl = page.url();
  console.log("Page URL:", pageUrl);

  let pageText = "";
  try {
    pageText = await page.evaluate(() => document.body?.innerText || "");
    console.log("Extracted text length:", pageText.length);
    console.log("First 200 chars:", pageText.slice(0, 200));
  } catch (e) {
    console.error("Error extracting text:", e);
  }

  await context.close();
  console.log("Browser closed");
} catch (e) {
  console.error("Error:", e);
}
