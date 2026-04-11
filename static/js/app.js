const form = document.getElementById("risk-form");
const nativeFetch = window.fetch.bind(window);

// Always include credentials so session cookies persist across refresh and API calls.
window.fetch = (input, init = {}) => {
    const options = init && typeof init === "object" ? init : {};
    if (!options.credentials) {
        options.credentials = "include";
    }
    return nativeFetch(input, options);
};

const THEME_STORAGE_KEY = "ig_theme";

function getSystemTheme() {
    if (typeof window.matchMedia !== "function") {
        return "light";
    }
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function getStoredTheme() {
    const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
    return storedTheme === "dark" || storedTheme === "light" ? storedTheme : null;
}

function normalizeTheme(theme) {
    return String(theme || "light").toLowerCase() === "dark" ? "dark" : "light";
}

function syncThemeColor(theme) {
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (!themeColorMeta) {
        return;
    }
    themeColorMeta.setAttribute("content", theme === "dark" ? "#0f172a" : "#f8fafc");
}

function updateThemeToggleButtons(theme) {
    const isDark = normalizeTheme(theme) === "dark";
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        button.textContent = isDark ? "☀ Light" : "🌙 Dark";
        button.setAttribute("aria-pressed", isDark ? "true" : "false");
        button.setAttribute("title", isDark ? "Switch to light mode" : "Switch to dark mode");
    });
}

function bindThemeToggleButtons() {
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
        if (button.dataset.themeBound === "1") {
            return;
        }
        button.addEventListener("click", () => {
            toggleInboxGuardTheme();
        });
        button.dataset.themeBound = "1";
    });
}

function applyTheme(theme, persist = true) {
    const normalized = normalizeTheme(theme);
    const root = document.documentElement;
    root.dataset.theme = normalized;
    root.classList.toggle("dark", normalized === "dark");
    root.style.colorScheme = normalized === "dark" ? "dark" : "light";
    syncThemeColor(normalized);
    if (persist) {
        localStorage.setItem(THEME_STORAGE_KEY, normalized);
    }
    updateThemeToggleButtons(normalized);
    return normalized;
}

function toggleInboxGuardTheme() {
    const currentTheme = normalizeTheme(document.documentElement.classList.contains("dark") ? "dark" : document.documentElement.dataset.theme || getStoredTheme() || getSystemTheme());
    return applyTheme(currentTheme === "dark" ? "light" : "dark");
}

function toggleTheme() {
    return toggleInboxGuardTheme();
}

function initTheme() {
    const storedTheme = getStoredTheme();
    const initialTheme = storedTheme || getSystemTheme();
    applyTheme(initialTheme, false);
    bindThemeToggleButtons();

    if (!storedTheme && typeof window.matchMedia === "function") {
        const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
        const syncSystemTheme = () => {
            if (!getStoredTheme()) {
                applyTheme(mediaQuery.matches ? "dark" : "light", false);
            }
        };

        if (typeof mediaQuery.addEventListener === "function") {
            mediaQuery.addEventListener("change", syncSystemTheme);
        } else if (typeof mediaQuery.addListener === "function") {
            mediaQuery.addListener(syncSystemTheme);
        }
    }
}

window.toggleInboxGuardTheme = toggleInboxGuardTheme;
window.toggleTheme = toggleTheme;
window.applyInboxGuardTheme = applyTheme;
initTheme();

const uxState = {
    screen: "home",
    valueShown: false,
    showPaywall: false,
    hasMultipleCTAs: false,
};

function countPrimaryActions(container) {
    if (!container) {
        return 0;
    }
    const candidates = Array.from(container.querySelectorAll(".primary-btn, .btn-primary, .decision-cta, .plan-btn.primary, .upgrade-cta"));
    return candidates.filter((node) => node && !node.classList.contains("hidden") && node.offsetParent !== null).length;
}

function enforceUX(state = {}) {
    const current = {
        ...uxState,
        ...state,
    };

    if (current.screen === "home" && current.hasMultipleCTAs) {
        console.warn("UX VIOLATION: Multiple primary CTAs on home screen");
    }

    if (current.showPaywall && !current.valueShown) {
        console.warn("UX VIOLATION: Paywall before value");
    }

    if (current.screen === "result" && countPrimaryActions(resultSection) > 1) {
        console.warn("UX VIOLATION: Multiple primary CTAs on result screen");
    }

    return current;
}

function updateUxState(nextState = {}) {
    Object.assign(uxState, nextState);
    enforceUX(uxState);
}

const resultSection = document.getElementById("result");
const idleNote = document.getElementById("idle-note");
const scanPanel = document.getElementById("scan-panel");
const homeView = document.getElementById("home");
const toolPanel = document.getElementById("tool-panel");
const homeSections = Array.from(document.querySelectorAll(".home-only"));
const scanSections = Array.from(document.querySelectorAll(".scan-only"));
const tabFeedbackNode = document.getElementById("tab-feedback");
const dashboardTab = document.getElementById("tab-dashboard");
const threatScanTab = document.getElementById("tab-threat-scan");
const startButton = document.getElementById("start-btn");
const homeScanButton = document.getElementById("home-scan-btn");
const cardScanOpenButton = document.getElementById("card-scan-open-btn");
const accessButton = document.getElementById("get-access-btn") || document.getElementById("access-btn");
const fillExampleButton = document.getElementById("fill-example");
const tokenCostHintNode = document.getElementById("token-cost-hint");
const tokenAfterHintNode = document.getElementById("token-after-hint");
const realtimeLintPanelNode = document.getElementById("realtime-lint-panel");
const realtimeLintBandNode = document.getElementById("realtime-lint-band");
const realtimeIssuesListNode = document.getElementById("realtime-issues-list");
const tokenEmptyStateNode = document.getElementById("token-empty-state");

const authModal = document.getElementById("auth-modal");
const authSignInButton = document.getElementById("auth-signin");
const authCreateButton = document.getElementById("auth-create");
const authCloseButton = document.getElementById("auth-close");
const authEmailInput = document.getElementById("auth-email");
const leadCaptureModal = document.getElementById("lead-capture-modal");
const leadCaptureEmailInput = document.getElementById("lead-capture-email");
const leadCaptureContinueButton = document.getElementById("lead-capture-continue");
const leadCaptureCloseButton = document.getElementById("lead-capture-close");
const profileLink = document.getElementById("profile-link");
const profileAvatar = document.getElementById("profile-avatar");
const profileInitial = document.getElementById("profile-initial");
const adminDashboardButton = document.getElementById("admin-dashboard-btn");

const rawEmailInput = document.getElementById("raw-email");
const domainInput = document.getElementById("domain");
const analysisModeInput = document.getElementById("analysis-mode");
const submitButton = document.getElementById("run-check");
const submitAsyncButton = document.getElementById("run-check-async");
const generateSubjectsButton = document.getElementById("generate-subjects");
const loadingPanel = document.getElementById("result-loading");
const loadingStep = document.getElementById("loading-step");
const progressBarNode = document.getElementById("progressBar");
const loadingStepNodes = [
    document.getElementById("load-step-1"),
    document.getElementById("load-step-2"),
    document.getElementById("load-step-3"),
    document.getElementById("load-step-4"),
];

const statusRiskBandNode = document.getElementById("status-risk-band");
const statusRiskCardNode = document.getElementById("status-risk-card");
const statusPrimaryIssueNode = document.getElementById("status-primary-issue");
const statusConfidenceNode = document.getElementById("status-confidence");
const confidenceMeterFillNode = document.getElementById("confidence-meter-fill");
const confidenceMeterDetailNode = document.getElementById("confidence-meter-detail");
const riskStripNode = document.getElementById("risk-strip");
const riskStripTitleNode = document.getElementById("risk-strip-title");
const riskStripBodyNode = document.getElementById("risk-strip-body");
const decisionProblemNode = document.getElementById("decision-problem");
const decisionSignalNode = document.getElementById("decision-signal");
const decisionScopeNode = document.getElementById("decision-scope");
const decisionWhyNode = document.getElementById("decision-why");
const decisionFixFirstNode = document.getElementById("decision-fix-first");
const decisionConsequenceNode = document.getElementById("decision-consequence");
const scaleWarningListNode = document.getElementById("scale-warning-list");

const biggestRiskCard = document.getElementById("biggest-risk-card");
const biggestRiskTitleNode = document.getElementById("biggest-risk-title");
const biggestRiskImpactNode = document.getElementById("biggest-risk-impact");
const biggestRiskDescNode = document.getElementById("biggest-risk-desc");
const trustHookNode = document.getElementById("trust-hook");
const riskFixNowButton = document.getElementById("risk-fix-now");
const riskFixAsyncButton = document.getElementById("risk-fix-async");
const postFixAccessButton = document.getElementById("post-fix-access");

const consequenceListNode = document.getElementById("consequence-list");
const hurtListNode = document.getElementById("hurt-list");
const topFixesListNode = document.getElementById("top-fixes-list");
const scoreBreakdownNode = document.getElementById("score-breakdown");
const predictionHeadlineNode = document.getElementById("prediction-headline");
const predictionDetailNode = document.getElementById("prediction-detail");
const predictionBandsNode = document.getElementById("prediction-bands");
const resultScreenNode = document.getElementById("result-screen");
const decisionTitleNode = document.getElementById("decision-title");
const primaryIssueNode = document.getElementById("primary-issue");
const step2FixBlockNode = document.getElementById("rewrite-section") || document.getElementById("step2-fix-block");
const step3BlockNode = document.getElementById("step3-block");
const biggestRiskTextNode = document.getElementById("biggest-risk-text");
const deliverabilitySummaryNode = document.getElementById("deliverability-summary");
const beforeEmailNode = document.getElementById("before-email");
const afterEmailNode = document.getElementById("after-email");
const issueListNode = document.getElementById("issue-list");
const diffSummaryNode = document.getElementById("diff-summary");
const rewriteTagsNode = document.getElementById("rewrite-tags");
const rewriteNotesNode = document.getElementById("rewrite-notes");
const copyFixedBtnNode = document.getElementById("copy-fixed-btn");
const fixIssueButton = document.getElementById("fix-issue-btn");
const rewriteSafeButton = document.getElementById("rewrite-safe-btn");
const rewriteEngagingButton = document.getElementById("rewrite-engaging-btn");
const rewriteDirectButton = document.getElementById("rewrite-direct-btn");
const rewriteConvertingButton = document.getElementById("rewrite-converting-btn");
const restoreBtnNode = document.getElementById("restore-btn");
const gmailBtnNode = document.getElementById("gmail-btn");
const runTestBtnNode = document.getElementById("run-test-btn");
const riskTitleNode = document.getElementById("risk-title");
const riskSummaryNode = document.getElementById("risk-summary");
const riskReasonsNode = document.getElementById("risk-reasons");
const riskImpactNode = document.getElementById("risk-impact");
const riskWarningImpactNode = document.getElementById("risk-warning-impact");
const fixTitleNode = document.getElementById("fix-title");
const rewriteSummaryNode = document.getElementById("rewrite-summary");
const fixPreviewTextNode = document.getElementById("fix-preview-text");
const rewriteLiveStatusNode = document.getElementById("rewrite-live-status");
const fixRecommendationsNode = document.getElementById("fix-recommendations");
const impactEstimateNode = document.getElementById("impact-estimate");
const variantInsightNode = document.getElementById("variant-insight");
const variantLossNode = document.getElementById("variant-loss");
const variantPatternNode = document.getElementById("variant-pattern");
const fixedEmailNowNode = document.getElementById("fixed-email-now");
const copyFixedNowButton = document.getElementById("copy-fixed-now");
const progressStep1Node = document.getElementById("progress-step-1");
const progressStep2Node = document.getElementById("progress-step-2");
const progressStep3Node = document.getElementById("progress-step-3");
const unlockFixButton = document.getElementById("unlock-fix-btn");
const shareResultButton = document.getElementById("share-result-btn");
const resultCaptureEmailInput = document.getElementById("result-capture-email");
const resultCaptureSubmitButton = document.getElementById("result-capture-submit");
const resultCaptureStatusNode = document.getElementById("result-capture-status");

const PAYWALL_VARIANT_KEY = "ig_paywall_variant";

function getPaywallVariant() {
    const existing = localStorage.getItem(PAYWALL_VARIANT_KEY);
    if (existing === "A" || existing === "B") {
        return existing;
    }
    const assigned = Math.random() < 0.5 ? "A" : "B";
    localStorage.setItem(PAYWALL_VARIANT_KEY, assigned);
    return assigned;
}

function getFreeScansLimitForCurrentUser() {
    const variant = getPaywallVariant();
    return variant === "B" ? 2 : 1;
}

const fixNowButton = document.getElementById("fix-now");
const rewriteStyleInput = document.getElementById("rewrite-style");
const subjectProductNameInput = document.getElementById("subject-product-name");
const subjectTargetRoleInput = document.getElementById("subject-target-role");
const subjectIndustryInput = document.getElementById("subject-industry");
const subjectGoalInput = document.getElementById("subject-goal");
const subjectEmailTypeInput = document.getElementById("subject-email-type");
const subjectToneInput = document.getElementById("subject-tone");
const subjectContextInput = document.getElementById("subject-context");
const subjectBodyInput = document.getElementById("subject-body");
const subjectTopPickNode = document.getElementById("subject-intel-top-pick");
const subjectTopReasonNode = document.getElementById("subject-intel-top-reason");
const subjectWarningListNode = document.getElementById("subject-intel-warning-list");
const subjectTopListNode = document.getElementById("subject-intel-top-list");
const subjectAllListNode = document.getElementById("subject-intel-all-list");

const workflowStateNode = document.getElementById("workflow-state");
const workflowTitleNode = document.getElementById("workflow-title");
const rewriteModeDisplayNode = document.getElementById("rewrite-mode-display");
const improvementEstimateNode = document.getElementById("improvement-estimate");
const subjectChangeNode = document.getElementById("subject-change");
const rewriteChangesNode = document.getElementById("rewrite-changes");
const rewriteTrustNoteNode = document.getElementById("rewrite-trust-note");
const rewriteLimitationsNode = document.getElementById("rewrite-limitations");
const rewriteDiffNode = document.getElementById("rewrite-diff");
const successBadge = document.getElementById("successBadge");
const rewardBoxNode = document.getElementById("rewardBox");
const rewardTextNode = document.getElementById("rewardText");
const winCounterNode = document.getElementById("winCounter");
const streakNode = document.getElementById("streak");
const nextActionNode = document.getElementById("nextAction");
const fixOutput = document.getElementById("fix-output");
const saveFixButton = document.getElementById("save-fix");
const useFixedButton = document.getElementById("use-fixed");
const restoreOriginalButton = document.getElementById("restore-original");
const sendGmailButton = document.getElementById("send-gmail");
const editManualButton = document.getElementById("edit-manual");
const feedbackInboxButton = document.getElementById("feedback-inbox");
const feedbackSpamButton = document.getElementById("feedback-spam");
const feedbackPromotionsButton = document.getElementById("feedback-promotions");
const feedbackStatusNode = document.getElementById("feedback-status");
const realityStripTitleNode = document.getElementById("reality-strip-title");
const realityStripBodyNode = document.getElementById("reality-strip-body");
const metricOpenRateInput = document.getElementById("cd-open") || document.getElementById("metric-open-rate");
const metricReplyRateInput = document.getElementById("cd-reply") || document.getElementById("metric-reply-rate");
const metricBounceRateInput = document.getElementById("cd-bounce") || document.getElementById("metric-bounce-rate");
const metricSentCountInput = document.getElementById("cd-sent") || document.getElementById("metric-sent-count");
const runDiagnosisButton = document.getElementById("cd-run") || document.getElementById("run-diagnosis");
const diagnosisOutput = document.getElementById("diagnosis-output");
const diagnosisPrimaryNode = document.getElementById("diagnosis-primary");
const diagnosisConfidenceNode = document.getElementById("diagnosis-confidence");
const diagnosisWhyNode = document.getElementById("diagnosis-why");
const diagnosisActionsNode = document.getElementById("diagnosis-actions");
const campaignDebuggerResultNode = document.getElementById("cd-result");
const blacklistDomainInput = document.getElementById("blacklist-domain");
const runBlacklistCheckButton = document.getElementById("run-blacklist-check");
const blacklistResultNode = document.getElementById("blacklist-result");
const seedCampaignInput = document.getElementById("seed-campaign");
const seedProviderInput = document.getElementById("seed-provider");
const seedInboxCountInput = document.getElementById("seed-inbox-count");
const seedSpamCountInput = document.getElementById("seed-spam-count");
const saveSeedTestButton = document.getElementById("save-seed-test");
const seedTestListNode = document.getElementById("seed-test-list");
const runSeedSyncButton = document.getElementById("run-seed-sync");
const runSeedAutoButton = document.getElementById("run-seed-auto");
const bulkFileInput = document.getElementById("bulk-file");
const runBulkScanButton = document.getElementById("run-bulk-scan");
const bulkResultsNode = document.getElementById("bulk-results");
const apiKeyNameInput = document.getElementById("api-key-name");
const createApiKeyButton = document.getElementById("create-api-key");
const listApiKeysButton = document.getElementById("list-api-keys");
const revokeApiKeyButton = document.getElementById("revoke-api-key");
const revokeKeyIdInput = document.getElementById("revoke-key-id");
const apiKeyListNode = document.getElementById("api-key-list");
const teamNameInput = document.getElementById("team-name");
const createTeamButton = document.getElementById("create-team");
const listTeamsButton = document.getElementById("list-teams");
const addTeamMemberButton = document.getElementById("add-team-member");
const teamMemberTeamIdInput = document.getElementById("team-member-team-id");
const teamMemberEmailInput = document.getElementById("team-member-email");
const teamMemberRoleInput = document.getElementById("team-member-role");
const teamListNode = document.getElementById("team-list");
const opsOutputNode = document.getElementById("ops-output");
const refreshOutcomeStatsButton = document.getElementById("refresh-outcome-stats");
const refreshJobsButton = document.getElementById("refresh-jobs");
const outcomeStatsListNode = document.getElementById("outcome-stats-list");
const jobListNode = document.getElementById("job-list");
const inlinePlanTypeInput = document.getElementById("inline-plan-type");
const hiddenPlanTypeInput = document.getElementById("plan-type");
const selectedPlanNameNode = document.getElementById("selected-plan-name");
const checkoutPriceLabelNode = document.getElementById("checkout-price-label");
const checkoutPriceSummaryNode = document.getElementById("checkout-price-summary");
const refreshPlansButton = document.getElementById("refresh-plans");
const plansOutputNode = document.getElementById("plans-output");
const requestAccessButton = document.getElementById("request-access");
const accessRequestEmailInput = document.getElementById("access-request-email");
const liveStatsSummaryNode = document.getElementById("live-stats-summary");
const liveStatsBreakdownNode = document.getElementById("live-stats-breakdown");
const liveStatsStatusNode = document.getElementById("live-stats-status");

const loadSteps = [
    "Checking content signals...",
    "Detecting spam patterns...",
    "Evaluating provider rules...",
    "Scoring risk signals...",
];

const defaultSubmitLabel = submitButton ? submitButton.textContent : "Check Before Sending";
let latestSummary = null;
let latestFindings = [];
let latestRewriteContext = null;
let realtimeLintTimer = null;
let liveRewriteTimer = null;
let liveRewriteRequestId = 0;
let activeRewriteMode = "casual";
let latestLearningProfile = null;
let hasScanResult = false;
let pendingAction = null;
let isAuthenticated = false;
let userState = {
    tokens: 0,
    plan: "free",
};
let anonymousScansUsed = Number(localStorage.getItem("ig_anon_scans_used") || "0");
let anonymousScansLimit = Number(localStorage.getItem("ig_anon_scans_limit") || "3");
let userScansUsed = 0;
let userScansLimit = 50;
let currentUserName = "";
let currentUserEmail = "";
let currentUserAvatar = "";
let currentUserStatus = "inactive";
let emailPastedTracked = false;
let advancedOpenedTracked = false;
let pendingAuthRedirectPath = "";
let leadCaptureEmail = localStorage.getItem("ig_lead_capture_email") || "";
let leadCaptureSaved = localStorage.getItem("ig_lead_capture_saved") === "1";
let pendingPlanChoice = "monthly";
let currentUserPlan = "free";
let currentUserIsAdmin = false;
let userActionCount = 0;
let appliedPromoState = null;

window.appState = {
    hasScanned: localStorage.getItem("ig_has_scanned") === "1",
    hasOptimized: localStorage.getItem("ig_has_optimized") === "1",
    hasScaled: localStorage.getItem("ig_has_scaled") === "1",
    isAuthenticated: false,
    credits: 0,
    isAdmin: false,
    currentScreen: "dashboard",
};

let sidebarLockTooltipTimer = null;

function showSidebarTooltip(message, target) {
    let tooltip = document.getElementById("scan-lock-tooltip");
    if (!tooltip) {
        tooltip = document.createElement("div");
        tooltip.id = "scan-lock-tooltip";
        tooltip.className = "scan-lock-tooltip";
        document.body.appendChild(tooltip);
    }

    tooltip.textContent = String(message || "Run your first scan to unlock this");
    const rect = target && typeof target.getBoundingClientRect === "function"
        ? target.getBoundingClientRect()
        : null;
    const top = rect ? Math.max(8, rect.top - 42) : 20;
    const left = rect ? Math.max(8, rect.left + rect.width / 2 - 120) : 20;
    tooltip.style.top = `${Math.round(top)}px`;
    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.classList.add("show");

    if (sidebarLockTooltipTimer) {
        clearTimeout(sidebarLockTooltipTimer);
    }
    sidebarLockTooltipTimer = setTimeout(() => {
        tooltip.classList.remove("show");
    }, 1200);
}

function lockSidebar() {
    document.querySelectorAll(".advanced-tool").forEach((el) => {
        el.classList.add("locked");
        el.setAttribute("aria-disabled", "true");
        el.setAttribute("title", "Run your first scan to unlock this");
    });
}

function unlockSidebar() {
    document.querySelectorAll(".advanced-tool").forEach((el) => {
        el.classList.remove("locked");
        el.removeAttribute("aria-disabled");
        el.removeAttribute("title");
    });
}

