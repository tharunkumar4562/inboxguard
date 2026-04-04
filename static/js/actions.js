import * as api from "./api.js";
import { state, setTokens, setUserFromAuth } from "./state.js";
import {
  showView,
  showScanPanel,
  closeToolPanes,
  openToolPane,
  updateTokenUI,
  updateScanHints,
  renderAnalyzeResult,
  showError,
} from "./ui.js";

const $ = (id) => document.getElementById(id);

function openAuthModal() {
  const modal = $("auth-modal");
  if (modal) {
    modal.classList.remove("hidden");
  }
}

export function openPricingModal() {
  const modal = $("pricing-modal");
  if (modal) {
    modal.classList.remove("hidden");
    document.body.classList.add("modal-open");
  }
}

export function closePricingModal() {
  const modal = $("pricing-modal");
  if (modal) {
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
  }
}

export async function initUser() {
  const auth = await api.getAuthMe();
  setUserFromAuth(auth);

  if (state.user) {
    const tokenInfo = await api.getTokensInfo();
    if (tokenInfo && typeof tokenInfo.tokens !== "undefined") {
      setTokens(tokenInfo.tokens);
    }
  }

  updateTokenUI();
  updateScanHints();
}

export function openTool(tool) {
  state.currentTool = tool;
  showView("tool");

  if (tool === "scan") {
    closeToolPanes();
    showScanPanel(true);
    const input = $("raw-email");
    if (input) {
      input.focus();
    }
    return;
  }

  showScanPanel(false);
  openToolPane(tool);
}

export function goHome() {
  closeToolPanes();
  showView("home");
}

export async function handleUnlock() {
  const auth = await api.getAuthMe();
  if (!auth || !auth.authenticated) {
    openAuthModal();
    return;
  }
  openPricingModal();
}

export async function handleRequestAccess() {
  const email = window.prompt("Enter your email");
  if (!email) {
    return;
  }

  await api.requestAccess(email);
  alert("Request submitted");
}

export async function runScan() {
  const rawEmail = String($("raw-email")?.value || "").trim();
  const domain = String($("domain")?.value || "").trim();
  const analysisMode = String($("analysis-mode")?.value || "content");

  if (rawEmail.length < 20) {
    showError("Paste your email draft first.");
    return;
  }

  if (state.user) {
    alert(`This will cost 1 credit. You have ${state.tokens} left.`);
  }

  const data = await api.analyzeEmail({ rawEmail, domain, analysisMode });
  const usage = data.usage || {};

  if (typeof usage.tokens_remaining !== "undefined") {
    setTokens(Number(usage.tokens_remaining));
  } else if (state.user) {
    setTokens(Math.max(0, state.tokens - 1));
  }

  updateTokenUI();
  updateScanHints(`Credits remaining: ${state.tokens}`);
  renderAnalyzeResult(data);
}

async function startPayment() {
  try {
    if (!state.user) {
      openAuthModal();
      return;
    }

    const plan = String($("inline-plan-type")?.value || "monthly");
    const data = await api.createSubscription(plan);

    if (data.usage_mode) {
      showError("Usage-based plan enabled.");
      closePricingModal();
      return;
    }

    if (typeof Razorpay === "undefined") {
      showError("Payment system unavailable.");
      return;
    }

    const options = {
      key: data.key,
      amount: data.amount,
      currency: data.currency || "INR",
      subscription_id: data.subscription_id,
      name: "InboxGuard",
      description: `${data.display_price || "$12"} / month`,
      prefill: {
        email: state.user.email || "",
        name: state.user.name || "",
      },
      handler: () => {
        closePricingModal();
        setTimeout(() => window.location.reload(), 1500);
      },
    };

    const rzp = new Razorpay(options);
    rzp.open();
  } catch (error) {
    showError(error && error.message ? error.message : "Could not start payment");
  }
}

async function applyPromoCode() {
  const input = $("promo-code-input");
  const message = $("promo-message");
  const code = String(input?.value || "").trim().toUpperCase();

  if (!code) {
    if (message) {
      message.style.display = "block";
      message.style.color = "#fca5a5";
      message.textContent = "Enter a promo code";
    }
    return;
  }

  const data = await api.applyPromo(code);
  if (!data.success) {
    if (message) {
      message.style.display = "block";
      message.style.color = "#fca5a5";
      message.textContent = String(data.message || "Invalid promo code");
    }
    return;
  }

  if (message) {
    message.style.display = "block";
    message.style.color = "#86efac";
    message.textContent = String(data.message || "Promo applied");
  }

  if (input) {
    input.value = "";
  }

  await initUser();
}

function fillExample() {
  const input = $("raw-email");
  if (!input) {
    return;
  }

  input.value = "Subject: Quick question about your outreach\n\nHi John,\nI noticed your recent post and had one short idea to improve reply rates without changing your offer.\nWould you be open to a quick review this week?\n\nBest,\nTharun";
  input.focus();
}

export function bindEvents() {
  $("back-home-btn")?.addEventListener("click", goHome);
  $("tab-dashboard")?.addEventListener("click", goHome);
  $("tab-threat-scan")?.addEventListener("click", () => openTool("scan"));
  $("start-btn")?.addEventListener("click", () => openTool("scan"));
  $("access-request-top")?.addEventListener("click", () => handleRequestAccess().catch((e) => showError(e.message)));
  $("access-btn")?.addEventListener("click", () => handleUnlock().catch((e) => showError(e.message)));
  $("fill-example")?.addEventListener("click", fillExample);

  $("risk-form")?.addEventListener("submit", (event) => {
    event.preventDefault();
    runScan().catch((error) => showError(error.message));
  });

  document.querySelectorAll(".tool-nav-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = String(btn.getAttribute("data-tool") || "");
      if (key) {
        openTool(key);
      }
    });
  });

  document.querySelectorAll("[data-tool-close]").forEach((btn) => {
    btn.addEventListener("click", () => {
      closeToolPanes();
      showScanPanel(true);
    });
  });

  $("pay-btn")?.addEventListener("click", (event) => {
    event.preventDefault();
    startPayment();
  });

  $("request-access")?.addEventListener("click", (event) => {
    event.preventDefault();
    handleRequestAccess().catch((e) => showError(e.message));
  });

  $("apply-promo-btn")?.addEventListener("click", () => {
    applyPromoCode().catch((e) => showError(e.message));
  });

  $("promo-code-input")?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      applyPromoCode().catch((e) => showError(e.message));
    }
  });

  $("pricing-modal")?.addEventListener("click", (event) => {
    if (event.target === $("pricing-modal")) {
      closePricingModal();
    }
  });
}

export function exposeGlobals() {
  window.openTool = openTool;
  window.openToolPane = openTool;
  window.goHome = goHome;
  window.handleUnlock = () => handleUnlock().catch((e) => showError(e.message));
  window.handleRequestAccess = () => handleRequestAccess().catch((e) => showError(e.message));
  window.openPricingModal = openPricingModal;
  window.closePricingModal = closePricingModal;
}
