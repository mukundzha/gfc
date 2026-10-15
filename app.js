const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) console.warn(`[fc-card] missing #${id} — stale cache. Hard-refresh: Ctrl+Shift+R`);
  return el;
};
const form = $("form"), input = $("username"), status = $("status");
const stage = $("stage"), card = $("card"), skeleton = $("skeleton");

const clamp = (n, lo = 40, hi = 99) => Math.max(lo, Math.min(hi, Math.round(n)));
const fmt = (n) => (n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n));
const USERNAME_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9]|-(?=[a-zA-Z0-9])){0,38}$/;
const CACHE_PREFIX = "fccache:", CACHE_TTL = 6 * 3600 * 1000, MAX_CACHE = 24;

const POSITIONS = {
  JavaScript: "RW", TypeScript: "RW", HTML: "RW", CSS: "RW",
  Python: "CAM", Jupyter: "CAM",
  Go: "CDM", Rust: "CDM", C: "CDM", "C++": "CDM", Java: "CDM", Zig: "CDM",
  Shell: "GK", Dockerfile: "GK", HCL: "GK", Nix: "GK", Makefile: "GK",
  Kotlin: "LW", Swift: "LW", Dart: "LW", Objective: "LW",
  Ruby: "ST", PHP: "ST",
};
const positionFor = (lang) => POSITIONS[lang] || "CM";
const tierFor = (ovr) => (ovr >= 90 ? "Icon" : ovr >= 78 ? "Gold" : ovr >= 66 ? "Silver" : "Bronze");

/* Open formula — every constant here is fair game in a PR.
   norm() log-scales a raw count against the top of a realistic range,
   so 99 means "near the very best" instead of "over 10k stars". */
const norm = (x, max) => Math.log10(x + 1) / Math.log10(max + 1);

function rate(user, repos) {
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

  const weights = { FINISHING: .25, VISION: .2, PACE: .15, DRIBBLING: .15, TACKLING: .1, ENGINE: .15 };
  const ovr = Math.round(sho * weights.FINISHING + pas * weights.VISION + pac * weights.PACE + dri * weights.DRIBBLING + def * weights.TACKLING + phy * weights.ENGINE);

  return {
    pac, sho, pas, dri, def, phy, ovr, stars, forks, repoCount, followers,
    topLang, uniqLangs, weights,
    formulas: {
      PACE: `45 + repos/250 ×34 + followers/150k ×20`,
      FINISHING: `45 + stars/250k ×54`,
      VISION: `45 + forks/25k ×40 + following/1k ×14`,
      DRIBBLING: `48 + languages/14 ×51`,
      TACKLING: `45 + stars+forks/300k ×38 + age ×1.5`,
      ENGINE: `45 + age ×2.6 (max 22) + repos/250 ×32`,
    },
  };
}

/* ---------- token + cache ---------- */
const getToken = () => localStorage.getItem("fctoken") || "";
function setToken(v) {
  if (v) localStorage.setItem("fctoken", v.trim());
  else localStorage.removeItem("fctoken");
}

function cacheGet(key) {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + key);
    if (!raw) return null;
    const hit = JSON.parse(raw);
    if (!hit || Date.now() - hit.t > CACHE_TTL) { localStorage.removeItem(CACHE_PREFIX + key); return null; }
    return hit;
  } catch { return null; }
}
function cacheSet(key, data) {
  try {
    const keys = Object.keys(localStorage).filter((k) => k.startsWith(CACHE_PREFIX));
    if (keys.length >= MAX_CACHE) localStorage.removeItem(keys[0]);
    localStorage.setItem(CACHE_PREFIX + key, JSON.stringify({ t: Date.now(), ...data }));
  } catch { /* quota full — caching is optional */ }
}

/* ---------- networking ---------- */
let inflight = null;

function apiError(r) {
  if (r.status === 404) return new Error("No GitHub user by that name.");
  if (r.status === 403 || r.status === 429) {
    const reset = Number(r.headers.get("x-ratelimit-reset"));
    if (reset) {
      const mins = Math.max(1, Math.round((reset * 1000 - Date.now()) / 60000));
      return new Error(`GitHub rate limit reached. Resets in about ${mins} min.`);
    }
    return new Error("GitHub rejected that request. Try again shortly.");
  }
  if (r.status >= 500) return new Error("GitHub is having a moment. Try again shortly.");
  return new Error("Could not reach GitHub. Check your connection.");
}

