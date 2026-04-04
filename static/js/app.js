(function progressiveCommandCenter() {
    const analyzeBtn = document.getElementById("analyzeBtn");
    const emailInput = document.getElementById("emailInput");
    const analysisMode = document.getElementById("analysisMode");
    const rewriteStyle = document.getElementById("rewriteStyle");

    if (!analyzeBtn || !emailInput) {
        return;
    }

    const stepsWrap = document.getElementById("analysisSteps");
    const steps = Array.from(document.querySelectorAll(".step"));
    const progressBar = document.getElementById("progressBar");

    const decisionBlock = document.getElementById("decisionBlock");
    const decisionText = document.getElementById("decisionText");
    const decisionSub = document.getElementById("decisionSub");
    const decisionPrimaryText = document.getElementById("decisionPrimaryText");
    const learningAdjustments = document.getElementById("learningAdjustments");

    const riskStatusValue = document.getElementById("riskStatusValue");
    const primaryIssueValue = document.getElementById("primaryIssueValue");
    const confidenceValue = document.getElementById("confidenceValue");
    const infraValue = document.getElementById("infraValue");
    const biggestRiskValue = document.getElementById("biggestRiskValue");

    const beforeBox = document.getElementById("beforeBox");
    const afterBox = document.getElementById("afterBox");
    const changeTags = document.getElementById("changeTags");
    const useRewrite = document.getElementById("useRewrite");

    const rewardBox = document.getElementById("rewardBox");
    const rewardText = document.getElementById("rewardText");
    const successBadge = document.getElementById("successBadge");

    const feedbackInbox = document.getElementById("feedbackInbox");
    const feedbackSpam = document.getElementById("feedbackSpam");
    const feedbackNotSure = document.getElementById("feedbackNotSure");
    const feedbackState = document.getElementById("feedbackState");

    const overlay = document.getElementById("decisionOverlay");
    const overlayText = document.getElementById("decisionOverlayText");

    const winCounter = document.getElementById("winCounter");
    const streak = document.getElementById("streak");
    const nextAction = document.getElementById("nextAction");

    const defaultAnalyze = analyzeBtn.textContent;
    const APP_WINS = "ig_wins";
    const APP_STREAK = "ig_streak";

    let latestDecision = "";
    let latestRewriteStyle = "balanced";
    let latestFromBand = "";
    let latestToBand = "";
    let latestFromScore = 0;
    let latestToScore = 0;

    function spring({ from, to, stiffness = 0.08, damping = 0.8, onUpdate }) {
        let position = Number(from || 0);
        let velocity = 0;

        function frame() {
            const force = (to - position) * stiffness;
            velocity = velocity * damping + force;
            position += velocity;
            onUpdate(position);
            if (Math.abs(velocity) > 0.001 || Math.abs(to - position) > 0.001) {
                requestAnimationFrame(frame);
            } else {
                onUpdate(to);
            }
        }

        requestAnimationFrame(frame);
    }

    function animateDecision(el) {
        spring({
            from: 0.8,
            to: 1,
            onUpdate: (scale) => {
                el.style.transform = `scale(${scale})`;
                el.style.opacity = String(Math.max(0.2, Math.min(1, scale)));
            },
        });
    }

    function slideIn(el) {
        spring({
            from: 100,
            to: 0,
            stiffness: 0.06,
            damping: 0.75,
            onUpdate: (x) => {
                el.style.transform = `translateX(${x}px)`;
                el.style.opacity = String(1 - Math.min(1, x / 100));
            },
        });
    }

    function revealText(el, text) {
        if (!el) {
            return;
        }
        let i = 0;
        el.textContent = "";
        function step() {
            if (i < text.length) {
                el.textContent += text[i];
                i += 1;
                setTimeout(step, 14);
            }
        }
        step();
    }

    function showOverlay(text) {
        if (!overlay || !overlayText) {
            return;
        }
        overlayText.textContent = text;
        overlay.classList.remove("hidden");
        overlay.style.opacity = "0";

        spring({
            from: 0.7,
            to: 1,
            onUpdate: (scale) => {
                overlay.style.transform = `scale(${scale})`;
                overlay.style.opacity = String(Math.max(0.2, Math.min(1, scale)));
            },
        });

        setTimeout(() => {
            overlay.classList.add("hidden");
            overlay.style.transform = "scale(1)";
            overlay.style.opacity = "1";
        }, 1500);
    }

    function updateCounters() {
        if (winCounter) {
            winCounter.textContent = `Emails improved: ${Number(localStorage.getItem(APP_WINS) || "0")}`;
        }
        if (streak) {
            streak.textContent = `Streak: ${Number(localStorage.getItem(APP_STREAK) || "0")}`;
        }
    }

    function registerWin() {
        const wins = Number(localStorage.getItem(APP_WINS) || "0") + 1;
        const streakNow = Number(localStorage.getItem(APP_STREAK) || "0") + 1;
        localStorage.setItem(APP_WINS, String(wins));
        localStorage.setItem(APP_STREAK, String(streakNow));
        updateCounters();
    }

    function resetStreak() {
        localStorage.setItem(APP_STREAK, "0");
        updateCounters();
    }

    function inferInfrastructure(signals) {
        const spf = String(signals && signals.spf_status ? signals.spf_status : "unknown").toUpperCase();
        const dkim = String(signals && signals.dkim_status ? signals.dkim_status : "unknown").toUpperCase();
        const dmarc = String(signals && signals.dmarc_status ? signals.dmarc_status : "unknown").toUpperCase();
        return `SPF: ${spf} | DKIM: ${dkim} | DMARC: ${dmarc}`;
    }

    function revealStatusOneByOne() {
        const cards = [
            document.getElementById("riskStatusCard"),
            document.getElementById("primaryIssueCard"),
            document.getElementById("confidenceCard"),
            document.getElementById("infraCard"),
            document.getElementById("biggestRiskCard"),
        ].filter(Boolean);

        cards.forEach((card) => card.classList.remove("reveal-on"));
        cards.forEach((card, idx) => {
            setTimeout(() => {
                card.classList.add("reveal-on");
            }, 110 * (idx + 1));
        });
    }

    function resetUI() {
        steps.forEach((step, idx) => {
            step.classList.remove("active");
            step.textContent = [
                "Scanning structure...",
                "Checking spam patterns...",
                "Analyzing tone...",
                "Predicting inbox placement...",
            ][idx];
        });

        stepsWrap.classList.add("hidden");
        decisionBlock.classList.add("hidden");
        decisionText.classList.remove("pulse-red");
        decisionText.style.transform = "scale(1)";
        decisionText.style.opacity = "1";

        if (progressBar) {
            progressBar.style.width = "0%";
        }

        beforeBox.textContent = "-";
        afterBox.textContent = "-";
        changeTags.innerHTML = "";
        useRewrite.classList.add("hidden");
        successBadge.classList.add("hidden");
        rewardBox.classList.add("hidden");

        feedbackState.textContent = "Different emails produce different results.";
    }

    function lockAnalyze(locked) {
        analyzeBtn.disabled = locked;
        analyzeBtn.textContent = locked ? "Analyzing..." : defaultAnalyze;
    }

    async function runSteps() {
        stepsWrap.classList.remove("hidden");
        spring({
            from: 0,
            to: 100,
            stiffness: 0.05,
            damping: 0.85,
            onUpdate: (v) => {
                if (progressBar) {
                    progressBar.style.width = `${Math.max(0, Math.min(100, v))}%`;
                }
            },
        });

        for (let i = 0; i < steps.length; i += 1) {
            steps[i].classList.add("active");
            if (!steps[i].textContent.endsWith(" ✓")) {
                steps[i].textContent += " ✓";
            }
            // eslint-disable-next-line no-await-in-loop
            await new Promise((resolve) => setTimeout(resolve, 350 + i * 100));
        }
    }

    async function analyzeEmail(rawEmail) {
        const payload = new FormData();
        payload.set("raw_email", rawEmail);
        payload.set("analysis_mode", analysisMode ? analysisMode.value : "full");

        const response = await fetch("/analyze", { method: "POST", body: payload });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(String(err.detail || "Analysis failed"));
        }
        return response.json();
    }

    async function rewriteEmail(rawEmail) {
        latestRewriteStyle = rewriteStyle ? rewriteStyle.value : "balanced";
        const payload = new FormData();
        payload.set("raw_email", rawEmail);
        payload.set("analysis_mode", analysisMode ? analysisMode.value : "full");
        payload.set("rewrite_style", latestRewriteStyle);

        const response = await fetch("/rewrite", { method: "POST", body: payload });
        if (!response.ok) {
            throw new Error("Rewrite failed");
        }
        return response.json();
    }

    function renderLearning(rows) {
        if (!Array.isArray(rows) || !rows.length) {
            learningAdjustments.innerHTML = "";
            return;
        }
        learningAdjustments.innerHTML = rows.slice(0, 3).map((row) => {
            const impact = Number(row.impact || 0);
            const sign = impact > 0 ? "+" : "";
            return `<div>${row.pattern}: ${sign}${impact} -> ${row.reason || "learning impact"}</div>`;
        }).join("");
    }

    function updateStatusOverview(summary, signals, prediction) {
        const band = String(summary.risk_band || "Needs Review");
        const confidence = String(summary.deliverability_confidence || "medium").toUpperCase();
        const issue = String(summary.primary_issue || "No primary issue identified");
        const biggest = Array.isArray(summary.top_fixes) && summary.top_fixes.length
            ? String(summary.top_fixes[0].title || summary.top_fixes[0].action || issue)
            : issue;

        riskStatusValue.textContent = band;
        primaryIssueValue.textContent = issue;
        confidenceValue.textContent = `${confidence}${prediction && prediction.decision ? ` | ${prediction.decision}` : ""}`;
        infraValue.textContent = inferInfrastructure(signals || {});
        biggestRiskValue.textContent = biggest;

        revealStatusOneByOne();
    }

    function showDecision(analysis) {
        const summary = analysis.summary || {};
        const prediction = analysis.prediction || {};

        const decision = String(prediction.decision || "TEST FIRST");
        const probability = Number(prediction.inbox_probability || 0);

        latestDecision = decision;
        latestFromBand = String(summary.risk_band || "");
        latestFromScore = Number(summary.final_score || summary.score || 0);

        updateStatusOverview(summary, analysis.signals || {}, prediction);

        stepsWrap.classList.add("hidden");
        decisionBlock.classList.remove("hidden");

        decisionText.textContent = decision;
        if (decision === "DO NOT SEND") {
            decisionText.classList.add("pulse-red");
        }
        animateDecision(decisionText);
        showOverlay(decision);

        revealText(decisionSub, `Estimated inbox: ${probability.toFixed(1)}%`);
        decisionPrimaryText.textContent = `Primary issue: ${summary.primary_issue || "No primary issue identified"}`;
        renderLearning(summary.learning_adjustments || []);
    }

    function renderChanges(changes) {
        changeTags.innerHTML = "";
        (Array.isArray(changes) ? changes : []).slice(0, 4).forEach((line) => {
            const tag = document.createElement("span");
            tag.className = "cc-tag";
            tag.textContent = String(line);
            changeTags.appendChild(tag);
        });
    }

    function showRewrite(rewrite, original) {
        const beforeText = String(rewrite.original_text || original || "");
        const afterText = String(rewrite.rewritten_text || original || "");

        beforeBox.textContent = beforeText;
        afterBox.textContent = afterText;
        slideIn(afterBox);

        latestToBand = String(rewrite.to_risk_band || latestFromBand || "");
        latestToScore = Number(rewrite.to_score || latestFromScore || 0);
        latestRewriteStyle = String(rewrite.rewrite_style || latestRewriteStyle || "balanced");

        const delta = Number(rewrite.score_delta || 0);
        rewardText.textContent = delta > 0
            ? `Spam risk reduced ↑ (+${delta})`
            : "Structure improved for better delivery";

        rewardBox.classList.remove("hidden");
        successBadge.classList.remove("hidden");
        useRewrite.classList.remove("hidden");
        renderChanges(rewrite.rewrite_changes || []);

        registerWin();
    }

    async function sendFeedback(outcome) {
        const original = beforeBox.textContent === "-" ? "" : beforeBox.textContent;
        const rewritten = afterBox.textContent === "-" ? "" : afterBox.textContent;

        if (!original || !rewritten) {
            feedbackState.textContent = "Run rewrite first.";
            return;
        }

        const payload = new URLSearchParams({
            outcome,
            original_text: original,
            rewritten_text: rewritten,
            rewrite_style: latestRewriteStyle,
            decision: latestDecision,
            from_risk_band: latestFromBand,
            to_risk_band: latestToBand,
            from_score: String(latestFromScore),
            to_score: String(latestToScore),
        });

        try {
            const response = await fetch("/feedback", {
                method: "POST",
                headers: { "Content-Type": "application/x-www-form-urlencoded" },
                body: payload,
            });

            if (!response.ok) {
                throw new Error("Feedback failed");
            }

            feedbackState.textContent = "Feedback saved. Model updated.";
            if (outcome === "spam") {
                resetStreak();
            }
        } catch (_error) {
            feedbackState.textContent = "Feedback failed. Try again.";
        }
    }

    analyzeBtn.addEventListener("click", async () => {
        const email = String(emailInput.value || "").trim();
        if (!email) {
            feedbackState.textContent = "Paste an email first.";
            return;
        }

        resetUI();
        lockAnalyze(true);

        try {
            await runSteps();
            const analysis = await analyzeEmail(email);
            showDecision(analysis);
            const rewrite = await rewriteEmail(email);
            showRewrite(rewrite, email);
        } catch (error) {
            decisionBlock.classList.remove("hidden");
            decisionText.textContent = "ERROR";
            decisionSub.textContent = String(error && error.message ? error.message : "Something went wrong");
        } finally {
            lockAnalyze(false);
        }
    });

    useRewrite.addEventListener("click", async () => {
        const text = afterBox.textContent || "";
        if (!text || text === "-") {
            return;
        }

        try {
            await navigator.clipboard.writeText(text);
            useRewrite.textContent = "✓ Copied";
            setTimeout(() => {
                useRewrite.textContent = "Copy Safer Version";
            }, 1200);
        } catch (_error) {
            useRewrite.textContent = "Copy failed";
            setTimeout(() => {
                useRewrite.textContent = "Copy Safer Version";
            }, 1200);
        }
    });

    feedbackInbox.addEventListener("click", () => sendFeedback("inbox"));
    feedbackSpam.addEventListener("click", () => sendFeedback("spam"));
    feedbackNotSure.addEventListener("click", () => sendFeedback("not_sure"));

    if (nextAction) {
        nextAction.addEventListener("click", () => {
            emailInput.value = "";
            emailInput.focus();
            rewardBox.classList.add("hidden");
            successBadge.classList.add("hidden");
        });
    }

    updateCounters();
})();