function updateProgressIndicator() {
    const done1 = Boolean(window.appState && window.appState.hasScanned);
    const done2 = Boolean(window.appState && window.appState.hasOptimized);
    const done3 = Boolean(window.appState && window.appState.hasScaled);

    if (progressStep1Node) {
        progressStep1Node.classList.toggle("active", !done1);
        progressStep1Node.classList.toggle("done", done1);
        progressStep1Node.classList.remove("locked");
        progressStep1Node.textContent = done1 ? "Step 1: Run your first scan ✅" : "Step 1: Run your first scan";
    }
    if (progressStep2Node) {
        progressStep2Node.classList.toggle("active", done1 && !done2);
        progressStep2Node.classList.toggle("done", done2);
        progressStep2Node.classList.toggle("locked", !done1);
        progressStep2Node.textContent = done2 ? "Step 2: Optimize your email ✅" : "Step 2: Optimize your email";
    }
    if (progressStep3Node) {
        progressStep3Node.classList.toggle("active", done2 && !done3);
        progressStep3Node.classList.toggle("done", done3);
        progressStep3Node.classList.toggle("locked", !done2);
        progressStep3Node.textContent = done3 ? "Step 3: Scale campaigns ✅" : "Step 3: Scale campaigns";
    }
}

function applyProgressiveExposure() {
    if (window.appState && window.appState.hasScanned) {
        unlockSidebar();
    } else {
        lockSidebar();
    }
    updateProgressIndicator();
}

function updateSteps() {
    if (progressStep1Node) {
        progressStep1Node.classList.toggle("done", Boolean(window.appState && window.appState.hasScanned));
    }
    if (progressStep2Node) {
        progressStep2Node.classList.toggle("done", Boolean(window.appState && window.appState.hasOptimized));
    }
    if (progressStep3Node) {
        progressStep3Node.classList.toggle("done", Boolean(window.appState && window.appState.hasScaled));
    }
}

function syncProgressState() {
    if (window.appState && window.appState.hasScanned) {
        localStorage.setItem("ig_has_scanned", "1");
    } else {
        localStorage.removeItem("ig_has_scanned");
    }

    if (window.appState && window.appState.hasOptimized) {
        localStorage.setItem("ig_has_optimized", "1");
    } else {
        localStorage.removeItem("ig_has_optimized");
    }

    if (window.appState && window.appState.hasScaled) {
        localStorage.setItem("ig_has_scaled", "1");
    } else {
        localStorage.removeItem("ig_has_scaled");
    }
}

function syncFlowUserState() {
    if (!window.InboxGuardFlow || typeof window.InboxGuardFlow.updateFlowUser !== "function") {
        return;
    }
    window.InboxGuardFlow.updateFlowUser(
        isAuthenticated
            ? {
                tokens: Number(userState.tokens || 0),
                plan: currentUserPlan || userState.plan || "free",
            }
            : null,
    );

    window.appState.isAuthenticated = Boolean(isAuthenticated);
    window.appState.credits = Number(userState.tokens || 0);
    window.appState.isAdmin = Boolean(window.userIsAdmin || currentUserIsAdmin || window.appState.isAdmin);
    applyProgressiveExposure();
}

const PLAN_CHECKOUT_AMOUNTS_INR = {
    free: 0,
    starter: 200,
    monthly: 1200,
    annual: 9900,
    usage: 2,
};

const PLAN_OPTION_LABELS = {
    free: "Free",
    starter: "Starter ($2/month)",
    monthly: "Growth Monthly",
    annual: "Growth Annual",
    usage: "Usage-Based (Pay Per Scan)",
};

const PLAN_LEVELS = {
    free: 0,
    starter: 1,
    monthly: 2,
    annual: 2,
};

function normalizePlanChoice(plan) {
    const value = String(plan || "monthly").toLowerCase();
    if (value === "growth") {
        return "monthly";
    }
    if (value === "pro") {
        return "monthly";
    }
    if (value === "trial") {
        return "starter";
    }
    if (Object.prototype.hasOwnProperty.call(PLAN_OPTION_LABELS, value)) {
        return value;
    }
    return "monthly";
}

function planDisplayName(plan) {
    const normalized = normalizePlanChoice(plan);
    return PLAN_OPTION_LABELS[normalized] || "Growth Monthly";
}

function formatInr(amount) {
    const value = Math.max(0, Number(amount || 0));
    return new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(value);
}

function planCheckoutAmount(plan) {
    const normalized = normalizePlanChoice(plan);
    return Number(PLAN_CHECKOUT_AMOUNTS_INR[normalized] || PLAN_CHECKOUT_AMOUNTS_INR.monthly || 0);
}

function renderCheckoutPrice(plan, promo = null) {
    if (!checkoutPriceLabelNode && !checkoutPriceSummaryNode) {
        return;
    }

    const baseAmount = planCheckoutAmount(plan);
    const applied = promo && typeof promo === "object" ? promo : null;
    const finalAmount = Number(applied && applied.final_amount_inr !== undefined ? applied.final_amount_inr : baseAmount);
    const discountAmount = Number(applied && applied.discount_amount_inr !== undefined ? applied.discount_amount_inr : 0);

    if (checkoutPriceLabelNode) {
        checkoutPriceLabelNode.textContent = `${formatInr(finalAmount)}${plan === "annual" ? " / year" : plan === "usage" ? " / scan" : " / month"}`;
    }

    if (checkoutPriceSummaryNode) {
        if (applied) {
            const promoLabel = applied.type === "trial_extension"
                ? `Trial extended by ${Number(applied.trial_extension_days || 0)} day${Number(applied.trial_extension_days || 0) === 1 ? "" : "s"}`
                : `${formatInr(discountAmount)} off`;
            checkoutPriceSummaryNode.textContent = `Checkout total: ${formatInr(finalAmount)} (${promoLabel})`;
        } else {
            checkoutPriceSummaryNode.textContent = `Checkout total: ${formatInr(baseAmount)}`;
        }
    }
}

function clearAppliedPromo(reason = "") {
    appliedPromoState = null;
    const promoMessage = document.getElementById("promo-message");
    if (promoMessage) {
        promoMessage.textContent = reason;
        promoMessage.style.display = reason ? "block" : "none";
        promoMessage.style.color = reason ? "#fca5a5" : "";
    }
    renderCheckoutPrice(pendingPlanChoice, null);
}

function planAccessLevel(plan) {
    const normalized = normalizePlanChoice(plan);
    return PLAN_LEVELS[normalized] ?? 0;
}

function getActivePlanForAccess() {
    const normalizedPlan = normalizePlanChoice(window.userPlan || currentUserPlan || "free");
    const status = String(window.userStatus || currentUserStatus || "inactive").toLowerCase();
    if (normalizedPlan === "free") {
        return "free";
    }
    if (status !== "active") {
        return "free";
    }
    return normalizedPlan;
}

function hasPlanAccess(requiredPlan) {
    if (Boolean(window.userIsAdmin || currentUserIsAdmin)) {
        return true;
    }
    const required = normalizePlanChoice(requiredPlan || "free");
    return planAccessLevel(getActivePlanForAccess()) >= planAccessLevel(required);
}

function syncPlanSelection(plan) {
    const normalized = normalizePlanChoice(plan);
    pendingPlanChoice = normalized;
    if (appliedPromoState && normalizePlanChoice(appliedPromoState.plan || normalized) !== normalized) {
        clearAppliedPromo("Promo cleared because the selected plan changed.");
    }
    if (inlinePlanTypeInput) {
        inlinePlanTypeInput.value = normalized;
    }
    if (hiddenPlanTypeInput) {
        hiddenPlanTypeInput.value = normalized;
    }
    if (selectedPlanNameNode) {
        selectedPlanNameNode.textContent = planDisplayName(normalized);
    }
    const payButton = document.getElementById("pay-btn");
    if (payButton) {
        payButton.textContent = normalized === "free" ? "Continue Free" : "Get Access";
    }
    renderCheckoutPrice(normalized, appliedPromoState && normalizePlanChoice(appliedPromoState.plan || normalized) === normalized ? appliedPromoState : null);
}

const APP_LOOP_WINS_KEY = "ig_wins";
const APP_LOOP_STREAK_KEY = "ig_streak";

const errorBanner = document.createElement("div");
errorBanner.id = "error-banner";
errorBanner.className = "hidden";
document.body.appendChild(errorBanner);

function showError(message) {
    errorBanner.textContent = message;
    errorBanner.classList.remove("hidden");
    setTimeout(() => errorBanner.classList.add("hidden"), 3800);
}

function setListMessage(node, message) {
    if (!node) {
        return;
    }
    node.innerHTML = "";
    const li = document.createElement("li");
    li.textContent = String(message || "");
    node.appendChild(li);
}

function setActionButtonState(button, state, label) {
    if (!button) {
        return;
    }
    button.classList.remove("is-loading", "is-success", "is-error");
    if (state === "loading") {
        button.classList.add("is-loading");
        button.disabled = true;
    } else if (state === "success") {
        button.classList.add("is-success");
        button.disabled = false;
    } else if (state === "error") {
        button.classList.add("is-error");
        button.disabled = false;
    } else {
        button.disabled = false;
    }
    if (typeof label === "string") {
        button.textContent = label;
    }
}

async function parseApiError(response, fallbackMessage) {
    const payload = await response.json().catch(() => ({}));
    const detail = String(payload.detail || "").trim();
    if (detail === "AUTH_REQUIRED") {
        showError("Sign in required for this tool.");
        if (typeof showAuthModal === "function") {
            showAuthModal();
        }
        return "Sign in required for this tool.";
    }
    if (detail === "SUBSCRIPTION_REQUIRED") {
        showError("Subscription required for this tool.");
        if (typeof openPricingModal === "function") {
            openPricingModal();
        }
        return "Subscription required for this tool.";
    }
    return detail || String(fallbackMessage || "Request failed.");
}

function trackEvent(eventName, params) {
    if (typeof window.gtag !== "function") {
        return;
    }
    const safeParams = params && typeof params === "object" ? params : {};
    window.gtag("event", eventName, safeParams);
}

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

// Lightweight spring interpolator for physics-like, interruptible motion.
function spring({ from, to, stiffness = 0.08, damping = 0.8, onUpdate }) {
    let position = Number(from || 0);
    let velocity = 0;
    let cancelled = false;

    function frame() {
        if (cancelled) {
            return;
        }
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
    return () => {
        cancelled = true;
    };
}

function animateDecision(el) {
    if (!el) {
        return;
    }
    spring({
        from: 0.8,
        to: 1,
        stiffness: 0.09,
        damping: 0.79,
        onUpdate: (scale) => {
            el.style.transform = `scale(${scale})`;
            el.style.opacity = String(Math.max(0.2, Math.min(1, scale)));
        },
    });
}

function slideIn(el) {
    if (!el) {
        return;
    }
    spring({
        from: 100,
        to: 0,
        stiffness: 0.06,
        damping: 0.75,
        onUpdate: (val) => {
            el.style.transform = `translateX(${val}px)`;
            el.style.opacity = String(1 - Math.min(1, val / 100));
        },
    });
}

function magnetic(el) {
    if (!el) {
        return;
    }

    el.addEventListener("mousemove", (event) => {
        const rect = el.getBoundingClientRect();
        const x = (event.clientX - rect.left - rect.width / 2) * 0.16;
        const y = (event.clientY - rect.top - rect.height / 2) * 0.16;
        el.style.transform = `translate(${x}px, ${y}px)`;
    });

    el.addEventListener("mouseleave", () => {
        el.style.transform = "translate(0px, 0px)";
    });
}

function animateProgress(to = 100) {
    if (!progressBarNode) {
        return;
    }
    spring({
        from: 0,
        to,
        stiffness: 0.05,
        damping: 0.85,
        onUpdate: (val) => {
            progressBarNode.style.width = `${Math.max(0, Math.min(100, val))}%`;
        },
    });
}

function refreshToolPaneData(toolKey) {
    const key = String(toolKey || "").trim().toLowerCase();
    if (!key) {
        return;
    }

    if (key === "seed") {
        refreshSeedTests().catch((error) => {
            const msg = error && error.message ? error.message : "Could not load seed tests.";
            setListMessage(seedTestListNode, msg);
            showError(msg);
        });
        return;
    }
    if (key === "ops") {
        listApiKeys().catch((error) => {
            const msg = error && error.message ? error.message : "Could not load API keys.";
            setListMessage(apiKeyListNode, msg);
            showError(msg);
        });
        listTeams().catch((error) => {
            const msg = error && error.message ? error.message : "Could not load teams.";
            setListMessage(teamListNode, msg);
            showError(msg);
        });
        return;
    }
    if (key === "insights") {
        refreshOutcomeStats().catch((error) => {
            const msg = error && error.message ? error.message : "Could not load outcome stats.";
            setListMessage(outcomeStatsListNode, msg);
            showError(msg);
        });
        refreshJobs().catch((error) => {
            const msg = error && error.message ? error.message : "Could not load async jobs.";
            setListMessage(jobListNode, msg);
            showError(msg);
        });
    }
}

window.igOnToolPaneOpened = (toolKey) => {
    refreshToolPaneData(toolKey);
};

async function refreshHomeLiveStats() {
    if (!liveStatsSummaryNode || !liveStatsBreakdownNode || !liveStatsStatusNode) {
        return;
    }

    liveStatsSummaryNode.textContent = "Loading live performance metrics...";
    liveStatsBreakdownNode.textContent = "Fetching current outcome signals.";
    liveStatsStatusNode.textContent = "";

    try {
        const response = await fetch("/outcome-stats", { method: "GET" });
        if (!response.ok) {
            const fallback = await response.json().catch(() => ({}));
            const detail = String(fallback.detail || "").trim();
            if (detail === "AUTH_REQUIRED") {
                liveStatsSummaryNode.textContent = "Live metrics available after sign in.";
                liveStatsBreakdownNode.textContent = "Sign in to load real inbox-rate and benchmark stats from tracked outcomes.";
                liveStatsStatusNode.textContent = "No fake counters shown.";
                return;
            }
            throw new Error(detail || "Could not load live stats.");
        }

        const data = await response.json();
        const samples = Number(data.samples || 0);
        const inboxRate = Number(data.inbox_rate || 0).toFixed(1);
        const benchmarkValue = data.benchmark_top_10_score;
        const benchmarkSamples = Number(data.benchmark_inbox_samples || 0);
        const bands = Array.isArray(data.score_bands) ? data.score_bands : [];

        liveStatsSummaryNode.textContent = `Tracked outcomes: ${samples} | Inbox rate: ${inboxRate}%`;
        if (benchmarkValue === null || benchmarkValue === undefined) {
            liveStatsBreakdownNode.textContent = `No inbox benchmark yet. Record at least 10 inbox outcomes to build a real baseline. Band rows loaded: ${bands.length}.`;
        } else {
            liveStatsBreakdownNode.textContent = `Current inbox benchmark: ${Number(benchmarkValue)}+ based on ${benchmarkSamples} inbox outcomes. Band rows loaded: ${bands.length}.`;
        }
        liveStatsStatusNode.textContent = "Updates in real time as new feedback is recorded.";
    } catch (error) {
        liveStatsSummaryNode.textContent = "Live performance metrics are temporarily unavailable.";
        liveStatsBreakdownNode.textContent = "Outcome data endpoint did not respond. Try again in a moment.";
        liveStatsStatusNode.textContent = "No synthetic values are shown.";
    }
}

function revealText(el, text) {
    if (!el) {
        return;
    }
    let i = 0;
    el.innerText = "";
    el.style.opacity = "1";

    function type() {
        if (i < text.length) {
            el.innerText += text[i];
            i += 1;
            setTimeout(type, 15);
        }
    }

    type();
}

function transitionColor(el, fromColor, toColor) {
    if (!el) {
        return;
    }
    let progress = 0;
    function step() {
        progress += 0.08;
        el.style.color = progress > 0.5 ? toColor : fromColor;
        if (progress < 1) {
            requestAnimationFrame(step);
        }
    }
    step();
}

function showOverlaySpring(text) {
    const overlay = document.getElementById("decisionOverlay");
    const overlayText = document.getElementById("decisionOverlayText");
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
        overlay.style.opacity = "0";
        setTimeout(() => {
            overlay.classList.add("hidden");
            overlay.style.transform = "scale(1)";
        }, 160);
    }, 1500);
}

function highlightDiff(beforeEl, afterEl) {
    if (!beforeEl || !afterEl) {
        return;
    }
    afterEl.style.background = "rgba(34, 197, 94, 0.1)";
    afterEl.style.transform = "scale(1.02)";
    setTimeout(() => {
        afterEl.style.transform = "scale(1)";
    }, 300);
}

function showReward(delta) {
    if (!rewardBoxNode || !rewardTextNode) {
        return;
    }
    rewardTextNode.textContent = delta > 0
        ? `Spam risk reduced ↑ (+${delta})`
        : "Structure improved for better delivery";
    rewardBoxNode.classList.remove("hidden");
}

function updateWins() {
    const wins = Number(localStorage.getItem(APP_LOOP_WINS_KEY) || "0") + 1;
    localStorage.setItem(APP_LOOP_WINS_KEY, String(wins));
    if (winCounterNode) {
        winCounterNode.textContent = `Emails improved: ${wins}`;
    }
}

function updateStreak() {
    const streak = Number(localStorage.getItem(APP_LOOP_STREAK_KEY) || "0") + 1;
    localStorage.setItem(APP_LOOP_STREAK_KEY, String(streak));
    if (streakNode) {
        streakNode.textContent = `🔥 ${streak} improvements in a row`;
    }
}

function initializeLoopCounters() {
    if (winCounterNode) {
        winCounterNode.textContent = `Emails improved: ${Number(localStorage.getItem(APP_LOOP_WINS_KEY) || "0")}`;
    }
    if (streakNode) {
        streakNode.textContent = `🔥 ${Number(localStorage.getItem(APP_LOOP_STREAK_KEY) || "0")} improvements in a row`;
    }
}

function setupNextAction() {
    if (!nextActionNode || !rawEmailInput) {
        return;
    }
    nextActionNode.addEventListener("click", () => {
        rawEmailInput.value = "";
        rawEmailInput.focus();
        if (rewardBoxNode) {
            rewardBoxNode.classList.add("hidden");
        }
    });
}

function setupParallax() {
    const shell = document.querySelector(".app-shell");
    if (!shell) {
        return;
    }
    document.addEventListener("mousemove", (event) => {
        const x = (event.clientX / window.innerWidth - 0.5) * 3;
        const y = (event.clientY / window.innerHeight - 0.5) * 3;
        shell.style.transform = `translate(${x}px, ${y}px)`;
    });
    document.addEventListener("mouseleave", () => {
        shell.style.transform = "translate(0px, 0px)";
    });
}

function escapeHtml(value) {
    return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/\"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function highlightSpamSignals(text) {
    const patterns = [
        /\blast\s+chance\b/gi,
        /\bregister\s+now\b/gi,
        /\bapply\s+now\b/gi,
        /\blimited\s+time\b/gi,
        /\bonly\s+\d+\s*(day|days|hour|hours|left)\b/gi,
        /\bact\s+now\b/gi,
        /\burgent\b/gi,
    ];
    let html = escapeHtml(text);
    patterns.forEach((regex) => {
        html = html.replace(regex, (match) => `<mark class="spam-highlight">${match}</mark>`);
    });
    return html;
}

