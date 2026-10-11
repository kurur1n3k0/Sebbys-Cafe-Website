(function () {
  'use strict';
  var grid = document.getElementById('menuGrid');
  if (!grid) return;
  var count = document.getElementById('menuCount');
  var status = document.getElementById('menuStatus');
  var tabs = [];
  var tabsWrap = document.querySelector('.menu-tabs');
  function node(tag, className, text) { var n = document.createElement(tag); if (className) n.className = className; if (text !== undefined) n.textContent = text; return n; }
  function price(amount) { return '₱' + Number(amount).toLocaleString('en-PH'); }
  function cardFor(product) {
    var card = node('article', 'product-card' + (product.variants && product.variants.length ? ' has-flavors' : ''));
    card.dataset.category = product.categoryKey;
    var imageWrap = node('div', 'product-image'); var image = node('img'); image.src = product.image || '/assets/sebbys-coffee.jpg'; image.alt = product.name; image.loading = 'lazy';
    imageWrap.appendChild(image);
    var content = node('div', 'product-content'); content.appendChild(node('span', 'product-category', product.category.toUpperCase())); content.appendChild(node('h3', '', product.name));
    content.appendChild(node('p', 'product-description', product.description));
    var bottom = node('div', 'product-bottom'); bottom.appendChild(node('strong', '', (product.variants && product.variants.length ? 'From ' : '') + price(product.price)));
    if (product.variants && product.variants.length) bottom.appendChild(node('span', 'flavor-hint', product.variants.length + ' flavors'));
    var button = node('button', 'add-to-cart', product.available ? ((product.variants && product.variants.length) ? 'Choose flavor' : 'Add to cart') : 'Unavailable');
    button.type = 'button'; button.dataset.productId = product.id; button.disabled = !product.available; button.setAttribute('aria-label', (product.available ? 'Add ' : 'Unavailable: ') + product.name);
    bottom.appendChild(button); content.appendChild(bottom); card.appendChild(imageWrap); card.appendChild(content); return card;
  }
  function showCategory(category) {
    var shown = 0;
    Array.from(grid.children).forEach(function (card) { var match = category === 'all' || card.dataset.category === category; card.hidden = !match; if (match) shown++; });
    if (count) count.textContent = shown + (shown === 1 ? ' item' : ' items') + ' shown';
  }
  function bindTabs() {
    tabs = Array.from(document.querySelectorAll('.menu-tab'));
    tabs.forEach(function (tab) { tab.addEventListener('click', function () {
      tabs.forEach(function (button) { var active = button === tab; button.classList.toggle('primary-btn', active); button.classList.toggle('secondary-btn', !active); button.setAttribute('aria-pressed', String(active)); });
      showCategory(tab.dataset.filter);
    }); });
  }
  function renderTabs(products) {
    if (!tabsWrap) return;
    tabsWrap.replaceChildren();
    function addTab(label, filter, active) {
      var button = node('button', 'btn ' + (active ? 'primary-btn' : 'secondary-btn') + ' menu-tab', label);
      button.type = 'button'; button.dataset.filter = filter; button.setAttribute('aria-pressed', String(active)); tabsWrap.appendChild(button);
    }
    addTab('All', 'all', true);
    var seen = new Set();
    products.forEach(function (product) {
      var key = product.categoryKey || String(product.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (!key || seen.has(key)) return;
      seen.add(key);
    });
    var categoryData = [];
    products.forEach(function (product) {
      var key = product.categoryKey || String(product.category || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (key && !categoryData.some(function (entry) { return entry.key === key; })) categoryData.push({ key: key, label: product.category || key });
    });
    var order = ['coffee', 'noncoffee', 'pastry', 'food', 'christmas'];
    categoryData.sort(function (a, b) { var ai = order.indexOf(a.key); var bi = order.indexOf(b.key); if (ai < 0) ai = 99; if (bi < 0) bi = 99; return ai - bi || a.label.localeCompare(b.label); });
    categoryData.forEach(function (entry) { addTab(entry.key === 'christmas' ? 'Seasonal' : entry.label, entry.key, false); });
    bindTabs();
  }
  fetch('/api/products').then(function (response) { if (!response.ok) throw new Error('Menu could not be loaded.'); return response.json(); }).then(function (products) {
    window.SebbysProducts = products;
    grid.replaceChildren();
    products.forEach(function (product) { grid.appendChild(cardFor(product)); });
    renderTabs(products);
    showCategory('all');
    if (!products.length && status) status.textContent = 'No menu items are available yet.';
  }).catch(function (error) { if (status) status.textContent = error.message + ' Please refresh or contact the café.'; if (count) count.textContent = 'Menu unavailable'; });
})();
