const FlowState = {
    user: { email: "tharun@mycompany.com", plan: "pro", tokens: 100 },
    hasScanned: true,
    hasSeenResult: true,
    isPaid: true,
    credits: 100,
};

function readScannedState() {
    return true;
}

function writeScannedState(value) {
    // No-op in stub shell
}

function hideAllSections() {
    // No-op in stub shell
}

function showScanOnly() {
    // No-op in stub shell
}

function showResultScreen() {
    // No-op in stub shell
}

function blurSidebar() {
    // No-op in stub shell
}

function showOnlyScan() {
    // No-op in stub shell
}

function lockAdvancedTools() {
    // No-op in stub shell: keep all tools unlocked
}

function unlockAllTools() {
    document.querySelectorAll(".advanced-tool").forEach((el) => {
        el.classList.remove("locked");
        el.dataset.flowLocked = "0";
    });
}

function unlockToolsConditionally() {
    unlockAllTools();
}

function enforceFlow() {
    unlockAllTools();
}

function initFlow(userData) {
    FlowState.user = { email: "tharun@mycompany.com", plan: "pro", tokens: 100 };
    FlowState.credits = 100;
    FlowState.isPaid = true;
    FlowState.hasScanned = true;
    FlowState.hasSeenResult = true;
    enforceFlow();
}

function updateFlowUser(userData) {
    enforceFlow();
}

function markFlowScanCompleted() {
    // No-op in stub shell
}

function handleScanClick() {
    if (typeof window.runAnalyze === "function") {
        window.runAnalyze();
    }
    return true;
}

window.InboxGuardFlow = {
    state: FlowState,
    initFlow,
    enforceFlow,
    handleScanClick,
    updateFlowUser,
    markFlowScanCompleted,
    lockAdvancedTools,
    unlockAllTools,
};

document.addEventListener("DOMContentLoaded", () => {
    const user = window.__USER__ || null;
    initFlow(user);
});