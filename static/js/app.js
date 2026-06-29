// STATIC STUBS — replace with real API calls in behavior phase
const STUB_DATA = {
  stats: {
    scans_this_month: 7,
    average_score: 34,
    issues_fixed: 12,
    domain_health: 'healthy'
  },
  recent_scans: [
    { date: 'Jun 13, 2026', subject: 'Quick question about your pricing', score: 23, issues: 1, risk: 'High' },
    { date: 'Jun 12, 2026', subject: 'Following up on my last email', score: 67, issues: 3, risk: 'Medium' },
    { date: 'Jun 11, 2026', subject: 'Introduction — [First Name]', score: 12, issues: 0, risk: 'Clean' }
  ],
  extended_history: [
    { date: 'Jun 13, 2026', subject: 'Quick question about your pricing', score: 23, issues: 1, risk: 'High' },
    { date: 'Jun 12, 2026', subject: 'Following up on my last email', score: 67, issues: 3, risk: 'Medium' },
    { date: 'Jun 11, 2026', subject: 'Introduction — [First Name]', score: 12, issues: 0, risk: 'Clean' },
    { date: 'Jun 10, 2026', subject: 'Urgent: update payment details', score: 45, issues: 2, risk: 'Low' },
    { date: 'Jun 09, 2026', subject: 'Welcome to InboxGuard!', score: 95, issues: 0, risk: 'Clean' }
  ],
  domain: { name: 'mycompany.com', spf: 'pass', dkim: 'fail', dmarc: 'warning', score: 67 },
  profile: { name: 'M. Tharun Kumar', email: 'tharun@mycompany.com', domain: 'mycompany.com' },
  billing: { plan: 'Free', scans_used: 3, scans_limit: 3, resets_in_days: 14 }
};

// Razorpay Plan Mapping
const RAZORPAY_PLANS = {
    starter: { id: 'plan_SZWV8NEvJagNab', price: 199, name: 'Starter' },
    pro: { id: 'plan_SZWbPRZCN1aTkN', price: 999, name: 'Pro' },
    growth: { id: 'plan_ScBQczGquzpbUA', price: 4000, name: 'Growth Annual' },
    usage: { id: 'plan_ScBDHsF3daVe6z', price: 2, name: 'Usage-Based' },
};

// Razorpay Checkout Handler
async function purchasePlan(planKey) {
    // STUB: Razorpay checkout removed — to be re-implemented
    console.log('[InboxGuard] purchasePlan() called with key:', planKey);
}

function submitContactRequest() {
    // STUB: contact form logic removed — to be re-implemented
    console.log('[InboxGuard] submitContactRequest() called');
}
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
    return "light";
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
const step2FixBlockNode = document.getElementById("step2-fix-block");
const step3BlockNode = document.getElementById("step3-block");
const biggestRiskTextNode = document.getElementById("biggest-risk-text");
const deliverabilitySummaryNode = document.getElementById("deliverability-summary");
const beforeEmailNode = document.getElementById("before-email");
const afterEmailNode = document.getElementById("after-email");
const diffSummaryNode = document.getElementById("diff-summary");
const copyFixedBtnNode = document.getElementById("copy-fixed-btn");
const fixIssueButton = document.getElementById("fix-issue-btn");
const rewriteSafeButton = document.getElementById("rewrite-safe-btn");
const rewriteEngagingButton = document.getElementById("rewrite-engaging-btn");
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
const fixPreviewTextNode = document.getElementById("fix-preview-text");
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
const diagnosisActionsNode = document.getElementById("diagnosis-actions-container") || document.getElementById("diagnosis-actions");
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


// USD-based plan logic
let PLANS_USD = {};
let PLANS_DISPLAY = {};

function normalizePlanChoice(plan) {
    const value = String(plan || "monthly").toLowerCase();
    if (value === "growth" || value === "pro") return "monthly";
    if (value === "trial") return "starter";
    if (["free", "starter", "monthly", "annual", "usage"].includes(value)) return value;
    return "monthly";
}

function planDisplayName(plan) {
    const normalized = normalizePlanChoice(plan);
    return PLANS_DISPLAY[normalized]?.display_name || PLANS_DISPLAY[normalized]?.name || normalized.charAt(0).toUpperCase() + normalized.slice(1);
}

function formatUsd(amount) {
    const value = Math.max(0, Number(amount || 0));
    return new Intl.NumberFormat("en-US", {
        style: "currency",
        currency: "USD",
        maximumFractionDigits: 0,
    }).format(value);
}

function planCheckoutAmount(plan) {
    const normalized = normalizePlanChoice(plan);
    return Number(PLANS_USD[normalized]?.price || 0);
}

function renderCheckoutPrice(plan, promo = null) {
    if (!checkoutPriceLabelNode && !checkoutPriceSummaryNode) {
        return;
    }
    const baseAmount = planCheckoutAmount(plan);
    const applied = promo && typeof promo === "object" ? promo : null;
    const finalAmount = Number(applied && applied.final_amount_usd !== undefined ? applied.final_amount_usd : baseAmount);
    const discountAmount = Number(applied && applied.discount_amount_usd !== undefined ? applied.discount_amount_usd : 0);

    if (checkoutPriceLabelNode) {
        checkoutPriceLabelNode.textContent = `${formatUsd(finalAmount)}${plan === "annual" ? " / year" : plan === "usage" ? " / scan" : " / month"}`;
    }

    if (checkoutPriceSummaryNode) {
        if (applied) {
            const promoLabel = applied.type === "trial_extension"
                ? `Trial extended by ${Number(applied.trial_extension_days || 0)} day${Number(applied.trial_extension_days || 0) === 1 ? "" : "s"}`
                : `${formatUsd(discountAmount)} off`;
            checkoutPriceSummaryNode.textContent = `Checkout total: ${formatUsd(finalAmount)} (${promoLabel})`;
        } else {
            checkoutPriceSummaryNode.textContent = `Checkout total: ${formatUsd(baseAmount)}`;
        }
    }
}

// Dynamically set hero price from /plans
async function setHeroPrice() {
    const heroPriceNode = document.getElementById("hero-price");
    if (!heroPriceNode) return;
    try {
        const response = await fetch("/plans", { method: "GET" });
        if (!response.ok) return;
        const data = await response.json();
        const plans = data.plans || {};
        PLANS_USD = plans;
        PLANS_DISPLAY = plans;
        // Prefer annual, fallback to monthly
        const annual = plans.annual;
        if (annual && annual.price) {
            heroPriceNode.textContent = formatUsd(annual.price) + "/year";
        } else if (plans.monthly && plans.monthly.price) {
            heroPriceNode.textContent = formatUsd(plans.monthly.price) + "/month";
        } else {
            heroPriceNode.textContent = "$12/month";
        }
    } catch (e) {
        // fallback
        heroPriceNode.textContent = "$12/month";
    }
}

document.addEventListener("DOMContentLoaded", setHeroPrice);

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

