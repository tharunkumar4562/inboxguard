const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const idleNote = document.getElementById("idle-note");
const scanPanel = document.querySelector(".scan-panel");
const tabFeedbackNode = document.getElementById("tab-feedback");
const dashboardTab = document.getElementById("tab-dashboard");
const threatScanTab = document.getElementById("tab-threat-scan");
const startButton = document.getElementById("start-btn");

const authModal = document.getElementById("auth-modal");
const authSignInButton = document.getElementById("auth-signin");
const authCreateButton = document.getElementById("auth-create");
const authCloseButton = document.getElementById("auth-close");

const rawEmailInput = document.getElementById("raw-email");
const domainInput = document.getElementById("domain");
const analysisModeInput = document.getElementById("analysis-mode");
const submitButton = document.getElementById("run-check");
const loadingPanel = document.getElementById("result-loading");
const loadingStep = document.getElementById("loading-step");

const statusRiskBandNode = document.getElementById("status-risk-band");
const statusRiskCardNode = document.getElementById("status-risk-card");
const statusPrimaryIssueNode = document.getElementById("status-primary-issue");
const statusConfidenceNode = document.getElementById("status-confidence");
const statusInfraNode = document.getElementById("status-infra");

const biggestRiskCard = document.getElementById("biggest-risk-card");
const biggestRiskTitleNode = document.getElementById("biggest-risk-title");
const biggestRiskImpactNode = document.getElementById("biggest-risk-impact");
const biggestRiskDescNode = document.getElementById("biggest-risk-desc");
const trustHookNode = document.getElementById("trust-hook");

const consequenceListNode = document.getElementById("consequence-list");
const hurtListNode = document.getElementById("hurt-list");
const topFixesListNode = document.getElementById("top-fixes-list");
const scoreBreakdownNode = document.getElementById("score-breakdown");

const fixNowButton = document.getElementById("fix-now");
const rewriteStyleInput = document.getElementById("rewrite-style");

const workflowStateNode = document.getElementById("workflow-state");
const workflowTitleNode = document.getElementById("workflow-title");
const rewriteModeDisplayNode = document.getElementById("rewrite-mode-display");
const improvementEstimateNode = document.getElementById("improvement-estimate");
const subjectChangeNode = document.getElementById("subject-change");
const rewriteChangesNode = document.getElementById("rewrite-changes");
const rewriteTrustNoteNode = document.getElementById("rewrite-trust-note");
const rewriteLimitationsNode = document.getElementById("rewrite-limitations");
const fixOutput = document.getElementById("fix-output");
const beforeEmailNode = document.getElementById("before-email");
const afterEmailNode = document.getElementById("after-email");
const useFixedButton = document.getElementById("use-fixed");
const restoreOriginalButton = document.getElementById("restore-original");
const editManualButton = document.getElementById("edit-manual");
const feedbackInboxButton = document.getElementById("feedback-inbox");
const feedbackSpamButton = document.getElementById("feedback-spam");
const feedbackUnsureButton = document.getElementById("feedback-unsure");

const loadSteps = [
    "Checking content signals...",
    "Detecting spam patterns...",
    "Evaluating provider rules...",
    "Scoring risk signals...",
];

const defaultSubmitLabel = submitButton ? submitButton.textContent : "Analyze Email Risk";
let latestSummary = null;
let latestFindings = [];
let latestRewriteContext = null;
let latestLearningProfile = null;
let hasScanResult = false;
let pendingAction = null;
let isAuthenticated = false;
let anonymousScansUsed = Number(localStorage.getItem("ig_anon_scans_used") || "0");
let anonymousScansLimit = Number(localStorage.getItem("ig_anon_scans_limit") || "3");
let userScansUsed = 0;
let userScansLimit = 50;

const errorBanner = document.createElement("div");
errorBanner.id = "error-banner";
errorBanner.className = "hidden";
document.body.appendChild(errorBanner);

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => errorBanner.classList.add("hidden"), 3800);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setTabFeedback(message) {
    if (tabFeedbackNode) {
        tabFeedbackNode.textContent = message;
    }
}

