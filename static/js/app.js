const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const rawEmailInput = document.getElementById("raw-email");
const domainInput = document.getElementById("domain");
const analysisModeInput = document.getElementById("analysis-mode");
const submitButton = document.getElementById("run-check");
const resultLoading = document.getElementById("result-loading");
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

const hurtListNode = document.getElementById("hurt-list");
const topFixesListNode = document.getElementById("top-fixes-list");
const consequenceListNode = document.getElementById("consequence-list");
const providerViewListNode = document.getElementById("provider-view-list");
const scoreBreakdownNode = document.getElementById("score-breakdown");

const fixNowButton = document.getElementById("fix-now");
const rewriteActionButton = document.getElementById("rewrite-action");
const personalizeActionButton = document.getElementById("personalize-action");
const domainActionButton = document.getElementById("domain-action");

const unlockLink = document.getElementById("unlock-link");
const leadEmailInput = document.getElementById("lead-email");
const emailRequestLink = document.getElementById("email-request-link");
const workflowStateNode = document.getElementById("workflow-state");
const workflowTitleNode = document.getElementById("workflow-title");

const loadingMessages = [
    "Collecting risk telemetry...",
    "Scoring content threats...",
    "Prioritizing remediation actions...",
];

const defaultSubmitLabel = submitButton ? submitButton.textContent : "Analyze Email Risk";
let loadingTimer = null;
let lastSummary = null;

const errorBanner = document.createElement("div");
errorBanner.id = "error-banner";
errorBanner.className = "hidden";
document.body.appendChild(errorBanner);

function sendTrackEvent(eventName, target = "", mode = "") {
    if (!eventName) {
        return;
    }

    const payload = new FormData();
    payload.set("event", eventName);
    payload.set("target", target || "");
    payload.set("mode", mode || "");

    fetch("/track", {
        method: "POST",
        body: payload,
        keepalive: true,
    }).catch(() => {
        // Never block UX on analytics failures.
    });
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => {
        errorBanner.classList.add("hidden");
    }, 4000);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function startLoadingSteps() {
    if (!loadingStep) {
        return;
    }

    let idx = 0;
    loadingStep.textContent = loadingMessages[idx];
    loadingTimer = setInterval(() => {
        idx = (idx + 1) % loadingMessages.length;
        loadingStep.textContent = loadingMessages[idx];
    }, 620);
}

function stopLoadingSteps() {
    if (loadingTimer) {
        clearInterval(loadingTimer);
        loadingTimer = null;
    }
}

function setLoadingState(isLoading) {
    if (!submitButton || !resultLoading) {
        return;
    }

    if (isLoading) {
        submitButton.disabled = true;
        submitButton.textContent = "Scanning...";
        resultLoading.classList.remove("hidden");
        startLoadingSteps();
    } else {
        submitButton.disabled = false;
        submitButton.textContent = defaultSubmitLabel;
        resultLoading.classList.add("hidden");
        stopLoadingSteps();
    }
}

function updateLeadLinks(domain) {
    if (!unlockLink || !emailRequestLink) {
        return;
    }

    const cleanDomain = (domain || "yourdomain.com").trim() || "yourdomain.com";
    const waText = encodeURIComponent(`I want to unlock the full report for ${cleanDomain}`);
    unlockLink.href = `https://wa.me/?text=${waText}`;

    const email = (leadEmailInput && leadEmailInput.value ? leadEmailInput.value : "").trim() || "you@company.com";
    const subject = encodeURIComponent("InboxGuard Full Fix Report Request");
    const body = encodeURIComponent(`Domain: ${cleanDomain}\nEmail: ${email}`);
    emailRequestLink.href = `mailto:inboxguard.beta@gmail.com?subject=${subject}&body=${body}`;
}

function getPrimaryIssue(summary, findings) {
    const topFixes = summary.top_fixes || [];
    if (topFixes.length && topFixes[0].title) {
        return topFixes[0].title;
    }

    const filtered = (findings || []).filter((item) => !String(item.title || "").toLowerCase().startsWith("analysis mode"));
    if (filtered.length && filtered[0].title) {
        return filtered[0].title;
    }

    return "No critical issue";
}

