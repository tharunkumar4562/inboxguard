const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const scoreNode = document.getElementById("score");
const scoreBarFill = document.getElementById("score-bar-fill");
const bandNode = document.getElementById("risk-band");
const findingsNode = document.getElementById("findings");
const riskPill = document.getElementById("risk-pill");
const submitButton = document.getElementById("run-check");
const unlockLink = document.getElementById("unlock-link");
const leadEmailInput = document.getElementById("lead-email");
const emailRequestLink = document.getElementById("email-request-link");
const resultLoading = document.getElementById("result-loading");
const resultCta = document.getElementById("result-cta");
const loadingStep = document.getElementById("loading-step");
const lockedFixes = document.getElementById("locked-fixes");
const emailQuickInput = document.getElementById("email-quick");
const rawEmailInput = document.getElementById("raw-email");
const domainInput = document.getElementById("domain");
const manualBodyInput = document.getElementById("manual-body");
const analysisModeInput = document.getElementById("analysis-mode");
const pasteModeWrap = document.getElementById("paste-mode-wrap");
const manualModeWrap = document.getElementById("manual-mode-wrap");
const switchToManual = document.getElementById("switch-to-manual");
const switchToPaste = document.getElementById("switch-to-paste");
const scoreBreakdownWrap = document.getElementById("score-breakdown-wrap");
const scoreBreakdownNode = document.getElementById("score-breakdown");
const contentScoreNode = document.getElementById("content-score-value");
const infraImpactNode = document.getElementById("infra-impact-value");
const finalScoreNode = document.getElementById("final-score-value");
const problemSummary = document.getElementById("problem-summary");
const analysisModeNote = document.getElementById("analysis-mode-note");
const capabilityNoteNode = document.getElementById("capability-note");
const confidenceValueNode = document.getElementById("confidence-value");
const confidenceNoteNode = document.getElementById("confidence-note");
const topFixesListNode = document.getElementById("top-fixes-list");
const providerViewListNode = document.getElementById("provider-view-list");
const errorBanner = document.createElement("div");
errorBanner.id = "error-banner";
errorBanner.className = "hidden fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-3 rounded-lg shadow-lg font-semibold";
document.body.appendChild(errorBanner);

const loadingMessages = ["Analyzing SPF...", "Checking DKIM and DMARC...", "Scanning content and sending pattern..."];
let loadingTimer = null;
let currentInputMode = "paste";

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
        // Fire-and-forget analytics should not affect UX.
    });
}

const pillStyle = {
    "High Risk": {
        cls: "border-red-500/60 bg-red-500/15 text-red-100",
        scoreCls: "text-red-500",
    },
    "⚠️ May hit Promotions/Spam": {
        cls: "border-yellow-500/60 bg-yellow-500/15 text-yellow-100",
        scoreCls: "text-yellow-400",
    },
    "Likely Inbox": {
        cls: "border-emerald-500/60 bg-emerald-500/15 text-emerald-100",
        scoreCls: "text-emerald-400",
    },
    "❌ Likely Spam": {
        cls: "border-red-500/60 bg-red-500/15 text-red-100",
        scoreCls: "text-red-500",
    },
};

function renderFindings(findings) {
    findingsNode.innerHTML = "";

    if (!findings || findings.length === 0) {
        findingsNode.innerHTML = '<li class="finding-row low">No major red flags detected from the provided content.</li>';
        return;
    }

    findings.forEach((item) => {
        const li = document.createElement("li");
        li.className = `finding-row ${item.severity || "medium"}`;
        const title = item.title || "Signal";
        const consequence = item.impact || item.issue || item.message || "Deliverability may be affected.";

        li.innerHTML = `
            <p class="finding-title">- ${title}</p>
            <p>${consequence}</p>
    `;
        findingsNode.appendChild(li);
    });
}