async function fetchJSON(url, signal) {
  const token = getToken();
  let res;
  try {
    res = await fetch(url, {
      signal,
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Network error. Check your connection.");
  }
  if (!res.ok) throw apiError(res);
  return res.json();
}

/* GitHub avatars allow CORS; inlining as a data URL keeps PNG export uncors-blocked */
async function avatarDataUrl(url) {
  try {
    const blob = await (await fetch(url, { mode: "cors" })).blob();
    return await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = () => rej(new Error("read"));
      fr.readAsDataURL(blob);
    });
  } catch { return null; }
}

/* ---------- ui helpers ---------- */
let toastTimer;
function toast(msg) {
  const t = $("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2400);
}
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}
function setStatus(msg, isErr = false) {
  status.textContent = msg;
  status.classList.toggle("err", isErr);
}

/* ---------- render ---------- */
function render(user, repos, { animate = true } = {}) {
  const s = rate(user, repos);
  const pos = positionFor(s.topLang);

  card.dataset.tier = tierFor(s.ovr);
  $("tier").textContent = tierFor(s.ovr);
  $("ovr").textContent = s.ovr;
  $("pos").textContent = pos;
  $("pac").textContent = s.pac; $("sho").textContent = s.sho; $("pas").textContent = s.pas;
  $("dri").textContent = s.dri; $("def").textContent = s.def; $("phy").textContent = s.phy;

  [["pac", s.pac], ["sho", s.sho], ["pas", s.pas], ["dri", s.dri], ["def", s.def], ["phy", s.phy]]
    .forEach(([id, v]) => { $(id).parentElement.querySelector(".bar").style.setProperty("--v", v + "%"); });

  $("name").textContent = (user.name || user.login).slice(0, 20);
  $("club").textContent = (user.company || "Free Agent").replace(/^@/, "").slice(0, 22);
  $("nation").textContent = (user.location || "Internet").slice(0, 22);
  $("clubCrest").dataset.l = (user.name || user.login).trim().charAt(0).toUpperCase();
  $("foot").textContent = `★ ${fmt(s.stars)} · ${s.repoCount} repos · ${fmt(s.followers)} followers`;

  $("breakTable").querySelector("tbody").innerHTML =
    Object.entries(s.formulas).map(([k, f]) => `<tr><td>${k}</td><td>${f}</td></tr>`).join("") +
    `<tr><td>OVR</td><td>${Object.entries(s.weights).map(([k, w]) => `${k}×${w}`).join(" + ")}</td></tr>`;

  $("positionNote").textContent =
    `You write ${s.uniqLangs} language${s.uniqLangs === 1 ? "" : "s"} across ${s.repoCount} repos. ` +
    `Most common: ${s.topLang}, so you play ${pos}.`;

  const byPos = {};
  Object.entries(POSITIONS).forEach(([lang, p]) => { (byPos[p] ||= []).push(lang); });
  $("posMap").innerHTML = ["ST", "LW", "RW", "CAM", "CDM", "GK"]
    .filter((p) => byPos[p])
    .map((p) => `<div class="pm-row"><dt>${p}</dt><dd>${byPos[p].join(", ")}</dd></div>`).join("") +
    `<div class="pm-row"><dt>CM</dt><dd>anything not listed above</dd></div>`;

  $("weightList").innerHTML = Object.entries(s.weights)
    .sort((a, b) => b[1] - a[1])
    .map(([k, w]) => `<li><span>${k}</span><b>${Math.round(w * 100)}%</b></li>`).join("");

  skeleton.classList.add("hidden");
  stage.classList.remove("hidden");
  stage.setAttribute("aria-busy", "false");

  if (animate) {
    replay(card, "reveal");
    replay($("burst"), "go");
    replay($("ovr"), "bump");
  }

  document.title = `${user.login} — ${s.ovr} OVR ${pos} · GitHub FC Card`;
}

