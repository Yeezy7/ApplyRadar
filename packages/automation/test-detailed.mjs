import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";

const profileDir = path.join(os.homedir(), "Library/Application Support/com.applyradar.app/profiles/hr-campus.vivo.com");

console.log("=== Detailed Sidecar Test ===");
console.log("Profile dir:", profileDir);

// Kill existing Chrome
try {
  const { execSync } = await import("node:child_process");
  execSync(`pkill -f "${profileDir}" 2>/dev/null || true`, { timeout: 5000 });
  execSync("sleep 1", { timeout: 3000 });
  console.log("Killed existing Chrome processes");
} catch (e) {
  console.log("No existing Chrome processes to kill");
}

let context = null;

try {
  console.log("\n1. Launching browser...");
  context = await chromium.launchPersistentContext(profileDir, {
    headless: false,
    viewport: { width: 1280, height: 800 },
    args: ["--start-minimized"],
  });
  console.log("   Browser launched successfully");

  console.log("\n2. Creating new page...");
  const page = await context.newPage();
  console.log("   Page created");

  const url = "https://hr-campus.vivo.com/personal/deliveryRecord";
  console.log("\n3. Navigating to:", url);
  await page.goto(url, { waitUntil: "load", timeout: 60000 });
  console.log("   Navigation complete");
  console.log("   Current URL:", page.url());

  console.log("\n4. Waiting 5 seconds for page to render...");
  await page.waitForTimeout(5000);
  console.log("   Wait complete");

  console.log("\n5. Getting page title...");
  const title = await page.title();
  console.log("   Title:", title);

  console.log("\n6. Extracting text (method 1: innerText)...");
  let pageText = "";
  try {
    pageText = await page.evaluate(() => document.body?.innerText || "");
    console.log("   Text length:", pageText.length);
    if (pageText.length > 0) {
      console.log("   First 300 chars:", pageText.slice(0, 300));
    }
  } catch (e) {
    console.error("   Error:", e.message);
  }

  if (!pageText || pageText.trim().length === 0) {
    console.log("\n7. innerText empty, trying textContent...");
    try {
      pageText = await page.evaluate(() => document.body?.textContent || "");
      console.log("   Text length:", pageText.length);
    } catch (e) {
      console.error("   Error:", e.message);
    }
  }

  if (!pageText || pageText.trim().length === 0) {
    console.log("\n8. textContent empty, trying HTML conversion...");
    try {
      const html = await page.content();
      console.log("   HTML length:", html.length);
      pageText = html
        .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
        .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();
      console.log("   Converted text length:", pageText.length);
    } catch (e) {
      console.error("   Error:", e.message);
    }
  }

  console.log("\n9. Computing hash...");
  const textHash = createHash("sha256").update(pageText || "").digest("hex");
  console.log("   Hash:", textHash);

  console.log("\n10. Detecting login state...");
  let loginState = "valid";
  const currentUrl = page.url().toLowerCase();
  const text = (pageText || "").toLowerCase();

  if (currentUrl.includes("login") || currentUrl.includes("signin") || currentUrl.includes("auth")) {
    loginState = "expired";
  } else if (text.includes("captcha") || text.includes("recaptcha")) {
    loginState = "captcha_required";
  } else if (text.includes("two-factor") || text.includes("2fa")) {
    loginState = "mfa_required";
  }
  console.log("   Login state:", loginState);

  console.log("\n=== Results ===");
  console.log("success: true");
  console.log("loginState:", loginState);
  console.log("pageText length:", pageText?.length || 0);
  console.log("textHash:", textHash);
  console.log("pageTitle:", title);

  console.log("\n11. Closing browser...");
  await context.close();
  context = null;
  console.log("   Browser closed");

} catch (e) {
  console.error("\n=== Error ===");
  console.error(e);
  if (context) {
    await context.close().catch(() => {});
  }
}
