/* Single source of truth for the rating formula.
   Imported by the browser app (app.js) and the Vercel renderer (api/card/[username].js)
   so the two can never disagree. */

export const clamp = (n, lo = 40, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
export const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));

export const POSITIONS = {
  JavaScript: "RW", TypeScript: "RW", HTML: "RW", CSS: "RW",
  Python: "CAM", Jupyter: "CAM",
  Go: "CDM", Rust: "CDM", C: "CDM", "C++": "CDM", Java: "CDM", Zig: "CDM",
  Shell: "GK", Dockerfile: "GK", HCL: "GK", Nix: "GK", Makefile: "GK",
  Kotlin: "LW", Swift: "LW", Dart: "LW", Objective: "LW",
  Ruby: "ST", PHP: "ST",
};
export const positionFor = (lang) => POSITIONS[lang] || "CM";
export const tierFor = (ovr) => (ovr >= 90 ? "Icon" : ovr >= 78 ? "Gold" : ovr >= 66 ? "Silver" : "Bronze");

/* Open formula — every constant here is fair game in a PR.
   norm() log-scales a raw count against the top of a realistic range,
   so 99 means "near the very best" instead of "over 10k stars". */
const norm = (x, max) => Math.log10(x + 1) / Math.log10(max + 1);

export const WEIGHTS = {
  FINISHING: .25, VISION: .2, PACE: .15, DRIBBLING: .15, TACKLING: .1, ENGINE: .15,
};

export const FORMULAS = {
  PACE: "45 + repos/250 ×34 + followers/150k ×20",
  FINISHING: "45 + stars/250k ×54",
  VISION: "45 + forks/25k ×40 + following/1k ×14",
  DRIBBLING: "48 + languages/14 ×51",
  TACKLING: "45 + stars+forks/300k ×38 + age ×1.5",
  ENGINE: "45 + age ×2.6 (max 22) + repos/250 ×32",
};

export function rate(user, repos) {
  const followers = user.followers || 0;
  const repoCount = user.public_repos || repos.length;
  const stars = repos.reduce((s, r) => s + (r.stargazers_count || 0), 0);
  const forks = repos.reduce((s, r) => s + (r.forks_count || 0), 0);
  const ageYrs = Math.max(0, (Date.now() - new Date(user.created_at)) / 3.15e10);

  const langs = {};
  repos.forEach((r) => { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
  const uniqLangs = Object.keys(langs).length;
  const topLang = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] || "Code";

  const pac = clamp(45 + norm(repoCount, 250) * 34 + norm(followers, 150000) * 20);
  const sho = clamp(45 + norm(stars, 250000) * 54);
  const pas = clamp(45 + norm(forks, 25000) * 40 + norm(user.following || 0, 1000) * 14);
  const dri = clamp(48 + norm(uniqLangs, 14) * 51);
  const def = clamp(45 + norm(stars + forks, 300000) * 38 + Math.min(12, ageYrs * 1.5));
  const phy = clamp(45 + Math.min(22, ageYrs * 2.6) + norm(repoCount, 250) * 32);

  const ovr = Math.round(
    sho * WEIGHTS.FINISHING + pas * WEIGHTS.VISION + pac * WEIGHTS.PACE +
    dri * WEIGHTS.DRIBBLING + def * WEIGHTS.TACKLING + phy * WEIGHTS.ENGINE
  );

  return {
    pac, sho, pas, dri, def, phy, ovr, stars, forks, repoCount, followers,
    topLang, uniqLangs, ageYrs, weights: WEIGHTS, formulas: FORMULAS,
  };
}

export const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;

export function tierColors(tier) {
  switch (tier) {
    case "Icon":   return { frame: ["#514a3a", "#2b2b33", "#17171d", "#0e0e12"], panel: ["#1d1e25", "#0f1014", "#08090b"], ink: "#f7e6b4", edge: "rgba(247,214,120,0.36)" };
    case "Silver": return { frame: ["#ffffff", "#f6f9fc", "#d5dde7", "#98a3b2"], panel: ["#232936", "#12161e", "#0b0e13"], ink: "#eef3f9", edge: "rgba(238,243,249,0.24)" };
    case "Bronze": return { frame: ["#ffdcb8", "#fff0e0", "#dd9a63", "#a4642f"], panel: ["#301b0a", "#1b0f04", "#120a03"], ink: "#ffe3c6", edge: "rgba(255,227,198,0.22)" };
    default:       return { frame: ["#ffeeb4", "#fff9e2", "#f0cd63", "#cfa128"], panel: ["#3d2c0f", "#221806", "#160f04"], ink: "#f7e3ab", edge: "rgba(247,227,171,0.30)" };
  }
}