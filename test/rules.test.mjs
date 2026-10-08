// Run: node --test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

globalThis.window = globalThis;
createRequire(import.meta.url)('../extension/src/rules.js');
const { classify, DEFAULTS } = globalThis.TDF;

const allowed = (path, ctx) => classify(path, '', DEFAULTS, ctx).allow;
const LOGGED_OUT = { loggedIn: false };

test('single posts and their media open', () => {
  for (const p of ['/jack/status/20', '/i/status/20', '/i/web/status/20', '/jack/status/20/photo/1']) {
    assert.ok(allowed(p), p);
  }
});

test('feeds and discovery are blocked', () => {
  for (const p of ['/', '/home', '/explore', '/i/trending', '/search', '/notifications',
                   '/jack', '/jack/with_replies', '/i/bookmarks', '/jack/status/20/likes',
                   '/i/connect_people', '/i/grok']) {
    assert.ok(!allowed(p), p);
  }
});

test('logged out, x.com/ is the sign-in page and must open', () => {
  assert.ok(allowed('/', LOGGED_OUT));
  assert.ok(allowed('/home', LOGGED_OUT));
  // ...but being logged out does not open anything else
  assert.ok(!allowed('/explore', LOGGED_OUT));
  assert.ok(!allowed('/jack', LOGGED_OUT));
});

test('no ctx means logged in: unknown login state must never unblock', () => {
  assert.ok(!allowed('/'));
  assert.ok(!allowed('/', {}));
});

test('login and account pages always open', () => {
  for (const p of ['/login', '/logout', '/i/flow/login', '/i/flow/signup', '/account/access',
                   '/settings/blocked/all']) {
    assert.ok(allowed(p), p);
  }
});

test('"Sign in with X" on other sites works', () => {
  for (const p of ['/i/oauth2/authorize', '/oauth/authorize', '/oauth/authenticate']) {
    assert.ok(allowed(p), p);
  }
});

test('DMs follow the messages setting on both URL forms', () => {
  for (const p of ['/messages', '/i/chat', '/i/chat/123-456']) {
    assert.ok(allowed(p), p);
    assert.ok(!classify(p, '', { ...DEFAULTS, allowMessages: false }).allow, p + ' when disabled');
  }
  assert.ok(!allowed('/i/chatter'), 'prefix must not overmatch');
});

test('legal pages open, bare and localized', () => {
  for (const p of ['/tos', '/privacy', '/en/tos', '/de/privacy', '/pt-br/tos']) {
    assert.ok(allowed(p), p);
  }
});
