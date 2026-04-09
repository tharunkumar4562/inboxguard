(function () {
    const CONSENT_KEY = "ig_cookie_consent";

    function getBanner() {
        return document.getElementById("cookie-banner");
    }

    function setBannerVisible(visible) {
        const banner = getBanner();
        if (!banner) {
            return;
        }
        banner.classList.toggle("hidden", !visible);
        banner.setAttribute("aria-hidden", visible ? "false" : "true");
    }

    function hasConsent() {
        try {
            return localStorage.getItem(CONSENT_KEY) === "accepted";
        } catch (error) {
            return true;
        }
    }

    function checkCookieConsent() {
        setBannerVisible(!hasConsent());
    }

    function acceptCookies() {
        try {
            localStorage.setItem(CONSENT_KEY, "accepted");
        } catch (error) {
        }
        setBannerVisible(false);
    }

    window.checkCookieConsent = checkCookieConsent;
    window.acceptCookies = acceptCookies;

    document.addEventListener("DOMContentLoaded", checkCookieConsent);
    document.addEventListener("click", (event) => {
        const button = event.target && typeof event.target.closest === "function" ? event.target.closest("[data-cookie-accept]") : null;
        if (button) {
            acceptCookies();
        }
    });
})();