function renderDetectedSignals(signals) {
    const detectedNode = document.getElementById("detected-signals");
    if (!detectedNode) {
        return;
    }

    detectedNode.innerHTML = "";

    if (!signals || signals.length === 0) {
        detectedNode.innerHTML = '<li>No specific signals detected</li>';
        return;
    }

    signals.forEach((signal) => {
        const li = document.createElement("li");
        li.textContent = signal;
        detectedNode.appendChild(li);
    });
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => {
        errorBanner.classList.add("hidden");
    }, 4000);
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
    }, 580);
}

function stopLoadingSteps() {
    if (loadingTimer) {
        clearInterval(loadingTimer);
        loadingTimer = null;
    }
}

function setLoadingState(isLoading) {
    if (isLoading) {
        resultLoading.classList.remove("hidden");
        resultCta.classList.add("hidden");
        if (lockedFixes) {
            lockedFixes.classList.add("hidden");
        }
        findingsNode.innerHTML = "";
        bandNode.textContent = "Analyzing your email...";
        if (analysisModeNote) {
            analysisModeNote.textContent = "Preparing mode-specific analysis...";
        }
        scoreNode.textContent = "Calculating...";
        if (problemSummary) {
            problemSummary.classList.add("hidden");
        }
        startLoadingSteps();
        return;
    }
    resultLoading.classList.add("hidden");
    stopLoadingSteps();
}

function updateLeadLinks(domain) {
    const cleanDomain = (domain || "yourdomain.com").trim();
    const waText = encodeURIComponent(`I want to unlock the full report for ${cleanDomain}`);
    unlockLink.href = `https://wa.me/?text=${waText}`;

    const email = (leadEmailInput.value || "").trim() || "you@company.com";
    const subject = encodeURIComponent("InboxGuard Full Fix Report Request");
    const body = encodeURIComponent(`Domain: ${cleanDomain}\nEmail: ${email}`);
    emailRequestLink.href = `mailto:inboxguard.beta@gmail.com?subject=${subject}&body=${body}`;
}

function renderRisk(summary) {
    const label = summary.risk_band;
    const variant = pillStyle[label] || pillStyle["❌ Likely Spam"];

    scoreNode.textContent = `${summary.score}/100`;

    const emailType = summary.email_type || "email";
    const emailTypeConfidence = summary.email_type_confidence || 72;
    const modeLabel = summary.analysis_mode_label || "Content Only";
    const modeDetail = summary.analysis_mode_note || "Based on content signals only.";
    const capabilityNote = summary.capability_note || "Based on content + domain checks only (no real inbox placement testing).";

    bandNode.textContent = `Heuristic risk index: ${summary.score}/100 (not inbox probability) • Email type: ${emailType} (${emailTypeConfidence}%)`;
    if (analysisModeNote) {
        analysisModeNote.textContent = `${modeLabel}: ${modeDetail}`;
    }
    if (capabilityNoteNode) {
        capabilityNoteNode.textContent = capabilityNote;
    }
    if (confidenceValueNode) {
        const confidence = (summary.deliverability_confidence || "medium").toUpperCase();
        confidenceValueNode.textContent = confidence;
    }
    if (confidenceNoteNode) {
        confidenceNoteNode.textContent = summary.confidence_note || "Confidence depends on available authentication evidence.";
    }

    scoreNode.classList.remove("text-red-500", "text-blue-400", "text-emerald-400", "text-yellow-400");
    scoreNode.classList.add(variant.scoreCls);

    if (scoreBarFill) {
        const clamped = Math.max(0, Math.min(100, Number(summary.score) || 0));
        scoreBarFill.style.width = `${clamped}%`;
    }

    riskPill.className = `rounded-full border px-4 py-1 text-sm font-semibold ${variant.cls}`;
    riskPill.textContent = label;

    if (problemSummary) {
        problemSummary.classList.remove("hidden");
    }
}

