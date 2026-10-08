/* Twitter Defang - content script. Runs at document_start on x.com/twitter.com. */
(function () {
  'use strict';

  var api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;
  var TDF = globalThis.TDF;
  var settings = TDF.DEFAULTS;
  var root = document.documentElement;
  var lastHref = location.href;

  /* ------------------------------------------------------------------ *
   * 1. Blackout before the first paint.
   * ------------------------------------------------------------------ */
  root.setAttribute('data-tdf', 'pending');
  // If anything below throws or storage never answers, reveal the page anyway.
  // A broken extension should degrade to plain X, not to a blank screen.
  var failsafe = setTimeout(reveal, 2000);

  function reveal() {
    clearTimeout(failsafe);
    if (root.getAttribute('data-tdf') === 'pending') {
      root.setAttribute('data-tdf', 'on');
    }
  }

  /* ------------------------------------------------------------------ *
   * 2. Settings, then the first routing decision.
   * ------------------------------------------------------------------ */
  api.storage.sync.get(TDF.DEFAULTS, function (loaded) {
    settings = loaded || TDF.DEFAULTS;
    applyCssFlags();
    route(location.pathname, location.search);
    reveal();
    start();
  });

  api.storage.onChanged.addListener(function (changes, area) {
    if (area !== 'sync') return;
    Object.keys(changes).forEach(function (k) { settings[k] = changes[k].newValue; });
    applyCssFlags();
    scan();
  });

  function applyCssFlags() {
    set('data-tdf-sidebar', settings.hideSidebar);
    set('data-tdf-wtf', settings.hideWhoToFollow);
    set('data-tdf-ads', settings.hideAds);
    set('data-tdf-nav', settings.hideNavFeeds);
    set('data-tdf-counts', settings.hideCounts);
    function set(attr, on) { root.setAttribute(attr, on ? 'hide' : 'show'); }
  }

  /* ------------------------------------------------------------------ *
   * 3. Routing.
   * ------------------------------------------------------------------ */

  // Only matters for x.com/ and /home, which are the sign-in page when logged
  // out. `twid` is X's script-readable user-id cookie (the session token itself
  // is HttpOnly); only its presence is checked, the value is never read. The
  // DOM markers are a second signal so that a missing or renamed cookie cannot
  // switch the blocker off for a logged-in user - at worst it delays the block
  // until X's own navigation has rendered.
  var LOGGED_IN_MARKERS =
    '[data-testid="SideNav_AccountSwitcher_Button"], [data-testid="AppTabBar_Profile_Link"]';

  function isLoggedIn() {
    if (/(?:^|;\s*)twid=/.test(document.cookie)) return true;
    return !!document.querySelector(LOGGED_IN_MARKERS);
  }

  function classify(pathname, search) {
    return TDF.classify(pathname, search, settings, { loggedIn: isLoggedIn() });
  }

  function route(pathname, search) {
    var verdict = classify(pathname, search);
    if (verdict.allow) {
      root.setAttribute('data-tdf-page', verdict.kind);
      return true;
    }
    var url = api.runtime.getURL('src/blocked.html') +
      '?path=' + encodeURIComponent(pathname) +
      '&kind=' + encodeURIComponent(verdict.kind) +
      '&reason=' + encodeURIComponent(verdict.reason);
    location.replace(url);
    return false;
  }

  /* ------------------------------------------------------------------ *
   * 4. Catching SPA navigation.
   *
   * A content script lives in an isolated world, so patching
   * history.pushState here would never see X's own calls. Instead:
   *   a) intercept clicks on links to blocked routes (instant, covers ~all
   *      real navigation), and
   *   b) poll location.href as the backstop for programmatic navigation.
   * ------------------------------------------------------------------ */
  function start() {
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', checkLocation);
    setInterval(checkLocation, 150);
    observe();
    scan();
  }

  function onClick(e) {
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target && e.target.closest && e.target.closest('a[href]');
    if (!a) return;
    var href = a.getAttribute('href') || '';
    if (!href || href[0] !== '/') return; // external or hash link
    var u;
    try { u = new URL(href, location.origin); } catch (_) { return; }
    if (classify(u.pathname, u.search).allow) return;
    e.preventDefault();
    e.stopPropagation();
    route(u.pathname, u.search);
  }

  function checkLocation() {
    if (location.href === lastHref) return;
    lastHref = location.href;
    cutY = null;
    root.setAttribute('data-tdf', 'pending');
    if (route(location.pathname, location.search)) {
      reveal();
      scan();
    }
  }

  /* ------------------------------------------------------------------ *
   * 5. Stripping discovery blocks out of an allowed page.
   * ------------------------------------------------------------------ */

  // Headings that mark the start of the recommendation rail under the replies.
  var DISCOVER = [
    'discover more', 'more posts', 'more tweets', 'you might like',
    'who to follow', 'people you may know', 'recommended', 'trending',
    'what’s happening', 'whats happening', 'live on x', 'today’s news',
    // de / fr / es / it, since X follows the browser locale
    'mehr entdecken', 'wem folgen', 'könnte dir gefallen',
    'découvrir plus', 'qui suivre', 'descubre más', 'a quién seguir',
    'scopri altro', 'chi seguire'
  ];
  // Headings that are part of the conversation and must survive.
  var KEEP = [
    'more replies', 'show more replies', 'show additional replies',
    'probable spam', 'offensive', 'weitere antworten', 'plus de réponses',
    'más respuestas', 'altre risposte'
  ];

  function norm(s) {
    return (s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  var cutY = null;      // translateY threshold: cells at or below this are discovery
  var cutKey = null;    // the path cutY was computed for

  function translateY(el) {
    var m = /translateY\(([-\d.]+)px\)/.exec(el.style.transform || '');
    return m ? parseFloat(m[1]) : null;
  }

  function scan() {
    // x.com/ was let through as the sign-in page; if it turns out to be a
    // logged-in feed after all, block it now.
    if (root.getAttribute('data-tdf-page') === 'auth' &&
        /^\/(home)?\/?$/.test(location.pathname) && isLoggedIn()) {
      route(location.pathname, location.search);
      return;
    }
    if (root.getAttribute('data-tdf-page') !== 'status') return;

    var timeline = document.querySelector(
      '[aria-label^="Timeline: Conversation"], [aria-label^="Timeline: Konversation"]'
    );
    if (!timeline) return;

    var cells = timeline.querySelectorAll('[data-testid="cellInnerDiv"]');
    var i, cell;

    // Promoted posts: hide the whole cell, not just the ad wrapper, or an
    // empty gap is left where the ad was.
    if (settings.hideAds) {
      for (i = 0; i < cells.length; i++) {
        if (cells[i].querySelector('[data-testid="placementTracking"]')) strip(cells[i]);
      }
    }

    if (!settings.hideDiscoverMore) return;

    if (cutKey !== location.pathname) { cutKey = location.pathname; cutY = null; }

    // X lays the timeline out as absolutely positioned cells and unmounts the
    // ones off screen, so sibling order is not dependable - the divider is
    // usually gone by the time you have scrolled past it. Its translateY is,
    // so that is what gets remembered.
    var found = null;
    for (i = 0; i < cells.length; i++) {
      cell = cells[i];
      var y = translateY(cell);
      if (y === null || y <= 0) continue;                   // never cut at the root post
      var heading = cell.querySelector('h2, [role="heading"][aria-level="2"]');
      if (!heading) continue;
      if (cell.querySelector('article[data-testid="tweet"]')) continue; // a post, not a divider
      var text = norm(heading.innerText);
      if (KEEP.some(function (k) { return text.indexOf(k) !== -1; })) continue;
      if (!DISCOVER.some(function (k) { return text.indexOf(k) !== -1; })) {
        console.debug('[twitter-defang] cutting at unrecognised divider:', text);
      }
      if (found === null || y < found) found = y;
    }

    // Latest sighting wins rather than the smallest ever seen: expanding
    // "Show more replies" pushes the divider down, and a remembered lower
    // threshold would start hiding real replies.
    if (found !== null) cutY = found;
    if (cutY === null) return;

    for (i = 0; i < cells.length; i++) {
      var cy = translateY(cells[i]);
      if (cy !== null && cy >= cutY) strip(cells[i]);
    }
  }

  function strip(el) {
    if (el.getAttribute('data-tdf-strip') !== '1') el.setAttribute('data-tdf-strip', '1');
  }

  var queued = false;
  function observe() {
    new MutationObserver(function () {
      if (queued) return;
      queued = true;
      // Deliberately setTimeout and not requestAnimationFrame: rAF does not
      // fire in a background tab, which would leave `queued` stuck true and
      // silently kill all further scanning, even once the tab is foregrounded.
      setTimeout(function () { queued = false; scan(); }, 100);
    }).observe(document.documentElement, { childList: true, subtree: true });
    // X finishes laying the thread out after the tab becomes visible again.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scan();
    });
  }
})();
