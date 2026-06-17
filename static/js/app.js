// InboxGuard Clean App Stub
// Stripped of all interactive UX logic, flows, modals, theme toggles, and validations.
// Keeps only structural placeholders and ensures light theme is forced.

(function() {
    // 1. Force Light Mode
    try {
        const root = document.documentElement;
        root.dataset.theme = 'light';
        root.classList.remove('dark');
        root.classList.add('light');
        root.style.colorScheme = 'light';
        const themeColorMeta = document.querySelector('meta[name="theme-color"]');
        if (themeColorMeta) {
            themeColorMeta.setAttribute("content", "#f8f9ff");
        }
    } catch (e) {
        console.error("Theme override error:", e);
    }

    // 2. Global State Placeholders
    window.appState = {
        hasScanned: true,
        hasOptimized: true,
        hasScaled: true,
        isAuthenticated: true,
        credits: 9999,
        isAdmin: false,
        currentScreen: "dashboard"
    };
    window.currentUser = true;
    window.userIsPro = true;
    window.userStatus = "active";
    window.userPlan = "pro";
    window.userIsAdmin = false;
    window.currentUserEmail = "user@inboxguard.me";
    window.currentUserName = "InboxGuard User";

    // 3. Theme Hooks (No-ops)
    window.toggleInboxGuardTheme = function() {};
    window.toggleTheme = function() {};
    window.applyInboxGuardTheme = function(theme) { return "light"; };

    // 4. Modal Hooks (No-ops)
    window.openPricingModal = function() {};
    window.closePricingModal = function() {};
    window.openPaywallModal = function() {};
    window.closePaywallModal = function() {};
    window.openCreditsModal = function() {};
    window.closeCreditsModal = function() {};
    window.openDrawer = function() {};
    window.closeDrawer = function() {};
    window.toggleMobileSidebar = function() {};

    // 5. Auth / Lead Capture Hooks (No-ops)
    window.igAuthSignIn = function() {};
    window.igAuthCreate = function() {};
    window.igAuthClose = function() {};
    window.igLeadCaptureClose = function() {};
    window.stashPendingContext = function() {};

    // 6. Navigation / Panel / Tool Hooks (No-ops)
    window.openTool = function() {};
    window.closeTool = function() {};
    window.igOpenToolPane = function() {};
    window.igCloseToolPane = function() {};
    window.igOnToolPaneOpened = function() {};
    window.activateTab = function() {};
    window.goHome = function() {};
    window.selectPlanAndScroll = function() {};
    window.startInlineScan = function() {};

    // 7. Payment Hooks (No-ops)
    window.purchasePlan = function() {};
    window.submitContactRequest = function() {};

    // 8. Scanning / Analysis Hooks (No-ops)
    window.runAnalyze = function() {};
    window.runAnalyzeAsync = function() {};
    window.startInlineScan = function() {};

    // 9. Fetch Credentials override (so fetch is untouched but works normally)
    const nativeFetch = window.fetch.bind(window);
    window.fetch = (input, init = {}) => {
        const options = init && typeof init === "object" ? init : {};
        if (!options.credentials) {
            options.credentials = "include";
        }
        return nativeFetch(input, options);
    };

    console.log("InboxGuard UX layers successfully removed. UI structure and visual styling preserved.");
})();
