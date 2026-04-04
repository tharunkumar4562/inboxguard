function ensureCredentials(init = {}) {
  return { credentials: "include", ...init };
}

export async function getAuthMe() {
  const res = await fetch("/auth/me", ensureCredentials({ method: "GET" }));
  if (!res.ok) {
    return { authenticated: false };
  }
  return res.json();
}

export async function getTokensInfo() {
  const res = await fetch("/tokens/info", ensureCredentials({ method: "GET" }));
  if (!res.ok) {
    return null;
  }
  return res.json();
}

export async function analyzeEmail({ rawEmail, domain = "", analysisMode = "content" }) {
  const payload = new FormData();
  payload.set("raw_email", String(rawEmail || ""));
  payload.set("domain", String(domain || ""));
  payload.set("analysis_mode", String(analysisMode || "content"));

  const res = await fetch("/analyze", ensureCredentials({ method: "POST", body: payload }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(String(data.detail || "Analyze failed"));
  }
  return data;
}

export async function requestAccess(email) {
  const res = await fetch("/request-access", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  if (!res.ok) {
    throw new Error("Could not submit access request");
  }
  return res.json().catch(() => ({ ok: true }));
}

export async function createSubscription(plan = "monthly") {
  const payload = new FormData();
  payload.set("plan", plan);
  const res = await fetch("/create-subscription", ensureCredentials({ method: "POST", body: payload }));
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(String(data.detail || "Could not create subscription"));
  }
  return data;
}

export async function applyPromo(code) {
  const res = await fetch("/apply-promo", ensureCredentials({
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: `code=${encodeURIComponent(code)}`,
  }));
  return res.json().catch(() => ({ success: false, message: "Invalid promo code" }));
}