function showAuthModal() {
    if (!authModal) {
        return;
    }

    const msgNode = authModal.querySelector(".micro");
    if (msgNode) {
        msgNode.textContent = "You've used your free scans. Create a free account or sign in to continue.";
    }
    authModal.classList.remove("hidden");
}

function hideAuthModal() {
    if (!authModal) {
        return;
    }
    authModal.classList.add("hidden");
}

function needsAuthGate(action) {
    if (isAuthenticated) {
        return action === "analyze" && userScansUsed >= userScansLimit;
    }
    return action === "analyze" && anonymousScansUsed >= anonymousScansLimit;
}

async function refreshAuthStatus() {
    try {
        const response = await fetch("/auth/status", { method: "GET" });
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        isAuthenticated = Boolean(data && data.authenticated);
        anonymousScansUsed = Number(data && data.anonymous_scans_used ? data.anonymous_scans_used : 0);
        anonymousScansLimit = Number(data && data.anonymous_scans_limit ? data.anonymous_scans_limit : 3);
        userScansUsed = Number(data && data.user_scans_used ? data.user_scans_used : 0);
        userScansLimit = Number(data && data.user_scans_limit ? data.user_scans_limit : 50);

        localStorage.setItem("ig_anon_scans_used", String(anonymousScansUsed));
        localStorage.setItem("ig_anon_scans_limit", String(anonymousScansLimit));
    } catch (error) {
        // Keep UI operational even if auth status endpoint is temporarily unavailable.
    }
}

function runPendingAction() {
    if (pendingAction === "analyze") {
        runAnalyze();
    } else if (pendingAction === "fix") {
        showFixTransformation();
    }
    pendingAction = null;
}

function stashPendingContext(actionName) {
    localStorage.setItem("ig_pending_action", actionName || "analyze");
    localStorage.setItem("ig_pending_draft", rawEmailInput ? rawEmailInput.value : "");
    localStorage.setItem("ig_pending_domain", domainInput ? domainInput.value : "");
    localStorage.setItem("ig_pending_analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
    localStorage.setItem("ig_pending_rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "balanced");
}

function restorePendingContext() {
    if (rawEmailInput && !rawEmailInput.value) {
        rawEmailInput.value = localStorage.getItem("ig_pending_draft") || "";
    }
    if (domainInput && !domainInput.value) {
        domainInput.value = localStorage.getItem("ig_pending_domain") || "";
    }
    if (analysisModeInput) {
        const mode = localStorage.getItem("ig_pending_analysis_mode");
        if (mode) {
            analysisModeInput.value = mode;
        }
    }
    if (rewriteStyleInput) {
        const style = localStorage.getItem("ig_pending_rewrite_style");
        if (style) {
            rewriteStyleInput.value = style;
        }
    }
}

function clearPendingContext() {
    localStorage.removeItem("ig_pending_action");
    localStorage.removeItem("ig_pending_draft");
    localStorage.removeItem("ig_pending_domain");
    localStorage.removeItem("ig_pending_analysis_mode");
    localStorage.removeItem("ig_pending_rewrite_style");
}

function resumeAfterAccessIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    const shouldResume = params.get("resume") === "1";
    if (!shouldResume || !isAuthenticated) {
        return;
    }

    restorePendingContext();
    const action = localStorage.getItem("ig_pending_action");
    if (action) {
        pendingAction = action;
        runPendingAction();
    }
    clearPendingContext();
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
}

function handleAuthAction(action) {
    if (action === "signin") {
        stashPendingContext(pendingAction || "analyze");
        hideAuthModal();
        window.location.href = "/access?mode=signin&resume=1";
        return;
    }
    if (action === "create") {
        stashPendingContext(pendingAction || "analyze");
        hideAuthModal();
        window.location.href = "/access?mode=signup&resume=1";
        return;
    }
    hideAuthModal();
}

// Inline fallback hooks for resilient modal behavior.
window.igAuthSignIn = () => handleAuthAction("signin");
window.igAuthCreate = () => handleAuthAction("create");
window.igAuthClose = () => handleAuthAction("close");

function activateTab(tab) {
    if (!dashboardTab || !threatScanTab) {
        return;
    }

    dashboardTab.classList.remove("active");
    threatScanTab.classList.remove("active");

    if (tab === "threat-scan") {
        threatScanTab.classList.add("active");
        if (scanPanel) {
            scanPanel.classList.add("focused");
            scanPanel.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        if (rawEmailInput) {
            rawEmailInput.focus();
        }
        setTabFeedback("Scan mode active. Paste your email and click Fix Before Sending.");
    } else {
        dashboardTab.classList.add("active");
        if (scanPanel) {
            scanPanel.classList.remove("focused");
        }
        setTabFeedback("Ready to scan. Paste your draft and hit Fix Before Sending to find issues.");
    }
}

function setIdleState() {
    hasScanResult = false;
    if (resultSection) {
        resultSection.classList.add("hidden");
    }
    if (idleNote) {
        idleNote.classList.remove("hidden");
    }
    if (loadingPanel) {
        loadingPanel.classList.add("hidden");
    }
    if (fixOutput) {
        fixOutput.classList.add("hidden");
    }
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultSubmitLabel;
    }
}

function setLoadingState() {
    if (resultSection) {
        resultSection.classList.add("hidden");
    }
    if (idleNote) {
        idleNote.classList.add("hidden");
    }
    if (loadingPanel) {
        loadingPanel.classList.remove("hidden");
    }
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = "Analyzing...";
    }
}

