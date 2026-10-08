/* Shared route policy + settings schema. Loaded as a plain script by both the
   content script and the settings page, so everything hangs off one global. */
(function (root) {
  'use strict';

  var DEFAULTS = {
    // --- route gates -------------------------------------------------------
    allowProfiles: false,      // x.com/someone
    allowSearch: false,        // x.com/search?q=
    allowNotifications: false, // x.com/notifications
    allowMessages: true,       // x.com/messages  (direct msgs, not a feed)
    allowBookmarks: false,     // x.com/i/bookmarks
    allowLists: false,         // x.com/i/lists, x.com/someone/lists
    allowCommunities: false,   // x.com/i/communities
    allowCompose: true,        // x.com/compose/post
    allowEngagementLists: false, // /status/N/likes, /retweets, /quotes

    // --- in-page stripping (only applies on pages that are allowed) --------
    hideSidebar: true,         // right column: trends, who to follow, premium
    hideDiscoverMore: true,    // "Discover more" block under the replies
    hideWhoToFollow: true,     // inline follow-suggestion modules
    hideAds: true,             // promoted posts
    hideNavFeeds: true,        // feed-y entries in the left nav
    hideCounts: false,         // like / repost / view counters
    hideAvatarsInNav: false,   // unused placeholder, kept for schema stability

    // --- behaviour ---------------------------------------------------------
    showBlockReason: true
  };

  // /jack/status/123, /i/status/123, /i/web/status/123
  var STATUS_RE =
    /^\/(?:i\/web\/status|i\/status|[A-Za-z0-9_]{1,15}\/status)\/(\d+)(\/.*)?$/;

  // Sub-pages of a post that are still "the post itself".
  var STATUS_SUB_OK = /^\/(?:photo|video)\/\d+\/?$/;
  // Sub-pages of a post that are engagement/discovery lists.
  var STATUS_SUB_ENGAGEMENT =
    /^\/(?:likes|retweets|quotes|retweets\/with_comments)\/?$/;

  // Paths that must always work or the extension locks you out of your account.
  var ALWAYS_OK = [
    /^\/i\/flow\//,        // login, signup, 2fa, account recovery
    /^\/login\/?$/,
    /^\/logout\/?$/,
    /^\/account\//,
    /^\/settings(\/|$)/,
    /^\/i\/keyboard_shortcuts\/?$/,
    // "Sign in with X" on third-party sites. Blocking these silently breaks
    // logins elsewhere, with nothing pointing back at this extension.
    /^\/i\/oauth2\//,
    /^\/oauth\//,
    // Legal pages, bare or localized (/tos, /en/tos, /pt-br/privacy).
    /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?(?:tos|privacy)\/?$/
  ];

  // Reserved first path segments, so /explore is never mistaken for a profile.
  var RESERVED = [
    'home', 'explore', 'notifications', 'messages', 'compose', 'search',
    'i', 'settings', 'login', 'logout', 'account', 'intent', 'hashtag',
    'topics', 'tos', 'privacy', 'about', 'download', 'jobs', 'signup',
    'session', 'oauth', 'share', 'widgets', 'who_to_follow', 'connect_people'
  ];

  /**
   * Decide what to do with a path.
   * ctx.loggedIn: false only when the caller is sure there is no session.
   * @returns {{allow: boolean, kind: string, reason: string}}
   */
  function classify(pathname, search, s, ctx) {
    s = s || DEFAULTS;
    var loggedIn = !(ctx && ctx.loggedIn === false);
    var p = (pathname || '/').replace(/\/+$/, '') || '/';

    for (var i = 0; i < ALWAYS_OK.length; i++) {
      if (ALWAYS_OK[i].test(p)) return ok('auth', 'account / auth page');
    }

    var m = STATUS_RE.exec(p);
    if (m) {
      var sub = m[2] || '';
      if (!sub) return ok('status', 'a post and its replies');
      if (STATUS_SUB_OK.test(sub)) return ok('status', 'post media');
      if (STATUS_SUB_ENGAGEMENT.test(sub)) {
        return s.allowEngagementLists
          ? ok('status', 'engagement list')
          : no('engagement', 'who liked / reposted / quoted this');
      }
      // /analytics and anything else hanging off a post
      return no('engagement', 'post analytics');
    }

    if (p === '/' || p === '/home') {
      // Logged out, x.com/ is the sign-in page, not a feed, and X's login flow
      // passes through it. Blocking it makes logging in impossible.
      return loggedIn ? no('feed', 'the main feed') : ok('auth', 'sign-in page');
    }
    if (/^\/explore/.test(p) || /^\/i\/trending/.test(p) || /^\/trends/.test(p)) {
      return no('discovery', 'Explore / Trending');
    }
    if (/^\/search/.test(p) || /^\/hashtag\//.test(p) || /^\/i\/topics/.test(p)) {
      return s.allowSearch ? ok('search', 'search') : no('discovery', 'search');
    }
    if (/^\/notifications/.test(p)) {
      return s.allowNotifications
        ? ok('notifications', 'notifications')
        : no('engagement', 'notifications');
    }
    // DMs moved from /messages to /i/chat; both are the same setting.
    if (/^\/messages/.test(p) || /^\/i\/chat(\/|$)/.test(p)) {
      return s.allowMessages ? ok('messages', 'messages') : no('feed', 'messages');
    }
    if (/^\/i\/bookmarks/.test(p)) {
      return s.allowBookmarks ? ok('bookmarks', 'bookmarks') : no('feed', 'bookmarks');
    }
    if (/^\/i\/lists/.test(p) || /\/lists(\/|$)/.test(p)) {
      return s.allowLists ? ok('lists', 'lists') : no('feed', 'lists');
    }
    if (/^\/i\/communities/.test(p)) {
      return s.allowCommunities
        ? ok('communities', 'communities')
        : no('feed', 'communities');
    }
    if (/^\/compose/.test(p) || /^\/intent\//.test(p)) {
      return s.allowCompose ? ok('compose', 'composer') : no('feed', 'composer');
    }
    if (/^\/i\/premium|^\/i\/verified|^\/i\/monetization|^\/i\/grok/.test(p)) {
      return no('upsell', 'Premium / Grok upsell');
    }

    // Anything left that looks like /handle or /handle/with_replies is a profile.
    var seg = p.split('/')[1] || '';
    if (seg && RESERVED.indexOf(seg.toLowerCase()) === -1) {
      return s.allowProfiles ? ok('profile', 'a profile') : no('feed', 'a profile feed');
    }

    return no('feed', 'an X surface that is not a single post');

    function ok(kind, reason) { return { allow: true, kind: kind, reason: reason }; }
    function no(kind, reason) { return { allow: false, kind: kind, reason: reason }; }
  }

  root.TDF = {
    DEFAULTS: DEFAULTS,
    classify: classify,
    STATUS_RE: STATUS_RE
  };
})(typeof globalThis !== 'undefined' ? globalThis : window);
