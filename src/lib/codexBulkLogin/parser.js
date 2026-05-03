const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseCodexCredentialLines(text = "") {
  const lines = String(text)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const accounts = [];
  const errors = [];

  lines.forEach((line, index) => {
    const parts = line.split("|").map((part) => part.trim());
    const [email, password, totpSecret = ""] = parts;
    if (parts.length < 2 || !email || !password) {
      errors.push({ line: index + 1, error: "Expected email|password|2fa_secret" });
      return;
    }
    if (!EMAIL_RE.test(email)) {
      errors.push({ line: index + 1, email, error: "Invalid email" });
      return;
    }
    accounts.push({ email, password, totpSecret, line: index + 1 });
  });

  return { accounts, errors };
}

export function sanitizeAccount(account = {}) {
  return {
    email: account.email,
    line: account.line,
    status: account.status || "pending",
    planType: account.planType || null,
    error: account.error || null,
    connectionId: account.connectionId || null,
    proxyLabel: account.proxyLabel || null,
    tsStart: account.tsStart || null,
    tsEnd: account.tsEnd || null,
  };
}