function renderTopFixes(summary) {
    if (!topFixesListNode) {
        return;
    }

    topFixesListNode.innerHTML = "";
    const fixes = summary.top_fixes || [];
    if (!fixes.length) {
        topFixesListNode.innerHTML = "<li>- No urgent fixes identified for this input.</li>";
        return;
    }

    fixes.forEach((item) => {
        const li = document.createElement("li");
        const impact = Math.round((Number(item.impact) || 0) * 100);
        const title = item.title || item.type || "Issue";
        const why = item.why || "This can reduce deliverability confidence.";
        const action = item.action || "Review and resolve before sending.";
        li.textContent = `- ${title} (${impact}% impact) | Why: ${why} | Fix: ${action}`;
        topFixesListNode.appendChild(li);
    });
}

function renderProviderView(summary) {
    if (!providerViewListNode) {
        return;
    }

    providerViewListNode.innerHTML = "";
    const providerResults = summary.provider_results || {};
    const providers = ["gmail", "outlook", "yahoo"];

    providers.forEach((provider) => {
        const data = providerResults[provider];
        if (!data) {
            return;
        }

        const li = document.createElement("li");
        const label = provider.charAt(0).toUpperCase() + provider.slice(1);
        li.textContent = `- ${label}: ${data.status} (${data.score}/100), top issue: ${data.top_issue}`;
        providerViewListNode.appendChild(li);
    });

    if (!providerViewListNode.children.length) {
        providerViewListNode.innerHTML = "<li>- Provider-specific breakdown unavailable for this mode/input.</li>";
    }
}

function setInputMode(mode) {
    currentInputMode = mode;

    if (pasteModeWrap && manualModeWrap) {
        if (mode === "paste") {
            pasteModeWrap.classList.remove("hidden");
            manualModeWrap.classList.add("hidden");
            if (rawEmailInput) {
                rawEmailInput.disabled = false;
            }
            if (emailQuickInput) {
                emailQuickInput.disabled = true;
            }
            if (domainInput) {
                domainInput.disabled = true;
            }
            if (manualBodyInput) {
                manualBodyInput.disabled = true;
            }
            if (submitButton) {
                submitButton.textContent = "Check Deliverability Risk ->";
            }
        } else {
            manualModeWrap.classList.remove("hidden");
            pasteModeWrap.classList.add("hidden");
            if (rawEmailInput) {
                rawEmailInput.disabled = true;
            }
            if (emailQuickInput) {
                emailQuickInput.disabled = false;
            }
            if (domainInput) {
                domainInput.disabled = false;
            }
            if (manualBodyInput) {
                manualBodyInput.disabled = false;
            }
            if (submitButton) {
                submitButton.textContent = "Check Deliverability Risk ->";
            }
        }
    }
}

function renderBreakdown(summary) {
    if (!scoreBreakdownWrap || !scoreBreakdownNode) {
        return;
    }

    const breakdown = summary.breakdown || [];
    const contentScore = summary.content_score;
    const infraImpact = summary.infra_impact;
    const finalScore = summary.final_score || summary.score;

    if (contentScoreNode) {
        contentScoreNode.textContent = Number.isFinite(Number(contentScore)) ? `${contentScore}/100` : "-";
    }
    if (infraImpactNode) {
        const infraNumber = Number(infraImpact);
        infraImpactNode.textContent = Number.isFinite(infraNumber) ? `${infraNumber}` : "0";
    }
    if (finalScoreNode) {
        finalScoreNode.textContent = Number.isFinite(Number(finalScore)) ? `${finalScore}/100` : "-";
    }

    if (!breakdown.length) {
        scoreBreakdownWrap.classList.add("hidden");
        scoreBreakdownNode.innerHTML = "";
        return;
    }

    scoreBreakdownNode.innerHTML = "";
    breakdown.slice(0, 5).forEach((item) => {
        const li = document.createElement("li");
        const points = Number(item.points) || 0;
        const sign = points >= 0 ? "+" : "";
        li.textContent = `- ${item.label} (${sign}${points}): ${item.reason}`;
        scoreBreakdownNode.appendChild(li);
    });
    scoreBreakdownWrap.classList.remove("hidden");
}