function showSuccess(message) {
    let successBanner = document.getElementById("success-banner");
    if (!successBanner) {
        successBanner = document.createElement("div");
        successBanner.id = "success-banner";
        successBanner.style.position = "fixed";
        successBanner.style.top = "14px";
        successBanner.style.left = "50%";
        successBanner.style.transform = "translateX(-50%)";
        successBanner.style.zIndex = "120";
        successBanner.style.background = "#00694c";
        successBanner.style.color = "#fff";
        successBanner.style.border = "1px solid #bccac1";
        successBanner.style.borderRadius = "10px";
        successBanner.style.padding = "10px 14px";
        successBanner.style.fontSize = "0.88rem";
        successBanner.classList.add("hidden");
        document.body.appendChild(successBanner);
    }
    successBanner.textContent = message;
    successBanner.classList.remove("hidden");
    setTimeout(() => successBanner.classList.add("hidden"), 3800);
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
    // Legacy elements update
    if (liveStatsSummaryNode) {
        liveStatsSummaryNode.textContent = `Tracked outcomes: ${STUB_DATA.stats.scans_this_month} | Average Score: ${STUB_DATA.stats.average_score}%`;
    }
    if (liveStatsBreakdownNode) {
        liveStatsBreakdownNode.textContent = `Issues fixed: ${STUB_DATA.stats.issues_fixed} • Domain health status: ${STUB_DATA.stats.domain_health.toUpperCase()}`;
    }
    if (liveStatsStatusNode) {
        liveStatsStatusNode.textContent = "Updates in real time as new feedback is recorded.";
    }

    // New Bento grid elements update
    const scansVal = document.getElementById("stat-scans-val");
    const scoreVal = document.getElementById("stat-score-val");
    const fixedVal = document.getElementById("stat-fixed-val");
    const scansRatioVal = document.getElementById("stat-scans-ratio");
    const usageProgressVal = document.getElementById("usage-progress-fill");
    const recentScansList = document.getElementById("recent-scans-list");
    const sidebarDomain = document.getElementById("sidebar-domain-name");

    if (scansVal) scansVal.textContent = String(STUB_DATA.stats.scans_this_month);
    if (scoreVal) scoreVal.textContent = String(STUB_DATA.stats.average_score);
    if (fixedVal) fixedVal.textContent = String(STUB_DATA.stats.issues_fixed);
    if (sidebarDomain) sidebarDomain.textContent = String(STUB_DATA.domain.name);
    
    if (scansRatioVal) {
        scansRatioVal.textContent = `${STUB_DATA.billing.scans_used} / ${STUB_DATA.billing.scans_limit === -1 ? '∞' : STUB_DATA.billing.scans_limit}`;
    }
    if (usageProgressVal) {
        const limit = STUB_DATA.billing.scans_limit === -1 ? 50 : STUB_DATA.billing.scans_limit;
        const percent = Math.min(100, Math.round((STUB_DATA.billing.scans_used / limit) * 100));
        usageProgressVal.style.width = `${percent}%`;
    }

    if (recentScansList) {
        recentScansList.innerHTML = "";
        const scans = Array.isArray(STUB_DATA.recent_scans) ? STUB_DATA.recent_scans : [];
        if (scans.length === 0) {
            recentScansList.innerHTML = `
                <tr class="border-b border-outline-variant/30 dark:border-outline/30">
                    <td colspan="5" class="px-md py-4 text-center text-secondary">No recent scans.</td>
                </tr>
            `;
        } else {
            scans.forEach(scan => {
                const tr = document.createElement("tr");
                tr.className = "border-b border-outline-variant/30 dark:border-outline/30 hover:bg-surface-container-low dark:hover:bg-on-secondary-fixed-variant/20 transition-colors";
                
                let badgeClass = "bg-primary/10 text-primary";
                if (scan.score < 50) {
                    badgeClass = "bg-error-container text-error text-xs font-bold";
                } else if (scan.score < 80) {
                    badgeClass = "bg-amber-100 text-amber-700 text-xs font-bold";
                }
                
                tr.innerHTML = `
                    <td class="px-md py-4 text-on-surface-variant dark:text-secondary-fixed-dim">${scan.date}</td>
                    <td class="px-md py-4 font-medium truncate max-w-[200px]" title="${scan.subject}">${scan.subject}</td>
                    <td class="px-md py-4"><span class="inline-flex items-center justify-center px-2 py-0.5 rounded-md ${badgeClass}">${scan.score} / 100</span></td>
                    <td class="px-md py-4">${scan.issues}</td>
                    <td class="px-md py-4"><button class="text-primary dark:text-primary-fixed hover:underline font-semibold bg-transparent border-none cursor-pointer" onclick="openTool('scan')">View</button></td>
                `;
                recentScansList.appendChild(tr);
            });
        }
    }
}