function buildRewriteDiff(beforeText, afterText) {
    const beforeLines = String(beforeText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const afterLines = String(afterText || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    const beforeSet = new Set(beforeLines);
    const afterSet = new Set(afterLines);
    const removed = beforeLines.filter((line) => !afterSet.has(line)).slice(0, 3);
    const added = afterLines.filter((line) => !beforeSet.has(line)).slice(0, 3);

    const rows = [];
    removed.forEach((line) => rows.push({ type: "Removed", text: line }));
    added.forEach((line) => rows.push({ type: "Added", text: line }));
    if (!rows.length) {
        rows.push({ type: "Updated", text: "Tone and structure adjusted with minor line edits." });
    }
    return rows;
}

function renderDiff(diff) {
    if (!diffSummaryNode) {
        return;
    }
    diffSummaryNode.innerHTML = "";
    const rows = Array.isArray(diff) ? diff : [];
    if (!rows.length) {
        const neutral = document.createElement("div");
        neutral.className = "diff-item";
        neutral.textContent = "No major line-level differences were detected.";
        diffSummaryNode.appendChild(neutral);
        return;
    }
    rows.forEach((item) => {
        const removedText = String(item && (item.removed || item.before) ? (item.removed || item.before) : "").trim();
        const addedText = String(item && (item.added || item.after) ? (item.added || item.after) : "").trim();
        if (removedText) {
            const removed = document.createElement("div");
            removed.className = "diff-item diff-removed";
            removed.textContent = `Removed: ${removedText}`;
            diffSummaryNode.appendChild(removed);
        }
        if (addedText) {
            const added = document.createElement("div");
            added.className = "diff-item diff-added";
            added.textContent = `Added: ${addedText}`;
            diffSummaryNode.appendChild(added);
        }
    });
}

function generateTags(issues) {
    const items = Array.isArray(issues) ? issues : [];
    const tags = [];
    if (items.some((issue) => String(issue && issue.type ? issue.type : "").toLowerCase() === "spam" || String(issue && issue.type ? issue.type : "").toLowerCase() === "spam_phrase")) {
        tags.push("Removed spam triggers");
    }
    if (items.some((issue) => String(issue && issue.type ? issue.type : "").toLowerCase() === "cta" || String(issue && issue.type ? issue.type : "").toLowerCase() === "weak_cta")) {
        tags.push("Improved CTA clarity");
    }
    if (items.some((issue) => String(issue && issue.type ? issue.type : "").toLowerCase() === "length" || String(issue && issue.type ? issue.type : "").toLowerCase() === "too_long" || String(issue && issue.type ? issue.type : "").toLowerCase() === "long_intro")) {
        tags.push("Simplified structure");
    }
    if (!tags.length) {
        tags.push("Improved readability");
    }
    return tags;
}

function renderTags(tags) {
    if (!rewriteTagsNode) {
        return;
    }
    rewriteTagsNode.innerHTML = "";
    const items = Array.isArray(tags) ? tags : [];
    items.forEach((tag) => {
        const node = document.createElement("span");
        node.className = "tag success";
        node.textContent = String(tag);
        rewriteTagsNode.appendChild(node);
    });
}

function setRewriteLiveStatus(message) {
    if (rewriteLiveStatusNode) {
        rewriteLiveStatusNode.textContent = String(message || "");
    }
}

function applyRewriteResponse(data, original, mode, options = {}) {
    const livePreview = Boolean(options && options.livePreview);
    const selectedMode = String(mode || "casual").toLowerCase();
    const rewrittenFromModes = data && data.rewrites && data.rewrites[selectedMode];
    const rewritten = String(
        rewrittenFromModes
        || data.rewritten
        || data.rewritten_text
        || data.improved
        || data.fix
        || original
    );

    renderRewrite({
        original,
        rewritten,
        improved: data.improved,
        fix: data.fix,
        issue_highlights: data.issue_highlights,
        issues: data.issues,
    });

    renderTags(generateTags(data.issues));

    if (fixPreviewTextNode) {
        fixPreviewTextNode.textContent = String(data.primary_fix || (livePreview ? "Live adaptive rewrite updated from the current draft." : "Rewrite generated to fix the top issue."));
    }

    renderDiff(Array.isArray(data.diff) ? data.diff : []);

    if (rewriteNotesNode) {
        rewriteNotesNode.innerHTML = "";
        const explicitFixes = Array.isArray(data && data.issue_fixes) ? data.issue_fixes : [];
        const notes = explicitFixes.length
            ? explicitFixes.slice(0, 4).map((item) => {
                const text = String(item && (item.text || item.issue) ? (item.text || item.issue) : "Issue");
                const why = String(item && item.why ? item.why : "");
                const fix = String(item && item.suggested_fix ? item.suggested_fix : "");
                return `${text} -> ${why}${fix ? ` | Fix: ${fix}` : ""}`;
            })
            : [
                "Exact issue fixes will appear here after rewrite.",
            ];
        notes.forEach((note) => {
            const p = document.createElement("p");
            p.textContent = note;
            rewriteNotesNode.appendChild(p);
        });
    }

    latestRewriteContext = {
        original_text: original,
        rewritten_text: rewritten,
        rewrite_style: String(data.rewrite_style || mode || "casual"),
        rewrite_mode: String(data.rewrite_mode || selectedMode || "casual"),
        from_risk_band: String(data.from_risk_band || "Needs Review"),
        to_risk_band: String(data.to_risk_band || "Needs Review"),
        score_delta: Number(data.score_delta || 0),
    };

    activeRewriteMode = String(data.rewrite_style || mode || activeRewriteMode || "casual");

    if (livePreview) {
        setRewriteLiveStatus("Live rewrite updated from the current draft and feedback profile.");
    }
}

async function runAdaptiveRewritePreview() {
    if (!rawEmailInput || !afterEmailNode || !beforeEmailNode) {
        return;
    }
    if (!latestRewriteContext && (!resultSection || resultSection.classList.contains("hidden"))) {
        return;
    }

    const original = String(rawEmailInput.value || "").trim();
    if (original.length < 20) {
        setRewriteLiveStatus("Paste a longer draft to enable live adaptive rewrite.");
        return;
    }

    const mode = activeRewriteMode || String(latestRewriteContext && latestRewriteContext.rewrite_style ? latestRewriteContext.rewrite_style : "casual");
    const requestId = ++liveRewriteRequestId;
    setRewriteLiveStatus("Updating live rewrite from the current draft...");

    const payload = new FormData();
    payload.set("raw_email", original);
    payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
    payload.set("rewrite_mode", mode);
    payload.set("rewrite_style", mode);
    if (domainInput && String(domainInput.value || "").trim()) {
        payload.set("domain", String(domainInput.value || "").trim());
    }

    const response = await fetch("/rewrite-live", { method: "POST", body: payload });
    if (requestId !== liveRewriteRequestId) {
        return;
    }
    if (!response.ok) {
        throw new Error("Live rewrite preview failed.");
    }
    const data = await response.json();
    if (requestId !== liveRewriteRequestId) {
        return;
    }
    applyRewriteResponse(data, original, mode, { livePreview: true });
}

function scheduleAdaptiveRewritePreview() {
    if (!rawEmailInput) {
        return;
    }
    if (liveRewriteTimer) {
        clearTimeout(liveRewriteTimer);
    }
    liveRewriteTimer = setTimeout(() => {
        runAdaptiveRewritePreview().catch(() => {
            setRewriteLiveStatus("Live rewrite is not available right now.");
        });
    }, 420);
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

    hideLeadCaptureModal();
    if (typeof renderBlockedScanResult === "function") {
        renderBlockedScanResult("Sign in required", "Your first scan is blocked until you sign in or continue your scan access.");
    }

    const msgNode = authModal.querySelector(".micro");
    if (msgNode) {
        if (pendingAuthRedirectPath) {
            msgNode.textContent = "Sign in to continue to pricing and unlock checkout.";
        } else if (pendingAction === "save-fix") {
            msgNode.textContent = "Sign in to save this rewrite to your account.";
        } else {
            msgNode.textContent = "You've used your free scans. Create a free account or sign in to continue.";
        }
    }
    authModal.classList.remove("hidden");
}

function hideAuthModal() {
    if (!authModal) {
        return;
    }
    authModal.classList.add("hidden");
}

function showLeadCaptureModal() {
    if (!leadCaptureModal) {
        return;
    }

    hideAuthModal();

    if (leadCaptureEmailInput && leadCaptureEmail) {
        leadCaptureEmailInput.value = leadCaptureEmail;
    }
    leadCaptureModal.classList.remove("hidden");
    if (leadCaptureEmailInput) {
        setTimeout(() => leadCaptureEmailInput.focus(), 50);
    }
}

function hideLeadCaptureModal() {
    if (!leadCaptureModal) {
        return;
    }
    leadCaptureModal.classList.add("hidden");
}

function needsAuthGate(action) {
    if (isAuthenticated) {
        return action === "analyze" && userScansUsed >= userScansLimit;
    }
    return action === "analyze" && anonymousScansUsed >= anonymousScansLimit;
}

function needsLeadCaptureGate(action) {
    if (isAuthenticated) {
        return false;
    }
    return action === "analyze" && anonymousScansUsed >= 1 && !leadCaptureSaved;
}

function updateProfileNav() {
    if (!profileLink) {
        return;
    }

    if (!isAuthenticated) {
        profileLink.classList.add("hidden");
        return;
    }

    profileLink.classList.remove("hidden");
    const source = currentUserName || currentUserEmail || "U";
    const initial = String(source).trim().charAt(0).toUpperCase() || "U";

    if (profileInitial) {
        profileInitial.textContent = initial;
    }

    if (profileAvatar) {
        if (currentUserAvatar) {
            profileAvatar.src = currentUserAvatar;
            profileAvatar.classList.remove("hidden");
            if (profileInitial) {
                profileInitial.classList.add("hidden");
            }
        } else {
            profileAvatar.classList.add("hidden");
            if (profileInitial) {
                profileInitial.classList.remove("hidden");
            }
        }
    }
}

async function refreshAuthStatus() {
    try {
        const response = await fetch("/auth/status", { method: "GET" });
        if (!response.ok) {
            return;
        }
        const data = await response.json();
        isAuthenticated = Boolean(data && data.authenticated);
        currentUserName = String(data && data.name ? data.name : "");
        currentUserEmail = String(data && data.email ? data.email : "");
        currentUserAvatar = String(data && data.avatar_url ? data.avatar_url : "");
        anonymousScansUsed = Number(data && data.anonymous_scans_used ? data.anonymous_scans_used : 0);
        anonymousScansLimit = Number(data && data.anonymous_scans_limit ? data.anonymous_scans_limit : 3);
        userScansUsed = Number(data && data.user_scans_used ? data.user_scans_used : 0);
        userScansLimit = Number(data && data.user_scans_limit ? data.user_scans_limit : 50);
        currentUserStatus = String(data && data.status ? data.status : "inactive").toLowerCase();
        currentUserPlan = normalizePlanChoice(String(data && data.plan ? data.plan : (data && data.pro ? "monthly" : "free")));
        const isAdmin = Boolean(data && data.is_admin);
        currentUserIsAdmin = isAdmin;
        window.appState.isAdmin = isAdmin;
        leadCaptureSaved = Boolean(data && data.lead_email_captured);
        leadCaptureEmail = String(data && data.lead_email ? data.lead_email : leadCaptureEmail);

        // Set window-level user state for Razorpay
        window.currentUser = isAuthenticated;
        window.userIsPro = Boolean(data && data.pro);
        window.userStatus = currentUserStatus;
        window.userPlan = currentUserPlan;
        window.userIsAdmin = isAdmin;
        window.currentUserEmail = currentUserEmail;
        window.currentUserName = currentUserName;
        window.appState.isAdmin = isAdmin;

        if (adminDashboardButton) {
            adminDashboardButton.classList.toggle("hidden", !isAuthenticated || !isAdmin);
            adminDashboardButton.onclick = isAuthenticated && isAdmin ? () => window.location.href = "/admin" : null;
        }

        localStorage.setItem("ig_anon_scans_used", String(anonymousScansUsed));
        localStorage.setItem("ig_anon_scans_limit", String(anonymousScansLimit));
        localStorage.setItem("ig_lead_capture_saved", leadCaptureSaved ? "1" : "0");
        if (leadCaptureEmail) {
            localStorage.setItem("ig_lead_capture_email", leadCaptureEmail);
        }
        window.appState.isAuthenticated = Boolean(isAuthenticated);
        updateProfileNav();
        syncFlowUserState();

    } catch (error) {
        // Keep UI operational even if auth status endpoint is temporarily unavailable.
    }
    // Load user tokens if authenticated
    if (isAuthenticated) {
        setTimeout(() => loadUserTokens(), 100);
    }
}

function runPendingAction() {
    if (pendingAction === "analyze") {
        runAnalyze();
    } else if (pendingAction === "fix") {
        showFixTransformation();
    } else if (pendingAction === "save-fix") {
        saveCurrentFix();
    }
    pendingAction = null;
}

function stashPendingContext(actionName) {
    localStorage.setItem("ig_pending_action", actionName || "analyze");
    localStorage.setItem("ig_pending_draft", rawEmailInput ? rawEmailInput.value : "");
    localStorage.setItem("ig_pending_domain", domainInput ? domainInput.value : "");
    localStorage.setItem("ig_pending_analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
    localStorage.setItem("ig_pending_rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "casual");
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

function resumePendingAfterAuthIfNeeded() {
    const shouldResume = localStorage.getItem("ig_resume_after_auth") === "1";
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
    localStorage.removeItem("ig_resume_after_auth");
}

function openAuthModalFromQueryIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    const shouldOpen = params.get("auth") === "1";
    const oauthError = params.get("oauth_error") === "1";
    if (!shouldOpen) {
        return;
    }

    showAuthModal();
    if (oauthError) {
        showError("Google sign-in failed. Please try again.");
    }
    const cleanUrl = window.location.pathname + window.location.hash;
    window.history.replaceState({}, document.title, cleanUrl);
}

function openEntryFromQueryIfNeeded() {
    const params = new URLSearchParams(window.location.search);
    const tab = String(params.get("tab") || "").toLowerCase();
    if (tab === "threat-scan" || tab === "scan") {
        activateTab("threat-scan");
        if (rawEmailInput) {
            setTimeout(() => rawEmailInput.focus(), 120);
        }
        params.delete("tab");
        const query = params.toString();
        const cleanUrl = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
        window.history.replaceState({}, document.title, cleanUrl);
    }
}

function openPendingScanFromStorage() {
    const savedEmail = String(localStorage.getItem("pending_scan_email") || "").trim();
    if (!savedEmail || !rawEmailInput) {
        return;
    }

    rawEmailInput.value = savedEmail;
    localStorage.removeItem("pending_scan_email");
    activateTab("threat-scan");
    setTimeout(() => rawEmailInput.focus(), 120);
}

function onAuthSuccess(source) {
    isAuthenticated = true;
    hideAuthModal();
    updateProfileNav();

    const payload = new FormData();
    payload.set("event", "access_request");
    payload.set("target", source || "auth_modal");
    payload.set("mode", "resume_pending_action");
    fetch("/track", { method: "POST", body: payload }).catch(() => null);

    if (!pendingAction && pendingAuthRedirectPath) {
        const destination = pendingAuthRedirectPath;
        pendingAuthRedirectPath = "";
        window.location.href = destination;
        return;
    }

    runPendingAction();
}

async function continueWithEmail() {
    const email = authEmailInput ? String(authEmailInput.value || "").trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
        showError("Enter a valid email to continue.");
        return;
    }

    const payload = new FormData();
    payload.set("email", email);

    const response = await fetch("/auth/email/continue", {
        method: "POST",
        body: payload,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not continue with email.");
    }

    await refreshAuthStatus();
    onAuthSuccess("email_continue");
}

async function continueWithLeadCapture() {
    const email = leadCaptureEmailInput ? String(leadCaptureEmailInput.value || "").trim().toLowerCase() : "";
    if (!email || !email.includes("@")) {
        showError("Enter a valid email to continue.");
        return;
    }

    const payload = new FormData();
    payload.set("email", email);
    payload.set("source", "scan_gate");

    const response = await fetch("/lead-capture", {
        method: "POST",
        body: payload,
    });

    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not save your email.");
    }

    leadCaptureSaved = true;
    leadCaptureEmail = email;
    localStorage.setItem("ig_lead_capture_saved", "1");
    localStorage.setItem("ig_lead_capture_email", email);
    hideLeadCaptureModal();
    runPendingAction();
}

async function continueWithGoogle() {
    stashPendingContext(pendingAction || "analyze");
    localStorage.setItem("ig_resume_after_auth", "1");
    const next = encodeURIComponent("/app");
    window.location.href = `/auth/google/login?next=${next}`;
}

function handleAuthAction(action) {
    if (action === "signin") {
        continueWithGoogle();
        return;
    }
    if (action === "create") {
        continueWithEmail().catch((error) => {
            showError(error && error.message ? error.message : "Could not continue with email.");
        });
        return;
    }
    hideAuthModal();
}

async function saveCurrentFix() {
    if (!latestRewriteContext) {
        showError("Generate a fix first so we have something to save.");
        return;
    }
    if (!isAuthenticated) {
        showAuthModal();
        return;
    }

    const payload = new FormData();
    payload.set("original_subject", String(latestRewriteContext.original_subject || ""));
    payload.set("original_body", String(latestRewriteContext.original_body || latestRewriteContext.original_text || ""));
    payload.set("rewritten_subject", String(latestRewriteContext.rewritten_subject || ""));
    payload.set("rewritten_body", String(latestRewriteContext.rewritten_body || latestRewriteContext.rewritten_text || ""));
    payload.set("score_delta", String(latestRewriteContext.score_delta || 0));
    payload.set("from_risk_band", String(latestRewriteContext.from_risk_band || ""));
    payload.set("to_risk_band", String(latestRewriteContext.to_risk_band || ""));
    payload.set("rewrite_style", String(latestRewriteContext.rewrite_style || "casual"));

    const response = await fetch("/save-fix", {
        method: "POST",
        body: payload,
    });
    if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.detail || "Could not save this fix.");
    }

    if (saveFixButton) {
        saveFixButton.textContent = "Saved";
        saveFixButton.disabled = true;
    }
    showError("Fix saved to your account.");
}

// Inline fallback hooks for resilient modal behavior.
window.igAuthSignIn = () => handleAuthAction("signin");
window.igAuthCreate = () => handleAuthAction("create");
window.igAuthClose = () => handleAuthAction("close");
window.igLeadCaptureClose = () => hideLeadCaptureModal();

function activateTab(tab) {
    if (tab === "threat-scan") {
        navigate("scan", { focusInput: true, scroll: true });
        return;
    }
    goHome();
}

window.activateTab = activateTab;

function hideAllViews() {
    if (homeView) {
        homeView.classList.add("hidden");
    }
    if (toolPanel) {
        toolPanel.classList.add("hidden");
    }
}

function navigate(screen, options = {}) {
    const requested = String(screen || "dashboard").toLowerCase();
    const target = requested === "home" ? "dashboard" : requested;
    const focusInput = Boolean(options.focusInput);
    const shouldScroll = options.scroll !== false;

    hideAllViews();

    if (target === "dashboard") {
        if (typeof window.closeTool === "function") {
            window.closeTool();
        }
        if (homeView) {
            homeView.classList.remove("hidden");
        }
        homeSections.forEach((node) => node.classList.remove("hidden"));
        scanSections.forEach((node) => node.classList.add("hidden"));
        if (scanPanel) {
            scanPanel.classList.remove("focused");
            scanPanel.classList.add("hidden");
        }
        if (dashboardTab) {
            dashboardTab.classList.add("active");
        }
        if (threatScanTab) {
            threatScanTab.classList.remove("active");
        }
        setTabFeedback("Choose a tool to get started.");
        updateUxState({
            screen: "home",
            valueShown: false,
            showPaywall: false,
            hasMultipleCTAs: countPrimaryActions(homeView) > 1,
        });
        window.appState.currentScreen = "dashboard";
        return;
    }

    if (toolPanel) {
        toolPanel.classList.remove("hidden");
    }
    homeSections.forEach((node) => node.classList.add("hidden"));
    if (dashboardTab) {
        dashboardTab.classList.remove("active");
    }

    if (target === "scan" || target === "result") {
        if (typeof window.closeTool === "function") {
            window.closeTool();
        }
        if (threatScanTab) {
            threatScanTab.classList.add("active");
        }
        scanSections.forEach((node) => node.classList.remove("hidden"));
        if (scanPanel) {
            scanPanel.classList.add("focused");
            scanPanel.classList.remove("hidden");
            if (shouldScroll) {
                scanPanel.scrollIntoView({ behavior: "smooth", block: "start" });
            }
        }
        if (focusInput && rawEmailInput) {
            setTimeout(() => rawEmailInput.focus(), 60);
        }
        setTabFeedback("Scan mode active. Paste your email and click Check Before Sending.");
        window.appState.currentScreen = target;
        return;
    }

    if (threatScanTab) {
        threatScanTab.classList.remove("active");
    }
    scanSections.forEach((node) => node.classList.add("hidden"));
    if (scanPanel) {
        scanPanel.classList.remove("focused");
        scanPanel.classList.add("hidden");
    }
    if (typeof window.igOpenToolPane === "function") {
        window.igOpenToolPane(target);
    }
    refreshToolPaneData(target);
    setTabFeedback("Tool panel active.");
    window.appState.currentScreen = target;
}

function showHome() {
    navigate("dashboard", { scroll: false });
}

function openTool(tool) {
    const key = String(tool || "").toLowerCase();
    const isAdmin = Boolean(window.appState && window.appState.isAdmin);
    const advancedTarget = document.querySelector(`.advanced-tool[data-tool="${key}"]`);
    if (advancedTarget && !isAdmin && !(window.appState && window.appState.hasScanned)) {
        showSidebarTooltip("Run your first scan to unlock this", advancedTarget);
        showError("Run at least one scan first before opening advanced tools.");
        trackEvent("blocked_before_first_value", { tool: key });
        activateTab("threat-scan");
        return;
    }

    const requiredByTool = {
        "campaign-debugger": "starter",
        seed: "monthly",
        bulk: "monthly",
        ops: "monthly",
    };

    if (requiredByTool[key] && !isAdmin && localStorage.getItem("ig_has_scanned") !== "1") {
        showError("Run at least one scan first before opening advanced tools.");
        activateTab("threat-scan");
        return;
    }

    const requiredPlan = requiredByTool[key] || "free";
    if (!isAdmin && !hasPlanAccess(requiredPlan)) {
        showUpgradeModal({
            title: "You're losing emails to spam right now",
            subtitle: "Upgrade to fix it before your next campaign",
            plan: requiredPlan === "starter" ? "starter" : "growth",
        });
        showHome();
        const pricingSection = document.getElementById("home-pricing-cta");
        if (pricingSection) {
            pricingSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        return;
    }

    if (key === "scan" || key === "threat-scan") {
        userActionCount += 1;
        refreshPricingContext();
        navigate("scan", { focusInput: true, scroll: true });
        return;
    }

    userActionCount += 1;
    refreshPricingContext();

    hideAllViews();
    homeSections.forEach((node) => node.classList.add("hidden"));
    if (toolPanel) {
        toolPanel.classList.remove("hidden");
    }

    if (dashboardTab) {
        dashboardTab.classList.remove("active");
    }

    if (threatScanTab) {
        threatScanTab.classList.remove("active");
    }
    scanSections.forEach((node) => node.classList.add("hidden"));
    if (scanPanel) {
        scanPanel.classList.remove("focused");
        scanPanel.classList.add("hidden");
    }
    if (typeof window.igOpenToolPane === "function") {
        window.igOpenToolPane(tool);
    }
    refreshToolPaneData(tool);
    setTabFeedback("Tool panel active.");
}

function goHome() {
    showHome();
}

window.openTool = openTool;
window.goHome = goHome;
window.navigate = navigate;

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
    if (successBadge) {
        successBadge.classList.add("hidden");
    }
    if (rewardBoxNode) {
        rewardBoxNode.classList.add("hidden");
    }
    if (progressBarNode) {
        progressBarNode.style.width = "0%";
    }
    if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = defaultSubmitLabel;
    }
    window.appState.hasScanned = localStorage.getItem("ig_has_scanned") === "1";
    window.appState.hasOptimized = localStorage.getItem("ig_has_optimized") === "1";
    window.appState.hasScaled = localStorage.getItem("ig_has_scaled") === "1";
    applyProgressiveExposure();
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
    if (successBadge) {
        successBadge.classList.add("hidden");
    }
    if (rewardBoxNode) {
        rewardBoxNode.classList.add("hidden");
    }
    if (progressBarNode) {
        progressBarNode.style.width = "0%";
    }
    window.appState.hasOptimized = false;
    window.appState.hasScaled = false;
    syncProgressState();
    animateProgress(100);
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
    if (progressBarNode) {
        progressBarNode.style.width = "100%";
    }
    window.appState.hasScanned = true;
    syncProgressState();
    applyProgressiveExposure();
    updateUxState({
        screen: "result",
        valueShown: true,
        hasMultipleCTAs: countPrimaryActions(resultSection) > 1,
    });
}

function getQuickFixPreview(summary = {}, findings = []) {
    const firstFinding = Array.isArray(findings) && findings.length ? findings[0] : null;
    const title = String(firstFinding && firstFinding.title ? firstFinding.title : "").toLowerCase();

    if (title.includes("urgency") || title.includes("pressure") || title.includes("broadcast")) {
        return {
            before: '"Buy now limited offer"',
            after: '"Quick question about your workflow"',
        };
    }

    if (title.includes("link") || title.includes("image")) {
        return {
            before: '"Click here for the full details"',
            after: '"Thought you might want a quick note on this"',
        };
    }

    if (title.includes("personalization")) {
        return {
            before: '"Hi team"',
            after: '"Hi {{first_name}},"',
        };
    }

    const subject = String(summary.subject || "Quick question").trim();
    return {
        before: `"${subject || "Limited offer today"}"`,
        after: '"Quick question about your workflow"',
    };
}

