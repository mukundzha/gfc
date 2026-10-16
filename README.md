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
| FINISHING | `45 + norm(sum of √stars per repo, 2200) * 54` |
| PACE | `45 + norm(repos, 220) * 33 + norm(followers, 120k) * 21` |
| VISION | `45 + norm(forks, 40k) * 42 + norm(topics, 40) * 12` |
| DRIBBLING | `45 + norm(languages, 12) * 24 + norm(main-language KB, 1.8M) * 30` |
| TACKLING | `45 + upkeep * 54`, upkeep gated on having 30+ repos |
| ENGINE | `45 + norm(active years, 15) * 54` |

OVR is the weighted average, defined in `WEIGHTS` in `lib/rate.js`.

Tier comes straight off it: 90+ Icon, 78-89 Gold, 66-77 Silver, under 66 Bronze.

Four decisions worth arguing with:

**FINISHING uses the square root of each repo's stars, summed.** A sqrt sum means a broad body of work beats one viral repository. Without it, a single 250k-star project maxes the attribute and everything else becomes irrelevant.

**Forks are excluded from FINISHING.** A fork's stars belong to whoever wrote the original code.

**ENGINE counts active years, not account age.** It's the number of distinct calendar years with at least one push. Ten years of existing is not ten years of stamina, and the old formula punished new accounts for being new.

**DRIBBLING weights languages by repository size.** A 400MB Rust project counts for more than a dozen two-line scripts, so depth beats dabbling. Language count is worth less than size on purpose.

**Every attribute is volume-gated.** TACKLING is the clearest case: upkeep is a ratio, so without a gate a 12-repo account scored 97 just for keeping things tidy. The credit now scales with how many repos are behind the ratio, which capped small accounts at roughly 65 and left the top of the scale for people who have actually maintained something large.

The ceilings in `CEILINGS` decide who gets a good card, and they were tuned against a cached sample of ten real accounts. Of that sample exactly one scores 98, two score 96, and the weakest sits at 67. Getting to the top takes a large body of starred work, a following, forks, a deep multi-language codebase, years of upkeep and a long run of active years, all at once. That is the intent: the scale should be hard to top out.

That sample skewed towards established developers, so the middle of the range is still the least verified part. `node tools/calibrate.mjs <accounts>` re-measures it. Everything tunable lives in `lib/rate.js`.

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