function setResultState() {
    if (loadingPanel) {
        loadingPanel.classList.add("hidden");
    }
    if (resultSection) {
        resultSection.classList.remove("hidden");
        resultSection.classList.add("fade-in");
    }
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultSubmitLabel;
    }
}

function startRealtimeScanSteps() {
    if (!loadingStep) {
        return null;
    }

    let idx = 0;
    loadingStep.textContent = loadSteps[idx];
    return setInterval(() => {
        idx = (idx + 1) % loadSteps.length;
        loadingStep.textContent = loadSteps[idx];
    }, 280);
}

function setImpactBadge(node, impact) {
    if (!node) {
        return;
    }

    node.className = "badge";
    if (impact === "HIGH") {
        node.classList.add("badge-red");
    } else if (impact === "MEDIUM") {
        node.classList.add("badge-yellow");
    } else {
        node.classList.add("badge-green");
    }
    node.textContent = impact;
}

function primaryIssue(summary, findings) {
    const topFixes = summary.top_fixes || [];
    if (topFixes.length && topFixes[0].title) {
        return topFixes[0].title;
    }

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    if (nonMeta.length) {
        return nonMeta[0].title || "Detected issue";
    }
    return "No critical issue detected";
}

function renderStatus(summary, signals, findings) {
    if (!statusRiskBandNode || !statusPrimaryIssueNode || !statusConfidenceNode || !statusInfraNode) {
        return;
    }

    const band = String(summary.risk_band || "Needs Review");
    let label = "At Risk";
    let cls = "warning";

    if (band === "High Spam-Risk Signals" || band === "High Risk") {
        label = "Likely Filtered";
        cls = "critical";
    } else if (band === "Content Safe") {
        label = "Safe";
        cls = "safe";
    }

    const confidence = String(summary.deliverability_confidence || "medium");
    const mode = String(summary.analysis_mode || "content");
    const spf = String(signals.spf_status || "unknown");
    const dkim = String(signals.dkim_status || "unknown");
    const dmarc = String(signals.dmarc_status || "unknown");
    const infraHealthy = spf === "found" && dkim === "found" && dmarc === "found";

    if (band === "Content Safe" && (confidence === "low" || (mode === "full" && !infraHealthy))) {
        label = "Low Risk (Incomplete Check)";
        cls = "warning";
    }

    statusRiskBandNode.textContent = label;
    statusRiskBandNode.className = `status-value ${cls}`;

    if (statusRiskCardNode) {
        statusRiskCardNode.classList.remove("critical-bg", "warning-bg", "safe-bg");
        if (cls === "critical") {
            statusRiskCardNode.classList.add("critical-bg");
        } else if (cls === "warning") {
            statusRiskCardNode.classList.add("warning-bg");
        } else {
            statusRiskCardNode.classList.add("safe-bg");
        }
    }

    statusPrimaryIssueNode.textContent = primaryIssue(summary, findings);

    const confidenceBasis = String(summary.analysis_mode || "content") === "full"
        ? "based on content + technical signals"
        : "based on content-only signals";
    statusConfidenceNode.textContent = `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence (${confidenceBasis})`;

    if (mode === "content") {
        statusInfraNode.textContent = "Not Checked";
    } else {
        statusInfraNode.textContent = infraHealthy ? "Healthy" : "Needs Attention";
    }
}