function renderResultSummary(summary, findings) {
    const scoreNode = document.getElementById("result-score");
    const riskNode = document.getElementById("result-risk");
    const issuesNode = document.getElementById("result-issues-list");
    const previewBeforeNode = document.getElementById("result-preview-before");
    const previewAfterNode = document.getElementById("result-preview-after");
    if (!scoreNode || !riskNode || !issuesNode || !previewBeforeNode || !previewAfterNode) {
        return;
    }

    const finalScore = Math.max(0, Math.min(100, Math.round(Number(summary.final_score || summary.score || 0))));
    const band = String(summary.risk_band || "Needs Review");
    const emoji = finalScore >= 85 ? "✅" : finalScore >= 70 ? "⚠️" : "❌";
    scoreNode.textContent = `Inbox Score: ${finalScore}% ${emoji}`;
    riskNode.textContent = `Risk Level: ${band.toUpperCase()}`;

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    issuesNode.innerHTML = "";
    const items = nonMeta.length ? nonMeta.slice(0, 3).map((item) => String(item.title || item.issue || "Risk detected")) : ["Spam trigger words detected", "No personalization", "Suspicious phrasing"];
    items.forEach((item) => {
        const li = document.createElement("li");
        li.textContent = item;
        issuesNode.appendChild(li);
    });

    const preview = getQuickFixPreview(summary, findings);
    previewBeforeNode.textContent = preview.before;
    previewAfterNode.textContent = preview.after;
}

function startRealtimeScanSteps() {
    if (!loadingStep) {
        return null;
    }

    let idx = 0;
    let cancelled = false;
    loadingStep.textContent = loadSteps[idx];
    loadingStepNodes.forEach((node) => {
        if (node) {
            node.classList.remove("active");
            node.textContent = node.textContent.replace(/\s✓$/, "");
        }
    });

    function runStep() {
        if (cancelled) {
            return;
        }
        const current = loadingStepNodes[idx];
        if (current) {
            current.classList.add("active");
            if (!current.textContent.endsWith(" ✓")) {
                current.textContent = `${loadSteps[idx]} ✓`;
            }
        }
        idx = (idx + 1) % loadSteps.length;
        loadingStep.textContent = loadSteps[idx];
        setTimeout(runStep, 350 + idx * 100);
    }

    setTimeout(runStep, 140);
    return {
        stop: () => {
            cancelled = true;
        },
    };
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

function confidenceScoreValue(confidence) {
    const value = String(confidence || "medium").toLowerCase();
    if (value === "high") {
        return 88;
    }
    if (value === "medium") {
        return 58;
    }
    return 28;
}

function classifyIssueScope(summary, signals, findings) {
    const band = String(summary.risk_band || "");
    const lowerFindings = (findings || []).map((item) => `${item.title || ""} ${item.issue || ""} ${item.impact || ""}`.toLowerCase());
    const hasContentSignals = lowerFindings.some((text) => /broadcast|mass|personal|cta|urgency|pressure|tone|promo|link|image/.test(text));
    const spf = String(signals.spf_status || "unknown");
    const dkim = String(signals.dkim_status || "unknown");
    const dmarc = String(signals.dmarc_status || "unknown");
    const infraWeak = !(spf === "found" && dkim === "found" && dmarc === "found");

    if (infraWeak && hasContentSignals) {
        return "MIXED";
    }
    if (infraWeak || band === "High Spam-Risk Signals" || band === "High Risk") {
        return "INFRA";
    }
    if (hasContentSignals) {
        return "CONTENT";
    }
    return "CONTENT";
}

function renderStatus(summary, signals, findings) {
    if (!statusRiskBandNode || !statusPrimaryIssueNode || !statusConfidenceNode) {
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
    const confidenceValue = confidenceScoreValue(confidence);
    const mode = String(summary.analysis_mode || "content");
    const scope = classifyIssueScope(summary, signals, findings);

    if (band === "Content Safe" && confidence === "low") {
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

    statusPrimaryIssueNode.textContent = `${scope}: ${primaryIssue(summary, findings)}`;

    const confidenceBasis = String(summary.analysis_mode || "content") === "full"
        ? "content + technical signals"
        : "content-only signals";
    const confidenceLabel = confidence.charAt(0).toUpperCase() + confidence.slice(1);
    statusConfidenceNode.textContent = `${confidenceLabel} (${scope === "INFRA" ? "infra-heavy" : scope === "MIXED" ? "mixed" : "content-led"})`;

    if (confidenceMeterFillNode) {
        confidenceMeterFillNode.style.width = `${confidenceValue}%`;
        confidenceMeterFillNode.style.background = confidenceValue >= 80
            ? "linear-gradient(90deg, #ef4444 0%, #f97316 100%)"
            : confidenceValue >= 50
                ? "linear-gradient(90deg, #f59e0b 0%, #facc15 100%)"
                : "linear-gradient(90deg, #f97316 0%, #f59e0b 100%)";
    }

    if (confidenceMeterDetailNode) {
        confidenceMeterDetailNode.textContent = `Confidence is ${confidenceLabel.toLowerCase()} because ${confidenceBasis}.`;
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
                trustHookNode.textContent = "Scan complete. Use Fix Issues to make it 1:1 and personal.";
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
        const title = String(item.title || "Risk");
        const low = title.toLowerCase();
        if (low.includes("urgency") || low.includes("pressure")) {
            li.textContent = `\"Only 1 day left\" style language is a spam trigger for Gmail filters.`;
        } else if (low.includes("broadcast") || low.includes("mass")) {
            li.textContent = "This reads like a mass campaign and lowers trust/reply rates.";
        } else if (low.includes("personalization")) {
            li.textContent = "Low personalization makes this look promotional instead of 1:1 outreach.";
        } else if (low.includes("spf") || low.includes("dkim") || low.includes("dmarc")) {
            li.textContent = "Authentication gaps can push this to spam even with good copy.";
        } else {
            li.textContent = `${title} can reduce inbox placement if not fixed.`;
        }
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

function renderPrediction(summary, prediction) {
    if (!predictionHeadlineNode || !predictionDetailNode || !predictionBandsNode) {
        return;
    }
    const score = Number(summary && (summary.final_score || summary.score || 0));
    const prob = Number(prediction && prediction.inbox_probability ? prediction.inbox_probability : 0);
    const likely = String(prediction && prediction.likely_outcome ? prediction.likely_outcome : "unknown");
    const benchmark = prediction && prediction.benchmark ? prediction.benchmark : null;
    const benchmarkAvailable = Boolean(benchmark && benchmark.available);
    const benchmarkScore = benchmarkAvailable ? Number(benchmark.top_10_score || 0) : 0;
    const benchmarkInboxSamples = benchmarkAvailable ? Number(benchmark.inbox_samples || 0) : 0;
    const samples = Number(prediction && prediction.samples ? prediction.samples : 0);

    predictionHeadlineNode.textContent = `Will likely land: ${likely.toUpperCase()} (${prob.toFixed(1)}% inbox probability)`;
    if (benchmarkAvailable) {
        predictionDetailNode.textContent = `Your score: ${score} | Your inbox benchmark is ${benchmarkScore}+ based on ${benchmarkInboxSamples} inbox outcomes | Learned samples: ${samples}`;
    } else {
        predictionDetailNode.textContent = `Your score: ${score} | No inbox benchmark yet - record at least 10 inbox outcomes to build a real baseline | Learned samples: ${samples}`;
    }
    predictionBandsNode.innerHTML = "";
    const rows = [
        `Score 85+ usually maps to strongest inbox probability.`,
        `Score 70-84 is often test-batch safe with monitoring.`,
        `Score below 70 usually needs fixes before scaling.`,
    ];
    rows.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        predictionBandsNode.appendChild(li);
    });
}

function buildBiggestRiskPayload(summary = {}, findings = [], payload = null) {
    if (payload && typeof payload === "object") {
        const reasons = Array.isArray(payload.reasons) ? payload.reasons : [];
        return {
            title: String(payload.title || "Looks like mass outreach"),
            summary: String(payload.summary || "Will likely be ignored quickly."),
            reasons: reasons.length ? reasons.map((item) => String(item)) : ["Generic opening", "No specific insight", "No proof"],
            impact: String(payload.impact || "Reply rate drops 30-50% and this can look like bulk outreach."),
        };
    }

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    const top = nonMeta[0] || {};
    const title = String(top.title || "Looks like mass outreach");
    const issue = String(top.issue || top.impact || "Will likely be ignored quickly");
    const band = String(summary.risk_band || "").toLowerCase();

    return {
        title,
        summary: issue || "Will likely be ignored quickly.",
        reasons: [
            title,
            String(top.issue || "No specific insight"),
            String(top.action || "No proof or credibility"),
        ].filter((line) => String(line || "").trim()),
        impact: band.includes("high")
            ? "Reply rate can drop by 30-50%. This may look like bulk outreach and damage domain reputation over time."
            : "This can still reduce replies and weaken trust if sent unchanged.",
    };
}

function renderConversionResult(data) {
    const issues = Array.isArray(data && data.issues)
        ? data.issues
        : Array.isArray(data && data.findings)
            ? data.findings
            : Array.isArray(data && data.partial_findings)
                ? data.partial_findings
                : Array.isArray(data && data.summary && data.summary.findings)
                    ? data.summary.findings
                    : [];
    const improved = String(
        (data && data.improved_email)
        || (data && data.instant_fixed)
        || (data && data.rewritten_text)
        || (data && data.rewritten_body)
        || ""
    );
    const original = String((data && data.original_email) || (rawEmailInput && rawEmailInput.value) || "");

    // Show result container and screen
    const resultContainer = document.getElementById("result");
    if (resultContainer) {
        resultContainer.classList.remove("hidden");
    }

    if (resultScreenNode) {
        resultScreenNode.classList.remove("hidden");
    }

    // Populate Status Overview
    const statusOverview = document.getElementById("status-overview");
    const statusBadge = document.getElementById("status-badge");
    const statusHeadline = document.getElementById("status-headline");
    const statusSub = document.getElementById("status-sub");

    if (statusOverview) {
        statusOverview.classList.remove("hidden");
    }

    const summary = data && typeof data.summary === "object" ? data.summary : {};
    const riskBand = String((summary && summary.risk_band) || "").toLowerCase();
    const baseScore = Number((summary && summary.score) ?? data.score ?? 0);
    const inferredRiskScore = Number.isFinite(baseScore)
        ? Math.max(0, Math.min(100, 100 - baseScore))
        : (issues.length ? 75 : 20);
    const riskScore = Number((summary && summary.risk_score) ?? data.risk_score ?? inferredRiskScore);

    const riskClass = getRiskClass(riskScore, riskBand);
    const riskLabel = riskClass === "risk-high" ? "High Risk" : riskClass === "risk-medium" ? "Medium Risk" : "Low Risk";

    if (statusOverview) {
        statusOverview.classList.remove("danger", "warning", "success");
        statusOverview.classList.add(riskClass === "risk-high" ? "danger" : riskClass === "risk-medium" ? "warning" : "success");
    }

    if (statusBadge && statusHeadline && statusSub) {
        if (riskClass === "risk-low") {
            statusBadge.textContent = "SAFE TO SEND";
            statusBadge.className = "status-badge success";
            statusHeadline.textContent = "Your email looks safe to send";
            statusSub.textContent = "No major issues detected. Keep the message focused and personal.";
        } else if (riskClass === "risk-medium") {
            statusBadge.textContent = "REVIEW RECOMMENDED";
            statusBadge.className = "status-badge warning";
            statusHeadline.textContent = "Your email may underperform without fixes";
            statusSub.textContent = "We found caution signals that can lower engagement and placement.";
        } else {
            statusBadge.textContent = "ACTION REQUIRED";
            statusBadge.className = "status-badge danger";
            statusHeadline.textContent = "Your email may hurt reply rates";
            statusSub.textContent = "We detected issues affecting deliverability and engagement.";
        }
    }

    // Populate Decision Grid
    const statusRiskCard = document.getElementById("status-risk-card");
    const statusRisk = document.getElementById("status-risk");
    const primaryIssueCard = document.getElementById("primary-issue");
    const statusConfidence = document.getElementById("status-confidence");

    if (statusRiskCard) {
        statusRiskCard.classList.remove("risk-high", "risk-medium", "risk-low");
        statusRiskCard.classList.add(riskClass);
        const labelNode = statusRiskCard.querySelector("span");
        if (labelNode) {
            labelNode.textContent = "RISK STATUS";
        }
    }

    if (statusRisk) {
        statusRisk.textContent = riskLabel;
    }

    if (primaryIssueCard) {
        const primaryIssue = issues.length === 0
            ? "no_clear_value"
            : String(issues[0] && (issues[0].type || issues[0].message || issues[0].title) || "spam_phrase");
        primaryIssueCard.textContent = issues.length === 0 ? "No critical issue" : humanizeIssue(primaryIssue);
    }

    if (statusConfidence) {
        statusConfidence.textContent = issues.length === 0 ? "High" : "Medium";
    }

    const topIssueText = String(issues[0] && (issues[0].message || issues[0].type || issues[0].title) || "No major issue detected");
    if (biggestRiskTextNode) {
        biggestRiskTextNode.innerHTML = issues.length === 0
            ? "Your email has <strong>no major issues</strong> and is ready for a send test."
            : `Your email has <strong>${topIssueText.toLowerCase()}</strong>`;
    }

    if (deliverabilitySummaryNode) {
        if (issues.length === 0) {
            deliverabilitySummaryNode.textContent = "Clean content signal profile with no major spam triggers.";
        } else {
            const summaryBits = issues.slice(0, 2).map((issue) => String(issue && (issue.message || issue.type || issue.title) || "risk signal")).filter(Boolean);
            deliverabilitySummaryNode.textContent = summaryBits.length ? summaryBits.join(", ") : "Overly salesy language, spam triggers used";
        }
    }

    if (fixTitleNode) {
        fixTitleNode.textContent = "Improved Version";
    }

    renderRewrite({
        original,
        rewritten: (data && data.rewritten) || improved || (data && data.fix) || original,
        improved: data && data.improved,
        fix: data && data.fix,
        rewritten_text: data && data.rewritten_text,
        issue_highlights: (data && data.issue_highlights)
            || issues.map((issue) => String(issue && (issue.span || issue.phrase || "") || "")).filter(Boolean),
    });

    renderTags(generateTags((data && data.issues) || issues));

    if (topFixesListNode) {
        topFixesListNode.innerHTML = "";
        const topFixes = Array.isArray(data && data.top_fixes) ? data.top_fixes : [];
        if (!topFixes.length && issues.length === 0) {
            const item = document.createElement("li");
            item.textContent = "Keep the message short and personal.";
            topFixesListNode.appendChild(item);
        } else if (!topFixes.length) {
            const itemA = document.createElement("li");
            itemA.textContent = "Remove spam phrases";
            topFixesListNode.appendChild(itemA);
            const itemB = document.createElement("li");
            itemB.textContent = "Personalize messaging";
            topFixesListNode.appendChild(itemB);
        } else {
            topFixes.slice(0, 3).forEach((fix, index) => {
                const item = document.createElement("li");
                item.textContent = `${index + 1}. ${String(fix && (fix.title || fix.type || fix.action) || "Review this issue")}`;
                topFixesListNode.appendChild(item);
            });
        }
    }

    // Legacy elements for backwards compatibility
    if (decisionTitleNode && primaryIssueNode) {
        if (issues.length === 0) {
            decisionTitleNode.textContent = "Safe to send";
            primaryIssueNode.textContent = "No major issues detected";
        } else {
            decisionTitleNode.textContent = "Analyze before sending";
            const compatibilityIssue = String(issues[0] && (issues[0].type || issues[0].message || issues[0].title) || "Issues detected");
            primaryIssueNode.textContent = humanizeIssue(compatibilityIssue);
        }
    }

    if (step2FixBlockNode) {
        step2FixBlockNode.classList.remove("hidden");
    }
    if (step3BlockNode) {
        step3BlockNode.classList.remove("hidden");
    }

    if (beforeEmailNode) {
        const structuredIssues = (data && Array.isArray(data.issues))
            ? data.issues
            : issues;
        beforeEmailNode.innerHTML = highlightIssues(original, structuredIssues);
    }
    if (afterEmailNode) {
        afterEmailNode.textContent = String((data && (data.rewritten || data.improved || data.fix || data.rewritten_text)) || improved || "No rewrite generated");
    }

    const fallbackDiff = issues.map((issue) => ({
        removed: String(issue && (issue.span || issue.message || issue.title || issue.type) || "Risky phrasing"),
        added: String(issue && issue.fix ? issue.fix : "Safer neutral phrasing"),
    }));
    renderDiff((data && Array.isArray(data.diff) && data.diff.length) ? data.diff : fallbackDiff.slice(0, 4));

    if (rewriteNotesNode) {
        rewriteNotesNode.innerHTML = "";
        const notes = [
            "✔ Optimized for inbox placement and reply rate",
            "✔ Removed bulk-style phrasing patterns",
        ];
        notes.forEach((note) => {
            const p = document.createElement("p");
            p.textContent = note;
            rewriteNotesNode.appendChild(p);
        });
    }

    if (copyFixedBtnNode) {
        copyFixedBtnNode.onclick = null;
    }

    if (restoreBtnNode) {
        restoreBtnNode.onclick = () => {
            if (rawEmailInput) {
                rawEmailInput.value = original;
            }
        };
    }

    if (gmailBtnNode) {
        gmailBtnNode.onclick = () => {
            const bodyText = String(improved || original || "");
            if (!bodyText.trim()) {
                return;
            }
            window.open(`https://mail.google.com/mail/?view=cm&fs=1&body=${encodeURIComponent(bodyText)}`, "_blank", "noopener");
        };
    }

    if (runTestBtnNode) {
        runTestBtnNode.onclick = null;
    }

    window.appState.hasScanned = true;
    window.appState.hasOptimized = true;
    syncProgressState();
    updateSteps();
}

function getRiskClass(score, riskBand = "") {
    const normalizedBand = String(riskBand || "").toLowerCase();
    if (normalizedBand.includes("high")) {
        return "risk-high";
    }
    if (normalizedBand.includes("medium") || normalizedBand.includes("moderate")) {
        return "risk-medium";
    }
    if (normalizedBand.includes("low")) {
        return "risk-low";
    }

    const value = Number(score);
    if (value > 70) {
        return "risk-high";
    }
    if (value > 40) {
        return "risk-medium";
    }
    return "risk-low";
}

function humanizeIssue(issue) {
    const map = {
        weak_cta: "Your call-to-action is unclear or weak",
        spam_phrase: "Spam-triggering words detected",
        too_long: "Email is too long",
        long_intro: "Intro is too long before the value",
        generic_personalization: "Email feels generic and not personalized",
        no_clear_value: "Value proposition is not clear",
    };
    const key = String(issue || "").toLowerCase().trim();
    return map[key] || key.replace(/_/g, " ") || "No major issue detected";
}

function highlightIssueSpans(text, spans = []) {
    let html = escapeHtml(String(text || ""));
    spans.filter(Boolean).forEach((span) => {
        const safeSpan = escapeHtml(String(span));
        if (!safeSpan) {
            return;
        }
        const escaped = safeSpan.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(escaped, "gi");
        html = html.replace(regex, (match) => `<span class=\"spam-word\">${match}</span>`);
    });
    return html;
}

function renderRealtimeLint(payload) {
    if (!realtimeIssuesListNode || !realtimeLintBandNode) {
        return;
    }
    const issues = Array.isArray(payload && payload.issues) ? payload.issues : [];
    const summary = payload && typeof payload.summary === "object" ? payload.summary : {};
    const band = String(summary.risk_band || "low").toLowerCase();
    const total = Number((summary.counts && summary.counts.total) || issues.length || 0);

    realtimeLintBandNode.classList.remove("risk-high", "risk-medium", "risk-low");
    realtimeLintBandNode.classList.add(band === "high" ? "risk-high" : band === "medium" ? "risk-medium" : "risk-low");
    realtimeLintBandNode.textContent = `${band.charAt(0).toUpperCase()}${band.slice(1)} risk (${total})`;

    realtimeIssuesListNode.innerHTML = "";
    if (!issues.length) {
        const li = document.createElement("li");
        li.textContent = "No live issues detected. This draft currently looks clean.";
        realtimeIssuesListNode.appendChild(li);
        return;
    }

    issues.slice(0, 8).forEach((issue) => {
        const li = document.createElement("li");
        const type = String(issue && issue.type ? issue.type : "issue").toLowerCase();
        li.classList.add(`issue-${type}`);
        const phrase = String(issue && issue.phrase ? issue.phrase : "Issue");
        const reason = String(issue && issue.reason ? issue.reason : "Needs review");
        li.innerHTML = `<strong>${escapeHtml(phrase)}</strong> -> ${escapeHtml(reason)}`;
        realtimeIssuesListNode.appendChild(li);
    });
}

async function runRealtimeLint(text) {
    const value = String(text || "");
    if (value.trim().length < 4) {
        renderRealtimeLint({ issues: [], summary: { risk_band: "low", counts: { total: 0 } } });
        return;
    }
    const response = await fetch("/lint-realtime", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: value }),
    });
    if (!response.ok) {
        throw new Error("Could not run live lint.");
    }
    const data = await response.json();
    renderRealtimeLint(data);
}

function scheduleRealtimeLint() {
    if (!rawEmailInput) {
        return;
    }
    if (realtimeLintTimer) {
        clearTimeout(realtimeLintTimer);
    }
    realtimeLintTimer = setTimeout(() => {
        runRealtimeLint(rawEmailInput.value).catch(() => {
            renderRealtimeLint({ issues: [], summary: { risk_band: "low", counts: { total: 0 } } });
        });
    }, 220);
}

function highlightIssues(text, issues) {
    const source = String(text || "");
    const rows = Array.isArray(issues) ? issues : [];
    if (!rows.length) {
        return escapeHtml(source);
    }

    const positional = rows
        .filter((issue) => Number.isInteger(issue && issue.start) && Number.isInteger(issue && issue.end) && Number(issue.end) > Number(issue.start))
        .map((issue) => ({
            type: String(issue.type || "issue").toLowerCase(),
            start: Number(issue.start),
            end: Number(issue.end),
            label: String(issue.label || issue.type || "Issue"),
            reason: String(issue.reason || issue.explanation || ""),
        }))
        .sort((a, b) => a.start - b.start);

    if (!positional.length) {
        let html = escapeHtml(source);
        rows.forEach((issue) => {
            const needle = String(issue && (issue.text || issue.span || issue.phrase || "") ? (issue.text || issue.span || issue.phrase) : "").trim();
            if (!needle) {
                return;
            }
            const escapedNeedle = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(escapedNeedle, "gi");
            const label = String(issue && (issue.label || issue.issue || issue.type || "Issue") ? (issue.label || issue.issue || issue.type) : "Issue");
            const reason = String(issue && (issue.reason || issue.explanation || issue.why || label) ? (issue.reason || issue.explanation || issue.why || label) : label);
            html = html.replace(regex, (match) => `<span class="issue-highlight" title="${escapeHtml(reason)}">${match}</span><span class="issue-inline-note"> ${escapeHtml(label)}</span>`);
        });
        return html;
    }

    let cursor = 0;
    let html = "";
    positional.forEach((issue) => {
        if (issue.start < cursor) {
            return;
        }
        html += escapeHtml(source.slice(cursor, issue.start));
        const target = escapeHtml(source.slice(issue.start, issue.end));
        const reason = issue.reason || issue.label;
        html += `<span class="issue-highlight issue-${issue.type}" title="${escapeHtml(reason)}">${target}</span>`;
        html += `<span class="issue-inline-note"> ${escapeHtml(issue.label)}</span>`;
        cursor = issue.end;
    });
    html += escapeHtml(source.slice(cursor));
    return html;
}

