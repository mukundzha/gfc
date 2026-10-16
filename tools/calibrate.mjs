/* Calibration harness.
 *
 *   node tools/calibrate.mjs [account ...]
 *
 * Prints each account's OVR plus the raw signals behind it, so you can see
 * whether the ceilings in CEILINGS are set sensibly or whether everything
 * is piling up at 99.
 *
 * Costs 2 API requests per account (user + repos). Anonymous budget is
 * 60/hr per IP, so keep the list short or set GITHUB_TOKEN.
 *
 * Suggested set: a few genuinely ordinary accounts, a few mid-tier, one or
 * two outliers. A list made only of famous developers tells you nothing
 * about the middle of the distribution.
 */

const ACCOUNTS = process.argv.slice(2).length
  ? process.argv.slice(2)
  : ["mukundzha", "swyx", "westurner", "cassidoo", "sindresorhus"];

const { rate, tierFor, CEILINGS } = await import("../lib/rate.js");

const headers = {
  Accept: "application/vnd.github+json",
  "X-GitHub-Api-Version": "2022-11-28",
  ...(process.env.GITHUB_TOKEN ? { Authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}),
};

const get = async (path) => {
  const res = await fetch(`https://api.github.com${path}`, { headers });
  if (!res.ok) throw new Error(`${path} -> ${res.status}`);
  return res.json();
};

const pad = (s, w) => String(s).padEnd(w);
const rows = [];

for (const account of ACCOUNTS) {
  try {
    const [user, repos] = await Promise.all([
      get(`/users/${account}`),
      get(`/users/${account}/repos?per_page=100&type=owner&sort=updated`),
    ]);
    if (!Array.isArray(repos)) throw new Error("repos not a list");
    rows.push({ login: user.login, s: rate(user, repos), n: repos.length });
  } catch (e) {
    console.error(`  ${account}: ${e.message}`);
  }
}

console.log();
console.log(pad("account", 16), pad("OVR", 5), pad("tier", 8),
  pad("FIN", 5), pad("PAC", 5), pad("VIS", 5), pad("DRI", 5), pad("TAC", 5), pad("ENG", 5),
  pad("dStars", 9), pad("langKB", 10), "yrs");
console.log("-".repeat(104));

for (const r of rows.sort((a, b) => b.s.ovr - a.s.ovr)) {
  const s = r.s;
  console.log(
    pad(r.login, 16), pad(s.ovr, 5), pad(tierFor(s.ovr), 8),
    pad(s.sho, 5), pad(s.pac, 5), pad(s.pas, 5), pad(s.dri, 5), pad(s.def, 5), pad(s.phy, 5),
    pad(Math.round(s.dStars), 9), pad(Math.round(s.langKb / 1000) + "M", 10), s.years
  );
}

const ovrs = rows.map((r) => r.s.ovr).sort((a, b) => a - b);
const median = ovrs.length ? ovrs[Math.floor(ovrs.length / 2)] : 0;
const icons = ovrs.filter((o) => o >= 90).length;

console.log();
console.log(`n=${ovrs.length}  min=${ovrs[0] ?? "-"}  median=${median}  max=${ovrs.at(-1) ?? "-"}  Icon: ${icons}/${ovrs.length}`);
console.log(`ceilings: FINISHING ${CEILINGS.FINISHING_SQRT_STARS}  MAIN_LANG_KB ${CEILINGS.MAIN_LANG_KB}  ACTIVE_YEARS ${CEILINGS.ACTIVE_YEARS}`);
console.log();
console.log("Want median in the low 80s with only one or two Icons? Raise the ceilings.");
console.log("Everything under 99 except the single best account? Lower them.");