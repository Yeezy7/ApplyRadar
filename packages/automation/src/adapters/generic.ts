import type { Page } from "playwright";
import { extractPageText, detectLoginState } from "../extractor";

export interface SiteAdapter {
  name: string;
  match(url: string): boolean;
  detectLoginState(page: Page): Promise<string>;
  extractStatusText(page: Page): Promise<string>;
}

export const genericAdapter: SiteAdapter = {
  name: "generic",

  match(_url: string): boolean {
    // Generic adapter matches all URLs
    return true;
  },

  async detectLoginState(page: Page): Promise<string> {
    return detectLoginState(page);
  },

  async extractStatusText(page: Page): Promise<string> {
    return extractPageText(page);
  },
};

export function getAdapter(url: string): SiteAdapter {
  // For now, always return the generic adapter
  // Later, add specific adapters for Workday, Greenhouse, etc.
  return genericAdapter;
}
