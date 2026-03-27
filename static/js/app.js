const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const idleNote = document.getElementById("idle-note");
const scanPanel = document.querySelector(".scan-panel");
const tabFeedbackNode = document.getElementById("tab-feedback");
const dashboardTab = document.getElementById("tab-dashboard");
const threatScanTab = document.getElementById("tab-threat-scan");

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

const workflowStateNode = document.getElementById("workflow-state");
const workflowTitleNode = document.getElementById("workflow-title");
const improvementEstimateNode = document.getElementById("improvement-estimate");
const beliefLineNode = document.getElementById("belief-line");
const rewriteReasonsNode = document.getElementById("rewrite-reasons");
const fixOutput = document.getElementById("fix-output");
const beforeEmailNode = document.getElementById("before-email");
const afterEmailNode = document.getElementById("after-email");
const useFixedButton = document.getElementById("use-fixed");
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
        setTabFeedback("Threat Scan mode active. Paste draft and click Analyze Email Risk.");
    } else {
        dashboardTab.classList.add("active");
        if (scanPanel) {
            scanPanel.classList.remove("focused");
        }
        setTabFeedback("Dashboard mode active.");
    }
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
    const confidence = String(summary.deliverability_confidence || "medium").toLowerCase();
    const mode = String(summary.analysis_mode || "content");
    let infraLabel = "Not Checked";
    if (mode !== "content") {
        const spf = String(signals.spf_status || "unknown");
        const dkim = String(signals.dkim_status || "unknown");
        const dmarc = String(signals.dmarc_status || "unknown");
        infraLabel = spf === "found" && dkim === "found" && dmarc === "found" ? "Healthy" : "Needs Attention";
    }

    let label = "Warning";
    let cls = "warning";

    if (band === "High Spam-Risk Signals" || band === "High Risk") {
        label = "Critical";
        cls = "critical";
    } else if (band === "Content Safe") {
        label = "Safe";
        cls = "safe";
    }

    if (cls === "safe" && (confidence === "low" || infraLabel === "Needs Attention")) {
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

    statusInfraNode.textContent = infraLabel;
}

function renderBiggestRisk(summary, findings) {
    if (!biggestRiskTitleNode || !biggestRiskImpactNode || !biggestRiskDescNode || !biggestRiskCard) {
        return;
    }

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    const top = nonMeta[0];

    if (!top) {
        biggestRiskTitleNode.textContent = "No critical issue detected";
        biggestRiskDescNode.textContent = String(summary.confidence_note || "No high-impact content risk was detected in this draft.");
        setImpactBadge(biggestRiskImpactNode, "LOW");
        biggestRiskCard.classList.remove("card-critical");
        if (trustHookNode) {
            trustHookNode.textContent = "Low-risk state can still depend on sender reputation and infra health.";
        }
        return;
    }

    const title = String(top.title || "risk signal").toLowerCase();
    biggestRiskTitleNode.textContent = title.includes("broadcast")
        ? "This will likely be filtered as spam"
        : (top.title || "Top risk detected");

    const reason = (top.issue || top.impact || "Pattern increases spam filtering risk").split(".")[0];
    biggestRiskDescNode.textContent = `Reason: ${reason}.`;

    const sev = String(top.severity || "medium").toLowerCase();
    const impact = sev === "high" ? "HIGH" : sev === "low" ? "LOW" : "MEDIUM";
    setImpactBadge(biggestRiskImpactNode, impact);

    if (trustHookNode) {
        trustHookNode.textContent = "Pattern matched to bulk-email risk signals.";
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
            "Likely filtered as bulk or spam by mailbox providers.",
            "Inbox placement can drop across future sends.",
            "Domain reputation can degrade if unchanged drafts are sent repeatedly.",
        ]
        : [
            "Current draft is lower-risk, but sender reputation still affects inbox placement.",
            "Repeated weak drafts can still reduce sender trust over time.",
            "Apply fix before send to keep risk low.",
        ];

    lines.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        consequenceListNode.appendChild(li);
    });
}

function renderHurting(summary, findings) {
    if (!hurtListNode) {
        return;
    }

    hurtListNode.innerHTML = "";
    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));

    if (!nonMeta.length) {
        hurtListNode.innerHTML = "<li>No major blocker detected for this draft.</li>";
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

        const response = await fetch("/rewrite", {
            method: "POST",
            body: payload,
        });
        if (!response.ok) {
            throw new Error("Rewrite failed. Try again.");
        }
        const data = await response.json();
        const rewritten = String(data.rewritten_text || original);

        beforeEmailNode.textContent = String(data.original_text || original);
        afterEmailNode.textContent = rewritten;
        rawEmailInput.value = rewritten;

        latestRewriteContext = {
            original_text: String(data.original_text || original),
            rewritten_text: rewritten,
            from_risk_band: String(data.from_risk_band || "Needs Review"),
            to_risk_band: String(data.to_risk_band || "Needs Review"),
            score_delta: Number(data.score_delta || 0),
        };

        if (workflowStateNode) {
            workflowStateNode.textContent = "Step 2: Fix complete";
        }
        if (workflowTitleNode) {
            workflowTitleNode.textContent = "Safer version generated";
        }

        if (improvementEstimateNode) {
            const delta = Number(data.score_delta || 0);
            if (Boolean(data.improvement_visible)) {
                improvementEstimateNode.textContent = `Risk shift: ${data.from_risk_band} -> ${data.to_risk_band} | Score delta: ${delta >= 0 ? "+" : ""}${delta}`;
            } else {
                improvementEstimateNode.textContent = "Rewrite applied with clearer structure. Re-scan in Full mode for deeper risk change.";
            }
        }

        if (beliefLineNode) {
            beliefLineNode.textContent = String(data.belief_line || "This version reduces bulk-email patterns commonly flagged by Gmail and Outlook.");
        }

        if (rewriteReasonsNode) {
            rewriteReasonsNode.innerHTML = "";
            const reasons = Array.isArray(data.rewrite_reasons) ? data.rewrite_reasons : [];
            reasons.slice(0, 4).forEach((reason) => {
                const li = document.createElement("li");
                li.textContent = String(reason);
                rewriteReasonsNode.appendChild(li);
            });
            if (!reasons.length) {
                const li = document.createElement("li");
                li.textContent = "Rewrite generated with lower bulk-email pattern density.";
                rewriteReasonsNode.appendChild(li);
            }
        }

        fixOutput.classList.remove("hidden");
        fixOutput.classList.add("fade-in");
        fixOutput.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        showError(error && error.message ? error.message : "Rewrite failed.");
    }

    fixNowButton.disabled = false;
    fixNowButton.textContent = "Fix Email Now";
}

function useFixedVersion() {
    if (!afterEmailNode || !rawEmailInput) {
        return;
    }
    rawEmailInput.value = afterEmailNode.textContent || rawEmailInput.value;
    showError("Fixed version applied to editor. Re-scan before send.");
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
        showError(`Feedback saved. Model updated with ${samples} sample(s).`);
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
if (fixNowButton) {
    fixNowButton.addEventListener("click", showFixTransformation);
}
if (useFixedButton) {
    useFixedButton.addEventListener("click", useFixedVersion);
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

            latestSummary = summary;
            latestFindings = findings;

            renderStatus(summary, signals, findings);
            renderBiggestRisk(summary, findings);
            renderConsequences(summary);
            renderHurting(summary, findings);
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
        } catch (error) {
            if (loadingTicker) {
                clearInterval(loadingTicker);
            }
            showError(error && error.message ? error.message : "Scan failed.");
            setIdleState();
        }
    });
}

setIdleState();
activateTab("dashboard");
