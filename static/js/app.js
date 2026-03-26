const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const idleNote = document.getElementById("idle-note");
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

const consequenceListNode = document.getElementById("consequence-list");
const hurtListNode = document.getElementById("hurt-list");
const topFixesListNode = document.getElementById("top-fixes-list");
const providerViewListNode = document.getElementById("provider-view-list");
const scoreBreakdownNode = document.getElementById("score-breakdown");

const fixNowButton = document.getElementById("fix-now");
const rewriteActionButton = document.getElementById("rewrite-action");
const personalizeActionButton = document.getElementById("personalize-action");
const domainActionButton = document.getElementById("domain-action");

const workflowStateNode = document.getElementById("workflow-state");
const workflowTitleNode = document.getElementById("workflow-title");
const fixOutput = document.getElementById("fix-output");
const beforeEmailNode = document.getElementById("before-email");
const afterEmailNode = document.getElementById("after-email");

const loadSteps = [
    "Checking content signals...",
    "Detecting spam patterns...",
    "Evaluating provider rules...",
    "Scoring risk signals...",
];

const defaultSubmitLabel = submitButton ? submitButton.textContent : "Analyze Email Risk";
let latestSummary = null;
let latestFindings = [];

const errorBanner = document.createElement("div");
errorBanner.id = "error-banner";
errorBanner.className = "hidden";
document.body.appendChild(errorBanner);

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => errorBanner.classList.add("hidden"), 3500);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function setIdleState() {
    if (resultSection) {
        resultSection.classList.add("hidden");
    }
    if (idleNote) {
        idleNote.classList.remove("hidden");
    }
    if (loadingPanel) {
        loadingPanel.classList.add("hidden");
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

async function fakeDelaySequence() {
    if (!loadingStep) {
        await sleep(1600);
        return;
    }

    for (const step of loadSteps) {
        loadingStep.textContent = step;
        await sleep(550);
    }
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
    } else if (impact === "PENDING") {
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
    let label = "Warning";
    let cls = "warning";

    if (band === "High Spam-Risk Signals" || band === "High Risk") {
        label = "Critical";
        cls = "critical";
    } else if (band === "Content Safe") {
        label = "Safe";
        cls = "safe";
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

    const confidence = String(summary.deliverability_confidence || "medium");
    statusConfidenceNode.textContent = `${confidence.charAt(0).toUpperCase()}${confidence.slice(1)} confidence`;

    const mode = String(summary.analysis_mode || "content");
    if (mode === "content") {
        statusInfraNode.textContent = "Not Checked";
    } else {
        const spf = String(signals.spf_status || "unknown");
        const dkim = String(signals.dkim_status || "unknown");
        const dmarc = String(signals.dmarc_status || "unknown");
        statusInfraNode.textContent = spf === "found" && dkim === "found" && dmarc === "found" ? "Healthy" : "Needs Attention";
    }
}

function renderBiggestRisk(findings) {
    if (!biggestRiskTitleNode || !biggestRiskImpactNode || !biggestRiskDescNode || !biggestRiskCard) {
        return;
    }

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    const top = nonMeta[0];

    if (!top) {
        biggestRiskTitleNode.textContent = "No scan yet";
        biggestRiskDescNode.textContent = "Run analysis to detect the top deliverability blocker.";
        setImpactBadge(biggestRiskImpactNode, "PENDING");
        biggestRiskCard.classList.remove("card-critical");
        return;
    }

    const title = String(top.title || "Risk signal").toLowerCase();
    biggestRiskTitleNode.textContent = title.includes("broadcast") ? "This will likely be filtered as spam" : (top.title || "Top risk detected");
    const reason = (top.issue || top.impact || "Pattern increases spam filtering risk").split(".")[0];
    biggestRiskDescNode.textContent = `Reason: ${reason}.`;

    const sev = String(top.severity || "medium").toLowerCase();
    const impact = sev === "high" ? "HIGH" : sev === "low" ? "LOW" : "MEDIUM";
    setImpactBadge(biggestRiskImpactNode, impact);

    if (impact === "HIGH") {
        biggestRiskCard.classList.add("card-critical");
        biggestRiskCard.classList.add("slide-up");
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
            "Likely filtered as bulk or spam by mailbox providers.",
            "Inbox placement can drop across future sends.",
            "Domain reputation can degrade if unchanged drafts are sent repeatedly.",
        ]
        : [
            "Risk is lower, but unresolved issues can still hurt delivery.",
            "Repeated weak drafts can reduce sender trust over time.",
            "Fixing issues now prevents future placement decline.",
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

function renderProvider(summary) {
    if (!providerViewListNode) {
        return;
    }

    providerViewListNode.innerHTML = "";
    const results = summary.provider_results || {};
    const map = { content_safe: "Safe", needs_review: "Warning", high_risk_signals: "Critical" };
    let found = 0;

    ["gmail", "outlook", "yahoo"].forEach((provider) => {
        const row = results[provider];
        const li = document.createElement("li");
        const p = provider.charAt(0).toUpperCase() + provider.slice(1);
        if (!row) {
            li.textContent = `${p}: No data`;
        } else {
            found += 1;
            li.textContent = `${p}: ${map[row.status] || "Warning"} | Top issue: ${row.top_issue || "Risk signals"}`;
        }
        providerViewListNode.appendChild(li);
    });

    if (!found) {
        providerViewListNode.innerHTML = "<li>Provider view will appear after analysis.</li>";
    }
}

function renderBreakdown(summary) {
    if (!scoreBreakdownNode) {
        return;
    }

    scoreBreakdownNode.innerHTML = "";
    const penalties = (summary.breakdown || []).filter((x) => Number(x.points) < 0);
    if (!penalties.length) {
        scoreBreakdownNode.innerHTML = "<li>No penalty data yet.</li>";
        return;
    }

    penalties.slice(0, 5).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.label} ${item.points}`;
        scoreBreakdownNode.appendChild(li);
    });
}

function improvedRewrite(text) {
    const body = String(text || "").trim();
    const stripped = body
        .replace(/we'?re excited to introduce[^.]*\.?/gi, "")
        .replace(/what smart mesh delivers[^\n]*/gi, "")
        .replace(/game-ready meshes[^.]*\.?/gi, "")
        .replace(/lightweight geometry[^.]*\.?/gi, "")
        .replace(/scalable asset generation[^.]*\.?/gi, "")
        .trim();

    return `Hi {{FirstName}},\n\nI noticed your team is shipping 3D assets for real-time workflows.\n\nOne thing that may help: we can reduce mesh cleanup time by generating cleaner topology up front.\n\nIf useful, I can share a short 2-step test workflow for your current pipeline.\n\n${stripped ? `Context kept:\n${stripped.slice(0, 240)}...` : ""}`.trim();
}

function showFixTransformation() {
    if (!fixOutput || !beforeEmailNode || !afterEmailNode || !rawEmailInput) {
        return;
    }

    const original = rawEmailInput.value.trim();
    if (!original) {
        showError("Paste an email first so we can fix it.");
        return;
    }

    fixNowButton.disabled = true;
    fixNowButton.textContent = "Fixing...";

    setTimeout(() => {
        const rewritten = improvedRewrite(original);
        beforeEmailNode.textContent = original;
        afterEmailNode.textContent = rewritten;
        rawEmailInput.value = rewritten;

        if (workflowStateNode) {
            workflowStateNode.textContent = "Step 2: Fix complete";
        }
        if (workflowTitleNode) {
            workflowTitleNode.textContent = "Risk reduced - re-run scan to confirm";
        }

        fixOutput.classList.remove("hidden");
        fixOutput.classList.add("fade-in");
        fixOutput.scrollIntoView({ behavior: "smooth", block: "start" });

        fixNowButton.disabled = false;
        fixNowButton.textContent = "Fix Email Now";
    }, 1100);
}

function runQuickRewrite() {
    if (!rawEmailInput) {
        return;
    }

    rawEmailInput.value = improvedRewrite(rawEmailInput.value || "");
}

function addPersonalization() {
    if (!rawEmailInput) {
        return;
    }

    const text = rawEmailInput.value || "";
    rawEmailInput.value = `Hi {{FirstName}},\nI noticed [recipient-specific detail].\n\n${text}`;
}

function checkDomainHealth() {
    if (!analysisModeInput) {
        return;
    }

    analysisModeInput.value = "full";
}

if (fixNowButton) {
    fixNowButton.addEventListener("click", showFixTransformation);
}
if (rewriteActionButton) {
    rewriteActionButton.addEventListener("click", runQuickRewrite);
}
if (personalizeActionButton) {
    personalizeActionButton.addEventListener("click", addPersonalization);
}
if (domainActionButton) {
    domainActionButton.addEventListener("click", checkDomainHealth);
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

        setLoadingState();
        await fakeDelaySequence();

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
                throw new Error("Unable to complete risk scan. Try again.");
            }

            const data = await response.json();
            const summary = data.summary || {};
            const signals = data.signals || {};
            const findings = data.partial_findings || summary.findings || [];

            latestSummary = summary;
            latestFindings = findings;

            renderStatus(summary, signals, findings);
            renderBiggestRisk(findings);
            renderConsequences(summary);
            renderHurting(findings);
            renderFixes(summary);
            renderProvider(summary);
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
        } catch (error) {
            showError(error && error.message ? error.message : "Scan failed.");
            setIdleState();
        }
    });
}

setIdleState();