async function generateRewrite(mode = "safe") {
    if (!rawEmailInput || !afterEmailNode || !beforeEmailNode) {
        return;
    }
    const original = String(rawEmailInput.value || "").trim();
    if (original.length < 20) {
        showError("Paste the full email draft before generating rewrite.");
        return;
    }

    const payload = new FormData();
    payload.set("raw_email", original);
    payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
    payload.set("rewrite_mode", mode);
    payload.set("rewrite_style", mode);
    if (domainInput && String(domainInput.value || "").trim()) {
        payload.set("domain", String(domainInput.value || "").trim());
    }

    const response = await fetch("/rewrite", { method: "POST", body: payload });
    if (!response.ok) {
        throw new Error("Rewrite failed. Try again.");
    }
    const data = await response.json();
    applyRewriteResponse(data, original, mode, { livePreview: false });
    setRewriteLiveStatus("Live rewrite follows the current draft and feedback profile.");
}

function renderRewrite(data) {
    const original = String((data && data.original) || "");
    const rewritten = String(
        (data && (data.rewritten || data.improved || data.fix || data.rewritten_text)) || "No rewrite generated"
    );
    const highlightSpans = Array.isArray(data && data.issue_highlights) ? data.issue_highlights : [];
    const structuredIssues = Array.isArray(data && data.issues) ? data.issues : [];

    if (beforeEmailNode) {
        if (structuredIssues.length) {
            beforeEmailNode.innerHTML = highlightIssues(original, structuredIssues);
        } else {
            beforeEmailNode.innerHTML = highlightIssueSpans(original, highlightSpans);
        }
    }
    if (afterEmailNode) {
        afterEmailNode.textContent = rewritten;
    }
}

function normalizeIssueRows(data) {
    const raw = Array.isArray(data && data.issues) ? data.issues : [];
    return raw.map((issue) => {
        const text = String(issue && (issue.text || issue.span || issue.phrase || "") ? (issue.text || issue.span || issue.phrase) : "").trim();
        const reason = String(issue && (issue.reason || issue.explanation || issue.why || "") ? (issue.reason || issue.explanation || issue.why) : "").trim();
        return {
            text,
            label: String(issue && (issue.issue || issue.label || issue.type || "Issue") ? (issue.issue || issue.label || issue.type) : "Issue"),
            type: String(issue && issue.type ? issue.type : "issue").toLowerCase(),
            reason,
            start: Number.isInteger(issue && issue.start) ? Number(issue.start) : -1,
            end: Number.isInteger(issue && issue.end) ? Number(issue.end) : -1,
            fix: String(issue && (issue.fix || issue.primary_fix || issue.suggested_fix || "") ? (issue.fix || issue.primary_fix || issue.suggested_fix) : "").trim(),
        };
    }).filter((item) => item.text || item.reason || item.label);
}

function renderAnalysisResult(data) {
    if (!step2FixBlockNode || !beforeEmailNode || !afterEmailNode) {
        return;
    }

    const original = String(
        (data && (data.original || data.original_text || (data.signals && data.signals.email_source) || ""))
        || (rawEmailInput && rawEmailInput.value ? rawEmailInput.value : "")
    );
    const rewritten = String(
        (data && (data.rewritten || data.rewritten_text || data.fix || data.improved || ""))
        || ""
    );
    const issues = normalizeIssueRows(data);

    step2FixBlockNode.classList.remove("hidden");
    if (resultSection) {
        resultSection.classList.remove("hidden");
    }

    beforeEmailNode.innerHTML = highlightIssues(original, issues);
    afterEmailNode.textContent = rewritten || "Run rewrite to generate an improved version.";

    if (rewriteSummaryNode) {
        rewriteSummaryNode.textContent = issues.length
            ? `We found ${issues.length} issue${issues.length === 1 ? "" : "s"} that hurt deliverability.`
            : "No major phrase-level issues were detected in this draft.";
    }

    if (decisionTitleNode) {
        decisionTitleNode.textContent = issues.length ? "Fix before sending" : "No major issues detected";
    }
    if (primaryIssueNode) {
        const firstIssue = issues[0];
        primaryIssueNode.textContent = firstIssue
            ? `${firstIssue.text || firstIssue.label} - ${firstIssue.reason || firstIssue.label}`
            : "No critical issue found";
    }
    if (biggestRiskTextNode) {
        biggestRiskTextNode.textContent = issues.length
            ? `Primary issue: ${issues[0].text || issues[0].label}`
            : "No high-risk phrase-level patterns were detected.";
    }

    if (issueListNode) {
        if (!issues.length) {
            issueListNode.innerHTML = '<div class="issue-item">No major phrase-level issues detected.</div>';
        } else {
            issueListNode.innerHTML = issues.slice(0, 8).map((issue) => {
                const fixText = issue.fix ? ` | Fix: ${escapeHtml(issue.fix)}` : "";
                return `<div class="issue-item"><strong>${escapeHtml(issue.text || issue.label)}</strong> - ${escapeHtml(issue.reason || issue.label)}${fixText}</div>`;
            }).join("");
        }
    }

    if (rewriteNotesNode && Array.isArray(data && data.issue_fixes) && data.issue_fixes.length) {
        rewriteNotesNode.innerHTML = "";
        data.issue_fixes.slice(0, 4).forEach((item) => {
            const p = document.createElement("p");
            const text = String(item && (item.text || item.issue) ? (item.text || item.issue) : "Issue");
            const why = String(item && item.why ? item.why : "Needs attention");
            const fix = String(item && item.suggested_fix ? item.suggested_fix : "");
            p.textContent = `${text} -> ${why}${fix ? ` | Fix: ${fix}` : ""}`;
            rewriteNotesNode.appendChild(p);
        });
    }
}

function renderBlockedScanResult(title, message) {
    const rawText = rawEmailInput ? String(rawEmailInput.value || "").trim() : "";

    // Show result container and screen
    const resultContainer = document.getElementById("result");
    if (resultContainer) {
        resultContainer.classList.remove("hidden");
    }
    if (resultScreenNode) {
        resultScreenNode.classList.remove("hidden");
    }
    if (decisionTitleNode) {
        decisionTitleNode.textContent = title || "Scan blocked";
    }
    if (primaryIssueNode) {
        primaryIssueNode.textContent = message || "Sign in to continue scanning.";
    }
    if (step2FixBlockNode) {
        step2FixBlockNode.classList.remove("hidden");
    }
    if (step3BlockNode) {
        step3BlockNode.classList.remove("hidden");
    }
    if (beforeEmailNode) {
        beforeEmailNode.textContent = rawText || "Paste your email and scan again.";
    }
    if (afterEmailNode) {
        afterEmailNode.textContent = "Unlock access to generate the fixed version.";
    }
    if (diffSummaryNode) {
        diffSummaryNode.innerHTML = "";
        const line = document.createElement("div");
        line.className = "diff-line";
        line.textContent = message || "Result is hidden until access is restored.";
        diffSummaryNode.appendChild(line);
    }
    resultSection?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function renderSubjectIntel(data) {
    if (!subjectTopPickNode || !subjectTopReasonNode || !subjectWarningListNode || !subjectTopListNode || !subjectAllListNode) {
        return;
    }

    const topPicks = Array.isArray(data && data.top_picks ? data.top_picks : []) ? data.top_picks : [];
    const strategies = Array.isArray(data && data.strategies ? data.strategies : []) ? data.strategies : [];
    const warnings = Array.isArray(data && data.warnings ? data.warnings : []) ? data.warnings : [];
    const best = topPicks[0] || null;

    subjectTopPickNode.textContent = best ? `${best.subject} (${Number(best.score || 0).toFixed(1)}/10)` : "No subject generated yet.";
    subjectTopReasonNode.textContent = best ? `${(best.tags || []).join(" • ") || "clean"} | ${best.alignment || "moderate"} body fit | ${best.notes && best.notes.spam_risk ? best.notes.spam_risk : "low"} spam risk` : "Fill the form to generate product-specific subject lines.";

    subjectWarningListNode.innerHTML = "";
    if (!warnings.length) {
        const li = document.createElement("li");
        li.textContent = "No major warnings. Top subjects look aligned with the provided context.";
        subjectWarningListNode.appendChild(li);
    } else {
        warnings.forEach((warning) => {
            const li = document.createElement("li");
            li.textContent = String(warning);
            subjectWarningListNode.appendChild(li);
        });
    }

    subjectTopListNode.innerHTML = "";
    topPicks.slice(0, 5).forEach((item, index) => {
        const li = document.createElement("li");
        li.textContent = `${index + 1}. ${item.subject} — ${Number(item.score || 0).toFixed(1)}/10 (${(item.tags || []).join(", ") || "clean"})`;
        subjectTopListNode.appendChild(li);
    });
    if (!topPicks.length) {
        const li = document.createElement("li");
        li.textContent = "No options generated.";
        subjectTopListNode.appendChild(li);
    }

    subjectAllListNode.innerHTML = "";
    strategies.slice(0, 12).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${item.strategy}: ${item.subject} | ${Number(item.score || 0).toFixed(1)}/10 | ${item.alignment || "moderate"} match`;
        subjectAllListNode.appendChild(li);
    });
    if (!strategies.length) {
        const li = document.createElement("li");
        li.textContent = "Generated subject lines will appear here.";
        subjectAllListNode.appendChild(li);
    }
}

async function generateSubjectLines() {
    if (!generateSubjectsButton) {
        return;
    }

    const payload = {
        product_name: String(subjectProductNameInput && subjectProductNameInput.value ? subjectProductNameInput.value : "InboxGuard").trim() || "InboxGuard",
        target_role: String(subjectTargetRoleInput && subjectTargetRoleInput.value ? subjectTargetRoleInput.value : "").trim(),
        industry: String(subjectIndustryInput && subjectIndustryInput.value ? subjectIndustryInput.value : "").trim(),
        goal: String(subjectGoalInput && subjectGoalInput.value ? subjectGoalInput.value : "").trim(),
        email_type: String(subjectEmailTypeInput && subjectEmailTypeInput.value ? subjectEmailTypeInput.value : "cold").trim(),
        tone: String(subjectToneInput && subjectToneInput.value ? subjectToneInput.value : "internal").trim(),
        context: String(subjectContextInput && subjectContextInput.value ? subjectContextInput.value : "").trim(),
        body: String(subjectBodyInput && subjectBodyInput.value ? subjectBodyInput.value : "").trim() || String(rawEmailInput && rawEmailInput.value ? rawEmailInput.value : "").trim(),
    };

    generateSubjectsButton.disabled = true;
    const previousLabel = generateSubjectsButton.textContent;
    generateSubjectsButton.textContent = "Generating...";
    try {
        const response = await fetch("/subject-lines", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok || !data.ok) {
            throw new Error(String(data.detail || data.error || "Could not generate subject lines."));
        }
        renderSubjectIntel(data);
        trackEvent("subject_lines_generated", {
            product: payload.product_name,
            role: payload.target_role,
            industry: payload.industry,
        });
    } catch (error) {
        showError(error && error.message ? error.message : "Could not generate subject lines.");
    } finally {
        generateSubjectsButton.disabled = false;
        generateSubjectsButton.textContent = previousLabel;
    }
}

async function runSeedAuto() {
    const previousLabel = runSeedAutoButton ? runSeedAutoButton.textContent : "Run Automated Seed Test";
    setActionButtonState(runSeedAutoButton, "loading", "Running...");
    const campaign = seedCampaignInput ? String(seedCampaignInput.value || "").trim() : "";
    const subjectToken = `IG-${Date.now().toString(36)}`;
    const payload = new FormData();
    payload.set("campaign_name", campaign || "Automated Seed Run");
    payload.set("subject_token", subjectToken);
    payload.set("body_text", String(rawEmailInput && rawEmailInput.value ? rawEmailInput.value : "InboxGuard seed probe"));
    try {
        const response = await fetch("/seed-run-async", { method: "POST", body: payload });
        if (!response.ok) {
            throw new Error("Could not start automated seed test.");
        }
        const data = await response.json();
        showError("Automated seed test queued. Polling result...");
        for (let i = 0; i < 20; i += 1) {
            await sleep(1200);
            const poll = await fetch(`/analyze-jobs/${String(data.job_id || "")}`, { method: "GET" });
            if (!poll.ok) {
                continue;
            }
            const job = await poll.json();
            if (job.status === "completed") {
                setActionButtonState(runSeedAutoButton, "success", "Completed");
                showError("Automated seed test completed.");
                await refreshSeedTests();
                return;
            }
            if (job.status === "failed") {
                throw new Error(String(job.error || "Seed test failed."));
            }
        }
        throw new Error("Seed test is still running. Check jobs and try again.");
    } catch (error) {
        setActionButtonState(runSeedAutoButton, "error", "Error");
        throw error;
    } finally {
        setTimeout(() => {
            setActionButtonState(runSeedAutoButton, "idle", previousLabel);
        }, 1000);
    }
}

async function runSeedSync() {
    const previousLabel = runSeedSyncButton ? runSeedSyncButton.textContent : "Run Instant Seed Probe";
    setActionButtonState(runSeedSyncButton, "loading", "Running...");
    const campaign = seedCampaignInput ? String(seedCampaignInput.value || "").trim() : "";
    const subject = campaign || "InboxGuard Seed Test";
    const body = String(rawEmailInput && rawEmailInput.value ? rawEmailInput.value : "InboxGuard seed probe");
    try {
        const response = await fetch("/seed-test", {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                subject,
                body,
                campaign_name: campaign || "Instant Seed Run",
                wait_seconds: 6,
            }),
        });
        if (!response.ok) {
            const errorBody = await response.json().catch(() => ({}));
            throw new Error(String(errorBody.detail || "Could not run instant seed probe."));
        }
        const data = await response.json();
        const placements = Array.isArray(data.placements) ? data.placements : [];
        const summary = data.summary && typeof data.summary === "object" ? data.summary : {};
        if (seedTestListNode) {
            seedTestListNode.innerHTML = "";
            const summaryLine = document.createElement("li");
            summaryLine.textContent = `Summary | Inbox ${Number(summary.inbox || 0)} | Spam ${Number(summary.spam || 0)} | Promotions ${Number(summary.promotions || 0)} | Unknown ${Number(summary.unknown || 0)}`;
            seedTestListNode.appendChild(summaryLine);
            if (!placements.length) {
                const li = document.createElement("li");
                li.textContent = "Seed probe completed, but no provider placements were returned.";
                seedTestListNode.appendChild(li);
            } else {
                placements.forEach((row) => {
                    const li = document.createElement("li");
                    li.textContent = `Instant probe | ${String(row.provider || "provider")}: ${String(row.placement || "unknown")}`;
                    seedTestListNode.appendChild(li);
                });
            }
        }
        setActionButtonState(runSeedSyncButton, "success", "Completed");
        showError(`Instant seed probe completed (${String(data.test_id || "test")}).`);
    } catch (error) {
        setActionButtonState(runSeedSyncButton, "error", "Error");
        throw error;
    } finally {
        setTimeout(() => {
            setActionButtonState(runSeedSyncButton, "idle", previousLabel);
        }, 1000);
    }
}

async function refreshPlans() {
    const response = await fetch("/plans", { method: "GET" });
    if (!response.ok) {
        throw new Error("Could not load plan details.");
    }
    const data = await response.json();
    const plans = data.plans && typeof data.plans === "object" ? data.plans : {};
    if (!plansOutputNode) {
        return;
    }
    plansOutputNode.innerHTML = "";
    const displayOrder = ["free", "starter", "monthly", "annual", "usage"];
    const keys = displayOrder.filter((key) => Object.prototype.hasOwnProperty.call(plans, key));
    if (!keys.length) {
        const li = document.createElement("li");
        li.textContent = "No plans returned by server.";
        plansOutputNode.appendChild(li);
        return;
    }
    keys.forEach((key) => {
        const item = plans[key] || {};
        const li = document.createElement("li");
        const planKey = String(key || "").toLowerCase();
        const displayName = planDisplayName(planKey);
        li.textContent = `${displayName}: ${String(item.display_price || item.price || "n/a")}`;
        plansOutputNode.appendChild(li);
    });
}

async function requestAccess() {
    const email = String(accessRequestEmailInput && accessRequestEmailInput.value ? accessRequestEmailInput.value : "").trim();
    if (!email) {
        showError("Enter your email to request access.");
        return;
    }
    const payload = new FormData();
    payload.set("email", email);
    const response = await fetch("/request-access", { method: "POST", body: payload });
    if (!response.ok) {
        throw new Error("Could not submit access request.");
    }
    showError("Access request submitted.");
}

async function runBulkScan() {
    if (!bulkFileInput || !bulkFileInput.files || !bulkFileInput.files.length) {
        showError("Select a CSV file first.");
        return;
    }
    setListMessage(bulkResultsNode, "Running bulk scan...");
    const payload = new FormData();
    payload.set("file", bulkFileInput.files[0]);
    payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
    const response = await fetch("/bulk-analyze", { method: "POST", body: payload });
    if (!response.ok) {
        const message = await parseApiError(response, "Bulk scan failed. Verify CSV format and try again.");
        setListMessage(bulkResultsNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    if (!bulkResultsNode) {
        return;
    }
    bulkResultsNode.innerHTML = "";
    const items = Array.isArray(data.items) ? data.items : [];
    items.slice(0, 8).forEach((item) => {
        const li = document.createElement("li");
        if (item.error) {
            li.textContent = `Row ${item.row}: ${item.error}`;
        } else {
            li.textContent = `Row ${item.row}: Score ${item.score} | ${item.risk_band}`;
        }
        bulkResultsNode.appendChild(li);
    });
}

async function createApiKey() {
    const payload = new FormData();
    payload.set("name", apiKeyNameInput ? String(apiKeyNameInput.value || "Primary key") : "Primary key");
    setListMessage(opsOutputNode, "Creating API key...");
    const response = await fetch("/api-keys", { method: "POST", body: payload });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not create API key.");
        setListMessage(opsOutputNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    if (opsOutputNode) {
        opsOutputNode.innerHTML = "";
        const li = document.createElement("li");
        li.textContent = `API key created: ${String(data.api_key || "")}`;
        opsOutputNode.appendChild(li);
    }
}

async function listApiKeys() {
    setListMessage(apiKeyListNode, "Loading API keys...");
    const response = await fetch("/api-keys", { method: "GET" });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not load API keys.");
        setListMessage(apiKeyListNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!apiKeyListNode) {
        return;
    }
    apiKeyListNode.innerHTML = "";
    if (!items.length) {
        const li = document.createElement("li");
        li.textContent = "No API keys found.";
        apiKeyListNode.appendChild(li);
        return;
    }
    items.slice(0, 10).forEach((item) => {
        const li = document.createElement("li");
        const id = Number(item.id || 0);
        const name = String(item.name || "API key");
        const prefix = String(item.key_prefix || "");
        const created = String(item.created_at || "").slice(0, 10);
        const revoked = item.revoked_at ? "revoked" : "active";
        li.textContent = `#${id} ${name} (${prefix}...) | ${revoked} | created ${created}`;
        apiKeyListNode.appendChild(li);
    });
}

async function revokeApiKey() {
    const keyId = Number(revokeKeyIdInput && revokeKeyIdInput.value ? revokeKeyIdInput.value : 0);
    if (!keyId) {
        showError("Enter a valid API key ID to revoke.");
        return;
    }
    setListMessage(opsOutputNode, `Revoking API key #${keyId}...`);
    const payload = new FormData();
    payload.set("key_id", String(keyId));
    const response = await fetch("/api-keys/revoke", { method: "POST", body: payload });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not revoke API key.");
        setListMessage(opsOutputNode, message);
        throw new Error(message);
    }
    showError(`API key #${keyId} revoked.`);
    await listApiKeys();
}

async function createTeam() {
    const payload = new FormData();
    payload.set("name", teamNameInput ? String(teamNameInput.value || "My Team") : "My Team");
    setListMessage(opsOutputNode, "Creating team...");
    const response = await fetch("/teams", { method: "POST", body: payload });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not create team.");
        setListMessage(opsOutputNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    if (opsOutputNode) {
        const li = document.createElement("li");
        li.textContent = `Team created with id: ${String(data.team_id || "")}`;
        opsOutputNode.appendChild(li);
    }
}

async function listTeams() {
    setListMessage(teamListNode, "Loading teams...");
    const response = await fetch("/teams", { method: "GET" });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not load teams.");
        setListMessage(teamListNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!teamListNode) {
        return;
    }
    teamListNode.innerHTML = "";
    if (!items.length) {
        const li = document.createElement("li");
        li.textContent = "No teams found.";
        teamListNode.appendChild(li);
        return;
    }
    items.slice(0, 10).forEach((item) => {
        const li = document.createElement("li");
        const id = Number(item.id || 0);
        const name = String(item.name || "Team");
        const role = String(item.role || "member");
        li.textContent = `#${id} ${name} | your role: ${role}`;
        teamListNode.appendChild(li);
    });
}

async function addTeamMember() {
    const teamId = Number(teamMemberTeamIdInput && teamMemberTeamIdInput.value ? teamMemberTeamIdInput.value : 0);
    const email = String(teamMemberEmailInput && teamMemberEmailInput.value ? teamMemberEmailInput.value : "").trim();
    const role = String(teamMemberRoleInput && teamMemberRoleInput.value ? teamMemberRoleInput.value : "member");
    if (!teamId || !email) {
        showError("Enter team ID and member email.");
        return;
    }
    setListMessage(opsOutputNode, `Adding ${email} to team #${teamId}...`);
    const payload = new FormData();
    payload.set("team_id", String(teamId));
    payload.set("email", email);
    payload.set("role", role);
    const response = await fetch("/teams/member", { method: "POST", body: payload });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not add team member.");
        setListMessage(opsOutputNode, message);
        throw new Error(message);
    }
    showError(`Added ${email} to team #${teamId} as ${role}.`);
    await listTeams();
}

