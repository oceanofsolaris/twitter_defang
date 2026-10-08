# Twitter Defang

A browser extension that lets you open a link to a single X/Twitter post and read
it — including the reply thread — while removing every feed, discovery surface and
engagement module around it.

The rule it enforces: **a URL that points at one specific post opens. Everything
else does not.**

## What it does

**Blocks, by redirecting to a local page that never loads X's feed code:**

| Blocked | Why |
| --- | --- |
| `x.com/` and `/home` | "For you" and "Following" |
| `/explore`, `/i/trending` | Trending rail |
| `/search`, `/hashtag/*` | Endless results feed |
| `/notifications` | The main pull back in |
| `/someone` (profiles) | A personal feed |
| `/i/bookmarks`, `/i/lists`, `/i/communities` | More feeds |
| `/status/N/likes`, `/retweets`, `/quotes` | Who-interacted lists |
| `/i/premium_sign_up`, Grok upsells | Nags |

**Allows:**

- `/{handle}/status/{id}` — the post and its full reply thread
- `/i/status/{id}`, `/i/web/status/{id}` — the canonical link forms
- `/status/{id}/photo/1`, `/video/1` — media views
- `/i/flow/*`, `/login`, `/settings/*` — so you can never lock yourself out
- `x.com/` itself **while logged out**, because then it is the sign-in page
- `/i/oauth2/*`, `/oauth/*` — "Sign in with X" on other websites
- `/i/chat`, `/messages` (DMs), `/compose/post` — on by default; both are toggles

**Strips from the post page itself:**

- the **"Discover more"** rail wedged in under the replies, and everything
  below it
- the right sidebar — trends, who to follow, Premium upsell
- follow suggestions inserted mid-thread
- promoted posts
- Home / Explore / Notifications in the left nav
- like / repost / view counters (off by default)

Every one of these is a checkbox. Click the toolbar icon.

## Install in Chrome

1. `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → select the `extension/` folder in this repo

That's it. No signing, no store listing, survives restarts.

## Install in Safari

Safari needs the extension wrapped in a Mac app, which needs full Xcode — you
currently have Command Line Tools only.

1. Install Xcode from the App Store (~10 GB), then:
   ```sh
   sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
   xcodebuild -runFirstLaunch
   ```
2. Wrap the extension:
   ```sh
   xcrun safari-web-extension-converter extension \
     --project-location build --app-name "Twitter Defang" --macos-only --no-prompt
   ```
3. Open `build/Twitter Defang/Twitter Defang.xcodeproj`, pick your own Apple ID
   under **Signing & Capabilities** (a free account is enough for local use),
   and Run once to install the container app.
4. Safari → Settings → Extensions → enable **Twitter Defang** → Edit Websites →
   allow `x.com` and `twitter.com`.

The extension source is identical for both browsers, so nothing here is
Chrome-specific work that has to be redone.

## Install in Firefox for Android

Firefox for **iOS** cannot run extensions at all — Apple only allows the Safari
extension model there, so this is Android-only.

Build the packages first:

```sh
node build.mjs     # -> build/twitter-defang-{chrome,firefox}.zip
```

The Firefox zip passes `addons-linter` with 0 errors, 0 warnings. It differs
from the Chrome build only in `browser_specific_settings`, added at build time:

- **`gecko.id`** — Firefox needs a stable extension ID. Without one
  `storage.sync` throws at runtime and AMO rejects the upload. Not optional the
  way it is in Chrome.
- **`gecko_android`** — marks the add-on installable on Android.
- **`data_collection_permissions: { required: ["none"] }`** — now mandatory on
  AMO. The extension has no server, no analytics and makes no network calls of
  its own, so "none" is accurate.
- **`strict_min_version: 142.0`** — the floor for the data-collection key on
  Android (140 on desktop).

**Firefox for Android will only install a Mozilla-signed add-on**, so either way
the zip has to go through addons.mozilla.org. That leaves two routes, and the
choice is really public-vs-private:

| | Release Firefox | Nightly Firefox |
| --- | --- | --- |
| Install from AMO listing | yes | yes |
| Install a signed `.xpi` from a file | **no** | yes |

- **Keep it private:** upload to AMO as **unlisted** ("On your own"), which gets
  it signed without publishing it. Download the signed `.xpi` and install it from
  the file — but this only works on **Firefox Nightly for Android**; release
  Firefox refuses file installs.
- **Use release Firefox:** publish to AMO as **listed**. It goes through Mozilla
  review and becomes public, after which it installs normally from AMO.

To just try it over USB without publishing anything, `web-ext` installs it
temporarily on Nightly:

```sh
npx web-ext run -t firefox-android --source-dir build/firefox
```

(Needs USB debugging and `adb`; the add-on disappears when the session ends.)

## How it works

`src/rules.js` holds the whole policy as an **allowlist** — a path has to look
like a post to be let through. A blocklist would rot every time X ships a new
surface; an allowlist fails closed instead.

`src/content.js` runs at `document_start`, before X paints. It hides the content
column, reads your settings, and either redirects to `src/blocked.html` or
reveals the page. A 2-second failsafe reveals the page regardless, so a bug in
the extension degrades to plain X rather than a blank screen.

Content scripts run in an isolated JS world, so patching `history.pushState`
would never see X's own SPA navigations. Instead the script intercepts clicks on
links to blocked routes (instant, covers essentially all real navigation) and
polls `location.href` every 150 ms as a backstop.

The "Discover more" cut is **structural, not text-matching**. Verified against
the live DOM: the divider is a cell containing `<h2 aria-level="2">Discover
more</h2>` ("Sourced from across X") and *no* `article`, sitting below every real
reply. Heading text is only consulted to protect known "Show more replies"
dividers, so the cut survives X rewording it or you switching UI language.

The cut is a **`translateY` threshold, not sibling order**. X renders the
timeline as absolutely positioned cells and unmounts the off-screen ones, so by
the time you have scrolled past the divider it is usually gone from the DOM —
anything keyed to DOM order stops working at exactly the moment it matters. The
script remembers the divider's Y offset instead and hides every cell at or below
it. The newest sighting wins rather than the lowest ever seen, because expanding
"Show more replies" pushes the divider down and a stale threshold would start
eating real replies.

The mutation observer is throttled with `setTimeout`, **not**
`requestAnimationFrame`. rAF does not fire in a background tab, which would leave
the throttle flag stuck and silently kill all further scanning even after you
came back to the tab. This was a real bug caught during live testing, not a
hypothetical.

`src/hide.css` ships in the manifest so it applies before first paint. Every rule
is gated on a `data-tdf-*` attribute that the content script sets, which is how
settings toggle CSS without re-injecting a stylesheet.

## Tests

```sh
node --test
```

Covers the route policy, including the cases that broke in 1.0.0: logging in,
"Sign in with X", DMs at `/i/chat`, and localized legal pages.

## Layout

```
build.mjs             emits the Chrome and Firefox packages
test/rules.test.mjs   route policy regression tests
extension/
  manifest.json       MV3, Chrome + Safari (Firefox keys added by build.mjs)
  src/rules.js        route policy + settings schema (shared)
  src/content.js      blocking, SPA tracking, DOM stripping
  src/hide.css        attribute-gated hiding, applied pre-paint
  src/blocked.html    the local page a blocked route lands on
  src/options.html    settings, doubles as the toolbar popup
  icons/
```