function renderBiggestRisk(summary, findings) {
    if (!biggestRiskTitleNode || !biggestRiskImpactNode || !biggestRiskDescNode || !biggestRiskCard) {
        return;
    }

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    const top = nonMeta[0];

    if (!top) {
        if (hasScanResult) {
            biggestRiskTitleNode.textContent = "No critical issue detected";
            biggestRiskDescNode.textContent = "Clean content signal profile. Still good practice to make emails shorter and more personal.";
            setImpactBadge(biggestRiskImpactNode, "LOW");
            biggestRiskCard.classList.remove("card-critical");
            if (trustHookNode) {
                trustHookNode.textContent = "Scan complete. Use Fix My Email to make it 1:1 and personal.";
            }
            return;
        }
        biggestRiskTitleNode.textContent = "No scan yet";
        biggestRiskDescNode.textContent = "Run analysis to detect the top deliverability blocker.";
        setImpactBadge(biggestRiskImpactNode, "LOW");
        biggestRiskCard.classList.remove("card-critical");
        return;
    }

    const title = String(top.title || "risk signal").toLowerCase();
    const impactStatement = title.includes("broadcast")
        ? "This will likely be filtered as spam"
        : title.includes("urgency") || title.includes("pressure")
            ? "This looks like pressure language — reduces trust"
            : title.includes("link") || title.includes("image")
                ? "Too many links/images for cold outreach — flagged as bulk"
                : title.includes("personalization")
                    ? "Looks like a mass send — inbox filters catch these first"
                    : (top.title || "Top risk detected");

    biggestRiskTitleNode.textContent = impactStatement;

    const reason = (top.issue || top.impact || "Pattern increases spam filtering risk").split(".")[0];
    biggestRiskDescNode.textContent = `Why it matters: ${reason}`;

    const sev = String(top.severity || "medium").toLowerCase();
    const impact = sev === "high" ? "HIGH" : sev === "low" ? "LOW" : "MEDIUM";
    setImpactBadge(biggestRiskImpactNode, impact);

    if (trustHookNode) {
        const samples = latestLearningProfile && Number(latestLearningProfile.sample_size || 0) > 0
            ? ` Model trained on ${latestLearningProfile.sample_size} outcome(s).`
            : "";
        trustHookNode.textContent = `Bulk-pattern check.${samples}`;
    }

    if (impact === "HIGH") {
        biggestRiskCard.classList.add("card-critical", "slide-up");
    } else {
        biggestRiskCard.classList.remove("card-critical");
    }
}

function renderConsequences(summary) {
    if (!consequenceListNode) {
        return;
    }

    consequenceListNode.innerHTML = "";
    const high = ["High Spam-Risk Signals", "High Risk"].includes(String(summary.risk_band || ""));
    const lines = high
        ? [
            "This email will likely be filtered or land in spam if you send it now.",
            "Repeated sends with these patterns will damage your domain reputation.",
            "Fix this before sending — use the safer version below.",
        ]
        : [
            "This can still land in spam if unchanged.",
            "Repeated sends from this account compound the filtering risk.",
            "Fix it now to protect future deliverability.",
        ];

    lines.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        consequenceListNode.appendChild(li);
    });
}