async function refreshOutcomeStats() {
    setListMessage(outcomeStatsListNode, "Loading outcome stats...");
    const response = await fetch("/outcome-stats", { method: "GET" });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not load outcome stats.");
        setListMessage(outcomeStatsListNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    if (!outcomeStatsListNode) {
        return;
    }
    const bands = Array.isArray(data.score_bands) ? data.score_bands : [];
    outcomeStatsListNode.innerHTML = "";
    const summary = document.createElement("li");
    summary.textContent = `Samples: ${Number(data.samples || 0)} | Inbox rate: ${Number(data.inbox_rate || 0).toFixed(1)}% | Top benchmark: ${Number(data.benchmark_top_10_score || 85)}+`;
    outcomeStatsListNode.appendChild(summary);
    bands.slice(0, 4).forEach((row) => {
        const li = document.createElement("li");
        li.textContent = `Band ${String(row.band || "-")}: ${Number(row.inbox_rate || 0).toFixed(1)}% inbox (${Number(row.samples || 0)} samples)`;
        outcomeStatsListNode.appendChild(li);
    });
}

async function refreshJobs() {
    setListMessage(jobListNode, "Loading async jobs...");
    const response = await fetch("/jobs?limit=12", { method: "GET" });
    if (!response.ok) {
        const message = await parseApiError(response, "Could not load async jobs.");
        setListMessage(jobListNode, message);
        throw new Error(message);
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    if (!jobListNode) {
        return;
    }
    jobListNode.innerHTML = "";
    if (!items.length) {
        const li = document.createElement("li");
        li.textContent = "No async jobs found.";
        jobListNode.appendChild(li);
        return;
    }
    items.slice(0, 10).forEach((item) => {
        const li = document.createElement("li");
        const id = String(item.id || "").slice(0, 8);
        const status = String(item.status || "unknown");
        const queue = String(item.queue_name || "analysis");
        const updated = String(item.updated_at || "").replace("T", " ").slice(0, 19);
        li.textContent = `${id} | ${queue} | ${status} | ${updated}`;
        jobListNode.appendChild(li);
    });
}

function renderDecisionEngine(summary, signals, findings, prediction) {
    if (!decisionProblemNode || !decisionSignalNode || !decisionScopeNode || !decisionWhyNode || !decisionFixFirstNode || !decisionConsequenceNode || !riskStripNode || !riskStripTitleNode || !riskStripBodyNode || !scaleWarningListNode) {
        return;
    }

    const band = String(summary.risk_band || "Needs Review");
    const predictionDecision = String(prediction && prediction.decision ? prediction.decision : "").toUpperCase();
    const spf = String(signals.spf_status || "unknown");
    const dkim = String(signals.dkim_status || "unknown");
    const dmarc = String(signals.dmarc_status || "unknown");
    const infraWeak = !(spf === "found" && dkim === "found" && dmarc === "found");
    const scope = classifyIssueScope(summary, signals, findings);

    let problem = "TEST FIRST - Risk unclear at scale";
    let signalLine = "Use this verdict before your batch send to avoid preventable filtering.";
    let stripTitle = "TEST FIRST";
    let stripBody = "Risk is mixed. Run a real inbox test before scaling.";
    let stripClass = "risk-strip risk-strip-medium";
    if (predictionDecision === "DO NOT SEND" || band === "High Spam-Risk Signals" || band === "High Risk") {
        problem = "DO NOT SEND - This will likely hit spam";
        signalLine = "High-confidence spam pattern detected.";
        stripTitle = "DO NOT SEND";
        stripBody = "This email will likely land in spam if sent now.";
        stripClass = "risk-strip risk-strip-high";
    } else if (predictionDecision === "SAFE TO SEND" || band === "Content Safe") {
        problem = "SAFE TO SEND - Low spam risk";
        signalLine = "Low immediate risk. Start with a controlled test batch.";
        stripTitle = "SAFE TO SEND";
        stripBody = "This is acceptable for a small test batch.";
        stripClass = "risk-strip risk-strip-low";
    }

    if (infraWeak && (band === "High Spam-Risk Signals" || band === "High Risk")) {
        stripBody = "This email is likely to be filtered and technical trust signals are weak.";
    }

    decisionProblemNode.textContent = problem;
    decisionProblemNode.classList.remove("decision-pop", "pulse-red");
    void decisionProblemNode.offsetWidth;
    decisionProblemNode.classList.add("decision-pop");
    if (predictionDecision === "DO NOT SEND" || band === "High Spam-Risk Signals" || band === "High Risk") {
        decisionProblemNode.classList.add("pulse-red");
        transitionColor(decisionProblemNode, "#fca5a5", "#ef4444");
    } else {
        transitionColor(decisionProblemNode, "#93c5fd", "#22c55e");
    }
    animateDecision(decisionProblemNode);
    showOverlaySpring(stripTitle);
    revealText(decisionSignalNode, signalLine);
    decisionScopeNode.textContent = `Primary issue: ${scope}${scope === "INFRA" ? " - technical trust signals" : scope === "MIXED" ? " - content and infrastructure" : " - content signals"}`;
    riskStripNode.className = stripClass;
    riskStripTitleNode.textContent = stripTitle;
    riskStripBodyNode.textContent = stripBody;
    if (realityStripTitleNode) {
        realityStripTitleNode.textContent = "Reality Check";
    }
    if (realityStripBodyNode) {
        const benchmark = prediction && prediction.benchmark ? prediction.benchmark : null;
        if (benchmark && benchmark.available) {
            const topScore = Number(benchmark.top_10_score || 0);
            const inboxSamples = Number(benchmark.inbox_samples || 0);
            realityStripBodyNode.textContent = `${inboxSamples} inbox outcomes recorded. Your top inbox campaigns in this dataset usually score ${topScore}+.`;
        } else {
            realityStripBodyNode.textContent = "No inbox benchmark yet. Keep scanning and recording inbox outcomes until a real baseline is built.";
        }
    }

    const nonMeta = (findings || []).filter((f) => !String(f.title || "").toLowerCase().includes("analysis mode"));
    decisionWhyNode.innerHTML = "";
    (nonMeta.slice(0, 3).length ? nonMeta.slice(0, 3) : [{ title: "Signals detected", issue: "Multiple risk patterns are present." }]).forEach((item) => {
        const li = document.createElement("li");
        const title = String(item.title || "risk signal").toLowerCase();
        if (title.includes("broadcast") || title.includes("promo") || title.includes("mass")) {
            li.textContent = "Detected broadcast-style phrasing (common spam signal).";
        } else if (title.includes("personal")) {
            li.textContent = "No recipient-specific personalization found.";
        } else if (title.includes("urgency") || title.includes("pressure")) {
            li.textContent = "Urgency language detected (reduces trust signals).";
        } else if (title.includes("spf") || title.includes("dkim") || title.includes("dmarc")) {
            li.textContent = "Authentication trust signals are incomplete for this send context.";
        } else {
            const issue = String(item.issue || item.impact || "This pattern increases filtering risk.");
            li.textContent = `Detected ${String(item.title || "risk signal")}: ${issue}`;
        }
        decisionWhyNode.appendChild(li);
    });

    const fixes = Array.isArray(summary.top_fixes) ? summary.top_fixes : [];
    decisionFixFirstNode.innerHTML = "";
    (fixes.slice(0, 3).length ? fixes.slice(0, 3) : [{ title: "Review technical auth" }, { title: "Lower CTA pressure" }, { title: "Simplify message structure" }]).forEach((fix, idx) => {
        const li = document.createElement("li");
        li.textContent = `${idx + 1}. ${commandFix(fix.title || fix.type || "Fix issue", fix.action)}`;
        decisionFixFirstNode.appendChild(li);
    });

    decisionConsequenceNode.innerHTML = "";
    const consequences = (band === "High Spam-Risk Signals" || band === "High Risk")
        ? [
            "This looks like bulk promotional email, so Gmail is likely to filter it.",
            "Repeated sends like this can damage domain reputation.",
        ]
        : [
            "This is likely safe for a small test batch, but scale risk can rise fast.",
            "If volume increases, keep watching inbox placement and replies.",
        ];
    consequences.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        decisionConsequenceNode.appendChild(li);
    });

    scaleWarningListNode.innerHTML = "";
    const scaleLines = (band === "High Spam-Risk Signals" || band === "High Risk")
        ? [
            "If you send this to 500+ people, high risk of spam placement.",
            "Domain reputation risk increases after the first batch.",
            "Performance will degrade as volume rises.",
        ]
        : [
            "Safe for an initial 20-50 email test batch.",
            "Re-check before scaling to 500+ sends.",
            "Monitor inbox placement after the first batch.",
        ];
    scaleLines.forEach((line) => {
        const li = document.createElement("li");
        li.textContent = line;
        scaleWarningListNode.appendChild(li);
    });
}

function getRecommendedRewriteStyle() {
    const band = String(latestSummary && latestSummary.risk_band ? latestSummary.risk_band : "");
    if (band === "High Spam-Risk Signals" || band === "High Risk") {
        return "safe";
    }
    return "casual";
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
    trackEvent("fix_clicked", {
        source: "fix_issues_button",
        rewrite_style: rewriteStyleInput ? rewriteStyleInput.value : "casual",
    });

    try {
        const payload = new FormData();
        payload.set("raw_email", original);
        if (domainInput && domainInput.value.trim()) {
            payload.set("domain", domainInput.value.trim());
        }
        payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
        payload.set("rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "casual");

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

        const beforeBlock = formatEmailBlock(originalSubject, originalBody);
        const afterBlock = formatEmailBlock(rewrittenSubject, rewrittenBody);
        beforeEmailNode.innerHTML = highlightSpamSignals(beforeBlock);
        afterEmailNode.innerHTML = escapeHtml(afterBlock);
        beforeEmailNode.classList.remove("split-enter");
        afterEmailNode.classList.remove("split-enter");
        void beforeEmailNode.offsetWidth;
        beforeEmailNode.classList.add("split-enter");
        afterEmailNode.classList.add("split-enter");
        slideIn(afterEmailNode);
        highlightDiff(beforeEmailNode, afterEmailNode);
        if (successBadge) {
            successBadge.classList.remove("hidden");
        }

        latestRewriteContext = {
            original_subject: originalSubject,
            original_body: originalBody,
            rewritten_subject: rewrittenSubject,
            rewritten_body: rewrittenBody,
            original_text: String(data.original_text || original),
            rewritten_text: rewritten,
            from_risk_band: String(data.from_risk_band || "Needs Review"),
            to_risk_band: String(data.to_risk_band || "Needs Review"),
            score_delta: Number(data.score_delta || 0),
            rewrite_style: String(data.rewrite_style || "casual"),
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
                improvementEstimateNode.textContent = `✅ Spam Risk Reduced | Deliverability Score: ${delta >= 0 ? "+" : ""}${delta} | Higher chance of inbox placement`;
            } else if (rewriteOutcome === "failed_fix") {
                improvementEstimateNode.textContent = "Could not safely remove all pressure signals without changing core intent. Use this draft as a base and refine further.";
            } else {
                improvementEstimateNode.textContent = "No major risk shift detected. We still simplified structure to reduce bulk-style triggers.";
            }
            showReward(delta);
            updateWins();
            updateStreak();
        }

        if (rewriteModeDisplayNode) {
            const mode = String(data.rewrite_style || "casual").toLowerCase();
            const modeLabel = mode === "safe"
                ? "Safe (keeps more detail)"
                : mode === "sales"
                    ? "Sales (high-conv tone)"
                    : mode === "direct"
                        ? "Direct (concise and clear)"
                        : "Casual (friendly and natural)";
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

        if (rewriteDiffNode) {
            const diffRows = buildRewriteDiff(beforeBlock, afterBlock);
            rewriteDiffNode.innerHTML = "";
            diffRows.forEach((row) => {
                const li = document.createElement("li");
                li.textContent = `${row.type}: ${row.text}`;
                rewriteDiffNode.appendChild(li);
            });
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
    fixNowButton.textContent = "Fix Issues";
}

async function runAnalyze() {
    const hasAccess = await ensureScanAccess();
    if (!hasAccess) {
        return;
    }

    const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
    const domainText = domainInput ? domainInput.value.trim() : "";
    const mode = analysisModeInput ? analysisModeInput.value : "content";

    trackEvent("analyze_clicked", {
        analysis_mode: mode,
        has_domain: Boolean(domainText),
    });
    trackEvent("clicked_scan", { analysis_mode: mode, auth: isAuthenticated ? "user" : "anon" });

    if (rawText.length < 20) {
        showError("Paste the full email draft before scanning.");
        return;
    }

    // Centralized transition: move from scan screen to result screen state before analysis.
    navigate("result", { scroll: true });

    // Keep the result shell visible from the start of analysis so UI state is explicit.
    if (resultSection) {
        resultSection.classList.remove("hidden");
    }
    if (resultScreenNode) {
        resultScreenNode.classList.remove("hidden");
    }
    const statusHeadlineNode = document.getElementById("status-headline");
    const statusSubNode = document.getElementById("status-sub");
    if (statusHeadlineNode) {
        statusHeadlineNode.textContent = "Analyzing...";
    }
    if (statusSubNode) {
        statusSubNode.textContent = "Checking content and deliverability signals.";
    }
    resultScreenNode?.scrollIntoView({ behavior: "smooth", block: "start" });

    setLoadingState();
    const loadingTicker = startRealtimeScanSteps();

    try {
        trackEvent("started_scan", { analysis_mode: mode, auth: isAuthenticated ? "user" : "anon" });
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
                renderBlockedScanResult("Sign in required", "Your first scan is blocked until you sign in or continue your scan access.");
                showAuthModal();
                throw new Error("Sign in to continue scanning.");
            }
            if (code === "SUBSCRIPTION_REQUIRED") {
                renderBlockedScanResult("Upgrade required", "This scan is locked until you upgrade your plan.");
                showPaywall();
                throw new Error("Active subscription required. Upgrade to continue scanning.");
            }
            if (code === "FREE_PLAN_LIMIT_REACHED" || code === "NO_TOKENS" || code === "INSUFFICIENT_TOKENS") {
                renderBlockedScanResult("Scan limit reached", "You used your available scans. Unlock more scans to continue.");
                openPricingModal();
                throw new Error("You reached your monthly free plan scan limit. Upgrade is required for more scans.");
            }
            throw new Error("Unable to complete risk scan. Try again.");
        }

        const data = await response.json();
        trackEvent("scan_completed", { analysis_mode: mode, auth: isAuthenticated ? "user" : "anon" });
        if (loadingTicker && typeof loadingTicker.stop === "function") {
            loadingTicker.stop();
        }
        const summary = data.summary || {};
        const signals = data.signals || {};
        const findings = data.partial_findings || summary.findings || [];
        latestLearningProfile = data.learning_profile || latestLearningProfile;
        hasScanResult = true;

        latestSummary = summary;
        latestFindings = findings;
        window.appState.hasScanned = true;
        syncProgressState();
        applyProgressiveExposure();
        if (window.InboxGuardFlow && typeof window.InboxGuardFlow.markFlowScanCompleted === "function") {
            window.InboxGuardFlow.markFlowScanCompleted();
        }

        trackEvent("result_viewed", {
            risk: String(summary.risk_band || "unknown"),
            analysis_mode: mode,
        });

        renderAnalysisResult(data);

        if (rewriteStyleInput) {
            rewriteStyleInput.value = getRecommendedRewriteStyle();
        }

        if (workflowStateNode) {
            workflowStateNode.textContent = "Step 1: Scan complete";
        }
        if (workflowTitleNode) {
            workflowTitleNode.textContent = "Step 2: Make this safe to send";
        }
        if (fixOutput) {
            fixOutput.classList.add("hidden");
        }
        if (saveFixButton) {
            saveFixButton.disabled = false;
            saveFixButton.textContent = "Save Fix";
        }

        setResultState();
        if (resultSection) {
            resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
        }
        activateTab("threat-scan");

        if (data.usage && !data.usage.authenticated) {
            anonymousScansUsed = Number(data.usage.anonymous_scans_used || anonymousScansUsed + 1);
            anonymousScansLimit = Number(data.usage.anonymous_scans_limit || anonymousScansLimit);
            localStorage.setItem("ig_anon_scans_used", String(anonymousScansUsed));
            localStorage.setItem("ig_anon_scans_limit", String(anonymousScansLimit));
            if (anonymousScansUsed >= 2) {
                showUpgradeBlock();
            }
        }
        if (data.usage && data.usage.authenticated) {
            userScansUsed = Number(data.usage.user_scans_used || userScansUsed + 1);
            userScansLimit = Number(data.usage.user_scans_limit || userScansLimit);
        }

        await loadUserTokens();
        const tokenCountNode = document.getElementById("token-count");
        if (tokenAfterHintNode && tokenCountNode) {
            tokenAfterHintNode.textContent = `Credits remaining: ${String(tokenCountNode.textContent || "0")}`;
            tokenAfterHintNode.classList.remove("hidden");
        }
    } catch (error) {
        if (loadingTicker && typeof loadingTicker.stop === "function") {
            loadingTicker.stop();
        }
        const errorMessage = String(error && error.message ? error.message : "Scan failed.");
        showError(errorMessage);
        const blockedScan = /continue scanning|subscription required|scan limit/i.test(errorMessage);
        if (blockedScan) {
            if (loadingPanel) {
                loadingPanel.classList.add("hidden");
            }
            if (resultSection) {
                resultSection.classList.remove("hidden");
            }
            if (resultScreenNode) {
                resultScreenNode.classList.remove("hidden");
            }
            if (submitButton) {
                submitButton.disabled = false;
                submitButton.textContent = defaultSubmitLabel;
            }
            if (resultSection) {
                resultSection.classList.remove("hidden");
            }
            resultSection?.scrollIntoView({ behavior: "smooth", block: "start" });
            return;
        }

        // Preserve visible result context on non-blocking errors instead of resetting to idle.
        if (loadingPanel) {
            loadingPanel.classList.add("hidden");
        }
        if (resultSection) {
            resultSection.classList.remove("hidden");
        }
        if (resultScreenNode) {
            resultScreenNode.classList.remove("hidden");
        }
        const statusHeadlineNode = document.getElementById("status-headline");
        const statusSubNode = document.getElementById("status-sub");
        if (statusHeadlineNode) {
            statusHeadlineNode.textContent = "Error running analysis";
        }
        if (statusSubNode) {
            statusSubNode.textContent = errorMessage;
        }
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = defaultSubmitLabel;
        }
        resultScreenNode?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
}

function getFixedEmailText() {
    const fromContext = String(latestRewriteContext && latestRewriteContext.rewritten_text ? latestRewriteContext.rewritten_text : "").trim();
    if (fromContext) {
        return fromContext;
    }
    const fromNode = String(afterEmailNode && afterEmailNode.textContent ? afterEmailNode.textContent : "").trim();
    if (fromNode && !fromNode.toLowerCase().includes("unlock access")) {
        return fromNode;
    }
    return "";
}

async function copyFixedEmail(sourceButton = null) {
    if (!afterEmailNode || !rawEmailInput) {
        return;
    }
    const text = getFixedEmailText();
    if (!text) {
        openPricingModal();
        showError("Unlock access to copy and test the fixed version.");
        return;
    }

    let clipboardOk = true;
    try {
        await navigator.clipboard.writeText(text);
    } catch (_error) {
        clipboardOk = false;
    }

    rawEmailInput.value = text;
    trackEvent("copy_clicked", { source: "fixed_email" });

    if (useFixedButton) {
        useFixedButton.textContent = "✓ Copied";
        useFixedButton.classList.add("bg-green-700");
        setTimeout(() => {
            useFixedButton.textContent = "Copy Fixed Email";
            useFixedButton.classList.remove("bg-green-700");
        }, 1200);
    }

    if (sourceButton && sourceButton !== useFixedButton) {
        const originalText = String(sourceButton.textContent || "Copy Fixed Email");
        sourceButton.textContent = "Copied!";
        setTimeout(() => {
            sourceButton.textContent = originalText;
        }, 1200);
    }

    showError(clipboardOk ? "Copied fixed email. You can paste directly into your sender." : "Clipboard blocked. Fixed draft is still loaded in the editor.");
}

function runRealInboxTest() {
    window.appState.hasScaled = true;
    syncProgressState();
    applyProgressiveExposure();

    if (!isAuthenticated) {
        openPricingModal();
        trackEvent("run_real_inbox_test_clicked", { state: "anon" });
        return;
    }

    trackEvent("run_real_inbox_test_clicked", { state: "authenticated" });
    runSeedAuto().catch(() => {
        window.location.href = "/seed-inbox";
    });
}

function useFixedVersion() {
    copyFixedEmail(useFixedButton).then(() => {
        const text = getFixedEmailText();
        rawEmailInput.value = text;
    }).catch(() => {
        showError("Fixed version ready. Clipboard blocked, but draft is updated in editor.");
    });
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

function openInGmail() {
    const bodyText = String(afterEmailNode && afterEmailNode.textContent ? afterEmailNode.textContent : rawEmailInput.value || "");
    if (!bodyText.trim()) {
        showError("Generate or paste an email first.");
        return;
    }

    const composeUrl = `https://mail.google.com/mail/?view=cm&fs=1&body=${encodeURIComponent(bodyText)}`;
    trackEvent("gmail_open_clicked", { source: "fix_output" });
    window.open(composeUrl, "_blank", "noopener");
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
        payload.set("from_score", String(latestSummary && (latestSummary.final_score || latestSummary.score || 0) || 0));
        payload.set("to_score", String((latestSummary && (latestSummary.final_score || latestSummary.score || 0) || 0) + Number(latestRewriteContext.score_delta || 0)));

        const response = await fetch("/feedback", {
            method: "POST",
            body: payload,
        });
        if (!response.ok) {
            throw new Error("Could not save feedback");
        }
        const data = await response.json();
        latestLearningProfile = data.learning_profile || latestLearningProfile;
        trackEvent("feedback_given", {
            outcome: String(outcome || "unknown"),
            from_risk_band: latestRewriteContext.from_risk_band || "unknown",
            to_risk_band: latestRewriteContext.to_risk_band || "unknown",
        });
        const samples = latestLearningProfile ? Number(latestLearningProfile.sample_size || 0) : 0;
        const message = "Saved. This helps improve future accuracy.";
        if (feedbackStatusNode) {
            feedbackStatusNode.textContent = message;
        }
        refreshOutcomeStats().catch(() => null);
        refreshHomeLiveStats().catch(() => null);
        showError(`${message} (${samples} learned outcomes)`);
    } catch (error) {
        showError(error && error.message ? error.message : "Could not save feedback");
    }
}

async function runCampaignDiagnosis() {
    const openRate = Number(metricOpenRateInput && metricOpenRateInput.value ? metricOpenRateInput.value : 0);
    const replyRate = Number(metricReplyRateInput && metricReplyRateInput.value ? metricReplyRateInput.value : 0);
    const bounceRate = Number(metricBounceRateInput && metricBounceRateInput.value ? metricBounceRateInput.value : 0);
    const sentCount = Number(metricSentCountInput && metricSentCountInput.value ? metricSentCountInput.value : 0);

    trackEvent("campaign_debug_used", {
        has_metrics: openRate > 0 || replyRate > 0 || bounceRate > 0 || sentCount > 0,
    });

    const response = await fetch("/campaign-debugger", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            open_rate: openRate,
            reply_rate: replyRate,
            bounce_rate: bounceRate,
            sent: sentCount,
        }),
    });

    if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(String(errorBody.detail || "Could not diagnose campaign."));
    }

    const data = await response.json();
    trackEvent("campaign_diagnosed", {
        type: String(data.diagnosis || "unknown").toLowerCase().replace(/\s+/g, "_"),
    });
    if (!diagnosisOutput || !diagnosisPrimaryNode || !diagnosisConfidenceNode || !diagnosisWhyNode || !diagnosisActionsNode) {
        return;
    }

    if (campaignDebuggerResultNode) {
        campaignDebuggerResultNode.innerHTML = `<strong>Issue:</strong> ${String(data.issue || "No Major Issues")}<br/><strong>Reason:</strong> ${String(data.reason || "No reason returned")}<br/><strong>Action:</strong> ${String(data.action || "No action returned")}`;
    }

    const severity = Number(data.severity_score || 0);
    diagnosisPrimaryNode.textContent = `Diagnosis: ${String(data.diagnosis || "Mixed issue")}`;
    diagnosisConfidenceNode.textContent = `Confidence: ${String(data.confidence || "medium").toUpperCase()} | Severity: ${severity}/100`;
    diagnosisWhyNode.textContent = String(data.why || "No diagnosis details available.");

    diagnosisActionsNode.innerHTML = "";
    const actions = Array.isArray(data.actions) ? data.actions : [];
    if (!actions.length) {
        const li = document.createElement("li");
        li.textContent = "No action list returned.";
        diagnosisActionsNode.appendChild(li);
    } else {
        actions.slice(0, 4).forEach((action, idx) => {
            const li = document.createElement("li");
            li.textContent = `${idx + 1}. ${String(action)}`;
            diagnosisActionsNode.appendChild(li);
        });
    }

    diagnosisOutput.classList.remove("hidden");
    diagnosisOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function runBlacklistCheck() {
    const domain = blacklistDomainInput ? String(blacklistDomainInput.value || "").trim() : "";
    const runButton = runBlacklistCheckButton;
    if (!domain) {
        showError("Enter a domain first.");
        return;
    }
    const previousLabel = runButton ? runButton.textContent : "Check Domain Risk";
    if (blacklistResultNode) {
        blacklistResultNode.textContent = "Checking domain risk...";
    }
    setActionButtonState(runButton, "loading", "Checking...");
    const payload = new FormData();
    payload.set("domain", domain);
    try {
        const response = await fetch("/blacklist-check", { method: "POST", body: payload });
        if (!response.ok) {
            const message = await parseApiError(response, "Could not run blacklist check.");
            if (blacklistResultNode) {
                blacklistResultNode.textContent = message;
            }
            throw new Error(message);
        }
        const data = await response.json();
        if (blacklistResultNode) {
            blacklistResultNode.textContent = data.listed
                ? `High risk: ${data.domain} appears in risk list. ${data.details}`
                : `Low risk: ${data.domain} is not in current risk list. ${data.details}`;
        }
        setActionButtonState(runButton, "success", data.listed ? "⚠️ Risk Found" : "✅ Clean");
    } catch (error) {
        setActionButtonState(runButton, "error", "Error");
        throw error;
    } finally {
        setTimeout(() => {
            setActionButtonState(runButton, "idle", previousLabel);
        }, 1000);
    }
}

