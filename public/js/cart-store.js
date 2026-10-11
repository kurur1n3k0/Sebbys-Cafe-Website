(function () {
  'use strict';
  var KEY = 'sebbysCartV2';
  var listeners = [];
  function read() {
    try {
      var saved = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(saved) ? saved.filter(function (item) { return item && typeof item.id === 'string' && Number(item.price) >= 0 && Number.isInteger(item.qty) && item.qty > 0; }) : [];
    } catch (_) { return []; }
  }
  var items = read();
  function write() { try { localStorage.setItem(KEY, JSON.stringify(items)); } catch (_) { /* Cart remains usable for this page session. */ } }
  function find(id) { return items.find(function (item) { return item.id === id; }) || null; }
  function count() { return items.reduce(function (sum, item) { return sum + item.qty; }, 0); }
  function total() { return items.reduce(function (sum, item) { return sum + item.qty * item.price; }, 0); }
  function money(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }
  function updateBadge() {
    var badge = document.getElementById('cartCount'); var button = document.getElementById('cartBtn'); var n = count();
    if (badge) { badge.textContent = n; badge.hidden = n === 0; }
    if (button) button.setAttribute('aria-label', 'Open cart, ' + n + (n === 1 ? ' item' : ' items'));
  }
  function changed() { write(); updateBadge(); listeners.slice().forEach(function (listener) { listener(items.slice()); }); }
  function add(item) {
    var existing = find(item.id);
    if (existing) existing.qty = Math.min(99, existing.qty + 1);
    else items.push({ id: item.id, productId: item.productId, variantId: item.variantId || null, name: item.name, price: Number(item.price), img: item.img || '', qty: 1 });
    changed();
  }
  function changeQty(id, delta) {
    var item = find(id); if (!item) return;
    item.qty += delta;
    if (item.qty < 1) remove(id); else if (item.qty > 99) item.qty = 99;
    changed();
  }
  function remove(id) { items = items.filter(function (item) { return item.id !== id; }); changed(); }
  function clear() { items = []; changed(); }
  window.addEventListener('storage', function (event) { if (event.key === KEY) { items = read(); updateBadge(); listeners.slice().forEach(function (listener) { listener(items.slice()); }); } });
  updateBadge();
  window.SebbysCart = { items: function () { return items.slice(); }, add: add, changeQty: changeQty, remove: remove, clear: clear, count: count, total: total, money: money, onChange: function (fn) { listeners.push(fn); } };
})();
