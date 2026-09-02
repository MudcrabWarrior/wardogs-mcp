import { chromium, type BrowserContext, type Page } from "playwright";
import { mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { DRAFT_KEY, SITE_URL } from "./types.js";
import { PLANS_DIR, PROFILE_DIR, ROOT } from "./data.js";

/**
 * Make sure Playwright's Chromium is on disk. A git checkout gets it from `npm run setup`;
 * the .mcpb bundle cannot run install steps, so the first browser_open downloads it here
 * (a few hundred MB, into Playwright's usual per-user cache, not into the bundle).
 */
async function ensureChromium(): Promise<void> {
  const exe = chromium.executablePath();
  if (exe && existsSync(exe)) return;
  const cli = path.join(ROOT, "node_modules", "playwright", "cli.js");
  if (!existsSync(cli)) throw new Error(`Chromium is not installed and the Playwright CLI was not found at ${cli}. Run: npx playwright install chromium`);
  await new Promise<void>((resolve, reject) => {
    const child = spawn(process.execPath, [cli, "install", "chromium"], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
    let err = "";
    child.stderr.on("data", (d) => { err += String(d); });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`playwright install chromium exited with ${code}: ${err.slice(-800)}`))));
  });
  const after = chromium.executablePath();
  if (!after || !existsSync(after)) throw new Error("Chromium download finished but the executable is still missing. Run: npx playwright install chromium");
}

export interface Readback {
  url: string;
  supplies: number | null;
  pieces: number | null;
  fobs: number | null;
  vehiclesCash: number | null;
  manifest: string[];
  status: string | null;
  signedIn: boolean;
  draftCode: string | null;
}

const num = (s: string | undefined) => (s ? Number(s.replace(/[^\d.-]/g, "")) : null);

export class Builder {
  private ctx: BrowserContext | null = null;
  private page: Page | null = null;

  async open(): Promise<Page> {
    if (this.page && !this.page.isClosed()) return this.page;
    await mkdir(PROFILE_DIR, { recursive: true });
    await ensureChromium();
    this.ctx = await chromium.launchPersistentContext(PROFILE_DIR, {
      headless: false,
      viewport: { width: 1600, height: 950 },
      args: ["--disable-blink-features=AutomationControlled"],
    });
    this.ctx.on("close", () => { this.ctx = null; this.page = null; });
    this.page = this.ctx.pages()[0] ?? (await this.ctx.newPage());
    if (!this.page.url().startsWith(SITE_URL)) {
      await this.page.goto(SITE_URL, { waitUntil: "domcontentloaded" });
    }
    await this.waitForBuilder();
    return this.page;
  }

  async close() {
    await this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.page = null;
  }

  private async waitForBuilder() {
    const page = this.page!;
    await page.waitForFunction(() => document.body.innerText.includes("MANIFEST"), null, { timeout: 30000 });
    // the 3D scene settles a moment after the manifest renders
    await page.waitForTimeout(800);
  }

  /** Write the plan into the builder's draft slot and reload so it renders. */
  async push(code: string): Promise<Readback> {
    const page = await this.open();
    await page.evaluate(
      ([key, c]) => {
        localStorage.setItem(key, JSON.stringify({ code: c, saved: null }));
      },
      [DRAFT_KEY, code] as const,
    );
    await page.goto(SITE_URL, { waitUntil: "domcontentloaded" });
    await this.waitForBuilder();
    return this.readback();
  }