async function refreshSeedTests() {
    if (!seedTestListNode) {
        return;
    }
    const response = await fetch("/seed-tests", { method: "GET" });
    if (!response.ok) {
        return;
    }
    const data = await response.json();
    const items = Array.isArray(data.items) ? data.items : [];
    seedTestListNode.innerHTML = "";
    if (!items.length) {
        const li = document.createElement("li");
        li.textContent = "No seed tests logged yet.";
        seedTestListNode.appendChild(li);
        return;
    }
    items.slice(0, 5).forEach((item) => {
        const li = document.createElement("li");
        li.textContent = `${String(item.campaign_name || "Campaign")} | ${String(item.provider || "provider")} | Inbox ${Number(item.inbox_count || 0)} / Spam ${Number(item.spam_count || 0)}`;
        seedTestListNode.appendChild(li);
    });
}

async function saveSeedTest() {
    const campaign = seedCampaignInput ? String(seedCampaignInput.value || "").trim() : "";
    const provider = seedProviderInput ? String(seedProviderInput.value || "gmail") : "gmail";
    const inboxCount = Number(seedInboxCountInput && seedInboxCountInput.value ? seedInboxCountInput.value : 0);
    const spamCount = Number(seedSpamCountInput && seedSpamCountInput.value ? seedSpamCountInput.value : 0);
    if (!campaign) {
        showError("Add a campaign name before saving.");
        return;
    }

    const payload = new FormData();
    payload.set("campaign_name", campaign);
    payload.set("provider", provider);
    payload.set("inbox_count", String(inboxCount));
    payload.set("spam_count", String(spamCount));
    payload.set("notes", "Logged from dashboard");

    const previousLabel = saveSeedTestButton ? saveSeedTestButton.textContent : "Save Seed Result";
    setActionButtonState(saveSeedTestButton, "loading", "Saving...");
    try {
        const response = await fetch("/seed-tests", { method: "POST", body: payload });
        if (!response.ok) {
            throw new Error("Could not save seed test.");
        }
        setActionButtonState(saveSeedTestButton, "success", "Saved");
        showError("Seed test saved.");
        await refreshSeedTests();
    } catch (error) {
        setActionButtonState(saveSeedTestButton, "error", "Error");
        throw error;
    } finally {
        setTimeout(() => {
            setActionButtonState(saveSeedTestButton, "idle", previousLabel);
        }, 1000);
    }
}

async function runAnalyzeAsync() {
    const hasAccess = await ensureScanAccess();
    if (!hasAccess) {
        return;
    }

    const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
    if (rawText.length < 20) {
        showError("Paste the full email draft before scanning.");
        return;
    }

    const payload = new FormData();
    payload.set("raw_email", rawText);
    if (domainInput && domainInput.value.trim()) {
        payload.set("domain", domainInput.value.trim());
    }
    payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");

    window.appState.hasOptimized = false;
    window.appState.hasScaled = false;
    syncProgressState();

    if (submitAsyncButton) {
        submitAsyncButton.disabled = true;
        submitAsyncButton.textContent = "Queued...";
    }

    const response = await fetch("/analyze-async", { method: "POST", body: payload });
    if (!response.ok) {
        if (submitAsyncButton) {
            submitAsyncButton.disabled = false;
            submitAsyncButton.textContent = "Analyze In Background";
        }
        throw new Error("Could not queue async scan.");
    }

    const data = await response.json();
    const jobId = String(data.job_id || "");
    showError("Background scan started. Results will appear automatically.");

    for (let i = 0; i < 20; i += 1) {
        await sleep(1200);
        const poll = await fetch(`/analyze-jobs/${jobId}`, { method: "GET" });
        if (!poll.ok) {
            continue;
        }
        const job = await poll.json();
        if (job.status === "completed" && job.result) {
            const summary = job.result.summary || {};
            const signals = job.result.signals || {};
            const findings = job.result.partial_findings || summary.findings || [];
            latestSummary = summary;
            latestFindings = findings;
            hasScanResult = true;
            window.appState.hasScanned = true;
            syncProgressState();
            applyProgressiveExposure();
            if (window.InboxGuardFlow && typeof window.InboxGuardFlow.markFlowScanCompleted === "function") {
                window.InboxGuardFlow.markFlowScanCompleted();
            }
            renderAnalysisResult(job.result || {});
            setResultState();
            if (resultSection) {
                resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
            }
            break;
        }
        if (job.status === "failed") {
            showError(String(job.error || "Async scan failed."));
            break;
        }
    }

    if (submitAsyncButton) {
        submitAsyncButton.disabled = false;
        submitAsyncButton.textContent = "Analyze In Background";
    }
}

async function runRewriteAsync() {
    const rawText = rawEmailInput ? rawEmailInput.value.trim() : "";
    if (rawText.length < 20) {
        showError("Paste the full email draft before generating rewrite.");
        return;
    }

    if (riskFixAsyncButton) {
        riskFixAsyncButton.disabled = true;
        riskFixAsyncButton.textContent = "Queued...";
    }

    try {
        const payload = new FormData();
        payload.set("raw_email", rawText);
        if (domainInput && domainInput.value.trim()) {
            payload.set("domain", domainInput.value.trim());
        }
        payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
        payload.set("rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "casual");

        const response = await fetch("/rewrite-async", { method: "POST", body: payload });
        if (!response.ok) {
            throw new Error("Could not queue async rewrite.");
        }
        const data = await response.json();
        const jobId = String(data.job_id || "");
        showError("Background rewrite started. Waiting for result...");

        for (let i = 0; i < 25; i += 1) {
            await sleep(1200);
            const poll = await fetch(`/analyze-jobs/${jobId}`, { method: "GET" });
            if (!poll.ok) {
                continue;
            }
            const job = await poll.json();
            if (job.status === "completed" && job.result) {
                const rewritten = String(job.result.rewritten_text || "");
                if (rewritten && afterEmailNode && beforeEmailNode) {
                    beforeEmailNode.innerHTML = highlightSpamSignals(rawText);
                    afterEmailNode.innerHTML = escapeHtml(rewritten);
                    latestRewriteContext = {
                        original_subject: String(job.result.original_subject || ""),
                        original_body: String(job.result.original_body || ""),
                        rewritten_subject: String(job.result.rewritten_subject || ""),
                        rewritten_body: String(job.result.rewritten_body || rewritten),
                        original_text: String(job.result.original_text || rawText),
                        rewritten_text: rewritten,
                        from_risk_band: String(job.result.from_risk_band || "Needs Review"),
                        to_risk_band: String(job.result.to_risk_band || "Needs Review"),
                        score_delta: Number(job.result.score_delta || 0),
                        rewrite_style: String(job.result.rewrite_style || "casual"),
                    };
                    if (workflowStateNode) {
                        workflowStateNode.textContent = "Step 2: Fix complete";
                    }
                    if (workflowTitleNode) {
                        workflowTitleNode.textContent = "Safer version generated";
                    }
                    if (improvementEstimateNode) {
                        const delta = Number(job.result.score_delta || 0);
                        improvementEstimateNode.textContent = `Spam Risk Reduced | Deliverability Score: ${delta >= 0 ? "+" : ""}${delta}`;
                    }
                    if (fixOutput) {
                        fixOutput.classList.remove("hidden");
                        fixOutput.scrollIntoView({ behavior: "smooth", block: "start" });
                    }
                }
                showError("Background rewrite completed.");
                return;
            }
            if (job.status === "failed") {
                throw new Error(String(job.error || "Async rewrite failed."));
            }
        }
        throw new Error("Async rewrite timed out. Try again.");
    } finally {
        if (riskFixAsyncButton) {
            riskFixAsyncButton.disabled = false;
            riskFixAsyncButton.textContent = "Generate Safe Rewrite In Background";
        }
    }
}

// ===== RAZORPAY PAYMENT INTEGRATION =====
window.currentUser = isAuthenticated;

function updateTokenMessaging(tokens) {
    const safeTokens = Math.max(0, Number(tokens || 0));
    userState.tokens = safeTokens;
    if (tokenCostHintNode) {
        tokenCostHintNode.textContent = `This will cost 1 credit. You have ${safeTokens} left.`;
    }
}

async function loadUser() {
    try {
        const response = await fetch("/auth/me", { method: "GET", credentials: "include" });
        if (!response.ok) {
            return;
        }
        const user = await response.json();
        userState.plan = normalizePlanChoice(String(user.plan || (user.pro ? "monthly" : "free")));
        currentUserPlan = userState.plan;
        window.userPlan = currentUserPlan;
        if (typeof user.tokens === "number") {
            userState.tokens = Number(user.tokens);
            updateTokenMessaging(userState.tokens);
        }
    } catch (error) {
        // Keep UI usable even if auth endpoint fails.
    }
}

async function loadUserTokens() {
    try {
        const tokenBadge = document.getElementById("token-display");
        const tokenCount = document.getElementById("token-count");
        const planLabel = document.getElementById("plan-label");

        if (!isAuthenticated) {
            if (tokenBadge) {
                tokenBadge.classList.add("hidden");
            }
            if (tokenEmptyStateNode) {
                tokenEmptyStateNode.classList.add("hidden");
            }
            userState.tokens = 0;
            window.appState.credits = 0;
            syncFlowUserState();
            return;
        }

        const res = await fetch("/tokens/info", { method: "GET" });
        if (!res.ok) {
            return;
        }
        const data = await res.json();
        const tokens = Number(data.tokens || 0);
        const plan = normalizePlanChoice(String(data.plan || userState.plan || "free"));
        currentUserPlan = plan;
        window.userPlan = plan;

        if (tokenBadge && tokenCount) {
            tokenBadge.classList.remove("hidden");
            tokenCount.textContent = String(tokens);
        }
        if (planLabel) {
            const badgeMap = {
                free: "FREE",
                starter: "STARTER",
                monthly: "GROWTH",
                annual: "GROWTH",
            };
            planLabel.textContent = badgeMap[plan] || "FREE";
        }

        if (tokenEmptyStateNode) {
            const shouldShowEmpty = tokens <= 0;
            tokenEmptyStateNode.classList.toggle("hidden", !shouldShowEmpty);
        }

        updateTokenMessaging(tokens);
        window.appState.credits = tokens;
        refreshLockedFeatures();
        refreshPricingContext();
        syncFlowUserState();
    } catch (error) {
        // Keep UI responsive even if token endpoint is unavailable.
    }
}

function fillExampleEmail() {
    if (!rawEmailInput) {
        return;
    }
    rawEmailInput.value = "Subject: Quick question\n\nHi John,\nI noticed your recent post and had one idea to improve reply rates without changing your offer.\nWould you be open to a quick review this week?";
    rawEmailInput.focus();
    showError("Example email loaded. Click Check Before Sending.");
}

window.fillExampleEmail = fillExampleEmail;

async function ensureScanAccess() {
    await refreshAuthStatus();
    await loadUserTokens();

    if (!isAuthenticated) {
        if (Number(anonymousScansUsed || 0) < 1) {
            return true;
        }
        pendingAction = "analyze";
        stashPendingContext("analyze");
        showAuthModal();
        trackEvent("blocked_auth", { reason: "first_value_scan_limit" });
        return false;
    }

    if (Boolean(window.userIsAdmin || currentUserIsAdmin)) {
        return true;
    }

    const plan = String(currentUserPlan || userState.plan || "free").toLowerCase();
    if (plan === "free") {
        const freeLimit = getFreeScansLimitForCurrentUser();
        if (Number(userScansUsed || 0) < freeLimit) {
            return true;
        }
    }

    if (Number(userState.tokens || 0) < 1) {
        showPaywall();
        showError("No credits left. Upgrade to continue scanning.");
        return false;
    }

    return true;
}

async function handleRequestAccess() {
    const fromField = accessRequestEmailInput ? String(accessRequestEmailInput.value || "").trim() : "";
    const email = fromField || String(window.prompt("Enter your email:") || "").trim();
    if (!email) {
        return;
    }

    const response = await fetch("/request-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
        credentials: "include",
    });
    if (!response.ok) {
        showError("Could not submit access request.");
        return;
    }

    if (accessRequestEmailInput) {
        accessRequestEmailInput.value = "";
    }

    alert("Access requested. We'll reach out.");
}

function openPricingModal() {
    const modal = document.getElementById("pricing-modal");
    if (modal) {
        syncPlanSelection(pendingPlanChoice);
        modal.style.display = "flex";
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    } else {
        console.error("Pricing modal not found");
    }
}

function closePricingModal() {
    const modal = document.getElementById("pricing-modal");
    if (!modal) {
        return;
    }
    modal.style.display = "none";
    modal.classList.add("hidden");
    document.body.classList.remove("modal-open");
}

function handleGetAccess() {
    syncPlanSelection(pendingPlanChoice);
    openPricingModal();
}

function handlePlanClick(plan) {
    const selected = String(plan || "growth").toLowerCase();
    if (selected === "free") {
        syncPlanSelection("free");
        openPricingModal();
        showSuccess("Free plan selected. No payment needed.");
        return;
    }

    if (selected === "starter") {
        syncPlanSelection("starter");
        openPricingModal();
        if (!isAuthenticated) {
            showAuthModal();
        }
        return;
    }

    syncPlanSelection("monthly");

    if (!isAuthenticated) {
        showAuthModal();
        return;
    }

    trackEvent("payment_started", { plan: selected });
    handleGetAccess();
}

function refreshPricingContext() {
    const pricingTitleNode = document.getElementById("pricing-title");
    if (!pricingTitleNode) {
        return;
    }
    if (userActionCount > 3) {
        pricingTitleNode.textContent = "You're already using InboxGuard - unlock full power";
        return;
    }
    pricingTitleNode.textContent = "Simple pricing. No guesswork.";
}

function refreshLockedFeatures() {
    document.querySelectorAll(".lockable").forEach((node) => {
        const requiredPlan = String(node.getAttribute("data-plan-required") || "free").toLowerCase();
        node.classList.toggle("locked", !hasPlanAccess(requiredPlan));
    });
}

function showUpgradeModal({ title, subtitle, plan } = {}) {
    if (plan === "growth") {
        syncPlanSelection("monthly");
    } else if (plan === "starter") {
        syncPlanSelection("starter");
    }
    const paywall = document.getElementById("paywall");
    if (!paywall) {
        openPricingModal();
        return;
    }

    paywall.classList.remove("hidden");
    const titleNode = paywall.querySelector("h3");
    const bodyNode = paywall.querySelector("p");
    const buttonNode = paywall.querySelector("button");
    if (titleNode) {
        titleNode.textContent = title || "You’re close to inbox.";
    }
    if (bodyNode) {
        bodyNode.textContent = subtitle || "Unlock full fix to remove the blockers and see the complete rewrite.";
    }
    if (buttonNode) {
        buttonNode.textContent = "Unlock Full Fix";
    }
    updateUxState({
        screen: "result",
        valueShown: true,
        showPaywall: true,
        hasMultipleCTAs: countPrimaryActions(paywall) > 1,
    });
    trackEvent("paywall_shown", { source: "upgrade_modal", plan: String(plan || "growth") });
    paywall.scrollIntoView({ behavior: "smooth", block: "center" });
}

function openToolPane(toolKey) {
    if (typeof window.openTool === "function") {
        window.openTool(toolKey);
    }
}

function showScanCost() {
    alert(`This will cost 1 credit. You have ${Math.max(0, Number(userState.tokens || 0))}`);
}

function canUserScan() {
    if (window.appState && window.appState.isAdmin) {
        return true;
    }

    if (!isAuthenticated) {
        return true;
    }

    const status = String(window.userStatus || currentUserStatus || "inactive").toLowerCase();
    const activePlan = getActivePlanForAccess();
    if (status === "active" || activePlan === "free") {
        return true;
    }

    if (status === "past_due" && planAccessLevel(activePlan) > 0) {
        showError("Payment failed. Update your payment method to keep access.");
    }

    showPaywall();
    return false;
}

function showPaywall() {
    const paywall = document.getElementById("paywall");
    if (!paywall) {
        return;
    }
    paywall.classList.remove("hidden");
    const title = paywall.querySelector("h3");
    const body = paywall.querySelector("p");
    const button = paywall.querySelector("button");
    if (title) {
        title.textContent = "You’re close to inbox.";
    }
    if (body) {
        body.textContent = "Unlock full fix: full rewrite, campaign debugger, subject generator, and deliverability insights.";
    }
    if (button) {
        button.textContent = "Unlock Full Fix";
    }
    updateUxState({
        screen: "result",
        valueShown: true,
        showPaywall: true,
        hasMultipleCTAs: countPrimaryActions(paywall) > 1,
    });
    trackEvent("paywall_shown", { source: "scan_flow" });
}

function unlockFullFix() {
    pendingAction = "fix";
    runPendingAction();
}

async function shareResultCard() {
    if (!resultScreenNode) {
        return;
    }
    if (typeof window.html2canvas !== "function") {
        showError("Share tool is loading. Try again in a second.");
        return;
    }

    const canvas = await window.html2canvas(resultScreenNode, { backgroundColor: null, scale: 2 });
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) {
        showError("Could not capture result image.");
        return;
    }

    try {
        if (navigator.clipboard && typeof window.ClipboardItem === "function") {
            await navigator.clipboard.write([new window.ClipboardItem({ "image/png": blob })]);
            showError("Copied! Share this result on X/Reddit.");
            return;
        }
    } catch (error) {
        // Fall through to download fallback.
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "inboxguard-result.png";
    link.click();
    URL.revokeObjectURL(url);
    showError("Result image downloaded. Share it on X/Reddit.");
}

async function submitResultEmailCapture() {
    if (!resultCaptureEmailInput || !resultCaptureStatusNode) {
        return;
    }

    const email = String(resultCaptureEmailInput.value || "").trim().toLowerCase();
    if (!email || !email.includes("@")) {
        resultCaptureStatusNode.classList.remove("hidden");
        resultCaptureStatusNode.textContent = "Enter a valid email address.";
        return;
    }

    const payload = new FormData();
    payload.set("email", email);
    payload.set("source", "result_screen");

    const response = await fetch("/lead-capture", { method: "POST", body: payload });
    if (!response.ok) {
        resultCaptureStatusNode.classList.remove("hidden");
        resultCaptureStatusNode.textContent = "Could not save your email right now.";
        return;
    }

    resultCaptureStatusNode.classList.remove("hidden");
    resultCaptureStatusNode.textContent = "Subscribed. Weekly deliverability tips are on the way.";
    resultCaptureEmailInput.value = "";
}

function showUpgradeBlock() {
    showUpgradeModal({
        title: "You’re close to inbox.",
        subtitle: "Unlock full fix to remove the blockers and see the complete rewrite.",
        plan: "growth",
    });
}