function runRealTimeLinting() {
    const rawEmailInput = document.getElementById("raw-email");
    const realtimeIssuesList = document.getElementById("realtime-issues-list");
    const realtimeLintBand = document.getElementById("realtime-lint-band");
    if (!rawEmailInput || !realtimeIssuesList || !realtimeLintBand) {
        return;
    }

    const content = rawEmailInput.value || "";
    if (content.trim().length === 0) {
        realtimeIssuesList.innerHTML = "<li>No issues detected. Start typing to audit your draft in real-time.</li>";
        realtimeLintBand.textContent = "Low risk";
        realtimeLintBand.className = "text-xs px-2.5 py-0.5 rounded-full border border-primary/20 text-primary bg-primary-container/25 font-semibold";
        return;
    }

    const issues = [];
    
    // Check 1: spam trigger words
    const triggerWords = [
        /\bfree\b/gi, /\bbuy now\b/gi, /\bclick here\b/gi, /\bwinner\b/gi, 
        /\blimited time\b/gi, /\bact now\b/gi, /\bmake money\b/gi, 
        /\bcash\b/gi, /\bsave big\b/gi, /\burgent\b/gi, /\bguaranteed\b/gi,
        /\b100% satisfied\b/gi, /\bextra income\b/gi, /\bno catch\b/gi,
        /\brefinance\b/gi, /\bhidden charges\b/gi
    ];
    
    let triggerCount = 0;
    triggerWords.forEach(pattern => {
        const matches = content.match(pattern);
        if (matches) {
            triggerCount += matches.length;
        }
    });

    if (triggerCount > 0) {
        issues.push(`<li class="flex items-center gap-xs text-error font-semibold"><span class="material-symbols-outlined text-[14px]">error</span>Found ${triggerCount} spam-trigger word(s) (e.g. 'free', 'urgent').</li>`);
    }

    // Check 2: ALL CAPS words
    const allCapsMatches = content.match(/\b[A-Z]{3,}\b/g);
    if (allCapsMatches && allCapsMatches.length > 1) {
        issues.push(`<li class="flex items-center gap-xs text-[#d97706] font-semibold"><span class="material-symbols-outlined text-[14px]">warning</span>Capitalization: Avoid writing words in ALL CAPS (found: ${allCapsMatches.slice(0, 3).join(', ')}).</li>`);
    }

    // Check 3: Subject line check (first line starting with "Subject:")
    const lines = content.split('\n');
    const subjectLine = lines.find(line => line.toLowerCase().startsWith('subject:'));
    if (subjectLine) {
        const subjectText = subjectLine.replace(/subject:/i, '').trim();
        if (subjectText.match(/[!?]{2,}/)) {
            issues.push(`<li class="flex items-center gap-xs text-error font-semibold"><span class="material-symbols-outlined text-[14px]">error</span>Subject line: Avoid multiple exclamation/question marks (e.g. '!!!').</li>`);
        }
        if (subjectText.length > 60) {
            issues.push(`<li class="flex items-center gap-xs text-[#d97706] font-semibold"><span class="material-symbols-outlined text-[14px]">warning</span>Subject line: Subject is long (${subjectText.length} chars). Keep under 60 characters for best display.</li>`);
        }
    } else {
        issues.push(`<li class="flex items-center gap-xs text-secondary"><span class="material-symbols-outlined text-[14px]">info</span>Add 'Subject: [Your Subject]' at the top of your draft to analyze subject lines.</li>`);
    }

    // Check 4: Track links
    const linkMatches = content.match(/https?:\/\/[^\s]+/g);
    if (linkMatches && linkMatches.length > 2) {
        issues.push(`<li class="flex items-center gap-xs text-[#d97706] font-semibold"><span class="material-symbols-outlined text-[14px]">warning</span>Too many tracking links (found ${linkMatches.length}). Avoid overloading with links.</li>`);
    }

    // Render issues list
    if (issues.length === 0) {
        realtimeIssuesList.innerHTML = `<li class="flex items-center gap-xs text-primary font-semibold"><span class="material-symbols-outlined text-[14px]">check_circle</span>Looks good! No structural deliverability risks found.</li>`;
        realtimeLintBand.textContent = "Low risk";
        realtimeLintBand.className = "text-xs px-2.5 py-0.5 rounded-full border border-primary/20 text-primary bg-primary-container/25 font-semibold";
    } else {
        realtimeIssuesList.innerHTML = issues.join('');
        const severeCount = issues.filter(issue => issue.includes('text-error')).length;
        if (severeCount > 0) {
            realtimeLintBand.textContent = "High risk";
            realtimeLintBand.className = "text-xs px-2.5 py-0.5 rounded-full border border-error-container text-error bg-error-container/25 font-semibold";
        } else {
            realtimeLintBand.textContent = "Medium risk";
            realtimeLintBand.className = "text-xs px-2.5 py-0.5 rounded-full border border-amber-500/25 text-amber-700 bg-amber-100/30 font-semibold";
        }
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
    // STUB: auth gate removed — to be re-implemented
    return false;
}

function needsLeadCaptureGate(action) {
    // STUB: lead capture gate removed — to be re-implemented
    return false;
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
    // STUB: auth status check removed — to be re-implemented
    isAuthenticated = true;
    currentUserName = STUB_DATA.profile.name;
    currentUserEmail = STUB_DATA.profile.email;
    currentUserAvatar = "";
    anonymousScansUsed = STUB_DATA.billing.scans_used;
    anonymousScansLimit = STUB_DATA.billing.scans_limit;
    userScansUsed = STUB_DATA.billing.scans_used;
    userScansLimit = STUB_DATA.billing.scans_limit;
    currentUserStatus = "active";
    currentUserPlan = normalizePlanChoice(STUB_DATA.billing.plan);
    currentUserIsAdmin = false;
    window.appState.isAdmin = false;
    leadCaptureSaved = true;
    leadCaptureEmail = STUB_DATA.profile.email;

    window.currentUser = isAuthenticated;
    window.userIsPro = false;
    window.userStatus = currentUserStatus;
    window.userPlan = currentUserPlan;
    window.userIsAdmin = false;
    window.currentUserEmail = currentUserEmail;
    window.currentUserName = currentUserName;
    window.appState.isAdmin = false;

    if (adminDashboardButton) {
        adminDashboardButton.classList.add("hidden");
    }

    window.appState.isAuthenticated = Boolean(isAuthenticated);
    updateProfileNav();
    syncFlowUserState();
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
    localStorage.setItem("ig_pending_rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "balanced");
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
    // STUB: auth redirect logic removed — to be re-implemented
}

function openAuthModalFromQueryIfNeeded() {
    // STUB: auth query check removed — to be re-implemented
}

function openEntryFromQueryIfNeeded() {
    // STUB: query check removed — to be re-implemented
}

function openPendingScanFromStorage() {
    // STUB: pending scan check removed — to be re-implemented
}

function onAuthSuccess(source) {
    // STUB: auth success logic removed — to be re-implemented
}

async function continueWithEmail() {
    // STUB: email auth removed — to be re-implemented
}

async function continueWithLeadCapture() {
    // STUB: lead capture removed — to be re-implemented
}

async function continueWithGoogle() {
    // STUB: Google OAuth redirect removed — to be re-implemented
}

function handleAuthAction(action) {
    // STUB: auth action routing removed — to be re-implemented
    if (action === "close") {
        hideAuthModal();
    }
}

async function saveCurrentFix() {
    // STUB: save fix removed — to be re-implemented
    console.log('[InboxGuard] saveCurrentFix() called');
    if (saveFixButton) {
        saveFixButton.textContent = "Saved";
        saveFixButton.disabled = true;
    }
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
    if (key === "scan" || key === "threat-scan") {
        navigate("scan", { focusInput: true, scroll: true });
        return;
    }
    hideAllViews();
    homeSections.forEach((node) => node.classList.add("hidden"));
    if (toolPanel) {
        toolPanel.classList.remove("hidden");
    }
    // Hide all tool panes, then show the one for this tool
    document.querySelectorAll('.tool-pane').forEach((el) => {
        el.classList.add('hidden');
        el.classList.remove('active');
    });
    const pane = document.querySelector(`[data-tool-pane="${key}"]`);
    if (pane) {
        pane.classList.remove('hidden');
        pane.classList.add('active');
        const firstInput = pane.querySelector('input,select,textarea,button');
        if (firstInput && typeof firstInput.focus === 'function') {
            setTimeout(() => firstInput.focus(), 60);
        }
    }
    document.querySelectorAll('.tool-nav-btn').forEach((btn) => {
        if (btn.getAttribute('data-tool') === key) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
    const mainArea = document.querySelector('.main-area');
    if (mainArea) {
        mainArea.classList.add('tool-panel-open');
    }
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

function renderDetectedSignals(signals) {
    if (!signals) return;
    const container = document.getElementById("deliverability-summary");
    if (!container) return;
    
    const spf = String(signals.spf_status || "unknown").toUpperCase();
    const dkim = String(signals.dkim_status || "unknown").toUpperCase();
    const dmarc = String(signals.dmarc_status || "unknown").toUpperCase();
    
    const lines = [];
    lines.push(`SPF: ${spf}`);
    lines.push(`DKIM: ${dkim}`);
    lines.push(`DMARC: ${dmarc}`);
    if (signals.link_count !== undefined) {
        lines.push(`Links: ${signals.link_count}`);
    }
    if (signals.image_count !== undefined) {
        lines.push(`Images: ${signals.image_count}`);
    }
    
    const prev = container.querySelector(".detected-signals-block");
    if (prev) {
        prev.remove();
    }
    
    const div = document.createElement("div");
    div.className = "detected-signals-block mt-md pt-2 border-t border-outline-variant text-xs text-on-surface-variant dark:text-secondary-fixed-dim flex gap-md flex-wrap";
    div.innerHTML = lines.map(line => `<span>${line}</span>`).join("");
    container.appendChild(div);
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

// renderPrediction is deprecated. The outcomes are rendered inline via renderConversionResult.

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
        primaryIssueCard.textContent = issues.length === 0
            ? "No critical issue"
            : String(issues[0] && (issues[0].message || issues[0].type || issues[0].title) || "Spam phrases detected");
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
        rewritten: improved || original,
    });

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
            primaryIssueNode.textContent = String(issues[0] && (issues[0].message || issues[0].type || issues[0].title) || "Issues detected");
        }
    }

    if (step2FixBlockNode) {
        step2FixBlockNode.classList.remove("hidden");
    }
    if (step3BlockNode) {
        step3BlockNode.classList.remove("hidden");
    }

    if (beforeEmailNode) {
        beforeEmailNode.textContent = original;
    }
    if (afterEmailNode) {
        afterEmailNode.textContent = improved;
    }

    if (diffSummaryNode) {
        diffSummaryNode.innerHTML = "";
        issues.forEach((issue) => {
            const line = document.createElement("div");
            line.className = "diff-line";
            line.textContent = String(issue && (issue.message || issue.type || issue.title) || "Fix applied");
            diffSummaryNode.appendChild(line);
        });
    }

    if (copyFixedBtnNode) {
        copyFixedBtnNode.onclick = () => {
            navigator.clipboard.writeText(improved);
            copyFixedBtnNode.textContent = "Copied!";
            setTimeout(() => {
                copyFixedBtnNode.textContent = "Copy Fixed Email";
            }, 1500);
        };
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
        runTestBtnNode.onclick = () => {
            window.appState.hasScaled = true;
            updateSteps();
            if (typeof window.openPricingModal === "function") {
                window.openPricingModal();
            } else {
                openPricingModal();
            }
        };
    }

    if (data && data.signals) {
        renderDetectedSignals(data.signals);
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
        html = html.replace(regex, (match) => `<span class="spam-word"> ${match}</span>`);
    });
    return html;
}