function renderStatusOverview(summary, signals, findings) {
    if (!statusRiskBandNode || !statusPrimaryIssueNode || !statusConfidenceNode || !statusInfraNode) {
        return;
    }

    const band = summary.risk_band || "Needs Review";
    let label = "Warning";
    let className = "warning";

    if (band === "High Spam-Risk Signals" || band === "High Risk") {
        label = "Critical";
        className = "critical";
    } else if (band === "Content Safe") {
        label = "Safe";
        className = "safe";
    }

    statusRiskBandNode.textContent = label;
    statusRiskBandNode.className = `status-value ${className}`;
    if (statusRiskCardNode) {
        statusRiskCardNode.classList.remove("critical-bg", "warning-bg", "safe-bg");
        if (className === "critical") {
            statusRiskCardNode.classList.add("critical-bg");
        } else if (className === "warning") {
            statusRiskCardNode.classList.add("warning-bg");
        } else if (className === "safe") {
            statusRiskCardNode.classList.add("safe-bg");
        }
    }

    statusPrimaryIssueNode.textContent = getPrimaryIssue(summary, findings);
    const confidence = (summary.deliverability_confidence || "medium").toString();
    statusConfidenceNode.textContent = `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence`;

    const mode = String(summary.analysis_mode || "content");
    if (mode === "content") {
        statusInfraNode.textContent = "Not Checked";
        return;
    }

    const spf = String(signals.spf_status || "unknown");
    const dkim = String(signals.dkim_status || "unknown");
    const dmarc = String(signals.dmarc_status || "unknown");
    const allGood = spf === "found" && dkim === "found" && dmarc === "found";
    statusInfraNode.textContent = allGood ? "Healthy" : "Needs Attention";
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

function renderBiggestRisk(summary, findings) {
    if (!biggestRiskTitleNode || !biggestRiskImpactNode || !biggestRiskDescNode || !biggestRiskCard) {
        return;
    }

    const filtered = (findings || []).filter((item) => !String(item.title || "").toLowerCase().startsWith("analysis mode"));
    const primary = filtered[0] || null;

    if (!primary) {
        biggestRiskTitleNode.textContent = "No critical risk detected";
        biggestRiskDescNode.textContent = "Continue monitoring before send.";
        setImpactBadge(biggestRiskImpactNode, "LOW");
        biggestRiskCard.classList.remove("card-critical");
        return;
    }

    const title = String(primary.title || "Risk signal detected");
    if (title.toLowerCase().includes("broadcast")) {
        biggestRiskTitleNode.textContent = "This email looks like a bulk campaign";
    } else {
        biggestRiskTitleNode.textContent = title;
    }
    biggestRiskDescNode.textContent = `Reason: ${(primary.issue || primary.impact || "Pattern increases spam filtering risk").split(".")[0]}.`;

    const severity = String(primary.severity || "medium").toLowerCase();
    const impact = severity === "high" ? "HIGH" : severity === "low" ? "LOW" : "MEDIUM";
    setImpactBadge(biggestRiskImpactNode, impact);

    if (impact === "HIGH") {
        biggestRiskCard.classList.add("card-critical");
    } else {
        biggestRiskCard.classList.remove("card-critical");
    }
}

function renderHurtingList(findings) {
    if (!hurtListNode) {
        return;
    }

    hurtListNode.innerHTML = "";
    const filtered = (findings || []).filter((item) => !String(item.title || "").toLowerCase().startsWith("analysis mode"));

    if (!filtered.length) {
        hurtListNode.innerHTML = "<li>No scan yet - run analysis to detect deliverability risks.</li>";
        return;
    }

    filtered.slice(0, 3).forEach((item) => {
        const li = document.createElement("li");
        const sev = String(item.severity || "medium").toUpperCase();
        li.textContent = `${item.title || "Risk"} (${sev})`;
        hurtListNode.appendChild(li);
    });
}

function renderConsequences(summary) {
    if (!consequenceListNode) {
        return;
    }

    consequenceListNode.innerHTML = "";
    const isHigh = ["High Spam-Risk Signals", "High Risk"].includes(String(summary.risk_band || ""));

    const lines = isHigh
        ? [
            "Likely filtered as bulk or spam by mailbox providers.",
            "Inbox placement can drop across future sends.",
            "Domain reputation can degrade if unchanged drafts are sent repeatedly.",
        ]
        : [
            "Risk remains moderate; unresolved issues can still lower delivery.",
            "Repeated borderline patterns can reduce trust over time.",
            "Fixing top signals now protects domain reputation.",
        ];

    lines.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        consequenceListNode.appendChild(li);
    });
}

function toCommandAction(title, fallback) {
    const text = String(title || "").toLowerCase();
    if (text.includes("broadcast")) {
        return "Remove feature list and rewrite as a 1-to-1 message.";
    }
    if (text.includes("personalization")) {
        return "Add recipient-specific detail in the opening line.";
    }
    if (text.includes("dkim") || text.includes("spf") || text.includes("dmarc")) {
        return "Fix authentication setup before sending campaign traffic.";
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
        topFixesListNode.innerHTML = "<li>No immediate fix required.</li>";
        return;
    }

    fixes.slice(0, 3).forEach((item, idx) => {
        const li = document.createElement("li");
        const title = item.title || item.type || "Fix issue";
        const action = toCommandAction(title, item.action);
        li.textContent = `${idx + 1}. ${action}`;
        topFixesListNode.appendChild(li);
    });
}