form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const quickText = emailQuickInput ? emailQuickInput.value.trim() : "";
    const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
    const domainText = domainInput ? domainInput.value.trim() : "";
    const manualBodyText = manualBodyInput ? manualBodyInput.value.trim() : "";
    const manualSubjectText = quickText;

    const useRawEmail = currentInputMode === "paste";
    const useManualFields = currentInputMode === "manual";

    if (useRawEmail && rawText.length < 20) {
        showError("Paste a full email to scan");
        return;
    }

    if (useManualFields && !quickText && !domainText && !manualBodyText) {
        showError("Enter subject, domain, or body in manual mode");
        return;
    }

    let finalRawEmail = rawText;
    let finalEmail = quickText;
    let finalDomain = domainText;
    const selectedMode = analysisModeInput ? analysisModeInput.value : "content";
    if (useManualFields && manualBodyText) {
        const subjectLine = finalEmail || "No subject";
        finalEmail = `Subject: ${subjectLine}\n\n${manualBodyText}`;
    }

    submitButton.disabled = true;
    submitButton.textContent = "Analyzing...";
    resultSection.classList.remove("hidden");
    resultSection.classList.add("visible");
    setLoadingState(true);

    try {
        // Construct payload based on source of truth
        const payload = new FormData();

        if (useRawEmail) {
            // ONLY send raw_email, ignore manual fields
            payload.set("raw_email", finalRawEmail);
        } else {
            // ONLY send manual fields, no raw_email
            payload.set("email", finalEmail);
            payload.set("domain", finalDomain);
            payload.set("manual_subject", manualSubjectText);
            payload.set("manual_body", manualBodyText);
        }
        payload.set("analysis_mode", selectedMode);

        const [response] = await Promise.all([
            fetch("/analyze", {
                method: "POST",
                body: payload,
            }),
            sleep(2000),
        ]);

        if (!response.ok) {
            throw new Error("Unable to run risk check. Please try again.");
        }

        const data = await response.json();
        renderRisk(data.summary);
        renderBreakdown(data.summary);
        renderTopFixes(data.summary);
        renderProviderView(data.summary);
        renderDetectedSignals(data.summary.detected_signals);
        renderFindings(data.partial_findings);
        updateLeadLinks(data.domain);
        if (lockedFixes) {
            lockedFixes.classList.remove("hidden");
        }
        resultCta.classList.remove("hidden");
        setLoadingState(false);

        resultSection.classList.remove("hidden");
        resultSection.classList.add("visible");
        resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        setLoadingState(false);
        if (scoreBreakdownWrap) {
            scoreBreakdownWrap.classList.add("hidden");
        }
        if (problemSummary) {
            problemSummary.classList.add("hidden");
        }
        findingsNode.innerHTML = `<li class="finding-row high">${error.message}</li>`;
        scoreNode.textContent = "Not available";
        bandNode.textContent = "Scan failed.";
        updateLeadLinks(document.getElementById("domain").value);
        resultSection.classList.remove("hidden");
        resultSection.classList.add("visible");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Check Deliverability Risk ->";
    }
});

leadEmailInput.addEventListener("input", () => {
    updateLeadLinks(domainInput ? domainInput.value : "");
});

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

if (domainInput) {
    domainInput.addEventListener("input", () => {
        updateLeadLinks(domainInput.value);
    });
}

if (switchToManual) {
    switchToManual.addEventListener("click", () => setInputMode("manual"));
}

if (switchToPaste) {
    switchToPaste.addEventListener("click", () => setInputMode("paste"));
}

if (rawEmailInput) {
    rawEmailInput.addEventListener("input", () => {
        if (rawEmailInput.value.trim()) {
            setInputMode("paste");
        }
    });
}

if (emailQuickInput) {
    emailQuickInput.addEventListener("input", () => {
        if (emailQuickInput.value.trim()) {
            setInputMode("manual");
        }
    });
}

if (manualBodyInput) {
    manualBodyInput.addEventListener("input", () => {
        if (manualBodyInput.value.trim()) {
            setInputMode("manual");
        }
    });
}

updateLeadLinks(domainInput ? domainInput.value : "");
setInputMode("paste");