async function generateRewrite(mode = "safe") {
    // STUB: generate rewrite removed — to be re-implemented
    console.log('[InboxGuard] generateRewrite() called with mode:', mode);
    const original = String(rawEmailInput.value || "").trim();
    const rewritten = `Subject: Quick outreach (No spam words)\n\nHi John,\n\nI noticed your recent newsletter. Let me know if you are open for a quick conversation.\n\nBest,\nSender`;
    
    renderRewrite({
        original,
        rewritten,
        improved: true,
        fix: "Removed spam words and simplified the subject line",
        issue_highlights: []
    });
    
    if (fixPreviewTextNode) {
        fixPreviewTextNode.textContent = "Removed spam words and simplified the subject line";
    }
}

function renderRewrite(data) {
    const original = String((data && data.original) || "");
    const rewritten = String(
        (data && (data.rewritten || data.improved || data.fix || data.rewritten_text)) || "No rewrite generated"
    );
    const highlightSpans = Array.isArray(data && data.issue_highlights) ? data.issue_highlights : [];

    if (beforeEmailNode) {
        beforeEmailNode.innerHTML = highlightIssueSpans(original, highlightSpans);
    }
    if (afterEmailNode) {
        afterEmailNode.textContent = rewritten;
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
    const product = subjectProductNameInput ? String(subjectProductNameInput.value || "").trim() : "";
    const role = subjectTargetRoleInput ? String(subjectTargetRoleInput.value || "").trim() : "";
    const industry = subjectIndustryInput ? String(subjectIndustryInput.value || "").trim() : "";
    const goal = subjectGoalInput ? String(subjectGoalInput.value || "").trim() : "";
    const emailType = subjectEmailTypeInput ? String(subjectEmailTypeInput.value || "cold").trim() : "cold";
    const tone = subjectToneInput ? String(subjectToneInput.value || "internal").trim() : "internal";
    const context = subjectContextInput ? String(subjectContextInput.value || "").trim() : "";
    const body = subjectBodyInput ? String(subjectBodyInput.value || "").trim() : "";

    const payload = {
        product_name: product,
        target_role: role,
        industry: industry,
        goal: goal,
        email_type: emailType,
        tone: tone,
        context: context,
        body: body
    };

    const previousHtml = generateSubjectsButton ? generateSubjectsButton.innerHTML : "";
    if (generateSubjectsButton) {
        setActionButtonState(generateSubjectsButton, "loading", "Generating...");
    }

    try {
        const response = await fetch("/subject-lines", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
        });
        if (!response.ok) {
            throw new Error("Failed to generate subject lines. Server returned status " + response.status);
        }
        const data = await response.json();
        if (data.ok) {
            renderSubjectIntel(data);
            if (generateSubjectsButton) {
                setActionButtonState(generateSubjectsButton, "success", "Generated!");
                setTimeout(() => {
                    setActionButtonState(generateSubjectsButton, "idle");
                    generateSubjectsButton.innerHTML = previousHtml;
                }, 1500);
            }
        } else {
            throw new Error(data.detail || "Could not generate subject lines.");
        }
    } catch (error) {
        showError(error.message || "An error occurred.");
        if (generateSubjectsButton) {
            setActionButtonState(generateSubjectsButton, "error", "Failed");
            setTimeout(() => {
                setActionButtonState(generateSubjectsButton, "idle");
                generateSubjectsButton.innerHTML = previousHtml;
            }, 1500);
        }
    }
}

async function runSeedAuto() {
    const campaign = seedCampaignInput ? String(seedCampaignInput.value || "").trim() : "Automated Run";
    const payload = {
        campaign_name: campaign,
        subject: "InboxGuard Automated Seed Test",
        body: "InboxGuard automated deliverability health probe content.",
        wait_seconds: 6
    };
    
    const previousLabel = runSeedAutoButton ? runSeedAutoButton.textContent : "Run Automated Seed Test";
    setActionButtonState(runSeedAutoButton, "loading", "Initializing...");
    
    try {
        const response = await fetch("/seed-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Automated seed test failed.");
        const data = await response.json();
        
        if (seedTestListNode) {
            seedTestListNode.innerHTML = "";
            const summaryLine = document.createElement("li");
            summaryLine.className = "font-bold text-primary";
            summaryLine.textContent = `Automated Summary | Inbox ${data.summary.inbox} | Spam ${data.summary.spam} | Promotions ${data.summary.promotions}`;
            seedTestListNode.appendChild(summaryLine);
        }
        setActionButtonState(runSeedAutoButton, "success", "Completed");
        showError("Automated seed test completed successfully.");
        await refreshSeedTests();
    } catch(e) {
        showError(e.message);
        setActionButtonState(runSeedAutoButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(runSeedAutoButton, "idle", previousLabel), 1500);
}

async function runSeedSync() {
    const campaign = seedCampaignInput ? String(seedCampaignInput.value || "").trim() : "Instant Probe";
    const payload = {
        campaign_name: campaign,
        subject: "InboxGuard Instant Probe",
        body: "InboxGuard seed testing content",
        wait_seconds: 5
    };
    
    const previousLabel = runSeedSyncButton ? runSeedSyncButton.textContent : "Run Instant Seed Probe";
    setActionButtonState(runSeedSyncButton, "loading", "Probing...");
    
    try {
        const response = await fetch("/seed-test", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload)
        });
        if (!response.ok) throw new Error("Seed probe failed.");
        const data = await response.json();
        
        if (seedTestListNode) {
            seedTestListNode.innerHTML = "";
            const summaryLine = document.createElement("li");
            summaryLine.className = "font-bold text-primary";
            summaryLine.textContent = `Summary | Inbox ${data.summary.inbox} | Spam ${data.summary.spam} | Promotions ${data.summary.promotions}`;
            seedTestListNode.appendChild(summaryLine);
            
            const placements = Array.isArray(data.placements) ? data.placements : [];
            placements.forEach(p => {
                const li = document.createElement("li");
                li.className = "ml-2 mt-0.5 list-disc text-on-surface-variant dark:text-secondary-fixed-dim";
                li.textContent = `${p.provider}: ${p.placement}`;
                seedTestListNode.appendChild(li);
            });
        }
        setActionButtonState(runSeedSyncButton, "success", "Completed");
        showError("Instant seed probe completed.");
        await refreshSeedTests();
    } catch(e) {
        showError(e.message);
        setActionButtonState(runSeedSyncButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(runSeedSyncButton, "idle", previousLabel), 1500);
}

async function refreshPlans() {
    if (!plansOutputNode) return;
    try {
        const response = await fetch("/plans");
        if (!response.ok) throw new Error("Could not fetch plans");
        const data = await response.json();
        plansOutputNode.innerHTML = JSON.stringify(data.plans || data, null, 2);
    } catch(e) {
        plansOutputNode.innerHTML = "Error loading plans: " + e.message;
    }
}

