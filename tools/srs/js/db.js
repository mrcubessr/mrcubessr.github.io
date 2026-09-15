/* =============================================================
 * SRS · 存储层（IndexedDB）
 * -------------------------------------------------------------
 * 库 srs v1
 *   decks    {id,name,type,desc,config,created}
 *   cards    {id,deckId,front,back,hint,tags,dir,head, ...调度字段}
 *   reviews  {id(auto),cardId,deckId,ts,grade,prevInterval,nextInterval,elapsedMs}
 *   settings {k,v}
 * 全部 API 返回 Promise。
 * ============================================================= */
(function (root) {
  'use strict';
  var DB_NAME = 'srs', DB_VER = 1, db = null;

  function open() {
    if (db) return Promise.resolve(db);
    return new Promise(function (res, rej) {
      var req = indexedDB.open(DB_NAME, DB_VER);
      req.onupgradeneeded = function (e) {
        var d = e.target.result;
        if (!d.objectStoreNames.contains('decks')) {
          d.createObjectStore('decks', { keyPath: 'id' });
        }
        if (!d.objectStoreNames.contains('cards')) {
          var s = d.createObjectStore('cards', { keyPath: 'id' });
          s.createIndex('deckId', 'deckId', { unique: false });
          s.createIndex('due', 'due', { unique: false });
        }
        if (!d.objectStoreNames.contains('reviews')) {
          var r = d.createObjectStore('reviews', { keyPath: 'id', autoIncrement: true });
          r.createIndex('cardId', 'cardId', { unique: false });
          r.createIndex('deckId', 'deckId', { unique: false });
          r.createIndex('ts', 'ts', { unique: false });
        }
        if (!d.objectStoreNames.contains('settings')) {
          d.createObjectStore('settings', { keyPath: 'k' });
        }
      };
      req.onsuccess = function (e) { db = e.target.result; res(db); };
      req.onerror = function (e) { rej(e.target.error); };
    });
  }

  function tx(stores, mode) { return open().then(function (d) { return d.transaction(stores, mode); }); }

  function req2p(r) {
    return new Promise(function (res, rej) {
      r.onsuccess = function () { res(r.result); };
      r.onerror = function () { rej(r.error); };
    });
  }

  function done(t) {
    return new Promise(function (res, rej) {
      t.oncomplete = function () { res(); };
      t.onerror = function () { rej(t.error); };
      t.onabort = function () { rej(t.error || new Error('aborted')); };
    });
  }

  function getAll(store, indexName, key) {
    return tx([store], 'readonly').then(function (t) {
      var s = t.objectStore(store);
      var r = indexName ? s.index(indexName).getAll(key) : s.getAll();
      return req2p(r);
    });
  }

  function getOne(store, key) {
    return tx([store], 'readonly').then(function (t) {
      return req2p(t.objectStore(store).get(key));
    });
  }

  function put(store, val) {
    return tx([store], 'readwrite').then(function (t) {
      t.objectStore(store).put(val);
      return done(t);
    });
  }

  function putMany(store, arr, chunk) {
    chunk = chunk || 400;
    var i = 0;
    function step() {
      if (i >= arr.length) return Promise.resolve();
      var slice = arr.slice(i, i + chunk); i += chunk;
      return tx([store], 'readwrite').then(function (t) {
        var os = t.objectStore(store);
        slice.forEach(function (v) { os.put(v); });
        return done(t);
      }).then(step);
    }
    return step();
  }

  function del(store, key) {
    return tx([store], 'readwrite').then(function (t) {
      t.objectStore(store).delete(key);
      return done(t);
    });
  }

  function clear(store) {
    return tx([store], 'readwrite').then(function (t) {
      t.objectStore(store).clear();
      return done(t);
    });
  }

  function count(store, indexName, key) {
    return tx([store], 'readonly').then(function (t) {
      var s = t.objectStore(store);
      var r = indexName ? s.index(indexName).count(key) : s.count();
      return req2p(r);
    });
  }

  var API = {
    open: open,

    /* ---------- decks ---------- */
    getDecks: function () { return getAll('decks'); },
    getDeck: function (id) { return getOne('decks', id); },
    putDeck: function (d) { return put('decks', d); },
    delDeck: function (id) {
      return API.getCards(id).then(function (cards) {
        return tx(['cards', 'decks'], 'readwrite').then(function (t) {
          var cs = t.objectStore('cards');
          cards.forEach(function (c) { cs.delete(c.id); });
          t.objectStore('decks').delete(id);
          return done(t);
        });
      });
    },

    /* ---------- cards ---------- */
    getCards: function (deckId) {
      return getAll('cards', 'deckId', deckId).then(function (arr) {
        arr.sort(function (a, b) { return (a.created || 0) - (b.created || 0); });
        return arr;
      });
    },
    getAllCards: function () { return getAll('cards'); },
    getCard: function (id) { return getOne('cards', id); },
    putCard: function (c) { return put('cards', c); },
    putCards: function (arr) { return putMany('cards', arr); },
    delCard: function (id) { return del('cards', id); },
    delCards: function (ids) {
      return tx(['cards'], 'readwrite').then(function (t) {
        var cs = t.objectStore('cards');
        ids.forEach(function (id) { cs.delete(id); });
        return done(t);
      });
    },
    clearCards: function (deckId) {
      return API.getCards(deckId).then(function (cards) {
        return API.delCards(cards.map(function (c) { return c.id; }));
      });
    },
    countCards: function (deckId) { return count('cards', 'deckId', deckId); },

    /* ---------- reviews ---------- */
    addReview: function (r) { return put('reviews', r); },
    getReviews: function () { return getAll('reviews'); },
    getReviewsByDeck: function (deckId) { return getAll('reviews', 'deckId', deckId); },
    getReviewsSince: function (ts) {
      return getAll('reviews').then(function (all) {
        return all.filter(function (r) { return r.ts >= ts; });
      });
    },

    /* ---------- settings ---------- */
    getSetting: function (k, def) {
      return getOne('settings', k).then(function (o) {
        return o && o.v !== undefined ? o.v : def;
      });
    },
    setSetting: function (k, v) { return put('settings', { k: k, v: v }); },

    /* ---------- 备份 / 恢复 ---------- */
    dump: function () {
      return Promise.all([getAll('decks'), getAll('cards'), getAll('reviews'), getAll('settings')])
        .then(function (r) {
          return { v: 1, exportedAt: Date.now(), decks: r[0], cards: r[1], reviews: r[2], settings: r[3] };
        });
    },
    restore: function (data, mode) {
      // mode: 'merge'(默认，按 id 覆盖) | 'replace'(先清空)
      return open().then(function () {
        var p = Promise.resolve();
        if (mode === 'replace') {
          p = Promise.all([clear('decks'), clear('cards'), clear('reviews')]);
        }
        return p.then(function () {
          return Promise.all([
            putMany('decks', data.decks || []),
            putMany('cards', data.cards || []),
            putMany('reviews', (data.reviews || []).map(function (r) {
              var o = {}; for (var k in r) if (k !== 'id') o[k] = r[k]; return o;
            }))
          ]);
        });
      });
    },
    wipe: function () {
      return Promise.all([clear('decks'), clear('cards'), clear('reviews'), clear('settings')]);
    }
  };

  root.SRSDB = API;
})(window);
