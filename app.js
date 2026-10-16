const $ = (id) => {
  const el = document.getElementById(id);
  if (!el) console.warn(`[fc-card] missing #${id} — stale cache. Hard-refresh: Ctrl+Shift+R`);
  return el;
};
const form = $("form"), input = $("username"), status = $("status");
const stage = $("stage"), card = $("card"), skeleton = $("skeleton");

import { clamp, fmt, POSITIONS, positionFor, tierFor, rate, USERNAME_RE } from "./lib/rate.js";

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
async function render(user, repos, { animate = true } = {}) {
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
  $("langName").textContent = s.topLang;
  $("sigHandle").textContent = "@" + user.login;

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

  /* Avatar last: the skeleton stays up until the photo has actually painted,
     so the card never flashes an empty frame. Inlining as a data URL also keeps
     PNG export from being blocked by canvas tainting. */
  const av = $("avatar");
  if (user.avatar_url) {
    const src = user.avatar_url + (user.avatar_url.includes("?") ? "&" : "?") + "s=260";
    const inline = await avatarDataUrl(src);
    av.src = inline || src;
    await new Promise((res) => { av.onload = res; av.onerror = res; setTimeout(res, 1500); });
  } else {
    av.removeAttribute("src");
  }

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
    try { await render(cached.user, cached.repos); history.replaceState(null, "", "?u=" + encodeURIComponent(cached.user.login)); setStatus(""); return; }
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

    await render(user, repos);
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

$("download").addEventListener("click", () => exportCard());

let exportReason = "";

/* Rasterise the card. html-to-image measures the live element, so anything
   mid-animation makes it crop — hence the .exporting freeze. */
async function exportCard() {
  if (typeof window.htmlToImage?.toPng !== "function") {
    exportReason = "html-to-image not loaded";
    toast("Export library blocked — screenshot instead");
    return null;
  }
  const btn = $("download");
  btn.disabled = true;
  card.classList.add("exporting");
  await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
  // signature reserves its height, so the capture box matches what's on screen
  const h = card.offsetHeight;

  const w = card.offsetWidth;
  try {
    const url = await window.htmlToImage.toPng(card, {
      pixelRatio: 3,
      cacheBust: true,
      width: w,
      height: h,
      style: { margin: "0", boxShadow: "none" },
    });
    const a = document.createElement("a");
    a.download = ($("name").textContent || "github-fc-card").replace(/[^\w-]+/g, "-").toLowerCase() + "-fc-card.png";
    a.href = url;
    a.click();
    toast("Saved — go post it");
    return url;
  } catch (e) {
    exportReason = (e && e.message) ? e.message : String(e);
    toast("Export failed — screenshot instead");
    return null;
  } finally {
    card.classList.remove("exporting");
    btn.disabled = false;
  }
}

/* ?export=1 self-test: renders the PNG and reports its real pixel size in the
   title, so the output can be verified without a human clicking the button. */
if (new URLSearchParams(location.search).has("export")) {
  new Promise((r) => setTimeout(r, 2500)).then(async () => {
    const url = await exportCard();
    if (!url) { document.title = "EXPORT FAILED: " + exportReason; return; }
    const bmp = await createImageBitmap(await (await fetch(url)).blob());
    document.title = `EXPORT ${bmp.width}x${bmp.height} expected ${card.offsetWidth * 3}x${card.offsetHeight * 3}`;
  });
}

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

/* ---------- star count ---------- */
const REPO = "mukundzha/gfc";
const STARS_KEY = "fcstars", STARS_TTL = 6 * 3600 * 1000;

function paintStars(n) {
  const el = $("starCount");
  if (!el || typeof n !== "number") return;
  el.textContent = n >= 1000 ? (n / 1000).toFixed(1) + "k" : String(n);
  el.hidden = false;
}

async function loadStars() {
  let hit = null;
  try {
    const raw = localStorage.getItem(STARS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.t < STARS_TTL) hit = parsed.n;
    }
  } catch { /* ignore malformed cache */ }
  if (hit !== null) { paintStars(hit); return; }

  try {
    const token = getToken();
    const res = await fetch(`https://api.github.com/repos/${REPO}`, {
      headers: {
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
    });
    if (!res.ok) return;                       // silent: no count, button still works
    const data = await res.json();
    if (typeof data.stargazers_count !== "number") return;
    try { localStorage.setItem(STARS_KEY, JSON.stringify({ t: Date.now(), n: data.stargazers_count })); } catch { /* quota */ }
    paintStars(data.stargazers_count);
  } catch { /* offline — leave it hidden */ }
}

const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 1200));
idle(() => loadStars());

/* ?only=card strips the page down to just the card — handy for grabbing a
   clean image of it, e.g. ?u=someone&only=card */
if (new URLSearchParams(location.search).has("only")) {
  document.body.classList.add("only-card");
}

/* deep link */
const q = new URLSearchParams(location.search).get("u");
if (q) { input.value = q; generate(q); }