const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const rawEmailInput = document.getElementById("raw-email");
const domainInput = document.getElementById("domain");
const analysisModeInput = document.getElementById("analysis-mode");
const submitButton = document.getElementById("run-check");
const resultLoading = document.getElementById("result-loading");
const loadingStep = document.getElementById("loading-step");

const verdictHeadlineNode = document.getElementById("verdict-headline");
const verdictSublineNode = document.getElementById("verdict-subline");
const verdictWarningNode = document.getElementById("verdict-warning");
const findingsNode = document.getElementById("findings");
const topFixesListNode = document.getElementById("top-fixes-list");
const whyMattersListNode = document.getElementById("why-matters-list");
const verdictLabelNode = document.getElementById("verdict-label");
const realWorldRiskNode = document.getElementById("real-world-risk");
const missingFactorsListNode = document.getElementById("missing-factors-list");
const providerViewListNode = document.getElementById("provider-view-list");
const scoreBreakdownWrap = document.getElementById("score-breakdown-wrap");
const scoreBreakdownNode = document.getElementById("score-breakdown");

const resultCta = document.getElementById("result-cta");
const unlockLink = document.getElementById("unlock-link");
const leadEmailInput = document.getElementById("lead-email");
const emailRequestLink = document.getElementById("email-request-link");

const loadingMessages = [
    "Scanning high-risk language...",
    "Checking authentication posture...",
    "Prioritizing fixes before send...",
];

const defaultSubmitLabel = submitButton ? submitButton.textContent : "Check Before You Burn Your Domain";
let loadingTimer = null;

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
        // Analytics must never break user flow.
    });
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => {
        errorBanner.classList.add("hidden");
    }, 4200);
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
    }, 650);
}

function stopLoadingSteps() {
    if (loadingTimer) {
        clearInterval(loadingTimer);
        loadingTimer = null;
    }
}