function renderHurting(findings) {
    if (!hurtListNode) {
        return;
    }

    hurtListNode.innerHTML = "";
    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));

    if (!nonMeta.length) {
        hurtListNode.innerHTML = "<li>No scan yet - run analysis to detect deliverability risks.</li>";
        return;
    }

    nonMeta.slice(0, 3).forEach((item) => {
        const li = document.createElement("li");
        const sev = String(item.severity || "medium").toUpperCase();
        li.textContent = `${item.title || "Risk"} (${sev})`;
        hurtListNode.appendChild(li);
    });
}

function commandFix(title, fallback) {
    const txt = String(title || "").toLowerCase();
    if (txt.includes("broadcast")) {
        return "Remove feature list and rewrite as a 1-to-1 message.";
    }
    if (txt.includes("personalization")) {
        return "Add recipient-specific detail in the opening line.";
    }
    if (txt.includes("dkim") || txt.includes("spf") || txt.includes("dmarc")) {
        return "Fix authentication setup before sending campaign traffic.";
    }
    if (txt.includes("link/image") || txt.includes("balance")) {
        return "Reduce dense links or balance with clean visual/text structure.";
    }
    return fallback || "Resolve this issue before sending.";
}

function renderFixes(summary) {
    if (!topFixesListNode) {
        return;
    }

    topFixesListNode.innerHTML = "";
    const fixes = summary.top_fixes || [];

    if (!fixes.length) {
        topFixesListNode.innerHTML = "<li>No fixes loaded yet - run analysis first.</li>";
        return;
    }

    fixes.slice(0, 3).forEach((fix, idx) => {
        const li = document.createElement("li");
        li.textContent = `${idx + 1}. ${commandFix(fix.title || fix.type || "Fix issue", fix.action)}`;
        topFixesListNode.appendChild(li);
    });
}