async function startPayment() {
    try {
        const selectedPlan = normalizePlanChoice(
            inlinePlanTypeInput
                ? String(inlinePlanTypeInput.value || "monthly")
                : "monthly"
        );
        const promoInput = document.getElementById("promo-code-input");
        const promoCode = String((appliedPromoState && appliedPromoState.code) || (promoInput && promoInput.value ? promoInput.value : "")).trim().toUpperCase();

        if (selectedPlan === "free") {
            closePricingModal();
            showSuccess("Free plan enabled. Start scanning.");
            openTool("scan");
            return;
        }

        await refreshAuthStatus();
        if (!isAuthenticated) {
            showError("Session expired. Please sign in again.");
            showAuthModal();
            return;
        }

        const response = await fetch("/create-subscription", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ plan: selectedPlan, promo_code: promoCode }),
        });
        const data = await response.json().catch(() => ({}));

        if (!response.ok || !data.success) {
            if (response.status === 401 || String(data.detail || "").toLowerCase() === "not authenticated") {
                showError("Not authenticated. Please sign in and try again.");
                showAuthModal();
                return;
            }
            if (response.status === 503 && Array.isArray(data.missing) && data.missing.length > 0) {
                showError(`Subscription not configured: ${data.missing.join(", ")}`);
                return;
            }
            showError(data.detail || "Payment system not configured. Please try again later.");
            return;
        }

        if (data.usage_mode) {
            showError("Usage-based plan enabled. API billing will apply per scan.");
            closePricingModal();
            return;
        }

        if (data.free_mode) {
            closePricingModal();
            clearAppliedPromo();
            showSuccess(data.message || "Promo applied. Access unlocked.");
            openTool("scan");
            return;
        }

        if (data.short_url) {
            closePricingModal();
            window.location.href = String(data.short_url);
            return;
        }

        if (data.checkout_type === "order" && data.order_id) {
            if (typeof Razorpay === "undefined") {
                showError("Payment system not available. Please try again.");
                return;
            }

            const options = {
                key: data.key,
                amount: data.amount,
                currency: data.currency || "INR",
                order_id: data.order_id,
                name: "InboxGuard",
                description: `${data.display_price || formatInr(Number(data.amount || 0) / 100)} checkout`,
                prefill: {
                    email: currentUserEmail || "",
                    name: currentUserName || "",
                },
                handler: function () {
                    closePricingModal();
                    clearAppliedPromo();
                    showError("Payment submitted. Waiting for webhook confirmation before access changes.");
                    setTimeout(() => {
                        window.location.reload();
                    }, 5000);
                },
            };

            const rzp = new Razorpay(options);
            rzp.open();
            return;
        }

        if (typeof Razorpay === "undefined") {
            showError("Payment system not available. Please try again.");
            return;
        }

        const options = {
            key: data.key,
            amount: data.amount,
            currency: data.currency || "INR",
            subscription_id: data.subscription_id,
            name: "InboxGuard",
            description: `${data.display_price || "$12"} / month`,
            prefill: {
                email: currentUserEmail || "",
                name: currentUserName || "",
            },
            handler: function () {
                closePricingModal();
                clearAppliedPromo();
                showError("Payment submitted. Waiting for webhook confirmation before access changes.");
                setTimeout(() => {
                    window.location.reload();
                }, 5000);
            },
        };

        const rzp = new Razorpay(options);
        rzp.open();
    } catch (error) {
        showError(`Could not start checkout: ${error && error.message ? error.message : "Unknown error"}`);
    }
}

async function applyPromo() {
    const promoInput = document.getElementById("promo-code-input");
    const promoMessage = document.getElementById("promo-message");
    const code = String(promoInput && promoInput.value ? promoInput.value : "").trim().toUpperCase();
    const plan = normalizePlanChoice(
        inlinePlanTypeInput ? String(inlinePlanTypeInput.value || pendingPlanChoice || "monthly") : pendingPlanChoice
    );

    if (!code) {
        clearAppliedPromo("Enter a promo code.");
        return;
    }

    if (promoMessage) {
        promoMessage.textContent = "Checking code...";
        promoMessage.style.display = "block";
        promoMessage.style.color = "#cbd5e1";
    }

    const response = await fetch("/promo/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code, plan }),
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok || !data.valid) {
        appliedPromoState = null;
        renderCheckoutPrice(plan, null);
        if (promoMessage) {
            promoMessage.textContent = String(data.reason || "Invalid promo code");
            promoMessage.style.display = "block";
            promoMessage.style.color = "#fca5a5";
        }
        return;
    }

    appliedPromoState = {
        ...data.promo,
        code,
        plan,
    };
    renderCheckoutPrice(plan, appliedPromoState);
    if (promoMessage) {
        promoMessage.textContent = String(data.message || data.promo.summary || "Promo applied");
        promoMessage.style.display = "block";
        promoMessage.style.color = "#86efac";
    }
}

window.openPricingModal = openPricingModal;
window.closePricingModal = closePricingModal;
window.handleGetAccess = handleGetAccess;
window.handleUnlock = handleGetAccess;
window.handleRequestAccess = handleRequestAccess;
window.openToolPane = openToolPane;
window.handlePlanClick = handlePlanClick;
window.applyPromo = applyPromo;

function wireUiEvents() {
    const pricingModal = document.getElementById("pricing-modal");
    const payButton = document.getElementById("pay-btn");
    const cancelSubscriptionButton = document.getElementById("cancel-subscription");
    const applyPromoBtn = document.getElementById("apply-promo-btn");
    const promoInput = document.getElementById("promo-code-input");
    const promoMessage = document.getElementById("promo-message");

    if (pricingModal) {
        pricingModal.addEventListener("click", (event) => {
            if (event.target === pricingModal) {
                closePricingModal();
            }
        });
    }

    if (payButton) {
        payButton.addEventListener("click", (event) => {
            event.preventDefault();
            startPayment();
        });
    }

    if (refreshPlansButton) {
        refreshPlansButton.addEventListener("click", (event) => {
            event.preventDefault();
            refreshPlans().catch((error) => {
                showError(error && error.message ? error.message : "Could not load plans.");
            });
        });
    }

    if (inlinePlanTypeInput) {
        inlinePlanTypeInput.addEventListener("change", () => {
            syncPlanSelection(inlinePlanTypeInput.value || "monthly");
        });
    }

    if (requestAccessButton) {
        requestAccessButton.addEventListener("click", (event) => {
            event.preventDefault();
            handleRequestAccess().catch((error) => {
                showError(error && error.message ? error.message : "Could not submit access request.");
            });
        });
    }

    if (cancelSubscriptionButton) {
        cancelSubscriptionButton.addEventListener("click", async (event) => {
            event.preventDefault();
            const response = await fetch("/cancel-subscription", { method: "POST" });
            if (!response.ok) {
                showError("Could not cancel subscription.");
                return;
            }
            showError("Subscription cancelled. Access will remain until current period ends.");
            setTimeout(() => window.location.reload(), 1200);
        });
    }

    if (applyPromoBtn) {
        applyPromoBtn.addEventListener("click", async (event) => {
            event.preventDefault();
            try {
                await applyPromo();
            } catch (error) {
                if (promoMessage) {
                    promoMessage.textContent = String(error && error.message ? error.message : "Could not validate promo code");
                    promoMessage.style.display = "block";
                    promoMessage.style.color = "#fca5a5";
                }
            }
        });
    }

    if (promoInput) {
        promoInput.addEventListener("keypress", (event) => {
            if (event.key === "Enter") {
                event.preventDefault();
                if (applyPromoBtn) {
                    applyPromoBtn.click();
                }
            }
        });
    }

    if (dashboardTab) {
        dashboardTab.addEventListener("click", () => {
            if (typeof window.closeTool === "function") {
                window.closeTool();
            }
            activateTab("dashboard");
        });
    }

    if (threatScanTab) {
        threatScanTab.addEventListener("click", () => {
            if (typeof window.closeTool === "function") {
                window.closeTool();
            }
            activateTab("threat-scan");
        });
    }

    if (startButton) {
        startButton.addEventListener("click", () => {
            activateTab("threat-scan");
            if (rawEmailInput) {
                rawEmailInput.scrollIntoView({ behavior: "smooth", block: "center" });
                setTimeout(() => rawEmailInput.focus(), 160);
            }
            trackEvent("start_clicked", { destination: "email_input" });
        });
    }

    if (homeScanButton) {
        homeScanButton.addEventListener("click", (event) => {
            event.preventDefault();
            activateTab("threat-scan");
        });
    }

    if (cardScanOpenButton) {
        cardScanOpenButton.addEventListener("click", (event) => {
            event.preventDefault();
            activateTab("threat-scan");
        });
    }

    if (accessButton) {
        accessButton.dataset.getAccessBound = "1";
        accessButton.addEventListener("click", (event) => {
            event.preventDefault();
            console.log("Get Access clicked");
            syncPlanSelection("monthly");
            handleGetAccess();
        });
    }

    if (fillExampleButton) {
        fillExampleButton.addEventListener("click", () => {
            fillExampleEmail();
            scheduleRealtimeLint();
            scheduleAdaptiveRewritePreview();
        });
    }

    if (rawEmailInput) {
        rawEmailInput.addEventListener("input", () => {
            scheduleRealtimeLint();
            scheduleAdaptiveRewritePreview();
        });
    }

    if (copyFixedNowButton) {
        copyFixedNowButton.addEventListener("click", () => {
            const text = String(fixedEmailNowNode && fixedEmailNowNode.textContent ? fixedEmailNowNode.textContent : "").trim();
            if (!text) {
                showError("Run a scan first to generate a fixed email.");
                return;
            }
            navigator.clipboard.writeText(text).then(() => {
                showError("Fixed email copied.");
            }).catch(() => {
                showError("Copy blocked. Select and copy the text manually.");
            });
        });
    }

    document.querySelectorAll(".advanced-tool").forEach((toolNode) => {
        toolNode.addEventListener("click", (event) => {
            if (window.appState && window.appState.hasScanned) {
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            showSidebarTooltip("Run your first scan to unlock this", toolNode);
            showError("Run at least one scan first before opening advanced tools.");
            trackEvent("blocked_before_first_value", {
                tool: String(toolNode.getAttribute("data-tool") || "advanced"),
                source: "sidebar",
            });
        });
    });

    if (fixNowButton) {
        fixNowButton.addEventListener("click", () => {
            const payload = new FormData();
            payload.set("event", "rewrite_clicked");
            fetch("/track", { method: "POST", body: payload }).catch(() => null);
            pendingAction = "fix";
            runPendingAction();
        });
    }
    if (riskFixNowButton) {
        riskFixNowButton.addEventListener("click", () => {
            trackEvent("fix_clicked", { source: "risk_fix_now" });
            pendingAction = "fix";
            runPendingAction();
        });
    }
    if (riskFixAsyncButton) {
        riskFixAsyncButton.addEventListener("click", () => {
            trackEvent("fix_async_clicked", { source: "risk_fix_async" });
            runRewriteAsync().catch((error) => {
                showError(error && error.message ? error.message : "Could not queue async rewrite.");
            });
        });
    }
    if (fixIssueButton) {
        fixIssueButton.addEventListener("click", () => {
            activeRewriteMode = "safe";
            generateRewrite("fix_primary").catch((error) => {
                showError(error && error.message ? error.message : "Could not fix the primary issue.");
            });
        });
    }
    if (rewriteSafeButton) {
        rewriteSafeButton.addEventListener("click", () => {
            activeRewriteMode = "safe";
            generateRewrite("safe").catch((error) => {
                showError(error && error.message ? error.message : "Could not generate safe rewrite.");
            });
        });
    }
    if (rewriteEngagingButton) {
        rewriteEngagingButton.addEventListener("click", () => {
            activeRewriteMode = "casual";
            generateRewrite("casual").catch((error) => {
                showError(error && error.message ? error.message : "Could not generate casual rewrite.");
            });
        });
    }
    if (rewriteDirectButton) {
        rewriteDirectButton.addEventListener("click", () => {
            activeRewriteMode = "direct";
            generateRewrite("direct").catch((error) => {
                showError(error && error.message ? error.message : "Could not generate direct rewrite.");
            });
        });
    }
    if (rewriteConvertingButton) {
        rewriteConvertingButton.addEventListener("click", () => {
            activeRewriteMode = "sales";
            generateRewrite("sales").catch((error) => {
                showError(error && error.message ? error.message : "Could not generate sales rewrite.");
            });
        });
    }
    if (postFixAccessButton) {
        postFixAccessButton.addEventListener("click", () => {
            window.appState.hasScaled = true;
            syncProgressState();
            applyProgressiveExposure();
            if (!isAuthenticated) {
                openPricingModal();
                trackEvent("post_fix_access_clicked", { state: "anon" });
                return;
            }
            trackEvent("post_fix_access_clicked", { state: "authenticated" });
            runSeedAuto().catch(() => {
                window.location.href = "/seed-inbox";
            });
        });
    }

    if (unlockFixButton) {
        unlockFixButton.addEventListener("click", async () => {
            window.appState.hasScaled = true;
            syncProgressState();
            applyProgressiveExposure();
            await refreshAuthStatus();
            await loadUserTokens();

            if (!isAuthenticated) {
                pendingAction = "fix";
                showAuthModal();
                return;
            }

            if (Number(userState.tokens || 0) <= 0) {
                showError("This email will likely underperform. Fix it before sending.");
                showPaywall();
                return;
            }

            unlockFullFix();
        });
    }

    if (shareResultButton) {
        shareResultButton.addEventListener("click", () => {
            shareResultCard().catch((error) => {
                showError(error && error.message ? error.message : "Could not copy result card.");
            });
        });
    }

    if (copyFixedBtnNode) {
        copyFixedBtnNode.addEventListener("click", () => {
            copyFixedEmail(copyFixedBtnNode).catch(() => {
                showError("Could not copy fixed email right now.");
            });
        });
    }

    if (runTestBtnNode) {
        runTestBtnNode.addEventListener("click", () => {
            runRealInboxTest();
        });
    }

    document.querySelectorAll("[data-nav]").forEach((buttonNode) => {
        if (buttonNode.dataset.navBound === "1") {
            return;
        }
        buttonNode.dataset.navBound = "1";
        buttonNode.addEventListener("click", () => {
            const target = String(buttonNode.dataset.nav || "").trim();
            if (!target) {
                return;
            }
            document.querySelectorAll(".page").forEach((pageNode) => pageNode.classList.add("hidden"));
            const targetNode = document.getElementById(target);
            if (targetNode) {
                targetNode.classList.remove("hidden");
            }
        });
    });

    if (resultCaptureSubmitButton) {
        resultCaptureSubmitButton.addEventListener("click", () => {
            submitResultEmailCapture().catch((error) => {
                showError(error && error.message ? error.message : "Could not subscribe right now.");
            });
        });
    }

    if (useFixedButton) useFixedButton.addEventListener("click", useFixedVersion);
    if (sendGmailButton) sendGmailButton.addEventListener("click", openInGmail);
    if (restoreOriginalButton) restoreOriginalButton.addEventListener("click", restoreOriginalDraft);
    if (editManualButton) editManualButton.addEventListener("click", editManually);
    if (feedbackInboxButton) feedbackInboxButton.addEventListener("click", () => sendFeedback("inbox"));
    if (feedbackSpamButton) feedbackSpamButton.addEventListener("click", () => sendFeedback("spam"));
    if (feedbackPromotionsButton) feedbackPromotionsButton.addEventListener("click", () => sendFeedback("promotions"));

    if (saveFixButton) {
        saveFixButton.addEventListener("click", () => {
            pendingAction = "save-fix";
            saveCurrentFix().catch((error) => {
                showError(error && error.message ? error.message : "Could not save this fix.");
            });
        });
    }
    if (runDiagnosisButton) runDiagnosisButton.addEventListener("click", () => runCampaignDiagnosis().catch((error) => showError(error && error.message ? error.message : "Could not diagnose campaign.")));
    if (submitAsyncButton) submitAsyncButton.addEventListener("click", () => runAnalyzeAsync().catch((error) => showError(error && error.message ? error.message : "Could not queue async scan.")));
    if (runBlacklistCheckButton) runBlacklistCheckButton.addEventListener("click", () => runBlacklistCheck().catch((error) => showError(error && error.message ? error.message : "Could not check domain risk.")));
    if (saveSeedTestButton) saveSeedTestButton.addEventListener("click", () => saveSeedTest().catch((error) => showError(error && error.message ? error.message : "Could not save seed test.")));
    if (runSeedAutoButton) runSeedAutoButton.addEventListener("click", () => runSeedAuto().catch((error) => showError(error && error.message ? error.message : "Could not run automated seed test.")));
    if (runSeedSyncButton) runSeedSyncButton.addEventListener("click", () => runSeedSync().catch((error) => showError(error && error.message ? error.message : "Could not run instant seed probe.")));
    if (runBulkScanButton) runBulkScanButton.addEventListener("click", () => runBulkScan().catch((error) => showError(error && error.message ? error.message : "Could not run bulk scan.")));
    if (generateSubjectsButton) generateSubjectsButton.addEventListener("click", () => generateSubjectLines().catch((error) => showError(error && error.message ? error.message : "Could not generate subject lines.")));
    if (createApiKeyButton) createApiKeyButton.addEventListener("click", () => createApiKey().catch((error) => showError(error && error.message ? error.message : "Could not create API key.")));
    if (listApiKeysButton) listApiKeysButton.addEventListener("click", () => listApiKeys().catch((error) => showError(error && error.message ? error.message : "Could not load API keys.")));
    if (revokeApiKeyButton) revokeApiKeyButton.addEventListener("click", () => revokeApiKey().catch((error) => showError(error && error.message ? error.message : "Could not revoke API key.")));
    if (createTeamButton) createTeamButton.addEventListener("click", () => createTeam().catch((error) => showError(error && error.message ? error.message : "Could not create team.")));
    if (listTeamsButton) listTeamsButton.addEventListener("click", () => listTeams().catch((error) => showError(error && error.message ? error.message : "Could not load teams.")));
    if (addTeamMemberButton) addTeamMemberButton.addEventListener("click", () => addTeamMember().catch((error) => showError(error && error.message ? error.message : "Could not add team member.")));
    if (refreshOutcomeStatsButton) refreshOutcomeStatsButton.addEventListener("click", () => refreshOutcomeStats().catch((error) => showError(error && error.message ? error.message : "Could not load outcome stats.")));
    if (refreshJobsButton) refreshJobsButton.addEventListener("click", () => refreshJobs().catch((error) => showError(error && error.message ? error.message : "Could not load async jobs.")));

    document.querySelectorAll("[data-nav]").forEach((buttonNode) => {
        if (buttonNode.dataset.navBound === "1") {
            return;
        }
        buttonNode.dataset.navBound = "1";
        buttonNode.addEventListener("click", () => {
            const target = String(buttonNode.dataset.nav || "").trim();
            if (!target) {
                return;
            }
            document.querySelectorAll(".page").forEach((pageNode) => pageNode.classList.add("hidden"));
            const targetNode = document.getElementById(target);
            if (targetNode) {
                targetNode.classList.remove("hidden");
            }
        });
    });

    if (leadCaptureContinueButton) {
        leadCaptureContinueButton.addEventListener("click", () => {
            continueWithLeadCapture().catch((error) => {
                showError(error && error.message ? error.message : "Could not save your email.");
            });
        });
    }
    if (leadCaptureCloseButton) leadCaptureCloseButton.addEventListener("click", hideLeadCaptureModal);
    if (authSignInButton) authSignInButton.addEventListener("click", () => handleAuthAction("signin"));
    if (authCreateButton) authCreateButton.addEventListener("click", () => handleAuthAction("create"));
    if (authCloseButton) authCloseButton.addEventListener("click", () => handleAuthAction("close"));

    if (authModal) {
        authModal.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.id === "auth-modal") handleAuthAction("close");
            if (target.id === "auth-signin") handleAuthAction("signin");
            if (target.id === "auth-create") handleAuthAction("create");
            if (target.id === "auth-close") handleAuthAction("close");
        });
    }

    if (leadCaptureModal) {
        leadCaptureModal.addEventListener("click", (event) => {
            const target = event.target;
            if (!(target instanceof HTMLElement)) return;
            if (target.id === "lead-capture-modal") hideLeadCaptureModal();
            if (target.id === "lead-capture-continue") {
                continueWithLeadCapture().catch((error) => {
                    showError(error && error.message ? error.message : "Could not save your email.");
                });
            }
            if (target.id === "lead-capture-close") hideLeadCaptureModal();
        });
    }

    if (form) {
        form.addEventListener("submit", async (event) => {
            event.preventDefault();
            pendingAction = "analyze";
            const hasAccess = await ensureScanAccess();
            if (!hasAccess) {
                return;
            }
            showScanCost();
            runPendingAction();
        });
    }

    if (rawEmailInput) {
        rawEmailInput.addEventListener("input", () => {
            const value = String(rawEmailInput.value || "").trim();
            if (!emailPastedTracked && value.length >= 20) {
                emailPastedTracked = true;
                trackEvent("email_pasted", {
                    length_bucket: value.length >= 300 ? "300_plus" : value.length >= 120 ? "120_299" : "20_119",
                });
            }
        });
    }

    document.querySelectorAll("details.secondary-options, details.advanced-block").forEach((detailsNode) => {
        detailsNode.addEventListener("toggle", () => {
            if (detailsNode.open && !advancedOpenedTracked) {
                advancedOpenedTracked = true;
                trackEvent("advanced_opened", {
                    section: detailsNode.classList.contains("advanced-block") ? "why_flagged" : "scan_options",
                });
            }
        });
    });
}

wireUiEvents();

magnetic(submitButton);
magnetic(useFixedButton);
initializeLoopCounters();
setupNextAction();
setupParallax();

setIdleState();
openTool("scan");
applyProgressiveExposure();
refreshAuthStatus().then(() => {
    loadUser().catch(() => null);
    refreshHomeLiveStats().catch(() => null);
    resumePendingAfterAuthIfNeeded();
    openAuthModalFromQueryIfNeeded();
    refreshSeedTests().catch(() => null);
    if (isAuthenticated) {
        listApiKeys().catch(() => null);
        listTeams().catch(() => null);
        refreshOutcomeStats().catch(() => null);
    }
    refreshJobs().catch(() => null);
    loadUserTokens().catch(() => null);
    refreshLockedFeatures();
    refreshPricingContext();
    openPendingScanFromStorage();
    openEntryFromQueryIfNeeded();
    applyProgressiveExposure();
});

document.addEventListener("DOMContentLoaded", () => {
    const btn = document.getElementById("get-access-btn");

    if (!btn) {
        console.error("Get Access button not found");
        return;
    }

    if (btn.dataset.getAccessBound === "1") {
        return;
    }

    btn.dataset.getAccessBound = "1";
    btn.addEventListener("click", () => {
        console.log("Get Access clicked");
        openPricingModal();
    });

    document.querySelectorAll("[data-nav]").forEach((buttonNode) => {
        if (buttonNode.dataset.navBound === "1") {
            return;
        }
        buttonNode.dataset.navBound = "1";
        buttonNode.addEventListener("click", () => {
            const target = String(buttonNode.dataset.nav || "").trim();
            if (!target) {
                return;
            }
            document.querySelectorAll(".page").forEach((pageNode) => pageNode.classList.add("hidden"));
            const targetNode = document.getElementById(target);
            if (targetNode) {
                targetNode.classList.remove("hidden");
            }
        });
    });
});
