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
  PACE: "45 + repos/220 \u00d733 + followers/120k \u00d721",
  FINISHING: "45 + \u221a(stars per repo, summed) \u00d754",
  VISION: "45 + forks/40k \u00d742 + topics/40 \u00d712",
  DRIBBLING: "45 + languages/12 \u00d724 + main-lang size \u00d730",
  TACKLING: "45 + upkeep \u00d754, upkeep needs 30+ repos",
  ENGINE: "45 + active years/15 \u00d754",
};

/* Every attribute is volume-gated: a ratio can only pay out once there is
   enough of something behind it. That is what stops a 12-repo account from
   scoring 97 on upkeep just by keeping tidy, and what makes 98 hard.
   Ceilings are set so only a genuinely huge, long-lived profile saturates. */
export const CEILINGS = {
  FINISHING_SQRT_STARS: 2200, // sum of per-repo sqrt(stars)
  MAIN_LANG_KB: 1800000,      // KB in the most-used language
  REPOS: 220,
  FOLLOWERS: 120000,
  FORKS: 40000,
  TACKLING_MIN_REPOS: 30,     // upkeep is meaningless below this
  ACTIVE_YEARS: 15,
};

/* Smooth 0..1 ramp once a count clears a minimum. Below the minimum the
   credit scales with the count itself, so small accounts earn little rather
   than a free full score. sqrt so it climbs steadily instead of hitting a
   cliff at the threshold. */
function gated(x, min) {
  return x >= min ? 1 : Math.sqrt(x / min);
}

function depthStars(repos) {
  return repos.filter((r) => !r.fork).reduce((s, r) => s + Math.sqrt(r.stargazers_count || 0), 0);
}

function activeYears(repos) {
  const years = new Set();
  for (const r of repos) {
    const y = (r.pushed_at || r.created_at || "").slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return years.size;
}

function mainLanguageKb(repos) {
  const byLang = {};
  for (const r of repos) {
    if (r.language && !r.fork) byLang[r.language] = (byLang[r.language] || 0) + (r.size || 0);
  }
  return Math.max(0, ...Object.values(byLang));
}

/* Share of repos still live, blended with share that carry a description.
   Gated on repo count: tidying 12 repos is not the same as tidying 300. */
function upkeep(repos) {
  if (!repos.length) return 0;
  const alive = repos.filter((r) => !r.archived).length / repos.length;
  const documented = repos.filter((r) => String(r.description || "").trim()).length / repos.length;
  return (alive * 0.55 + documented * 0.45) * gated(repos.length, CEILINGS.TACKLING_MIN_REPOS);
}

export function rate(user, repos) {
  const followers = user.followers || 0;
  const repoCount = user.public_repos || repos.length;
  const forks = repos.reduce((s, r) => s + (r.forks_count || 0), 0);
  const topics = new Set(repos.flatMap((r) => r.topics || [])).size;

  const langs = {};
  repos.forEach((r) => { if (r.language) langs[r.language] = (langs[r.language] || 0) + 1; });
  const uniqLangs = Object.keys(langs).length;
  const topLang = Object.entries(langs).sort((a, b) => b[1] - a[1])[0]?.[0] || "Code";

  const dStars = depthStars(repos);
  const years = activeYears(repos);
  const langKb = mainLanguageKb(repos);
  const up = upkeep(repos);

  const sho = clamp(45 + norm(dStars, CEILINGS.FINISHING_SQRT_STARS) * 54);
  const pac = clamp(45 + norm(repoCount, CEILINGS.REPOS) * 33 + norm(followers, CEILINGS.FOLLOWERS) * 21);
  const pas = clamp(45 + norm(forks, CEILINGS.FORKS) * 42 + norm(topics, 40) * 12);
  const dri = clamp(45 + norm(uniqLangs, 12) * 24 + norm(langKb, CEILINGS.MAIN_LANG_KB) * 30);
  const def = clamp(45 + up * 54);
  const phy = clamp(45 + norm(years, CEILINGS.ACTIVE_YEARS) * 54);

  const ovr = Math.round(
    sho * WEIGHTS.FINISHING + pas * WEIGHTS.VISION + pac * WEIGHTS.PACE +
    dri * WEIGHTS.DRIBBLING + def * WEIGHTS.TACKLING + phy * WEIGHTS.ENGINE
  );

  return {
    pac, sho, pas, dri, def, phy, ovr,
    stars: repos.reduce((s, r) => s + (r.stargazers_count || 0), 0),
    forks, repoCount, followers, uniqLangs, dStars, years, langKb, up,
    topLang, weights: WEIGHTS, formulas: FORMULAS,
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