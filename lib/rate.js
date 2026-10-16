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
  PACE: "45 + repos/250 \u00d734 + followers/150k \u00d720",
  FINISHING: "45 + \u221a(stars per repo, summed) \u00d754",
  VISION: "45 + forks/25k \u00d740 + topics/40 \u00d714",
  DRIBBLING: "48 + main-language size \u00d751",
  TACKLING: "45 + unarchived \u00d730 + documented \u00d724",
  ENGINE: "45 + active years/14 \u00d754",
};

/* Ceilings. Set just above the strongest value actually observed on a real
   account, so 99 is only reachable by genuine outliers rather than everyone
   who is merely well known. VERIFICATION PENDING: measured against a sample
   that skewed elite, so re-check the distribution once more accounts are
   available before trusting the spread. */
export const CEILINGS = {
  FINISHING_SQRT_STARS: 2000,  // sum of per-repo sqrt(stars)
  MAIN_LANG_KB: 1500000,       // KB in the most-used language
  ACTIVE_YEARS: 20,
};

/* Depth-weighted star count. sqrt per repo means a broad body of
   work beats one viral repository. Forks are excluded: a fork's stars
   belong to whoever wrote it. */
function depthStars(repos) {
  return repos
    .filter((r) => !r.fork)
    .reduce((s, r) => s + Math.sqrt(r.stargazers_count || 0), 0);
}

/* Distinct calendar years with actual output. Stamina, not tenure. */
function activeYears(repos) {
  const years = new Set();
  for (const r of repos) {
    const y = (r.pushed_at || r.created_at || "").slice(0, 4);
    if (/^\d{4}$/.test(y)) years.add(y);
  }
  return years.size;
}

/* Bytes in the most-used language, so depth beats dabbling:
   a 400MB Rust project outweighs a dozen tiny scripts. */
function mainLanguageKb(repos) {
  const byLang = {};
  for (const r of repos) {
    if (r.language && !r.fork) byLang[r.language] = (byLang[r.language] || 0) + (r.size || 0);
  }
  return Math.max(0, ...Object.values(byLang));
}

/* Share of repos that are still live, and share that carry a description. */
function upkeep(repos) {
  if (!repos.length) return { alive: 0, documented: 0 };
  const alive = repos.filter((r) => !r.archived).length;
  const documented = repos.filter((r) => (r.description || "").trim().length > 0).length;
  return { alive: alive / repos.length, documented: documented / repos.length };
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
  const pac = clamp(45 + norm(repoCount, 250) * 34 + norm(followers, 150000) * 20);
  const pas = clamp(45 + norm(forks, 25000) * 40 + norm(topics, 40) * 14);
  const dri = clamp(48 + norm(langKb, CEILINGS.MAIN_LANG_KB) * 51);
  const def = clamp(45 + up.alive * 30 + up.documented * 24);
  const phy = clamp(45 + norm(years, CEILINGS.ACTIVE_YEARS) * 54);

  const ovr = Math.round(
    sho * WEIGHTS.FINISHING + pas * WEIGHTS.VISION + pac * WEIGHTS.PACE +
    dri * WEIGHTS.DRIBBLING + def * WEIGHTS.TACKLING + phy * WEIGHTS.ENGINE
  );

  return {
    pac, sho, pas, dri, def, phy, ovr,
    stars: repos.reduce((s, r) => s + (r.stargazers_count || 0), 0),
    forks, repoCount, followers,
    uniqLangs, dStars, years, langKb, up,
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