function setLoadingState(isLoading) {
    if (!resultLoading || !submitButton) {
        return;
    }

    if (isLoading) {
        resultLoading.classList.remove("hidden");
        submitButton.disabled = true;
        submitButton.textContent = "Analyzing...";
        startLoadingSteps();
    } else {
        resultLoading.classList.add("hidden");
        submitButton.disabled = false;
        submitButton.textContent = defaultSubmitLabel;
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

function renderVerdict(summary) {
    if (!verdictHeadlineNode || !verdictSublineNode || !verdictWarningNode) {
        return;
    }

    const label = summary.risk_band || "Needs Review";

    const headlineMap = {
        "Content Safe": "Content Looks Safe - Delivery Risk Can Still Exist",
        "Needs Review": "Moderate Risk - Review Before Sending",
        "High Spam-Risk Signals": "High Risk - Likely Spam",
        "High Risk": "High Risk - Likely Spam",
    };

    const sublineMap = {
        "Content Safe": "No major direct spam triggers found in this draft.",
        "Needs Review": "This draft has risk patterns that can hurt inbox placement.",
        "High Spam-Risk Signals": "Strong risk patterns detected that can trigger bulk or spam filtering.",
        "High Risk": "Strong risk patterns detected that can trigger bulk or spam filtering.",
    };

    verdictHeadlineNode.textContent = headlineMap[label] || "Deliverability risk detected";
    verdictSublineNode.textContent = sublineMap[label] || "This draft contains deliverability risks that should be fixed first.";
    verdictWarningNode.textContent = "Sending this email as-is may hurt your domain reputation.";
}

function renderFindings(findings) {
    if (!findingsNode) {
        return;
    }

    findingsNode.innerHTML = "";

    if (!findings || !findings.length) {
        findingsNode.innerHTML = "<li class=\"card finding-row low\"><p class=\"finding-title\">No critical risks detected</p><p class=\"finding-impact low\">Low Impact</p><p class=\"finding-note\">No major red flags were found in this draft.</p></li>";
        return;
    }

    findings.slice(0, 4).forEach((item) => {
        const severity = item.severity || "medium";
        const impactText = severity === "high" ? "High Impact" : severity === "low" ? "Low Impact" : "Medium Impact";
        const title = item.title || "Risk signal";
        const note = item.issue || item.impact || item.message || "This pattern can reduce inbox trust.";

        const li = document.createElement("li");
        li.className = `card finding-row ${severity}`;
        li.innerHTML = `
            <p class="finding-title">${title}</p>
            <p class="finding-impact ${severity}">${impactText}</p>
            <p class="finding-note">${note}</p>
        `;
        findingsNode.appendChild(li);
    });
}

function renderTopFixes(summary) {
    if (!topFixesListNode) {
        return;
    }

    topFixesListNode.innerHTML = "";
    const fixes = summary.top_fixes || [];

    if (!fixes.length) {
        topFixesListNode.innerHTML = "<li class=\"card\">No urgent action is required for this draft right now.</li>";
        return;
    }

    fixes.slice(0, 3).forEach((fix, index) => {
        const title = fix.title || fix.type || "Fix issue";
        const action = fix.action || "Resolve this signal before sending.";
        const li = document.createElement("li");
        li.className = "card";
        li.innerHTML = `<strong>${index + 1}. ${title}</strong><p>${action}</p>`;
        topFixesListNode.appendChild(li);
    });
}

function renderWhyMatters(summary) {
    if (!whyMattersListNode) {
        return;
    }

    const findings = summary.findings || [];
    whyMattersListNode.innerHTML = "";

    const lines = [];
    if (findings.length) {
        lines.push("Broadcast-style and template signals increase bulk filtering probability.");
        lines.push("Low personalization can reduce trust scores in mailbox filtering systems.");
    }
    lines.push("Authentication or alignment gaps reduce sender trust with providers.");
    lines.push("Ignoring repeated risk patterns can damage domain reputation over time.");

    lines.slice(0, 3).forEach((line) => {
        const li = document.createElement("li");
        li.className = "card";
        li.textContent = line;
        whyMattersListNode.appendChild(li);
    });
}

function renderRealityGap(summary) {
    if (!verdictLabelNode || !realWorldRiskNode || !missingFactorsListNode) {
        return;
    }

    verdictLabelNode.textContent = summary.verdict_label || "Content and technical diagnostic only";
    realWorldRiskNode.textContent = summary.real_world_risk || "Real inbox placement remains uncertain without sender reputation and engagement history.";

    const missing = summary.missing_factors || [];
    missingFactorsListNode.innerHTML = "";
    if (!missing.length) {
        missingFactorsListNode.innerHTML = "<li>Sender reputation history</li><li>Engagement history</li><li>Complaint rates</li>";
        return;
    }

    missing.forEach((factor) => {
        const li = document.createElement("li");
        li.textContent = factor;
        missingFactorsListNode.appendChild(li);
    });
}

function renderProviderView(summary) {
    if (!providerViewListNode) {
        return;
    }

    providerViewListNode.innerHTML = "";
    const providerResults = summary.provider_results || {};

    const statusMap = {
        content_safe: "Content Safe",
        needs_review: "Needs Review",
        high_risk_signals: "High Risk",
    };

    ["gmail", "outlook", "yahoo"].forEach((provider) => {
        const item = providerResults[provider];
        if (!item) {
            return;
        }
        const li = document.createElement("li");
        li.className = "card";
        const providerName = provider.charAt(0).toUpperCase() + provider.slice(1);
        const status = statusMap[item.status] || item.status || "Needs Review";
        li.textContent = `${providerName}: ${status} (top issue: ${item.top_issue || "risk signals detected"})`;
        providerViewListNode.appendChild(li);
    });

    if (!providerViewListNode.children.length) {
        providerViewListNode.innerHTML = "<li class=\"card\">Provider-specific view is unavailable for this input.</li>";
    }
}

function renderBreakdown(summary) {
    if (!scoreBreakdownWrap || !scoreBreakdownNode) {
        return;
    }

    const breakdown = summary.breakdown || [];
    if (!breakdown.length) {
        scoreBreakdownWrap.classList.add("hidden");
        scoreBreakdownNode.innerHTML = "";
        return;
    }

    scoreBreakdownNode.innerHTML = "";
    breakdown.slice(0, 6).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.label}: ${item.points}`;
        scoreBreakdownNode.appendChild(li);
    });
    scoreBreakdownWrap.classList.remove("hidden");
}

if (form) {
    form.addEventListener("submit", async (event) => {
        event.preventDefault();

        const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
        const domainText = domainInput ? domainInput.value.trim() : "";

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
            payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");

            const [response] = await Promise.all([
                fetch("/analyze", {
                    method: "POST",
                    body: payload,
                }),
                sleep(1200),
            ]);

            if (!response.ok) {
                throw new Error("Unable to run risk check. Please try again.");
            }

            const data = await response.json();
            const summary = data.summary || {};

            renderVerdict(summary);
            renderFindings(data.partial_findings || summary.findings || []);
            renderTopFixes(summary);
            renderWhyMatters(summary);
            renderRealityGap(summary);
            renderProviderView(summary);
            renderBreakdown(summary);

            updateLeadLinks(data.domain || domainText);

            if (resultCta) {
                resultCta.classList.remove("hidden");
            }
            if (resultSection) {
                resultSection.classList.remove("hidden");
                resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }

            sendTrackEvent("analyze", "submit", analysisModeInput ? analysisModeInput.value : "content");
        } catch (error) {
            const message = error && error.message ? error.message : "Scan failed.";
            showError(message);
        } finally {
            setLoadingState(false);
        }
    });
}

if (unlockLink) {
    unlockLink.addEventListener("click", () => {
        sendTrackEvent("cta_click", "whatsapp_unlock", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (emailRequestLink) {
    emailRequestLink.addEventListener("click", () => {
        sendTrackEvent("cta_click", "email_request_link", analysisModeInput ? analysisModeInput.value : "");
    });
}

if (leadEmailInput) {
    leadEmailInput.addEventListener("input", () => {
        updateLeadLinks(domainInput ? domainInput.value : "");
    });
}

if (domainInput) {
    domainInput.addEventListener("input", () => {
        updateLeadLinks(domainInput.value);
    });
}

updateLeadLinks(domainInput ? domainInput.value : "");