  /** Read the plan the builder currently holds (includes anything edited by hand). */
  async pull(): Promise<string | null> {
    const page = await this.open();
    // the builder writes its draft 600 ms after the last edit
    await page.waitForTimeout(700);
    return page.evaluate((key) => {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) return null;
        const j = JSON.parse(raw);
        return typeof j.code === "string" ? j.code : null;
      } catch {
        return null;
      }
    }, DRAFT_KEY);
  }

  async readback(): Promise<Readback> {
    const page = await this.open();
    const text: string = await page.evaluate(() => document.body.innerText);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    const mi = lines.indexOf("MANIFEST");
    const manifest: string[] = [];
    if (mi >= 0) {
      for (let i = mi + 2; i < lines.length; i += 2) {
        const name = lines[i], qty = lines[i + 1];
        if (!name || !qty || /^(SUPPLIES|VEHICLES|PIECES|FOBS)$/.test(name)) break;
        if (!/^\d/.test(qty)) break;
        manifest.push(`${name}: ${qty}`);
      }
    }
    // The bottom status line describes the piece in hand (a FOB after reload), so it is a hint, not an error.
    const status = lines.find((l) => /^[A-Z ,.'0-9]+$/.test(l) && /(TOO CLOSE|OUTSIDE|PLACE A|NOTHING PLACED|STACKS|NO ROOM|FOUNDATION|CLAIMS 60 M)/.test(l)) ?? null;
    const signedIn = (await page.locator('a[href^="/api/auth/login"]').count()) === 0;
    // totals block sits after SUPPLIES; the sidebar also has a VEHICLES category count, so read from there
    const si = lines.indexOf("SUPPLIES");
    const totals = si >= 0 ? lines.slice(si) : [];
    const totalAfter = (label: string) => {
      const i = totals.indexOf(label);
      return i >= 0 ? totals[i + 1] : undefined;
    };
    return {
      url: page.url(),
      supplies: num(totalAfter("SUPPLIES")),
      pieces: num(totalAfter("PIECES")),
      fobs: num(totalAfter("FOBS")),
      vehiclesCash: num(totalAfter("VEHICLES")),
      manifest,
      status,
      signedIn,
      draftCode: await this.pull(),
    };
  }

  async screenshot(name = "base"): Promise<string> {
    const page = await this.open();
    await mkdir(PLANS_DIR, { recursive: true });
    const file = path.join(PLANS_DIR, `${name.replace(/[^a-z0-9_-]/gi, "_")}-${Date.now()}.png`);
    await page.screenshot({ path: file, fullPage: false });
    return file;
  }

  /** Press a builder key (for example "1".."4" to switch camera, "F" to frame, "Tab" to cycle). */
  async key(k: string) {
    const page = await this.open();
    await page.locator("canvas").first().click({ position: { x: 20, y: 20 } }).catch(() => {});
    await page.keyboard.press(k);
    await page.waitForTimeout(400);
  }

  /** Open a hub base in the builder and return its plan code. */
  async hubImport(idOrUrl: string): Promise<{ id: string; code: string | null; readback: Readback }> {
    const id = idOrUrl.match(/([0-9a-f]{10})(?:[/?#]|$)/i)?.[1] ?? idOrUrl.trim();
    const page = await this.open();
    await page.goto(`${SITE_URL}?load=${id}`, { waitUntil: "domcontentloaded" });
    await this.waitForBuilder();
    await page.waitForFunction(() => !document.body.innerText.includes("NOTHING PLACED YET"), null, { timeout: 15000 }).catch(() => {});
    const readback = await this.readback();
    return { id, code: readback.draftCode, readback };
  }

  /** Open the site's save dialog with name and notes filled. The user clicks Save. */
  async openSaveDialog(name: string, notes = ""): Promise<string> {
    const page = await this.open();
    const btn = page.getByRole("button", { name: /save this base to the hub/i });
    if (!(await btn.count())) return "No save button visible. Push a plan with at least one piece first.";
    await btn.first().click();
    await page.waitForTimeout(800);
    if (page.url().includes("/api/auth/login") || (await page.getByText(/sign in/i).count())) {
      return "The hub wants a Discord sign-in. Sign in in the builder window, then run this again.";
    }
    const nameBox = page.locator('input[type="text"], input:not([type])').first();
    if (await nameBox.count()) {
      await nameBox.fill(name);
    }
    const notesBox = page.locator("textarea").first();
    if (await notesBox.count()) await notesBox.fill(notes);
    return "Save dialog open with name and notes filled. Finish the captcha if shown and click Save in the builder window.";
  }
}
