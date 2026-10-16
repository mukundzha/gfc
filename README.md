# GitHub FC Card

Renders a GitHub account as a football card. Type a username, get an overall, a position, and six attributes. Download it as a PNG.

Live: https://fcgithubcard.vercel.app

## Run it

No build step, no dependencies.

```
python3 -m http.server 8000
```

Any static host works.

## How the rating works

Two requests: `GET /users/{u}` and `GET /users/{u}/repos?per_page=100`. Then six attributes, each reading one signal, so nothing is counted twice.

| Attribute | Formula |
|---|---|
| FINISHING | `45 + norm(sum of √stars per repo, 2000) * 54` |
| PACE | `45 + norm(repos, 250) * 34 + norm(followers, 150k) * 20` |
| VISION | `45 + norm(forks, 25k) * 40 + norm(topics, 40) * 14` |
| DRIBBLING | `48 + norm(main-language KB, 1.5M) * 51` |
| TACKLING | `45 + unarchived share * 30 + described share * 24` |
| ENGINE | `45 + norm(active years, 20) * 54` |

OVR is the weighted average, defined in `WEIGHTS` in `lib/rate.js`.

Tier comes straight off it: 90+ Icon, 78-89 Gold, 66-77 Silver, under 66 Bronze.

Four decisions worth arguing with:

**FINISHING uses the square root of each repo's stars, summed.** A sqrt sum means a broad body of work beats one viral repository. Without it, a single 250k-star project maxes the attribute and everything else becomes irrelevant.

**Forks are excluded from FINISHING.** A fork's stars belong to whoever wrote the original code.

**ENGINE counts active years, not account age.** It's the number of distinct calendar years with at least one push. Ten years of existing is not ten years of stamina, and the old formula punished new accounts for being new.

**DRIBBLING weights languages by repository size.** A 400MB Rust project counts for more than a dozen two-line scripts, so depth beats dabbling.

The ceilings in `CEILINGS` are numbers I picked, and they decide who gets a good card. They were set just above the strongest value measured on a real account, which keeps 99 rare. That measurement skewed towards well-known developers, so the spread around the middle of the range is unverified. Everything tunable lives in `lib/rate.js`.

## Position

Whichever language GitHub reports on the most of your repos. One language per repo, so a big project counts the same as a small one.

| Position | Languages |
|---|---|
| ST | Ruby, PHP |
| LW | Kotlin, Swift, Dart, Objective-C |
| RW | JavaScript, TypeScript, HTML, CSS |
| CAM | Python, Jupyter |
| CDM | Go, Rust, C, C++, Java, Zig |
| GK | Shell, Dockerfile, HCL, Nix, Makefile |
| CM | anything else |

## Rate limits

Anonymous GitHub API is 60 requests per hour per IP, which a shared office connection blows through in minutes. Three things keep it usable:

- results cached in localStorage for 6 hours, so a repeat lookup costs nothing
- 2 requests per card
- visitors can save their own token under *Rate limited?* for 5000/hour

The token stays in the visitor's browser and only goes to api.github.com. If you deploy this and want a shared budget, put the token behind a proxy. Don't commit one.

## Files

```
index.html   markup
style.css    all the styling
app.js       fetching, rendering, export
lib/rate.js  the formula, shared with nothing else right now
og.html      source for the link preview
```

`og.png` is committed so the social preview works without a build step. Regenerate it with:

```
chromium --headless --window-size=1200,630 --screenshot=og.png og.html
```

## Known rough edges

- The ceilings are unverified in the middle of the range. See above.
- Only 100 repos are fetched, sorted by most recently updated. FINISHING, VISION and ENGINE all undercount anyone with more than 100 repos, so prolific accounts score low. PACE uses `user.public_repos` and is unaffected.
- ENGINE counts push years across the fetched repos only, so it inherits the same cap.
- `api/card/[username].js` is a serverless route meant to render a card PNG for README embeds. It 404s right now, don't use it.

## The maker's mark

The card carries a `GFC / @handle` signature at the bottom, but it's hidden on screen and only revealed for the export. So nobody's card looks like an advert, and every PNG someone downloads or shares carries the credit.

## License

MIT
