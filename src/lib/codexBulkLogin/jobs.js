import { chromium } from "playwright-core";
import * as OTPAuth from "otpauth";
import { createProviderConnection } from "@/models";
import { exchangeTokens, extractCodexAccountInfo, generateAuthData } from "@/lib/oauth/providers";
import { parseCodexCredentialLines, sanitizeAccount } from "./parser";
import http from "node:http";

const jobs = globalThis.__codexBulkLoginJobs || new Map();
globalThis.__codexBulkLoginJobs = jobs;

const MAX_ACCOUNTS = 50;
const CALLBACK_URL = "http://localhost:1455/auth/callback";

function parseProxyLine(line) {
  const raw = String(line || "").trim();
  if (!raw) return null;

  if (/^(https?|socks4|socks5):\/\//i.test(raw)) {
    const url = new URL(raw);
    return {
      raw,
      server: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`,
      username: url.username ? decodeURIComponent(url.username) : undefined,
      password: url.password ? decodeURIComponent(url.password) : undefined,
      label: `${url.protocol}//${url.hostname}${url.port ? `:${url.port}` : ""}`,
    };
  }

  const parts = raw.split(":").map((part) => part.trim());
  if (parts.length >= 2) {
    const [host, port, username, password] = parts;
    return {
      raw,
      server: `http://${host}:${port}`,
      username: username || undefined,
      password: password || undefined,
      label: `http://${host}:${port}`,
    };
  }

  return null;
}

function parseProxyLines(text = "") {
  return String(text)
    .split(/\r?\n/)
    .map(parseProxyLine)
    .filter(Boolean);
}

function proxyToContextOptions(proxy) {
  if (!proxy?.server) return {};
  return {
    proxy: {
      server: proxy.server,
      username: proxy.username,
      password: proxy.password,
    },
  };
}

function makeJobId() {
  return `codex_bulk_${Date.now()}_${Math.random().toString(16).slice(2)}`;
}

function getTotpCode(secret) {
  if (!secret) return "";
  const totp = new OTPAuth.TOTP({
    issuer: "OpenAI",
    label: "ChatGPT",
    algorithm: "SHA1",
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret.replace(/\s+/g, "")),
  });
  return totp.generate();
}

async function clickIfVisible(page, selectors, timeout = 2500) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      if (await locator.isVisible({ timeout })) {
        await locator.click();
        return true;
      }
    } catch {}
  }
  return false;
}

async function fillFirstVisible(page, selectors, value, timeout = 8000) {
  for (const selector of selectors) {
    const locator = page.locator(selector).first();
    try {
      await locator.waitFor({ state: "visible", timeout });
      await locator.fill(value);
      return true;
    } catch {}
  }
  return false;
}

async function waitForCodexCallback(page, timeout = 180000) {
  const started = Date.now();
  while (Date.now() - started < timeout) {
    const url = page.url();
    if (url.startsWith(CALLBACK_URL)) return url;
    await page.waitForTimeout(500);
  }
  throw new Error("Timed out waiting for Codex OAuth callback");
}

function startCallbackCapture(timeout = 180000) {
  let server;
  let settled = false;
  let timer;

  const cleanup = () => {
    clearTimeout(timer);
    if (server) server.close(() => {});
  };

  const promise = new Promise((resolve, reject) => {
    server = http.createServer((req, res) => {
      const url = new URL(req.url || "/", CALLBACK_URL);
      if (url.pathname !== "/auth/callback") {
        res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
        res.end("Not found");
        return;
      }

      settled = true;
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      res.end("<html><body><h3>9peak Codex Bulk Login</h3><p>Đã nhận callback OAuth, đang import account vào Provider OAuth...</p></body></html>");
      cleanup();
      resolve(`${CALLBACK_URL}${url.search}`);
    });

    server.once("error", (error) => {
      cleanup();
      reject(error);
    });

    server.listen(1455, () => {
      timer = setTimeout(() => {
        if (!settled) {
          cleanup();
          reject(new Error("Timed out waiting for Codex OAuth callback"));
        }
      }, timeout);
    });
  });

  return { promise, cleanup };
}

function extractCode(callbackUrl) {
  const url = new URL(callbackUrl);
  const code = url.searchParams.get("code");
  if (!code) throw new Error("OAuth callback missing code");
  return code;
}

async function openBrowser() {
  const launchOptions = {
    headless: false,
    args: ["--disable-blink-features=AutomationControlled"],
  };
  try {
    return await chromium.launch({ ...launchOptions, channel: "msedge" });
  } catch {
    try {
      return await chromium.launch({ ...launchOptions, channel: "chrome" });
    } catch (error) {
      throw new Error(`Cannot launch Edge/Chrome for auto login: ${error.message}`);
    }
  }
}

