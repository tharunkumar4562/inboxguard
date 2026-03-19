const form = document.getElementById("risk-form");
const resultSection = document.getElementById("result");
const scoreNode = document.getElementById("score");
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
const scoreBreakdownWrap = document.getElementById("score-breakdown-wrap");
const scoreBreakdownNode = document.getElementById("score-breakdown");
const problemSummary = document.getElementById("problem-summary");
const errorBanner = document.createElement("div");
errorBanner.id = "error-banner";
errorBanner.className = "hidden fixed top-4 left-1/2 -translate-x-1/2 z-50 bg-red-500/90 text-white px-6 py-3 rounded-lg shadow-lg font-semibold";
document.body.appendChild(errorBanner);

const loadingMessages = ["Analyzing SPF...", "Checking DKIM and DMARC...", "Scanning content and sending pattern..."];
let loadingTimer = null;

const pillStyle = {
    "High Risk": {
        cls: "border-red-500/60 bg-red-500/15 text-red-100",
        scoreCls: "text-red-500",
    },
    "Moderate Risk": {
        cls: "border-blue-500/60 bg-blue-500/15 text-blue-100",
        scoreCls: "text-blue-400",
    },
    "Low Risk": {
        cls: "border-emerald-500/60 bg-emerald-500/15 text-emerald-100",
        scoreCls: "text-emerald-400",
    },
};

function renderFindings(findings) {
    findingsNode.innerHTML = "";

    if (!findings || findings.length === 0) {
        findingsNode.innerHTML = '<li class="finding-row low">No major red flags detected in this partial scan.</li>';
        return;
    }

    findings.forEach((item) => {
        const li = document.createElement("li");
        li.className = `finding-row ${item.severity || "medium"}`;
        const title = item.title || "Risk signal";
        const consequence = item.impact || item.issue || item.message || "Deliverability may be affected.";

        li.innerHTML = `
      <p class="finding-title">${title}</p>
      <p><span class="finding-label">Consequence:</span> ${consequence}</p>
    `;
        findingsNode.appendChild(li);
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
        bandNode.textContent = "Running pre-send diagnostics...";
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
    const variant = pillStyle[label] || pillStyle["High Risk"];

    scoreNode.textContent = `${summary.score}/100`;
    bandNode.textContent = "Your email has issues that can push it to spam. Fixes are locked.";

    scoreNode.classList.remove("text-red-500", "text-blue-400", "text-emerald-400");
    scoreNode.classList.add(variant.scoreCls);

    riskPill.className = `rounded-full border px-4 py-1 text-sm font-semibold ${variant.cls}`;
    riskPill.textContent = label;

    if (problemSummary) {
        problemSummary.classList.remove("hidden");
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
    breakdown.slice(0, 5).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `- ${item.label} (-${item.points}): ${item.reason}`;
        scoreBreakdownNode.appendChild(li);
    });
    scoreBreakdownWrap.classList.remove("hidden");
}

function extractSubjectFromRawClient(rawText) {
    const subjectMatch = rawText.match(/^\s*Subject:\s*(.+)$/im);
    if (subjectMatch && subjectMatch[1]) {
        return subjectMatch[1].trim();
    }

    const lines = rawText.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!lines.length) {
        return "";
    }

    const likelyHeader = /^(from|to|cc|bcc|date):/i;
    const firstContentLine = lines.find((line) => !likelyHeader.test(line));
    return firstContentLine ? firstContentLine.slice(0, 120) : "";
}

function extractDomainFromRawClient(rawText) {
    const fromMatch = rawText.match(/^\s*From:\s*(?:.*<)?[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})>?/im);
    if (fromMatch && fromMatch[1]) {
        return fromMatch[1].toLowerCase();
    }

    const emailMatch = rawText.match(/[A-Z0-9._%+-]+@([A-Z0-9.-]+\.[A-Z]{2,})/i);
    return emailMatch && emailMatch[1] ? emailMatch[1].toLowerCase() : "";
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const quickText = emailQuickInput ? emailQuickInput.value.trim() : "";
    const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
    const domainText = domainInput ? domainInput.value.trim() : "";

    // Single Source of Truth: determine what gets sent
    let useRawEmail = rawText.length > 20; // min sanity check
    let useManualFields = !useRawEmail && (quickText || domainText);

    // Validation: must have at least one valid source
    if (!useRawEmail && !useManualFields) {
        showError("Add an email to scan (paste full email or enter subject/domain)");
        return;
    }

    // Ensure fallback extraction for raw email
    let finalRawEmail = rawText;
    let finalEmail = quickText;
    let finalDomain = domainText;

    if (useRawEmail) {
        // If using raw email, guarantee subject and domain extraction before sending
        if (!finalEmail) {
            finalEmail = extractSubjectFromRawClient(finalRawEmail) || "No subject detected";
        }
        if (!finalDomain) {
            finalDomain = extractDomainFromRawClient(finalRawEmail) || "";
        }
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
        }

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
        submitButton.textContent = "Scan Before You Send";
    }
});

leadEmailInput.addEventListener("input", () => {
    updateLeadLinks(domainInput ? domainInput.value : "");
});

if (rawEmailInput) {
    rawEmailInput.addEventListener("input", () => {
        const rawText = rawEmailInput.value.trim();
        if (!rawText) {
            return;
        }

        // Always overwrite IF source = paste (never leave stale data)
        const subject = extractSubjectFromRawClient(rawText);
        if (subject && emailQuickInput) {
            emailQuickInput.value = subject;
            emailQuickInput.title = "Auto-filled from pasted email";
        }

        const detectedDomain = extractDomainFromRawClient(rawText);
        if (detectedDomain && domainInput) {
            domainInput.value = detectedDomain;
            domainInput.title = "Auto-filled from pasted email";
            updateLeadLinks(detectedDomain);
        }
    });
}

if (domainInput) {
    domainInput.addEventListener("input", () => {
        updateLeadLinks(domainInput.value);
    });
}

updateLeadLinks(domainInput ? domainInput.value : "");
