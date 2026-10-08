(function () {
  'use strict';
  var api = (typeof browser !== 'undefined' && browser.runtime) ? browser : chrome;
  var q = new URLSearchParams(location.search);

  var COPY = {
    feed:       ['This is a feed, not a post', 'Feeds are the whole reason X eats an afternoon.'],
    discovery:  ['This is a discovery surface', 'Explore, trending and search exist to hand you the next thing.'],
    engagement: ['This is an engagement screen', 'Counts, notifications and liker lists are the slot-machine layer.'],
    upsell:     ['This is an upsell', 'Nothing to read here.']
  };
  var kind = q.get('kind') || 'feed';
  var copy = COPY[kind] || COPY.feed;

  document.getElementById('title').textContent = copy[0];
  var reason = q.get('reason');
  document.getElementById('detail').textContent =
    copy[1] + (reason ? ' Blocked: ' + reason + '.' : '');

  var path = q.get('path') || '/';
  document.getElementById('path').textContent = 'x.com' + path;

  document.getElementById('back').addEventListener('click', function () {
    // The block used location.replace, so the blocked URL is not in history:
    // one step back lands on whatever the user was reading before.
    if (history.length > 1) history.back();
    else window.close();
  });
  document.getElementById('settings').addEventListener('click', function () {
    if (api.runtime.openOptionsPage) api.runtime.openOptionsPage();
    else location.href = api.runtime.getURL('src/options.html');
  });
})();