async function loginOne(account, job) {
  account.status = "running";
  account.tsStart = new Date().toISOString();

  const browser = await openBrowser();
  let callbackCapture = null;
  try {
    const context = await browser.newContext(proxyToContextOptions(account.proxy));
    const page = await context.newPage();
    const authData = await generateAuthData("codex", CALLBACK_URL);
    callbackCapture = startCallbackCapture();

    await page.goto(authData.authUrl, { waitUntil: "domcontentloaded", timeout: 60000 });

    await fillFirstVisible(page, [
      'input[type="email"]',
      'input[name="email"]',
      'input[autocomplete="username"]',
      '#email-input',
      'input[data-testid="email"]',
    ], account.password ? account.email : "");
    await clickIfVisible(page, [
      'button:has-text("Continue")',
      'button:has-text("Tiếp tục")',
      'button[type="submit"]',
    ]);

    await fillFirstVisible(page, [
      'input[type="password"]',
      'input[name="password"]',
      'input[autocomplete="current-password"]',
      '#password',
    ], account.password);
    await clickIfVisible(page, [
      'button:has-text("Continue")',
      'button:has-text("Log in")',
      'button:has-text("Đăng nhập")',
      'button[type="submit"]',
    ]);

    if (account.totpSecret) {
      const code = getTotpCode(account.totpSecret);
      const filled = await fillFirstVisible(page, [
        'input[name="code"]',
        'input[inputmode="numeric"]',
        'input[autocomplete="one-time-code"]',
        'input[type="tel"]',
        'input[type="text"]',
      ], code, 30000);
      if (filled) {
        await clickIfVisible(page, [
          'button:has-text("Continue")',
          'button:has-text("Verify")',
          'button:has-text("Xác minh")',
          'button[type="submit"]',
        ]);
      }
    }

    await clickIfVisible(page, [
      'button:has-text("Allow")',
      'button:has-text("Authorize")',
      'button:has-text("Continue")',
      'button:has-text("Cho phép")',
      'button[type="submit"]',
    ], 5000);

    const callbackUrl = await Promise.race([
      callbackCapture.promise.catch(() => waitForCodexCallback(page)),
      waitForCodexCallback(page),
    ]);
    callbackCapture?.cleanup?.();
    const code = extractCode(callbackUrl);
    const tokenData = await exchangeTokens("codex", code, CALLBACK_URL, authData.codeVerifier, authData.state);
    const expiresAt = tokenData.expiresIn
      ? new Date(Date.now() + tokenData.expiresIn * 1000).toISOString()
      : null;
    const connection = await createProviderConnection({
      provider: "codex",
      name: tokenData.email || account.email,
      authType: "oauth",
      ...tokenData,
      expiresAt,
      testStatus: "active",
      isActive: true,
      providerSpecificData: {
        ...(tokenData.providerSpecificData || {}),
        bulkLoginEmail: account.email,
      },
    });

    const info = extractCodexAccountInfo(tokenData.idToken);
    account.status = "success";
    account.planType = info.chatgptPlanType || tokenData.providerSpecificData?.chatgptPlanType || null;
    account.connectionId = connection?.id || null;
  } catch (error) {
    account.status = "failed";
    account.error = error.message || String(error);
  } finally {
    account.password = "";
    account.totpSecret = "";
    account.proxy = null;
    callbackCapture?.cleanup?.();
    account.tsEnd = new Date().toISOString();
    await browser.close().catch(() => {});
    job.updatedAt = new Date().toISOString();
  }
}

async function runJob(job) {
  job.status = "running";
  for (const account of job.accounts) {
    if (job.cancelled) break;
    await loginOne(account, job);
  }
  job.status = job.cancelled ? "cancelled" : "done";
  job.finishedAt = new Date().toISOString();
  job.updatedAt = job.finishedAt;
}

export function createCodexBulkLoginJob(inputText, options = {}) {
  const parsed = parseCodexCredentialLines(inputText);
  const proxies = parseProxyLines(options.proxies || "");
  if (parsed.accounts.length === 0) {
    const error = parsed.errors[0]?.error || "No valid accounts";
    throw new Error(error);
  }

  const accounts = parsed.accounts.slice(0, MAX_ACCOUNTS).map((account, index) => {
    const proxy = proxies.length ? proxies[index % proxies.length] : null;
    return {
      ...account,
      proxy,
      proxyLabel: proxy?.label || null,
      status: "pending",
      error: null,
      planType: null,
      connectionId: null,
      tsStart: null,
      tsEnd: null,
    };
  });

  const job = {
    id: makeJobId(),
    status: "queued",
    accounts,
    parseErrors: parsed.errors,
    proxyCount: proxies.length,
    cancelled: false,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    finishedAt: null,
  };

  jobs.set(job.id, job);
  runJob(job).catch((error) => {
    job.status = "failed";
    job.error = error.message || String(error);
    job.updatedAt = new Date().toISOString();
  });

  return serializeJob(job);
}

export function getCodexBulkLoginJob(id) {
  const job = jobs.get(id);
  return job ? serializeJob(job) : null;
}

export function cancelCodexBulkLoginJob(id) {
  const job = jobs.get(id);
  if (!job) return null;
  job.cancelled = true;
  job.status = ["done", "failed", "cancelled"].includes(job.status)
    ? job.status
    : "cancelling";
  job.updatedAt = new Date().toISOString();
  return serializeJob(job);
}

export function serializeJob(job) {
  return {
    id: job.id,
    status: job.status,
    accounts: job.accounts.map(sanitizeAccount),
    parseErrors: job.parseErrors || [],
    cancelled: !!job.cancelled,
    error: job.error || null,
    createdAt: job.createdAt,
    updatedAt: job.updatedAt,
    finishedAt: job.finishedAt,
    total: job.accounts.length,
    proxyCount: job.proxyCount || 0,
    done: job.accounts.filter((account) => ["success", "failed"].includes(account.status)).length,
    success: job.accounts.filter((account) => account.status === "success").length,
    failed: job.accounts.filter((account) => account.status === "failed").length,
  };
}
