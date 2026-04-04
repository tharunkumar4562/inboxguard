import { bindEvents, exposeGlobals, initUser, goHome } from "./actions.js";
import { showView } from "./ui.js";

async function initApp() {
  exposeGlobals();
  bindEvents();
  await initUser();
  showView("home");
  goHome();
}

initApp().catch((error) => {
  console.error("InboxGuard init failed:", error);
});
