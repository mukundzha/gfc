<div align="center">

# ⚽ GitHub FC Card

**Your GitHub account, rated like a football card.**

Type a username → get an overall rating, a position, and six attributes.
Download it, post it, argue about the formula.

> **Live:** https://fcgithubcard.vercel.app

[MIT License](LICENSE) · No build step · No backend · No tracking

</div>

---

## What it does

Paste any GitHub username. The app pulls the public profile and up to 100 repos,
scores six attributes, and renders a collectable-style card you can download as PNG.

## The formula

Everything is derived from two public endpoints:
`GET /users/{u}` and `GET /users/{u}/repos?per_page=100`.

Each attribute log-scales a raw count against the top of a realistic range,
then clamps to `40–99`:

| Attribute | Formula |
|---|---|
| **FINISHING** | `45 + stars/250k ×54` |
| **VISION** | `45 + forks/25k ×40 + following/1k ×14` |
| **PACE** | `45 + repos/250 ×34 + followers/150k ×20` |
| **DRIBBLING** | `48 + languages/14 ×51` |
| **TACKLING** | `45 + (stars+forks)/300k ×38 + age ×1.5` |
| **ENGINE** | `45 + age ×2.6 (max 22) + repos/250 ×32` |

```
OVR = FINISHING×0.25 + VISION×0.20 + PACE×0.15
    + DRIBBLING×0.15 + TACKLING×0.10 + ENGINE×0.15
```

**Tier:** `90+ Icon` · `78–89 Gold` · `66–77 Silver` · `below 66 Bronze`

## Position

Position comes from your **top language** — whichever language GitHub reports on
the most of your repos. One language per repo, so a huge project counts the same
as a tiny one.

| Position | Languages |
|---|---|
| **ST** | Ruby, PHP |
| **LW** | Kotlin, Swift, Dart, Objective-C |
| **RW** | JavaScript, TypeScript, HTML, CSS |
| **CAM** | Python, Jupyter |
| **CDM** | Go, Rust, C, C++, Java, Zig |
| **GK** | Shell, Dockerfile, HCL, Nix, Makefile |
| **CM** | anything else |

## Contribute

The formula is deliberately arguable. The most likely PRs:

- **"Python should be CAM, not ST"** — it's in `POSITIONS` in `app.js`
- **"Starring one repo shouldn't max out FINISHING"** — the `norm()` ceilings
- **Weight changes** — the `weights` object in `app.js`

All tunables live in `rate()` and `POSITIONS` in `app.js`. No build step.

## Rate limits

Unauthenticated GitHub API requests are capped at **60/hour per IP address**.
Two things mitigate this, both already implemented:

1. A **6-hour localStorage cache** — each unique username costs 2 requests, then free
2. An **optional personal token** under *Rate limited?* — raises the cap to 5,000/hour

The token stays in the visitor's own browser and only goes to `api.github.com`.
**Never commit a token to this repo** — if you deploy publicly and want a shared
budget, put the token behind a server-side proxy, not in client JS.

## Deploy

Static files. Any host works:

This one runs on **Vercel** at https://fcgithubcard.vercel.app.
Equivalent options:
- **Cloudflare Pages** — drag the folder in, no build config
- **Netlify** — same
- **GitHub Pages** — serve from `main` / root

### Social preview

`og.png` is the 1200×630 preview image, already committed so no build step is needed.
Regenerate it after editing `og.html`:

```bash
chromium --headless --window-size=1200,630 --screenshot=og.png og.html
```

`og:image` is set to the absolute URL `https://fcgithubcard.vercel.app/og.png`,
which is what X and WhatsApp require. If you fork this, update both `og:image`
and `twitter:image` in `index.html` to your own domain.

## Files

| File | What |
|---|---|
| `index.html` | markup + meta |
| `style.css` | all styling |
| `app.js` | fetch, formula, render |
| `og.html` / `og.png` | social preview source and output |