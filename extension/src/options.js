(function () {
  'use strict';
  var api = (typeof browser !== 'undefined' && browser.storage) ? browser : chrome;

  var ROUTES = [
    ['allowProfiles',        'Profiles',            'x.com/someone — a personal feed, and a fast way back into scrolling.'],
    ['allowSearch',          'Search & hashtags',   'Useful for finding one thing; also an endless results feed.'],
    ['allowNotifications',   'Notifications',       'The main pull back into the app.'],
    ['allowMessages',        'Direct messages',     'Actual conversations, not a recommendation feed.'],
    ['allowBookmarks',       'Bookmarks',           'Your own saved posts.'],
    ['allowLists',           'Lists',               'Curated, but still a feed.'],
    ['allowCommunities',     'Communities',         'Group feeds.'],
    ['allowCompose',         'Composer',            'Needed to write or reply from a link.'],
    ['allowEngagementLists', 'Likes / reposts / quotes', 'Who interacted with a post.']
  ];
  var STRIP = [
    ['hideDiscoverMore', 'Discover more',       'The recommended posts wedged in under the replies.'],
    ['hideSidebar',      'Right sidebar',       'Trends, who to follow, Premium upsell.'],
    ['hideWhoToFollow',  'Follow suggestions',  'Account recommendations inserted mid-thread.'],
    ['hideAds',          'Promoted posts',      'Ads in the conversation.'],
    ['hideNavFeeds',     'Feed links in the nav', 'Home, Explore, Notifications in the left rail.'],
    ['hideCounts',       'Engagement counts',   'Like, repost, reply and view numbers.']
  ];

  var defaults = globalThis.TDF.DEFAULTS;

  api.storage.sync.get(defaults, function (s) {
    render(document.getElementById('routes'), ROUTES, s);
    render(document.getElementById('strip'), STRIP, s);
  });

  function render(host, spec, s) {
    spec.forEach(function (row) {
      var key = row[0];
      var wrap = document.createElement('div');
      wrap.className = 'item';

      var box = document.createElement('input');
      box.type = 'checkbox';
      box.id = 'cb-' + key;
      box.checked = !!s[key];
      box.addEventListener('change', function () { save(key, box.checked); });

      var label = document.createElement('label');
      label.setAttribute('for', box.id);
      var name = document.createElement('span');
      name.className = 'name';
      name.textContent = row[1];
      var desc = document.createElement('span');
      desc.className = 'desc';
      desc.textContent = row[2];
      label.append(name, desc);

      wrap.append(box, label);
      host.append(wrap);
    });
  }

  var timer;
  function save(key, value) {
    var patch = {};
    patch[key] = value;
    api.storage.sync.set(patch, function () {
      var el = document.getElementById('saved');
      el.classList.add('on');
      clearTimeout(timer);
      timer = setTimeout(function () { el.classList.remove('on'); }, 1200);
    });
  }
})();
