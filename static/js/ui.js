import { state } from "./state.js";

const $ = (id) => document.getElementById(id);

const homeView = $("home-view");
const toolView = $("tool-view");
const tokenBadge = $("token-badge");
const tokenCount = $("token-count");
const tokenLabel = $("token-label");
const tokenCostHint = $("token-cost-hint");
const tokenAfterHint = $("token-after-hint");

const scanSections = Array.from(document.querySelectorAll(".scan-only"));
const toolPanes = Array.from(document.querySelectorAll(".tool-pane"));
const toolNavButtons = Array.from(document.querySelectorAll(".tool-nav-btn"));

export function showView(view) {
  state.currentView = view;
  if (homeView) {
    homeView.classList.toggle("hidden", view !== "home");
  }
  if (toolView) {
    toolView.classList.toggle("hidden", view !== "tool");
  }
}

export function showScanPanel(visible) {
  scanSections.forEach((el) => el.classList.toggle("hidden", !visible));
}

export function closeToolPanes() {
  toolPanes.forEach((pane) => pane.classList.remove("active"));
  toolNavButtons.forEach((btn) => btn.classList.remove("active"));
}

export function openToolPane(toolKey) {
  closeToolPanes();
  const pane = document.querySelector(`[data-tool-pane="${toolKey}"]`);
  const btn = document.querySelector(`[data-tool="${toolKey}"]`);
  if (!pane) {
    return;
  }
  pane.classList.add("active");
  if (btn) {
    btn.classList.add("active");
  }
}

export function updateTokenUI() {
  if (!tokenBadge || !tokenCount) {
    return;
  }

  if (!state.user) {
    tokenBadge.classList.add("hidden");
    return;
  }

  tokenBadge.classList.remove("hidden");
  tokenCount.textContent = String(state.tokens);
  if (tokenLabel) {
    tokenLabel.textContent = state.tokens === 1 ? "credit" : "credits";
  }
}

export function updateScanHints(afterText = "") {
  if (tokenCostHint) {
    tokenCostHint.textContent = `This will cost 1 credit. You have ${state.tokens} left.`;
  }
  if (tokenAfterHint) {
    if (afterText) {
      tokenAfterHint.textContent = afterText;
      tokenAfterHint.classList.remove("hidden");
    } else {
      tokenAfterHint.classList.add("hidden");
    }
  }
}

export function renderAnalyzeResult(data) {
  const result = $("result");
  const idle = $("idle-note");
  const riskBand = $("status-risk-band");
  const primaryIssue = $("status-primary-issue");
  const stripTitle = $("risk-strip-title");
  const stripBody = $("risk-strip-body");

  const summary = data.summary || {};
  const findings = data.partial_findings || [];
  const top = findings[0] || {};

  if (riskBand) {
    riskBand.textContent = String(summary.risk_band || "Needs Review");
  }
  if (primaryIssue) {
    primaryIssue.textContent = String(top.title || summary.primary_issue || "Top issue detected");
  }
  if (stripTitle) {
    stripTitle.textContent = String(summary.risk_band || "Review Required");
  }
  if (stripBody) {
    stripBody.textContent = String(top.issue || "Review the detected risk before sending.");
  }

  if (idle) {
    idle.classList.add("hidden");
  }
  if (result) {
    result.classList.remove("hidden");
    result.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

export function showError(message) {
  alert(String(message || "Something went wrong"));
}