function renderBreakdown(summary) {
    if (!scoreBreakdownNode) {
        return;
    }

    scoreBreakdownNode.innerHTML = "";
    const model = summary.scoring_model || {};
    const penalties = (summary.breakdown || []).filter((item) => Number(item.points) < 0);

    const baseline = Number(model.baseline_score || 0);
    const totalPenalty = Number(model.total_penalty_points || summary.risk_points || 0);
    const finalScore = Number(model.final_score || summary.final_score || summary.score || 0);

    if (baseline > 0) {
        const formulaLine = document.createElement("li");
        formulaLine.textContent = `Model: ${baseline} baseline - ${totalPenalty} penalties = ${finalScore} final score`;
        scoreBreakdownNode.appendChild(formulaLine);
    }

    if (!penalties.length) {
        const noPenalty = document.createElement("li");
        noPenalty.textContent = "No penalties triggered from current detected signals.";
        scoreBreakdownNode.appendChild(noPenalty);
        return;
    }

    penalties.slice(0, 5).forEach((item) => {
        const li = document.createElement("li");
        const points = Math.abs(Number(item.points || 0));
        const reason = item.reason ? ` | ${item.reason}` : "";
        li.textContent = `-${points} ${item.label}${reason}`;
        scoreBreakdownNode.appendChild(li);
    });
}
async function showFixTransformation() {
    if (!fixOutput || !beforeEmailNode || !afterEmailNode || !rawEmailInput || !fixNowButton) {
        return;
    }

    const original = rawEmailInput.value.trim();
    if (!original) {
        showError("Paste an email first so we can fix it.");
        return;
    }

    fixNowButton.disabled = true;
    fixNowButton.textContent = "Fixing...";

    try {
        const payload = new FormData();
        payload.set("raw_email", original);
        if (domainInput && domainInput.value.trim()) {
            payload.set("domain", domainInput.value.trim());
        }
        payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
        payload.set("rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "balanced");

        const response = await fetch("/rewrite", {
            method: "POST",
            body: payload,
        });
        if (!response.ok) {
            throw new Error("Rewrite failed. Try again.");
        }
        const data = await response.json();
        const rewritten = String(data.rewritten_text || original);

        const originalSubject = String(data.original_subject || "").trim();
        const originalBody = String(data.original_body || data.original_text || original).trim();
        const rewrittenSubject = String(data.rewritten_subject || "").trim();
        const rewrittenBody = String(data.rewritten_body || rewritten).trim();

        const formatEmailBlock = (subject, body) => {
            const parts = [];
            if (subject) {
                parts.push(`Subject: ${subject}`);
            }
            parts.push("Body:");
            parts.push(body || "-");
            return parts.join("\n\n");
        };

        beforeEmailNode.textContent = formatEmailBlock(originalSubject, originalBody);
        afterEmailNode.textContent = formatEmailBlock(rewrittenSubject, rewrittenBody);

        latestRewriteContext = {
            original_text: String(data.original_text || original),
            rewritten_text: rewritten,
            from_risk_band: String(data.from_risk_band || "Needs Review"),
            to_risk_band: String(data.to_risk_band || "Needs Review"),
            score_delta: Number(data.score_delta || 0),
            rewrite_style: String(data.rewrite_style || "balanced"),
        };

        const rewriteOutcome = String(data.rewrite_outcome || "neutral").toLowerCase();

        if (workflowStateNode) {
            workflowStateNode.textContent = "Step 2: Fix complete";
        }
        if (workflowTitleNode) {
            workflowTitleNode.textContent = rewriteOutcome === "improved"
                ? "Safer version generated"
                : rewriteOutcome === "failed_fix"
                    ? "Partial fix generated"
                    : "Best safer version generated";
        }

        if (improvementEstimateNode) {
            const delta = Number(data.score_delta || 0);
            if (rewriteOutcome === "improved") {
                improvementEstimateNode.textContent = `Risk shift: ${data.from_risk_band} -> ${data.to_risk_band} | Score delta: ${delta >= 0 ? "+" : ""}${delta}`;
            } else if (rewriteOutcome === "failed_fix") {
                improvementEstimateNode.textContent = "Could not safely remove all pressure signals without changing core intent. Use this draft as a base and refine further.";
            } else {
                improvementEstimateNode.textContent = "No major risk shift detected. We still simplified structure to reduce bulk-style triggers.";
            }
        }

        if (rewriteModeDisplayNode) {
            const mode = String(data.rewrite_style || "balanced").toLowerCase();
            const modeLabel = mode === "safe"
                ? "Safe (keeps more detail)"
                : mode === "aggressive"
                    ? "Aggressive (max reply rate)"
                    : "Balanced (best mix)";
            rewriteModeDisplayNode.textContent = `Rewrite mode: ${modeLabel}`;
        }

        if (subjectChangeNode) {
            const changed = Boolean(data.subject_changed) && originalSubject && rewrittenSubject && originalSubject !== rewrittenSubject;
            if (changed) {
                subjectChangeNode.textContent = `Subject updated:\n"${originalSubject}" -> "${rewrittenSubject}"`;
                subjectChangeNode.classList.remove("hidden");
            } else {
                subjectChangeNode.textContent = "";
                subjectChangeNode.classList.add("hidden");
            }
        }

        if (rewriteChangesNode) {
            rewriteChangesNode.innerHTML = "";
            const lines = Array.isArray(data.rewrite_changes) ? data.rewrite_changes : [];
            if (!lines.length) {
                const li = document.createElement("li");
                li.textContent = "Improved clarity and reduced bulk-style patterns.";
                rewriteChangesNode.appendChild(li);
            } else {
                lines.slice(0, 4).forEach((line) => {
                    const li = document.createElement("li");
                    li.textContent = String(line);
                    rewriteChangesNode.appendChild(li);
                });
            }
        }

        if (rewriteTrustNoteNode) {
            rewriteTrustNoteNode.textContent = String(
                data.rewrite_trust_note || "This version removes common bulk-style patterns flagged by Gmail and Outlook filters."
            );
        }

        if (rewriteLimitationsNode) {
            const notes = Array.isArray(data.rewrite_limitations) ? data.rewrite_limitations : [];
            rewriteLimitationsNode.innerHTML = "";
            notes.slice(0, 3).forEach((note) => {
                const li = document.createElement("li");
                li.textContent = String(note);
                rewriteLimitationsNode.appendChild(li);
            });
            if (!notes.length) {
                const li = document.createElement("li");
                li.textContent = "Final placement still depends on domain reputation, list quality, and send behavior.";
                rewriteLimitationsNode.appendChild(li);
            }
        }

        fixOutput.classList.remove("hidden");
        fixOutput.classList.add("fade-in");

        // Auto-scroll to transformation with immediate visibility
        await sleep(100);
        fixOutput.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        showError(error && error.message ? error.message : "Rewrite failed.");
    }

    fixNowButton.disabled = false;
    fixNowButton.textContent = "Fix My Email";
}

async function runAnalyze() {
    await refreshAuthStatus();

    if (needsAuthGate("analyze")) {
        if (isAuthenticated) {
            showError("You reached your monthly free plan scan limit. Upgrade is required for more scans.");
        } else {
            showAuthModal();
        }
        return;
    }

    const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
    const domainText = domainInput ? domainInput.value.trim() : "";
    const mode = analysisModeInput ? analysisModeInput.value : "content";

    if (rawText.length < 20) {
        showError("Paste the full email draft before scanning.");
        return;
    }

    setLoadingState();
    const loadingTicker = startRealtimeScanSteps();

    try {
        const payload = new FormData();
        payload.set("raw_email", rawText);
        if (domainText) {
            payload.set("domain", domainText);
        }
        payload.set("analysis_mode", mode);

        const response = await fetch("/analyze", {
            method: "POST",
            body: payload,
        });

        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            const code = String(err.detail || "");
            if (code === "AUTH_REQUIRED") {
                showAuthModal();
                throw new Error("Sign in to continue scanning.");
            }
            if (code === "FREE_PLAN_LIMIT_REACHED") {
                throw new Error("You reached your monthly free plan scan limit. Upgrade is required for more scans.");
            }
            throw new Error("Unable to complete risk scan. Try again.");
        }

        const data = await response.json();
        if (loadingTicker) {
            clearInterval(loadingTicker);
        }
        const summary = data.summary || {};
        const signals = data.signals || {};
        const findings = data.partial_findings || summary.findings || [];
        latestLearningProfile = data.learning_profile || latestLearningProfile;
        hasScanResult = true;

        latestSummary = summary;
        latestFindings = findings;

        renderStatus(summary, signals, findings);
        renderBiggestRisk(summary, findings);
        renderConsequences(summary);
        renderHurting(findings);
        renderFixes(summary);
        renderBreakdown(summary);

        if (workflowStateNode) {
            workflowStateNode.textContent = "Step 1: Scan complete";
        }
        if (workflowTitleNode) {
            workflowTitleNode.textContent = "Step 2: Fix required";
        }
        if (fixOutput) {
            fixOutput.classList.add("hidden");
        }

        setResultState();
        if (resultSection) {
            resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        activateTab("dashboard");

        if (data.usage && !data.usage.authenticated) {
            anonymousScansUsed = Number(data.usage.anonymous_scans_used || anonymousScansUsed + 1);
            anonymousScansLimit = Number(data.usage.anonymous_scans_limit || anonymousScansLimit);
            localStorage.setItem("ig_anon_scans_used", String(anonymousScansUsed));
            localStorage.setItem("ig_anon_scans_limit", String(anonymousScansLimit));
        }
        if (data.usage && data.usage.authenticated) {
            userScansUsed = Number(data.usage.user_scans_used || userScansUsed + 1);
            userScansLimit = Number(data.usage.user_scans_limit || userScansLimit);
        }
    } catch (error) {
        if (loadingTicker) {
            clearInterval(loadingTicker);
        }
        showError(error && error.message ? error.message : "Scan failed.");
        setIdleState();
    }
}

function useFixedVersion() {
    if (!afterEmailNode || !rawEmailInput) {
        return;
    }
    rawEmailInput.value = afterEmailNode.textContent || rawEmailInput.value;
    showError("Fixed version applied to editor. Re-scan before send.");
}

function restoreOriginalDraft() {
    if (!rawEmailInput || !latestRewriteContext) {
        return;
    }
    rawEmailInput.value = latestRewriteContext.original_text || rawEmailInput.value;
    showError("Original draft restored.");
}

function editManually() {
    if (!rawEmailInput) {
        return;
    }
    rawEmailInput.focus();
    showError("Manual edit mode active.");
}

async function sendFeedback(outcome) {
    if (!latestRewriteContext) {
        showError("Generate a fixed version first.");
        return;
    }

    try {
        const payload = new FormData();
        payload.set("outcome", outcome);
        payload.set("original_text", latestRewriteContext.original_text || "");
        payload.set("rewritten_text", latestRewriteContext.rewritten_text || "");
        payload.set("from_risk_band", latestRewriteContext.from_risk_band || "");
        payload.set("to_risk_band", latestRewriteContext.to_risk_band || "");

        const response = await fetch("/feedback", {
            method: "POST",
            body: payload,
        });
        if (!response.ok) {
            throw new Error("Could not save feedback");
        }
        const data = await response.json();
        latestLearningProfile = data.learning_profile || latestLearningProfile;
        const samples = latestLearningProfile ? Number(latestLearningProfile.sample_size || 0) : 0;
        showError(`Feedback saved. System learned from this outcome (${samples} total).`);
    } catch (error) {
        showError(error && error.message ? error.message : "Could not save feedback");
    }
}

if (dashboardTab) {
    dashboardTab.addEventListener("click", () => activateTab("dashboard"));
}
if (threatScanTab) {
    threatScanTab.addEventListener("click", () => activateTab("threat-scan"));
}
if (startButton) {
    startButton.addEventListener("click", () => {
        pendingAction = "analyze";
        if (needsAuthGate("analyze")) {
            if (isAuthenticated) {
                showError("You reached your monthly free plan scan limit. Upgrade is required for more scans.");
                return;
            }
            showAuthModal();
            return;
        }
        runPendingAction();
    });
}
if (fixNowButton) {
    fixNowButton.addEventListener("click", () => {
        const payload = new FormData();
        payload.set("event", "rewrite_clicked");
        fetch("/track", { method: "POST", body: payload }).catch(() => null);

        pendingAction = "fix";
        runPendingAction();
    });
}
if (useFixedButton) {
    useFixedButton.addEventListener("click", useFixedVersion);
}
if (restoreOriginalButton) {
    restoreOriginalButton.addEventListener("click", restoreOriginalDraft);
}
if (editManualButton) {
    editManualButton.addEventListener("click", editManually);
}
if (feedbackInboxButton) {
    feedbackInboxButton.addEventListener("click", () => sendFeedback("inbox"));
}
if (feedbackSpamButton) {
    feedbackSpamButton.addEventListener("click", () => sendFeedback("spam"));
}
if (feedbackUnsureButton) {
    feedbackUnsureButton.addEventListener("click", () => sendFeedback("not_sure"));
}
if (authSignInButton) {
    authSignInButton.addEventListener("click", () => handleAuthAction("signin"));
}
if (authCreateButton) {
    authCreateButton.addEventListener("click", () => handleAuthAction("create"));
}
if (authCloseButton) {
    authCloseButton.addEventListener("click", () => handleAuthAction("close"));
}
if (authModal) {
    authModal.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof HTMLElement)) {
            return;
        }
        if (target.id === "auth-modal") {
            handleAuthAction("close");
            return;
        }
        if (target.id === "auth-signin") {
            handleAuthAction("signin");
            return;
        }
        if (target.id === "auth-create") {
            handleAuthAction("create");
            return;
        }
        if (target.id === "auth-close") {
            handleAuthAction("close");
        }
    });
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        pendingAction = "analyze";
        if (needsAuthGate("analyze")) {
            if (isAuthenticated) {
                showError("You reached your monthly free plan scan limit. Upgrade is required for more scans.");
                return;
            }
            showAuthModal();
            return;
        }
        runPendingAction();
    });
}

setIdleState();
activateTab("dashboard");
refreshAuthStatus().then(() => {
    resumeAfterAccessIfNeeded();
});