function renderProviderView(summary) {
    if (!providerViewListNode) {
        return;
    }

    providerViewListNode.innerHTML = "";
    const providerResults = summary.provider_results || {};
    const statusMap = {
        content_safe: "Safe",
        needs_review: "Warning",
        high_risk_signals: "Critical",
    };

    let availableCount = 0;
    ["gmail", "outlook", "yahoo"].forEach((provider) => {
        const item = providerResults[provider];
        if (item) {
            availableCount += 1;
        }
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        const li = document.createElement("li");

        if (!item) {
            li.textContent = `${providerName}: No data`;
        } else {
            const status = statusMap[item.status] || "Warning";
            li.textContent = `${providerName}: ${status} | Top issue: ${item.top_issue || "Risk signals"}`;
        }

        providerViewListNode.appendChild(li);
    });

    if (!availableCount) {
        providerViewListNode.innerHTML = "<li>Provider view will appear after analysis.</li>";
    }
}

function renderScoreBreakdown(summary) {
    if (!scoreBreakdownNode) {
        return;
    }

    scoreBreakdownNode.innerHTML = "";
    const penalties = (summary.breakdown || []).filter((item) => Number(item.points) < 0);

    if (!penalties.length) {
        scoreBreakdownNode.innerHTML = "<li>No active penalties.</li>";
        return;
    }

    penalties.slice(0, 5).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.label} ${item.points}`;
        scoreBreakdownNode.appendChild(li);
    });
}

function runActionRewrite() {
    if (!rawEmailInput) {
        return;
    }

    const text = rawEmailInput.value.trim();
    if (!text) {
        rawEmailInput.value = "Hi {{FirstName}},\n\nI noticed [specific detail about recipient].\n\nOne clear outcome this can help with is [single outcome].\n\nWould it make sense to share a short 2-line plan?";
        return;
    }

    rawEmailInput.value = `${text}\n\n[Rewrite hint] Convert this draft into one recipient-focused message with one clear outcome.`;
}

function runActionPersonalize() {
    if (!rawEmailInput) {
        return;
    }

    const text = rawEmailInput.value.trim();
    if (!text) {
        rawEmailInput.value = "Hi {{FirstName}},\n\nI saw your recent update on [specific topic].";
        return;
    }

    rawEmailInput.value = `Hi {{FirstName}},\nI noticed [recipient-specific detail].\n\n${text}`;
}

function runActionDomainHealth() {
    if (!analysisModeInput) {
        return;
    }

    analysisModeInput.value = "full";
    sendTrackEvent("action_click", "check_domain_health", "full");
}

if (fixNowButton) {
    fixNowButton.addEventListener("click", () => {
        if (topFixesListNode) {
            topFixesListNode.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        sendTrackEvent("action_click", "fix_email_now", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (rewriteActionButton) {
    rewriteActionButton.addEventListener("click", () => {
        runActionRewrite();
        sendTrackEvent("action_click", "rewrite_for_deliverability", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (personalizeActionButton) {
    personalizeActionButton.addEventListener("click", () => {
        runActionPersonalize();
        sendTrackEvent("action_click", "add_personalization", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (domainActionButton) {
    domainActionButton.addEventListener("click", runActionDomainHealth);
}

if (unlockLink) {
    unlockLink.addEventListener("click", () => {
        sendTrackEvent("cta_click", "fix_email_now", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (emailRequestLink) {
    emailRequestLink.addEventListener("click", () => {
        sendTrackEvent("cta_click", "email_request", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (leadEmailInput) {
    leadEmailInput.addEventListener("input", () => updateLeadLinks(domainInput ? domainInput.value : ""));
}

if (domainInput) {
    domainInput.addEventListener("input", () => updateLeadLinks(domainInput.value));
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
        const domainText = domainInput ? domainInput.value.trim() : "";
        const mode = analysisModeInput ? analysisModeInput.value : "content";

        if (rawText.length < 20) {
            showError("Paste the full email draft before scanning.");
            return;
        }

        setLoadingState(true);

        try {
            const payload = new FormData();
            payload.set("raw_email", rawText);
            if (domainText) {
                payload.set("domain", domainText);
            }
            payload.set("analysis_mode", mode);

            const [response] = await Promise.all([
                fetch("/analyze", {
                    method: "POST",
                    body: payload,
                }),
                sleep(900),
            ]);

            if (!response.ok) {
                throw new Error("Unable to complete risk scan. Try again.");
            }

            const data = await response.json();
            const summary = data.summary || {};
            const signals = data.signals || {};
            const findings = data.partial_findings || summary.findings || [];

            lastSummary = summary;
            renderStatusOverview(summary, signals, findings);
            renderBiggestRisk(summary, findings);
            renderHurtingList(findings);
            renderConsequences(summary);
            renderFixes(summary);
            renderProviderView(summary);
            renderScoreBreakdown(summary);

            if (workflowStateNode) {
                workflowStateNode.textContent = "Step 1: Scan Complete";
            }
            if (workflowTitleNode) {
                workflowTitleNode.textContent = "Step 2: Fix Required";
            }

            updateLeadLinks(data.domain || domainText);

            if (resultSection) {
                resultSection.classList.remove("hidden");
                resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }

            sendTrackEvent("analyze", "submit", mode);
        } catch (error) {
            const message = error && error.message ? error.message : "Scan failed.";
            showError(message);
        } finally {
            setLoadingState(false);
        }
    });
}

updateLeadLinks(domainInput ? domainInput.value : "");
