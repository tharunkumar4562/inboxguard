(function commandCenterBootstrap() {
    const analyzeBtn = document.getElementById("analyzeBtn");
    const emailInput = document.getElementById("emailInput");
    const analysisMode = document.getElementById("analysisMode");
    const rewriteStyle = document.getElementById("rewriteStyle");

    if (!analyzeBtn || !emailInput) {
        return;
    }

    const steps = Array.from(document.querySelectorAll(".step"));
    const analysisSteps = document.getElementById("analysisSteps");

    const decisionBlock = document.getElementById("decisionBlock");
    const decisionText = document.getElementById("decisionText");
    const decisionSub = document.getElementById("decisionSub");
    const primaryIssue = document.getElementById("primaryIssue");
    const learningAdjustmentsNode = document.getElementById("learningAdjustments");

    const beforeBox = document.getElementById("beforeBox");
    const afterBox = document.getElementById("afterBox");
    const useRewrite = document.getElementById("useRewrite");
    const changeTags = document.getElementById("changeTags");

    const feedbackInbox = document.getElementById("feedbackInbox");
    const feedbackSpam = document.getElementById("feedbackSpam");
    const feedbackNotSure = document.getElementById("feedbackNotSure");
    const feedbackState = document.getElementById("feedbackState");

    const fullscreen = document.getElementById("fullscreenDecision");
    const fsDecision = document.getElementById("fsDecision");
    const fsSub = document.getElementById("fsSub");

    const defaultAnalyzeLabel = analyzeBtn.textContent;

    let latestDecision = "";
    let latestRewriteStyle = "balanced";
    let latestFromBand = "";
    let latestToBand = "";
    let latestFromScore = 0;
    let latestToScore = 0;

    function delay(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }

    function resetUI() {
        steps.forEach((step) => step.classList.remove("active"));
        analysisSteps.classList.add("hidden");
        decisionBlock.classList.add("hidden");
        decisionBlock.classList.remove("fade-in");
        decisionText.className = "text-5xl font-bold mb-4";
        decisionText.textContent = "";
        decisionSub.textContent = "";
        primaryIssue.textContent = "";
        if (learningAdjustmentsNode) {
            learningAdjustmentsNode.innerHTML = "";
        }
        beforeBox.textContent = "";
        afterBox.textContent = "";
        changeTags.innerHTML = "";
        feedbackState.textContent = "";
        useRewrite.classList.add("hidden");

        latestDecision = "";
        latestFromBand = "";
        latestToBand = "";
        latestFromScore = 0;
        latestToScore = 0;
    }

    function lockAnalysisState(locked) {
        analyzeBtn.disabled = locked;
        analyzeBtn.textContent = locked ? "Analyzing..." : defaultAnalyzeLabel;
        document.body.style.overflow = locked ? "hidden" : "auto";
    }

    function buildErrorMessage(rawDetail) {
        const detail = String(rawDetail || "").toUpperCase();
        if (detail === "AUTH_REQUIRED") {
            return "Free scans are used up. Sign in to continue analysis.";
        }
        if (detail === "SUBSCRIPTION_REQUIRED" || detail === "FREE_PLAN_LIMIT_REACHED") {
            return "Your current plan limit is reached. Upgrade to continue.";
        }
        return "Analysis failed. Try again in a moment.";
    }

    async function parseError(response) {
        try {
            const payload = await response.json();
            return buildErrorMessage(payload.detail || "");
        } catch (_error) {
            return "Analysis failed. Please retry.";
        }
    }

    async function analyzeEmail(rawEmailValue) {
        const formData = new FormData();
        formData.append("raw_email", rawEmailValue);
        formData.append("analysis_mode", analysisMode ? analysisMode.value : "full");

        const response = await fetch("/analyze", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error(await parseError(response));
        }

        return response.json();
    }

    async function rewriteEmail(rawEmailValue) {
        const selectedStyle = rewriteStyle ? rewriteStyle.value : "balanced";
        const formData = new FormData();
        formData.append("raw_email", rawEmailValue);
        formData.append("analysis_mode", analysisMode ? analysisMode.value : "full");
        formData.append("rewrite_style", selectedStyle);

        const response = await fetch("/rewrite", {
            method: "POST",
            body: formData,
        });

        if (!response.ok) {
            throw new Error("Rewrite failed. Try another style.");
        }

        latestRewriteStyle = selectedStyle;
        return response.json();
    }

    function normalizeDecision(payload) {
        const summary = payload.summary || {};
        const prediction = payload.prediction || {};

        const decision = prediction.decision || "TEST FIRST";
        const inboxProbability = Number(prediction.inbox_probability || 0);
        const issue = summary.primary_issue || "No primary issue identified.";

        latestDecision = decision;
        latestFromBand = String(summary.risk_band || "");
        latestFromScore = Number(summary.final_score || summary.score || 0);

        return {
            decision,
            probability: Number.isFinite(inboxProbability) ? inboxProbability : 0,
            primaryIssue: issue,
            learningAdjustments: Array.isArray(summary.learning_adjustments) ? summary.learning_adjustments : [],
            learningDelta: Number(summary.learning_delta || 0),
        };
    }

    function renderLearningAdjustments(items, learningDelta) {
        if (!learningAdjustmentsNode) {
            return;
        }

        if (!Array.isArray(items) || items.length === 0) {
            learningAdjustmentsNode.innerHTML = "";
            return;
        }

        const header =
            "<div class='text-xs text-slate-300 mb-1'>Adaptive scoring impact: " +
            (learningDelta > 0 ? "+" : "") +
            String(learningDelta) +
            "</div>";

        const rows = items
            .map((item) => {
                const impact = Number(item.impact || 0);
                const sign = impact > 0 ? "+" : "";
                const reason = String(item.reason || "Learning-based adjustment");
                return "<div class='mb-1'><span class='font-semibold'>" +
                    String(item.pattern || "pattern") +
                    ": " +
                    sign +
                    String(impact) +
                    "</span> -> " +
                    reason +
                    "</div>";
            })
            .join("");

        learningAdjustmentsNode.innerHTML = header + rows;
    }

    function showError(message) {
        analysisSteps.classList.add("hidden");
        decisionBlock.classList.remove("hidden");
        decisionBlock.classList.add("fade-in");
        decisionText.textContent = "ERROR";
        decisionText.className = "text-5xl font-bold mb-4 text-yellow-400";
        decisionSub.textContent = message;
        primaryIssue.textContent = "";
    }

    function showDecision(model) {
        analysisSteps.classList.add("hidden");

        decisionBlock.classList.remove("hidden");
        decisionBlock.classList.add("fade-in");

        decisionText.textContent = model.decision;

        if (model.decision === "DO NOT SEND") {
            decisionText.className = "text-5xl font-bold mb-4 text-red-500";
        } else if (model.decision === "SAFE TO SEND") {
            decisionText.className = "text-5xl font-bold mb-4 text-green-500";
        } else {
            decisionText.className = "text-5xl font-bold mb-4 text-yellow-400";
        }

        decisionSub.textContent = "Estimated inbox: " + model.probability.toFixed(1) + "%";
        primaryIssue.textContent = "Main issue: " + model.primaryIssue;
        renderLearningAdjustments(model.learningAdjustments, model.learningDelta);

        fullscreen.classList.remove("hidden");
        fsDecision.textContent = model.decision;
        fsSub.textContent = decisionSub.textContent;

        window.setTimeout(() => {
            fullscreen.classList.add("hidden");
        }, 1500);
    }

    function renderChanges(changes) {
        changeTags.innerHTML = "";
        changes.forEach((change) => {
            const tag = document.createElement("span");
            tag.className = "bg-green-500/20 text-green-300 text-xs px-2 py-1 rounded";
            tag.textContent = change;
            changeTags.appendChild(tag);
        });
    }

    function showRewrite(rewritePayload, originalText) {
        beforeBox.textContent = rewritePayload.original_text || originalText;
        afterBox.textContent = rewritePayload.rewritten_text || "No rewrite generated.";

        const changes = Array.isArray(rewritePayload.rewrite_changes)
            ? rewritePayload.rewrite_changes
            : ["Rewrite completed with structure and tone improvements."];
        renderChanges(changes);

        latestToBand = String(rewritePayload.to_risk_band || latestFromBand || "");
        latestToScore = Number(rewritePayload.to_score || latestFromScore || 0);
        latestRewriteStyle = String(rewritePayload.rewrite_style || latestRewriteStyle || "balanced");

        useRewrite.classList.remove("hidden");
    }

    async function sendFeedback(outcome) {
        const originalText = beforeBox.textContent || "";
        const rewrittenText = afterBox.textContent || "";

        if (!originalText.trim() || !rewrittenText.trim()) {
            feedbackState.textContent = "Run analysis and rewrite before sending feedback.";
            return;
        }

        feedbackState.textContent = "Saving feedback...";

        const payload = new URLSearchParams({
            outcome,
            original_text: originalText,
            rewritten_text: rewrittenText,
            rewrite_style: latestRewriteStyle || "balanced",
            decision: latestDecision,
            from_risk_band: latestFromBand,
            to_risk_band: latestToBand,
            from_score: String(latestFromScore || 0),
            to_score: String(latestToScore || 0),
        });

        try {
            const response = await fetch("/feedback", {
                method: "POST",
                body: payload,
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
            });
            if (!response.ok) {
                throw new Error("Feedback save failed");
            }
            feedbackState.textContent = "Feedback saved. Model updated.";
        } catch (_error) {
            feedbackState.textContent = "Feedback failed. Try again.";
        }
    }

    feedbackInbox.addEventListener("click", () => sendFeedback("inbox"));
    feedbackSpam.addEventListener("click", () => sendFeedback("spam"));
    feedbackNotSure.addEventListener("click", () => sendFeedback("not_sure"));

    useRewrite.addEventListener("click", async () => {
        const rewritten = afterBox.textContent || "";
        if (!rewritten.trim()) {
            return;
        }
        try {
            await navigator.clipboard.writeText(rewritten);
            useRewrite.textContent = "Copied";
            window.setTimeout(() => {
                useRewrite.textContent = "Send Safer Version";
            }, 1200);
        } catch (_error) {
            useRewrite.textContent = "Copy failed";
            window.setTimeout(() => {
                useRewrite.textContent = "Send Safer Version";
            }, 1200);
        }
    });

    analyzeBtn.addEventListener("click", async () => {
        const email = (emailInput.value || "").trim();
        if (!email) {
            showError("Paste your email first.");
            return;
        }

        resetUI();
        lockAnalysisState(true);
        analysisSteps.classList.remove("hidden");

        try {
            for (let index = 0; index < steps.length; index += 1) {
                await delay(350);
                steps[index].classList.add("active");
            }

            const analysisPayload = await analyzeEmail(email);
            const decision = normalizeDecision(analysisPayload);
            showDecision(decision);

            const rewritePayload = await rewriteEmail(email);
            showRewrite(rewritePayload, email);
        } catch (error) {
            showError(error && error.message ? error.message : "Analysis failed. Try again.");
        } finally {
            lockAnalysisState(false);
        }
    });
})();
