const FlowState = {
    user: null,
    hasScanned: false,
    hasSeenResult: false,
    isPaid: false,
    credits: 0,
};

function readScannedState() {
    return localStorage.getItem("ig_has_scanned") === "1";
}

function writeScannedState(value) {
    localStorage.setItem("ig_has_scanned", value ? "1" : "0");
}

function hideAllSections() {
    document.querySelectorAll(".app-section").forEach((el) => {
        el.style.display = "none";
    });
}

function showScanOnly() {
    hideAllSections();
    const scanSection = document.getElementById("scan-section") || document.getElementById("scan-panel");
    if (scanSection) {
        scanSection.style.display = "block";
        scanSection.classList.remove("hidden");
    }
    if (typeof window.activateTab === "function") {
        window.activateTab("threat-scan");
    }
}

function showResultScreen() {
    hideAllSections();
    const resultSection = document.getElementById("result-section") || document.getElementById("result");
    if (resultSection) {
        resultSection.style.display = "block";
        resultSection.classList.remove("hidden");
    }
}

function blurSidebar() {
    document.querySelectorAll(".sidebar .advanced-tool").forEach((link) => {
        link.classList.add("disabled");
    });
}

function showOnlyScan() {
    showScanOnly();
    blurSidebar();
}

function lockAdvancedTools() {
    document.querySelectorAll(".advanced-tool").forEach((el) => {
        el.classList.add("locked");
        el.dataset.flowLocked = "1";
        if (el.dataset.flowBound === "1") {
            return;
        }
        el.addEventListener("click", (event) => {
            if (el.dataset.flowLocked !== "1") {
                return;
            }
            event.preventDefault();
            if (typeof window.showPaywall === "function") {
                window.showPaywall();
            }
        });
        el.dataset.flowBound = "1";
    });
}

function unlockAllTools() {
    document.querySelectorAll(".advanced-tool").forEach((el) => {
        el.classList.remove("locked");
        el.dataset.flowLocked = "0";
    });
}

function unlockToolsConditionally() {
    if (!FlowState.user || !FlowState.hasScanned || !FlowState.isPaid) {
        lockAdvancedTools();
        return;
    }
    unlockAllTools();
}

function enforceFlow() {
    const isAppPage = window.location.pathname === "/app";

    if (!FlowState.user) {
        if (isAppPage) {
            showOnlyScan();
        }
        lockAdvancedTools();
        return;
    }

    if (!FlowState.hasScanned) {
        if (isAppPage) {
            showScanOnly();
        }
        lockAdvancedTools();
        return;
    }

    if (FlowState.hasScanned && !FlowState.hasSeenResult) {
        if (isAppPage) {
            showResultScreen();
        }
        return;
    }

    unlockToolsConditionally();
}

function initFlow(userData) {
    FlowState.user = userData || null;
    FlowState.credits = Number((userData && userData.tokens) || 0);
    FlowState.isPaid = Boolean(userData && String(userData.plan || "free").toLowerCase() !== "free");
    FlowState.hasScanned = readScannedState();
    FlowState.hasSeenResult = FlowState.hasScanned;
    enforceFlow();
}

function updateFlowUser(userData) {
    FlowState.user = userData || null;
    FlowState.credits = Number((userData && userData.tokens) || 0);
    FlowState.isPaid = Boolean(userData && String(userData.plan || "free").toLowerCase() !== "free");
    enforceFlow();
}

function markFlowScanCompleted() {
    FlowState.hasScanned = true;
    FlowState.hasSeenResult = true;
    writeScannedState(true);
    enforceFlow();
}

function handleScanClick() {
    if (!FlowState.user) {
        if (typeof window.showAuthModal === "function") {
            if (typeof window.stashPendingContext === "function") {
                window.stashPendingContext("analyze");
            }
            window.showAuthModal();
        }
        return false;
    }

    if (FlowState.credits < 1) {
        if (typeof window.showPaywall === "function") {
            window.showPaywall();
        }
        return false;
    }

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