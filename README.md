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

Two requests: `GET /users/{u}` and `GET /users/{u}/repos?per_page=100`. Then four raw counts get log-scaled against a ceiling and clamped to 40-99.

`norm(x, max)` is `log10(x+1) / log10(max+1)`, so the 10,000th star barely moves the number. That's deliberate. Without it almost everyone with 10k+ stars sits at 99 and the top end means nothing.

| Attribute | Formula |
|---|---|
| FINISHING | `45 + norm(stars, 250k) * 54` |
| VISION | `45 + norm(forks, 25k) * 40 + norm(following, 1k) * 14` |
| PACE | `45 + norm(repos, 250) * 34 + norm(followers, 150k) * 20` |
| DRIBBLING | `48 + norm(languages, 14) * 51` |
| TACKLING | `45 + norm(stars+forks, 300k) * 38 + min(12, age * 1.5)` |
| ENGINE | `45 + min(22, age * 2.6) + norm(repos, 250) * 32` |

OVR is the weighted average, defined in `WEIGHTS` in `lib/rate.js`.

Tier comes straight off it: 90+ Icon, 78-89 Gold, 66-77 Silver, under 66 Bronze.

The ceilings are numbers I picked by eye. They quietly decide who gets a good card, so argue with them. Everything tunable lives in `lib/rate.js`.

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

- `api/card/[username].js` is a serverless route meant to render a card PNG for README embeds. It 404s right now, don't use it.
- The card counts up to 100 repos. Someone with 400 isn't fully counted.
- ENGINE is basically account age. A new account with 30 good repos gets punished.

## License

MIT