/* ---------- main flow ---------- */
async function generate(raw) {
  const username = String(raw || "").trim().replace(/^@/, "");

  if (!username) { setStatus("Enter a GitHub username.", true); return; }
  if (!USERNAME_RE.test(username)) {
    setStatus("That's not a valid GitHub username.", true);
    return;
  }

  const cached = cacheGet(username.toLowerCase());
  if (cached) {
    try { render(cached.user, cached.repos); history.replaceState(null, "", "?u=" + encodeURIComponent(cached.user.login)); setStatus(""); return; }
    catch { /* fall through to network */ }
  }

  inflight?.abort();
  const ctrl = new AbortController();
  inflight = ctrl;

  $("go").disabled = true;
  stage.setAttribute("aria-busy", "true");
  stage.classList.add("hidden");
  skeleton.classList.remove("hidden");
  setStatus(`Pulling @${username}…`);

  try {
    const base = `https://api.github.com/users/${encodeURIComponent(username)}`;
    const [user, repos] = await Promise.all([
      fetchJSON(base, ctrl.signal),
      fetchJSON(`${base}/repos?per_page=100&type=owner&sort=updated`, ctrl.signal),
    ]);
    if (ctrl.signal.aborted) return;

    render(user, repos);
    cacheSet(username.toLowerCase(), { user, repos });
    setStatus("");
    history.replaceState(null, "", "?u=" + encodeURIComponent(user.login));
  } catch (err) {
    if (err.name === "AbortError") return;
    skeleton.classList.add("hidden");
    stage.setAttribute("aria-busy", "false");
    document.title = "GitHub FC Card — your dev rating as a football card";
    setStatus(err.message, true);
  } finally {
    if (inflight === ctrl) { $("go").disabled = false; inflight = null; }
  }
}

/* ---------- events ---------- */
form.addEventListener("submit", (e) => { e.preventDefault(); generate(input.value); });
input.addEventListener("input", () => setStatus(""));

document.querySelectorAll("[data-user]").forEach((b) =>
  b.addEventListener("click", () => { input.value = b.dataset.user; generate(b.dataset.user); }));

const RANDOM = ["torvalds", "sindresorhus", "gaearon", "anomalyco", "tj", "yyx990803", "antfu", "shadcn", "swyx", "kentcdodds"];
$("surprise").addEventListener("click", () => {
  const pick = RANDOM[Math.floor(Math.random() * RANDOM.length)];
  input.value = pick;
  generate(pick);
});

$("download").addEventListener("click", async () => {
  if (typeof window.htmlToImage?.toPng !== "function") {
    toast("Export library blocked — screenshot instead");
    return;
  }
  const btn = $("download");
  btn.disabled = true;
  try {
    const url = await window.htmlToImage.toPng(card, { pixelRatio: 3, cacheBust: true });
    const a = document.createElement("a");
    a.download = ($("name").textContent || "github-fc-card").replace(/[^\w-]+/g, "-").toLowerCase() + "-fc-card.png";
    a.href = url;
    a.click();
    toast("Saved — go post it");
  } catch {
    toast("Export failed — screenshot instead");
  } finally {
    btn.disabled = false;
  }
});

$("share").addEventListener("click", () => {
  const text = `GitHub FC card: ${$("ovr").textContent} OVR ${$("pos").textContent} — ${$("name").textContent}. What's your rating?`;
  window.open(
    "https://twitter.com/intent/tweet?text=" + encodeURIComponent(text) + "&url=" + encodeURIComponent(location.href),
    "_blank", "noopener,noreferrer"
  );
});

$("copy").addEventListener("click", async () => {
  try { await navigator.clipboard.writeText(location.href); toast("Link copied"); }
  catch { toast(location.href); }
});

$("breakToggle").addEventListener("click", (e) => {
  const open = e.currentTarget.getAttribute("aria-expanded") === "true";
  e.currentTarget.setAttribute("aria-expanded", String(!open));
  $("breakdown").hidden = open;
});

/* token settings */
const tokenInput = $("token");
if (tokenInput) {
  tokenInput.value = getToken();
  $("tokenState").textContent = getToken() ? "Token saved — 5,000 requests/hr" : "No token — 60 requests/hr";
  $("token").addEventListener("change", () => {
    setToken(tokenInput.value);
    $("tokenState").textContent = getToken() ? "Token saved — 5,000 requests/hr" : "No token — 60 requests/hr";
    toast(getToken() ? "Token saved locally" : "Token cleared");
  });
}

/* deep link */
const q = new URLSearchParams(location.search).get("u");
if (q) { input.value = q; generate(q); }