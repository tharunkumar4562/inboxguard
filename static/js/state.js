export const state = {
  user: null,
  tokens: 0,
  plan: "free",
  currentView: "home",
  currentTool: null,
  featureCosts: {
    scan: 1,
    campaign: 2,
    blacklist: 1,
    seed: 5,
    bulk: 3,
  },
};

export function setUserFromAuth(payload) {
  const authenticated = Boolean(payload && payload.authenticated);
  if (!authenticated) {
    state.user = null;
    state.tokens = 0;
    state.plan = "free";
    return;
  }

  const profile = payload.profile || {};
  state.user = {
    authenticated: true,
    email: String(profile.email || ""),
    name: String(profile.name || ""),
  };
  state.tokens = Number(profile.tokens || 0);
  state.plan = String(profile.plan || "free").toLowerCase();
}

export function setTokens(tokens) {
  state.tokens = Math.max(0, Number(tokens || 0));
}