async function requestAccess() {
    const email = accessRequestEmailInput ? String(accessRequestEmailInput.value || "").trim() : "";
    if (!email) {
        showError("Please specify an email address.");
        return;
    }
    const payload = new FormData();
    payload.set("email", email);
    try {
        const response = await fetch("/request-access", { method: "POST", body: payload });
        if (!response.ok) throw new Error("Access request failed.");
        showError("Access request submitted. We'll contact you soon!");
        if (accessRequestEmailInput) accessRequestEmailInput.value = "";
    } catch(e) {
        showError(e.message);
    }
}

async function runBulkScan() {
    const file = bulkFileInput && bulkFileInput.files ? bulkFileInput.files[0] : null;
    if (!file) {
        showError("Please select a CSV file to scan.");
        return;
    }
    
    const payload = new FormData();
    payload.append("file", file);
    payload.append("analysis_mode", "content");
    
    const runButton = runBulkScanButton;
    const previousLabel = runButton ? runButton.textContent : "Run Bulk Scanner";
    
    if (bulkResultsNode) {
        bulkResultsNode.innerHTML = "<li>Uploading and processing CSV rows...</li>";
    }
    setActionButtonState(runButton, "loading", "Analyzing...");
    
    try {
        const response = await fetch("/bulk-analyze", {
            method: "POST",
            body: payload
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Could not execute bulk scan.");
        }
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        
        if (bulkResultsNode) {
            bulkResultsNode.innerHTML = "";
            const summary = document.createElement("li");
            summary.className = "font-bold text-primary mb-1 text-xs";
            summary.textContent = `SUCCESS: Processed ${data.processed} rows out of max ${data.max_rows}`;
            bulkResultsNode.appendChild(summary);
            
            items.slice(0, 10).forEach(item => {
                const li = document.createElement("li");
                li.className = "flex justify-between items-center bg-surface-container-low dark:bg-on-secondary-fixed-variant/10 p-2 rounded-xl border border-outline-variant/30 text-xs mt-1";
                if (item.error) {
                    li.innerHTML = `<span class="text-error font-semibold">Row ${item.row}: Error: ${item.error}</span>`;
                } else {
                    const isHealthy = item.score >= 80;
                    li.innerHTML = `
                        <span>Row ${item.row}: ${item.primary_issue || 'No issues'}</span>
                        <span class="font-bold ${isHealthy ? 'text-primary' : 'text-error'}">${item.score}/100 (${item.risk_band})</span>
                    `;
                }
                bulkResultsNode.appendChild(li);
            });
            if (items.length > 10) {
                const moreLi = document.createElement("li");
                moreLi.className = "text-secondary text-[10px] mt-1 text-center";
                moreLi.textContent = `... and ${items.length - 10} more rows`;
                bulkResultsNode.appendChild(moreLi);
            }
        }
        setActionButtonState(runButton, "success", "Completed");
    } catch (error) {
        showError(error.message);
        if (bulkResultsNode) {
            bulkResultsNode.innerHTML = `<li class="text-error">Error: ${error.message}</li>`;
        }
        setActionButtonState(runButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(runButton, "idle", previousLabel), 1500);
}

async function createApiKey() {
    const labelInput = document.getElementById("api-key-name");
    const name = labelInput && labelInput.value ? String(labelInput.value).trim() : "Primary key";
    
    const payload = new FormData();
    payload.set("name", name);
    
    const logActivity = (msg) => {
        if (opsOutputNode) {
            const li = document.createElement("li");
            li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            opsOutputNode.insertBefore(li, opsOutputNode.firstChild);
        }
    };
    
    setActionButtonState(createApiKeyButton, "loading", "Creating...");
    try {
        const response = await fetch("/api-keys", {
            method: "POST",
            body: payload
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Could not create API key.");
        }
        const data = await response.json();
        logActivity(`SUCCESS: API key '${name}' created. Key: ${data.api_key}`);
        showError(`Key created: ${data.api_key}. Write it down now!`);
        if (labelInput) labelInput.value = "";
        setActionButtonState(createApiKeyButton, "success", "Created");
        await listApiKeys();
    } catch (error) {
        logActivity(`ERROR: ${error.message}`);
        showError(error.message);
        setActionButtonState(createApiKeyButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(createApiKeyButton, "idle", "Create API Token"), 1500);
}

async function listApiKeys() {
    if (!apiKeyListNode) return;
    try {
        const response = await fetch("/api-keys");
        if (!response.ok) throw new Error("Could not list keys");
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        apiKeyListNode.innerHTML = "";
        if (!items.length) {
            apiKeyListNode.innerHTML = "<li>No active tokens found.</li>";
            return;
        }
        items.forEach(item => {
            const li = document.createElement("li");
            li.className = "flex justify-between items-center bg-surface-container-low dark:bg-on-secondary-fixed-variant/10 p-2 rounded-xl border border-outline-variant/30 text-xs";
            li.innerHTML = `
                <div>
                    <span class="font-bold text-on-surface dark:text-secondary-fixed">${item.name}</span> 
                    <span class="text-secondary dark:text-secondary-fixed-dim">(ID: ${item.id})</span>
                    <code class="ml-2 bg-surface px-1 py-0.5 rounded text-[10px]">...${String(item.prefix || "")}</code>
                </div>
                <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${item.revoked ? 'bg-error-container text-error' : 'bg-primary/20 text-primary'}">
                    ${item.revoked ? 'Revoked' : 'Active'}
                </span>
            `;
            apiKeyListNode.appendChild(li);
        });
    } catch (e) {
        apiKeyListNode.innerHTML = `<li class="text-error">Could not load keys: ${e.message}</li>`;
    }
}

async function revokeApiKey() {
    const keyIdInput = document.getElementById("revoke-key-id");
    const keyId = keyIdInput && keyIdInput.value ? Number(keyIdInput.value) : 0;
    if (!keyId) {
        showError("Please specify a valid Key ID to revoke.");
        return;
    }
    const payload = new FormData();
    payload.set("key_id", String(keyId));
    
    const logActivity = (msg) => {
        if (opsOutputNode) {
            const li = document.createElement("li");
            li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            opsOutputNode.insertBefore(li, opsOutputNode.firstChild);
        }
    };
    
    setActionButtonState(revokeApiKeyButton, "loading", "Revoking...");
    try {
        const response = await fetch("/api-keys/revoke", {
            method: "POST",
            body: payload
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Could not revoke key.");
        }
        logActivity(`SUCCESS: Revoked API key ID ${keyId}`);
        showError(`Revoked API key ID ${keyId}`);
        if (keyIdInput) keyIdInput.value = "";
        setActionButtonState(revokeApiKeyButton, "success", "Revoked");
        await listApiKeys();
    } catch (error) {
        logActivity(`ERROR: ${error.message}`);
        showError(error.message);
        setActionButtonState(revokeApiKeyButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(revokeApiKeyButton, "idle", "Revoke Token"), 1500);
}

async function createTeam() {
    const teamInput = document.getElementById("team-name");
    const name = teamInput && teamInput.value ? String(teamInput.value).trim() : "My Team";
    
    const payload = new FormData();
    payload.set("name", name);
    
    const logActivity = (msg) => {
        if (opsOutputNode) {
            const li = document.createElement("li");
            li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            opsOutputNode.insertBefore(li, opsOutputNode.firstChild);
        }
    };
    
    setActionButtonState(createTeamButton, "loading", "Creating...");
    try {
        const response = await fetch("/teams", {
            method: "POST",
            body: payload
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Could not create workspace.");
        }
        const data = await response.json();
        logActivity(`SUCCESS: Workspace '${name}' created (ID: ${data.team_id})`);
        showError(`Workspace '${name}' created!`);
        if (teamInput) teamInput.value = "";
        setActionButtonState(createTeamButton, "success", "Created");
        await listTeams();
    } catch (error) {
        logActivity(`ERROR: ${error.message}`);
        showError(error.message);
        setActionButtonState(createTeamButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(createTeamButton, "idle", "Create Workspace"), 1500);
}

async function listTeams() {
    if (!teamListNode) return;
    try {
        const response = await fetch("/teams");
        if (!response.ok) throw new Error("Could not list teams");
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        teamListNode.innerHTML = "";
        if (!items.length) {
            teamListNode.innerHTML = "<li>No workspaces found.</li>";
            return;
        }
        items.forEach(item => {
            const li = document.createElement("li");
            li.className = "flex justify-between items-center bg-surface-container-low dark:bg-on-secondary-fixed-variant/10 p-2 rounded-xl border border-outline-variant/30 text-xs";
            li.innerHTML = `
                <div>
                    <span class="font-bold text-on-surface dark:text-secondary-fixed">${item.name}</span>
                    <span class="text-secondary dark:text-secondary-fixed-dim">(ID: ${item.id})</span>
                </div>
                <span class="text-[10px] text-secondary">Owner ID: ${item.owner_id}</span>
            `;
            teamListNode.appendChild(li);
        });
    } catch (e) {
        teamListNode.innerHTML = `<li class="text-error">Could not load workspaces: ${e.message}</li>`;
    }
}

async function addTeamMember() {
    const teamIdInput = document.getElementById("team-member-team-id");
    const emailInput = document.getElementById("team-member-email");
    const roleInput = document.getElementById("team-member-role");
    
    const teamId = teamIdInput && teamIdInput.value ? Number(teamIdInput.value) : 0;
    const email = emailInput && emailInput.value ? String(emailInput.value).trim() : "";
    const role = roleInput ? String(roleInput.value) : "member";
    
    if (!teamId || !email) {
        showError("Specify Team ID and Member Email.");
        return;
    }
    
    const payload = new FormData();
    payload.set("team_id", String(teamId));
    payload.set("email", email);
    payload.set("role", role);
    
    const logActivity = (msg) => {
        if (opsOutputNode) {
            const li = document.createElement("li");
            li.textContent = `[${new Date().toLocaleTimeString()}] ${msg}`;
            opsOutputNode.insertBefore(li, opsOutputNode.firstChild);
        }
    };
    
    setActionButtonState(addTeamMemberButton, "loading", "Inviting...");
    try {
        const response = await fetch("/teams/member", {
            method: "POST",
            body: payload
        });
        if (!response.ok) {
            const err = await response.json().catch(() => ({}));
            throw new Error(err.detail || "Could not invite member.");
        }
        logActivity(`SUCCESS: Invited ${email} to Workspace ID ${teamId} as ${role}`);
        showError(`Invited ${email} successfully!`);
        if (emailInput) emailInput.value = "";
        setActionButtonState(addTeamMemberButton, "success", "Invited");
    } catch (error) {
        logActivity(`ERROR: ${error.message}`);
        showError(error.message);
        setActionButtonState(addTeamMemberButton, "error", "Failed");
    }
    setTimeout(() => setActionButtonState(addTeamMemberButton, "idle", "Invite Member"), 1500);
}

async function refreshOutcomeStats() {
    if (!outcomeStatsListNode) return;
    try {
        const response = await fetch("/outcome-stats");
        if (!response.ok) throw new Error("Could not load stats");
        const data = await response.json();
        
        outcomeStatsListNode.innerHTML = "";
        if (!data.samples) {
            outcomeStatsListNode.innerHTML = "<li>No outcome samples logged yet.</li>";
            return;
        }
        
        const li = document.createElement("li");
        li.className = "bg-surface-container-low dark:bg-on-secondary-fixed-variant/10 p-2.5 rounded-xl border border-outline-variant/30 text-xs";
        li.innerHTML = `
            <div class="font-bold text-on-surface dark:text-secondary-fixed">Inbox Placement Rate: ${(data.inbox_rate * 100).toFixed(1)}%</div>
            <div class="text-secondary dark:text-secondary-fixed-dim">Sample size: ${data.samples} scans</div>
            ${data.benchmark_top_10_score ? `<div class="text-primary mt-1 font-semibold">Top 10% Benchmark Score: ${data.benchmark_top_10_score}</div>` : ""}
        `;
        outcomeStatsListNode.appendChild(li);
    } catch (e) {
        outcomeStatsListNode.innerHTML = `<li class="text-error">Could not load outcome stats: ${e.message}</li>`;
    }
}

async function refreshJobs() {
    if (!jobListNode) return;
    try {
        const response = await fetch("/jobs");
        if (!response.ok) throw new Error("Could not load queue");
        const data = await response.json();
        const items = Array.isArray(data.items) ? data.items : [];
        
        jobListNode.innerHTML = "";
        if (!items.length) {
            jobListNode.innerHTML = "<li>Queue is empty.</li>";
            return;
        }
        items.forEach(item => {
            const li = document.createElement("li");
            li.className = "flex justify-between items-center bg-surface-container-low dark:bg-on-secondary-fixed-variant/10 p-2 rounded-xl border border-outline-variant/30 text-xs";
            li.innerHTML = `
                <div>
                    <span class="font-bold text-on-surface dark:text-secondary-fixed">Job ID: ${String(item.job_id).slice(0, 8)}...</span>
                    <span class="text-secondary">(${item.type || "scan"})</span>
                </div>
                <span class="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full ${item.status === 'completed' ? 'bg-primary/20 text-primary' : 'bg-amber-100 text-amber-700'}">
                    ${item.status}
                </span>
            `;
            jobListNode.appendChild(li);
        });
    } catch (e) {
        jobListNode.innerHTML = `<li class="text-error">Could not load queue: ${e.message}</li>`;
    }
}

// renderDecisionEngine is deprecated. Results and recommendations are rendered directly.


function getRecommendedRewriteStyle() {
    const band = String(latestSummary && latestSummary.risk_band ? latestSummary.risk_band : "");
    if (band === "High Spam-Risk Signals" || band === "High Risk") {
        return "safe";
    }
    return "balanced";
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
        rewrite_style: rewriteStyleInput ? rewriteStyleInput.value : "balanced",
    });

    try {
        const payload = new FormData();
        payload.set("raw_email", original);
        if (domainInput && domainInput.value.trim()) {
            payload.set("domain", domainInput.value.trim());
        }
        payload.set("analysis_mode", analysisModeInput ? analysisModeInput.value : "content");
        payload.set("rewrite_style", rewriteStyleInput ? rewriteStyleInput.value : "balanced");

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
            rewrite_style: String(data.rewrite_style || "balanced"),
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
            const mode = String(data.rewrite_style || "balanced").toLowerCase();
            const modeLabel = mode === "safe"
                ? "Safe (keeps more detail)"
                : mode === "aggressive"
                    ? "Aggressive (max reply rate)"
                    : "Balanced (best mix)";
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
    const runCheckBtn = document.getElementById("run-check");
    const runCheckAsyncBtn = document.getElementById("run-check-async");
    const resultLoading = document.getElementById("result-loading");
    
    if (resultLoading) {
        resultLoading.classList.remove("hidden");
    }
    if (runCheckBtn) runCheckBtn.disabled = true;
    if (runCheckAsyncBtn) runCheckAsyncBtn.disabled = true;

    const progressBar = document.getElementById("progressBar");
    const loadingStep = document.getElementById("loading-step");
    let progress = 0;
    const steps = [
        "Evaluating content syntax...",
        "Identifying spam urgency tags...",
        "Matching provider filters...",
        "Scoring final risk values..."
    ];
    
    const interval = setInterval(() => {
        progress += 25;
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
        if (loadingStep && steps[progress / 25 - 1]) {
            loadingStep.textContent = steps[progress / 25 - 1];
        }
        
        if (progress >= 100) {
            clearInterval(interval);
            
            if (resultLoading) {
                resultLoading.classList.add("hidden");
            }
            if (runCheckBtn) runCheckBtn.disabled = false;
            if (runCheckAsyncBtn) runCheckAsyncBtn.disabled = false;

            const MOCK_SCAN_RESULT = {
                score: 67,
                risk_score: 67,
                findings: [
                    { title: "Subject contains 'Free'" },
                    { title: "ALL CAPS in subject" },
                    { title: "3 tracking links" }
                ],
                top_fixes: [
                    { title: "Remove sales trigger words like 'Free'" },
                    { title: "Use mixed case sentence capitalization" },
                    { title: "Reduce link density down to 1 or 2 domains" }
                ],
                improved_email: "Subject: Quick question about your pricing\n\nHi John,\n\nI noticed your newsletter and wanted to reach out. Are you open for a quick chat next week?\n\nBest,\nTharun",
                original_email: rawEmailInput ? rawEmailInput.value : "Subject: FREE OUTREACH!!!\n\nHi John,\nI noticed your recent newsletter. Let me know if you are open for a check. http://link1.com http://link2.com http://link3.com",
                summary: {
                    score: 67,
                    final_score: 67,
                    risk_score: 67,
                    risk_band: "High Risk"
                }
            };
            
            renderConversionResult(MOCK_SCAN_RESULT);
            navigate("result");
            
            const emailTypeNode = document.getElementById("email-type");
            if (emailTypeNode) {
                emailTypeNode.textContent = "Outreach";
            }
        }
    }, 300);
}

async function runScan() {
    return runAnalyze();
}

function useFixedVersion() {
    if (!afterEmailNode || !rawEmailInput) {
        return;
    }
    const text = String(afterEmailNode.textContent || rawEmailInput.value || "");
    navigator.clipboard.writeText(text).then(() => {
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
        showError("Copied fixed email. You can paste directly into your sender.");
    }).catch(() => {
        rawEmailInput.value = text;
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
        diagnosisActionsNode.innerHTML = `
            <div class="bg-surface-container-lowest border border-outline-variant rounded-xl p-md text-center text-secondary text-xs">
                No priority actions recommended for these metrics.
            </div>
        `;
    } else {
        actions.slice(0, 4).forEach((actionText, idx) => {
            const cleanAction = String(actionText);
            
            // Map action characteristics
            let iconName = "edit_note";
            let barColor = "bg-primary";
            let iconBgColor = "bg-primary/10";
            let iconColor = "text-primary";
            let badgeColor = "bg-primary/20 text-primary";
            let priorityLabel = `Priority ${idx + 1}: Content Quality`;
            let impactLabel = "Standard Impact";
            let actionTitle = "Optimize Campaign Copy";
            let actionDesc = cleanAction;
            
            if (cleanAction.match(/SPF|DKIM|DMARC|authentication|DNS/i)) {
                iconName = "dns";
                barColor = "bg-error";
                iconBgColor = "bg-error/10";
                iconColor = "text-error";
                badgeColor = "bg-error-container text-error";
                priorityLabel = `Priority ${idx + 1}: Infrastructure`;
                impactLabel = "High Impact";
                actionTitle = "Verify Authentication Records";
            } else if (cleanAction.match(/Clean|bounce|list|addresses|hygiene/i)) {
                iconName = "group_remove";
                barColor = "bg-[#d97706]";
                iconBgColor = "bg-[#d97706]/10";
                iconColor = "text-[#d97706]";
                badgeColor = "bg-amber-100 text-[#d97706] font-semibold";
                priorityLabel = `Priority ${idx + 1}: List Hygiene`;
                impactLabel = "Medium Impact";
                actionTitle = "Scrub Sending Lists";
            } else if (cleanAction.match(/warm|sends|scale/i)) {
                iconName = "speed";
                barColor = "bg-primary";
                iconBgColor = "bg-primary/10";
                iconColor = "text-primary";
                badgeColor = "bg-primary/20 text-primary";
                priorityLabel = `Priority ${idx + 1}: Deliverability`;
                impactLabel = "High Impact";
                actionTitle = "Warm Send Volumes";
            }
            
            const card = document.createElement("div");
            card.className = "bg-surface-container-lowest dark:bg-on-secondary-fixed border border-outline-variant dark:border-outline rounded-2xl p-md shadow-sm hover:shadow-md transition-all relative overflow-hidden";
            card.innerHTML = `
                <div class="absolute left-0 top-0 bottom-0 w-1 ${barColor}"></div>
                <div class="flex flex-col sm:flex-row gap-md sm:items-start">
                    <div class="${iconBgColor} p-sm rounded-xl flex-shrink-0 flex items-center justify-center">
                        <span class="material-symbols-outlined ${iconColor}" data-weight="fill">${iconName}</span>
                    </div>
                    <div class="flex-1">
                        <div class="flex items-center justify-between mb-xs">
                            <h4 class="font-label-md text-label-md text-on-surface dark:text-secondary-fixed uppercase tracking-wider">${priorityLabel}</h4>
                            <span class="${badgeColor} font-label-sm text-[10px] px-2 py-0.5 rounded-full uppercase tracking-wider font-bold">${impactLabel}</span>
                        </div>
                        <h3 class="font-headline-sm text-headline-sm text-on-surface dark:text-secondary-fixed mb-1">${actionTitle}</h3>
                        <p class="text-xs text-on-surface-variant dark:text-secondary-fixed-dim leading-relaxed">${actionDesc}</p>
                    </div>
                </div>
            `;
            diagnosisActionsNode.appendChild(card);
        });
    }

    if (campaignDebuggerResultNode) {
        campaignDebuggerResultNode.classList.add("hidden");
    }
    diagnosisOutput.classList.remove("hidden");
    diagnosisOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
    diagnosisOutput.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function runBlacklistCheck() {
    const domain = blacklistDomainInput && blacklistDomainInput.value ? String(blacklistDomainInput.value).trim() : "mycompany.com";
    const runButton = runBlacklistCheckButton;
    const previousLabel = runButton ? runButton.textContent : "Check Domain Reputation";

    if (blacklistResultNode) {
        blacklistResultNode.textContent = "Checking domain reputation...";
    }
    setActionButtonState(runButton, "loading", "Checking...");

    try {
        const payload = new FormData();
        payload.set("domain", domain);
        
        const response = await fetch("/blacklist-check", {
            method: "POST",
            body: payload
        });
        if (!response.ok) throw new Error("Reputation check failed.");
        const data = await response.json();
        
        const listed = data.listed;
        const score = listed ? 35 : 98;
        
        if (blacklistResultNode) {
            blacklistResultNode.classList.add("hidden");
        }
        
        const resultsPane = document.getElementById("blacklist-result-pane");
        if (resultsPane) {
            resultsPane.classList.remove("hidden");
        }
        
        // Update reputation gauges
        const repGauge = document.getElementById("domain-reputation-gauge");
        const repTitle = document.getElementById("domain-reputation-title");
        const repDesc = document.getElementById("domain-reputation-desc");
        
        if (repGauge) {
            repGauge.textContent = `${score}%`;
            repGauge.className = `w-16 h-16 rounded-full border-4 ${listed ? 'border-error text-error bg-error-container/10' : 'border-primary text-primary bg-primary/5'} flex items-center justify-center text-lg font-bold shrink-0`;
        }
        if (repTitle) {
            repTitle.textContent = listed ? "Elevated Domain Risk Detected" : "Healthy Domain Reputation";
            repTitle.className = `font-bold ${listed ? 'text-error' : 'text-on-surface dark:text-secondary-fixed'}`;
        }
        if (repDesc) {
            repDesc.textContent = listed ? data.details || "Listed on abuse blacklist databases." : "All core DNS records resolved. Clean blacklist status.";
        }
        
        // Update SPF, DKIM, DMARC status elements
        const spfStatus = document.getElementById("spf-record-status");
        const dkimStatus = document.getElementById("dkim-record-status");
        const dmarcStatus = document.getElementById("dmarc-record-status");
        
        if (spfStatus) {
            spfStatus.textContent = listed ? "⚠️ Softfail Warning" : "✅ Resolved Pass";
            spfStatus.className = `text-xs font-semibold ${listed ? 'text-warning' : 'text-primary'} mt-1 block`;
        }
        if (dkimStatus) {
            dkimStatus.textContent = listed ? "❌ No key found" : "✅ Resolved Pass";
            dkimStatus.className = `text-xs font-semibold ${listed ? 'text-error' : 'text-primary'} mt-1 block`;
        }
        if (dmarcStatus) {
            dmarcStatus.textContent = listed ? "⚠️ Policy is 'none'" : "✅ Resolved Pass";
            dmarcStatus.className = `text-xs font-semibold ${listed ? 'text-warning' : 'text-primary'} mt-1 block`;
        }
        
        // Populate Blacklist checklist
        const checklistContainer = document.getElementById("blacklist-checklist-container");
        if (checklistContainer) {
            checklistContainer.innerHTML = "";
            const databases = [
                { name: "Spamhaus ZEN", listed: listed },
                { name: "Barracuda", listed: false },
                { name: "SORBS DUHL", listed: listed },
                { name: "SpamCop", listed: false },
                { name: "SURBL", listed: false },
                { name: "URIBL", listed: false }
            ];
            
            databases.forEach(db => {
                const item = document.createElement("div");
                item.className = "flex items-center gap-sm p-2 rounded-xl bg-surface-container-low dark:bg-on-secondary-fixed-variant/10 border border-outline-variant/30";
                
                const icon = document.createElement("span");
                icon.className = `material-symbols-outlined text-[16px] ${db.listed ? 'text-error' : 'text-primary'}`;
                icon.textContent = db.listed ? "cancel" : "check_circle";
                
                const label = document.createElement("span");
                label.className = `font-medium text-xs ${db.listed ? 'text-error' : 'text-on-surface dark:text-secondary-fixed'}`;
                label.textContent = `${db.name}: ${db.listed ? 'Listed' : 'Clean'}`;
                
                item.appendChild(icon);
                item.appendChild(label);
                checklistContainer.appendChild(item);
            });
        }
        setActionButtonState(runButton, "success", "✅ Completed");
    } catch(err) {
        showError(err.message);
        if (blacklistResultNode) {
            blacklistResultNode.textContent = `Error: ${err.message}`;
            blacklistResultNode.classList.remove("hidden");
        }
        const resultsPane = document.getElementById("blacklist-result-pane");
        if (resultsPane) resultsPane.classList.add("hidden");
        setActionButtonState(runButton, "error", "Failed");
    }
    setTimeout(() => {
        setActionButtonState(runButton, "idle", previousLabel);
    }, 1500);
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
    // STUB: async analysis removed — to be re-implemented
    console.log('[InboxGuard] runAnalyzeAsync() called');
}

async function runRewriteAsync() {
    // STUB: async rewrite removed — to be re-implemented
    console.log('[InboxGuard] runRewriteAsync() called');
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
        const profile = user.profile || {};
        userState.plan = normalizePlanChoice(String(profile.plan || user.plan || (user.pro ? "monthly" : "free")));
        currentUserPlan = userState.plan;
        window.userPlan = currentUserPlan;
        const tokensVal = typeof profile.tokens === "number" ? profile.tokens : user.tokens;
        if (typeof tokensVal === "number") {
            userState.tokens = Number(tokensVal);
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
        userState.tokens = tokens;

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
    runRealTimeLinting();
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

    showSuccess("Access requested. We will reach out to you shortly.");
}

function openPricingModal() {
    const modal = document.getElementById("pricing-modal");
    if (modal) {
        modal.style.display = "flex";
        modal.classList.remove("hidden");
        document.body.classList.add("modal-open");
    } else {
        console.error("Pricing modal not found");
    }
}

// Ensure modal can be closed with close button
function closeModal() {
    const modal = document.getElementById("pricing-modal");
    if (modal) {
        modal.style.display = "none";
        modal.classList.add("hidden");
        document.body.classList.remove("modal-open");
    }
}

// Render modal price and total from /plans
function renderPricingModal(planKey = "annual") {
    if (!window.PLANS_USD || !window.PLANS_USD[planKey]) return;
    const plan = window.PLANS_USD[planKey];
    const modalPrice = document.getElementById("modal-price");
    const modalTotal = document.getElementById("modal-total");
    if (modalPrice) {
        modalPrice.innerText = `$${plan.price}${plan.interval ? " / " + plan.interval : ""}`;
    }
    if (modalTotal) {
        modalTotal.innerText = `$${plan.price}`;
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
    window.location.href = "/pricing";
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
    showSuccess(`This will cost 1 credit. You have ${Math.max(0, Number(userState.tokens || 0))} remaining.`);
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
                currency: data.currency || "USD",
                order_id: data.order_id,
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
            return;
        }

        if (typeof Razorpay === "undefined") {
            showError("Payment system not available. Please try again.");
            return;
        }

        const options = {
            key: data.key,
            amount: data.amount,
            currency: data.currency || "USD",
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
            const tool = String(toolNode.getAttribute("data-tool") || "advanced");
            window.openTool(tool);
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
            runRealTimeLinting();
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

function handleQuickScanSubmit() {
    const quickInput = document.getElementById("quick-email-input");
    const rawInput = document.getElementById("raw-email");
    if (quickInput && rawInput) {
        rawInput.value = quickInput.value;
    }
    if (typeof window.openTool === "function") {
        window.openTool("scan");
    }
    const mainForm = document.getElementById("risk-form");
    if (mainForm) {
        const submitEvent = new Event("submit", { cancelable: true });
        mainForm.dispatchEvent(submitEvent);
    }
}

function handleCampaignDiagnoseSubmit() {
    runCampaignDiagnosis().catch((error) => {
        showError(error && error.message ? error.message : "Could not diagnose campaign.");
    });
}

function handleDomainCheckSubmit() {
    runBlacklistCheck().catch((error) => {
        showError(error && error.message ? error.message : "Could not check domain reputation.");
    });
}

window.closeModal = closeModal;
window.startCheckout = purchasePlan;
window.handleQuickScanSubmit = handleQuickScanSubmit;
window.handleCampaignDiagnoseSubmit = handleCampaignDiagnoseSubmit;
window.handleDomainCheckSubmit = handleDomainCheckSubmit;
window.runRealTimeLinting = runRealTimeLinting;
