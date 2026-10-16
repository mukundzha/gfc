/* GET /card/{username}.png
   Renders the same card as the front-end to a PNG so people can drop a
   live image into their GitHub profile README. Same formula, same file:
   lib/rate.js is shared, so this cannot drift from the browser. */

import { ImageResponse } from "@vercel/og";
import { rate, positionFor, tierFor, fmt, tierColors, USERNAME_RE } from "../../lib/rate.js";

let fontCache = null;
async function loadFonts() {
  if (fontCache) return fontCache;
  try {
    const res = await fetch(
      "https://cdn.jsdelivr.net/fontsource/fonts/barlow-condensed@latest/latin-700-normal.ttf"
    );
    fontCache = res.ok
      ? [{ name: "Cond", data: await res.arrayBuffer(), weight: 700, style: "normal" }]
      : [];
  } catch {
    fontCache = [];
  }
  return fontCache;
}

async function fetchGitHub(path) {
  const headers = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
  const token = process.env.GITHUB_TOKEN;
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) {
    const err = new Error(`GitHub ${res.status}`);
    err.status = res.status;
    throw err;
  }
  return res.json();
}

const Stat = ({ value, label, ink }) => (
  <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
    <div style={{ fontFamily: "Cond", fontSize: 34, lineHeight: 1, color: ink }}>{value}</div>
    <div style={{ fontSize: 10, letterSpacing: "0.08em", textTransform: "uppercase", opacity: 0.65, marginTop: 4, color: ink }}>
      {label}
    </div>
  </div>
);

export default async function handler(req, res) {
  const raw = Array.isArray(req.query.username) ? req.query.username[0] : req.query.username;
  const username = String(raw || "").replace(/^@/, "");

  if (!username || !USERNAME_RE.test(username)) {
    res.status(400).json({ error: "Invalid GitHub username" });
    return;
  }

  let user, repos;
  try {
    [user, repos] = await Promise.all([
      fetchGitHub(`/users/${encodeURIComponent(username)}`),
      fetchGitHub(`/users/${encodeURIComponent(username)}/repos?per_page=100&type=owner&sort=updated`),
    ]);
  } catch (e) {
    if (e.status === 404) { res.status(404).json({ error: "User not found" }); return; }
    if (e.status === 403 || e.status === 429) {
      res.setHeader("Retry-After", "600");
      res.status(429).json({ error: "GitHub rate limited. Set GITHUB_TOKEN on this deployment." });
      return;
    }
    res.status(502).json({ error: "Upstream fetch failed" });
    return;
  }

  const s = rate(user, repos);
  const tier = tierFor(s.ovr);
  const c = tierColors(tier);
  const pos = positionFor(s.topLang);
  const fonts = await loadFonts();

  const stats = [
    [s.pac, "Pace"], [s.sho, "Finishing"], [s.pas, "Vision"],
    [s.dri, "Dribbling"], [s.def, "Tackling"], [s.phy, "Engine"],
  ];

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center",
          background: "linear-gradient(150deg, #10141d 0%, #0a0c11 100%)",
          padding: 40,
        }}
      >
        <div
          style={{
            display: "flex", flexDirection: "column", width: 372,
            padding: 9, borderRadius: 14,
            background: `linear-gradient(158deg, ${c.frame[0]} 0%, ${c.frame[1]} 18%, ${c.frame[2]} 52%, ${c.frame[3]} 100%)`,
          }}
        >
          <div
            style={{
              display: "flex", flexDirection: "column", width: "100%",
              padding: 22, borderRadius: 7, background: `linear-gradient(168deg, ${c.panel[0]} 0%, ${c.panel[1]} 56%, ${c.panel[2]} 100%)`,
              border: `1px solid ${c.edge}`, color: c.ink,
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                <div style={{ fontFamily: "Cond", fontSize: 76, lineHeight: 1, letterSpacing: "-0.03em" }}>{s.ovr}</div>
                <div style={{ marginTop: 8, padding: "3px 11px", borderRadius: 2, background: c.ink, color: "#171104", fontFamily: "Cond", fontSize: 19, letterSpacing: "0.1em" }}>
                  {pos}
                </div>
                <div style={{ marginTop: 10, padding: "4px 10px", borderRadius: 2, border: `1px solid ${c.edge}`, fontSize: 11, letterSpacing: "0.18em" }}>
                  {tier.toUpperCase()}
                </div>
              </div>
              <img src={`${user.avatar_url}&s=256`} width="134" height="134" style={{ borderRadius: 5 }} />
            </div>

            <div style={{ marginTop: 22, paddingLeft: 13, borderLeft: `4px solid ${c.ink}`, fontFamily: "Cond", fontSize: 38, lineHeight: 1, textTransform: "uppercase" }}>
              {(user.name || user.login).slice(0, 20)}
            </div>
            <div style={{ marginTop: 10, fontSize: 15, opacity: 0.85 }}>
              {(user.company || "Free Agent").replace(/^@/, "")}
            </div>

            <div style={{ height: 1, background: c.edge, margin: "18px 0 16px" }} />

            <div style={{ display: "flex", flexWrap: "wrap" }}>
              {stats.map(([v, l]) => (
                <div key={l} style={{ width: "33.33%", display: "flex", marginBottom: 16 }}>
                  <Stat value={v} label={l} ink={c.ink} />
                </div>
              ))}
            </div>

            <div style={{ height: 1, background: c.edge, margin: "2px 0 12px" }} />
            <div style={{ display: "flex", justifyContent: "center", fontSize: 12, opacity: 0.72 }}>
              {`★ ${fmt(s.stars)} · ${s.repoCount} repos · ${fmt(s.followers)} followers`}
            </div>
          </div>
        </div>
      </div>
    ),
    { width: 472, height: 640, fonts }
  );
}