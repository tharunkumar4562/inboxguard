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
        bandNode.textContent = "We will show what is hurting your deliverability. Fixes are hidden.";
        scoreNode.textContent = "--";
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
    bandNode.textContent = `${label} - based on this pre-send sample.`;

    scoreNode.classList.remove("text-red-500", "text-blue-400", "text-emerald-400");
    scoreNode.classList.add(variant.scoreCls);

    riskPill.className = `rounded-full border px-4 py-1 text-sm font-semibold ${variant.cls}`;
    riskPill.textContent = label;
}

form.addEventListener("submit", async (event) => {
    event.preventDefault();

    submitButton.disabled = true;
    submitButton.textContent = "Analyzing...";
    setLoadingState(true);

    try {
        const formData = new FormData(form);
        const [response] = await Promise.all([
            fetch("/analyze", {
                method: "POST",
                body: formData,
            }),
            sleep(2000),
        ]);

        if (!response.ok) {
            throw new Error("Unable to run risk check. Please try again.");
        }

        const data = await response.json();
        renderRisk(data.summary);
        renderFindings(data.partial_findings);
        updateLeadLinks(data.domain);
        if (lockedFixes) {
            lockedFixes.classList.remove("hidden");
        }
        resultCta.classList.remove("hidden");
        setLoadingState(false);

        resultSection.classList.add("visible");
        resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch (error) {
        setLoadingState(false);
        findingsNode.innerHTML = `<li class="finding-row high">${error.message}</li>`;
        scoreNode.textContent = "--";
        bandNode.textContent = "Scan failed.";
        updateLeadLinks(document.getElementById("domain").value);
        resultSection.classList.add("visible");
    } finally {
        submitButton.disabled = false;
        submitButton.textContent = "Check My Email Risk";
    }
});

leadEmailInput.addEventListener("input", () => {
    updateLeadLinks(document.getElementById("domain").value);
});

updateLeadLinks(document.getElementById("domain").value);
