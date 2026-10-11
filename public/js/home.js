(function () {
  'use strict';
  var featuredGrid = document.getElementById('featuredGrid');
  var promoSection = document.querySelector('[data-promotion-section]');
  var money = function (amount) { return '₱' + Number(amount || 0).toLocaleString('en-PH'); };

  function element(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }
  function productCard(product) {
    var card = element('article', 'product-card');
    var imageWrap = element('div', 'product-image');
    var img = element('img'); img.src = product.image || '/assets/sebbys-coffee.jpg'; img.alt = product.name; img.loading = 'lazy';
    imageWrap.appendChild(img);
    var content = element('div', 'product-content');
    content.appendChild(element('span', 'product-category', product.category.toUpperCase()));
    content.appendChild(element('h3', '', product.name));
    content.appendChild(element('p', '', product.description));
    var bottom = element('div', 'product-bottom');
    bottom.appendChild(element('strong', '', (product.variants && product.variants.length ? 'From ' : '') + money(product.price)));
    var link = element('a', 'view-menu-link', 'View menu →'); link.href = 'menu.html';
    bottom.appendChild(link); content.appendChild(bottom); card.appendChild(imageWrap); card.appendChild(content);
    return card;
  }
  function promoDrink(product) {
    var card = element('div', 'promo-drink');
    card.appendChild(element('span', '', '☕'));
    var meta = element('div'); meta.appendChild(element('strong', '', product.name));
    meta.appendChild(element('small', '', product.available ? 'Included in this promotion' : 'Currently unavailable'));
    card.appendChild(meta);
    return card;
  }
  async function loadHome() {
    try {
      var responses = await Promise.all([fetch('/api/products'), fetch('/api/promotions/active')]);
      if (responses[0].ok) {
        var products = await responses[0].json();
        if (featuredGrid && Array.isArray(products)) {
          var preferred = ['spanish-latte', 'matcha-creme', 'blueberry-cheesecake'];
          var picks = preferred.map(function (id) { return products.find(function (p) { return p.id === id && p.available; }); }).filter(Boolean);
          if (picks.length < 3) picks = picks.concat(products.filter(function (p) { return p.available && !picks.some(function (chosen) { return chosen.id === p.id; }); }).slice(0, 3 - picks.length));
          featuredGrid.replaceChildren.apply(featuredGrid, picks.slice(0, 3).map(productCard));
        }
        window.SebbysProducts = Array.isArray(products) ? products : [];
      }
      if (responses[1].ok && promoSection) {
        var promos = await responses[1].json();
        if (!Array.isArray(promos) || !promos.length) { promoSection.hidden = true; return; }
        var promo = promos[0];
        promoSection.hidden = false;
        promoSection.style.background = promo.backgroundColor || '#edf7ef';
        promoSection.style.color = promo.textColor || '#315b46';
        var label = document.getElementById('promoLabel'); if (label) { label.textContent = promo.label || 'SPECIAL OFFER'; label.style.color = promo.textColor || '#315b46'; }
        var title = document.getElementById('promoTitle'); if (title) { title.textContent = promo.title; title.style.color = promo.textColor || '#315b46'; }
        var desc = document.getElementById('promoDescription'); if (desc) { desc.textContent = promo.description; desc.style.color = promo.textColor || '#315b46'; }
        var cta = document.getElementById('promoCta'); if (cta) cta.textContent = promo.ctaText || 'Explore the menu';
        var sticker = document.getElementById('promoSticker'); if (sticker) sticker.textContent = 'Limited time';
        var image = document.getElementById('promoImage');
        if (image) { image.src = promo.image || '/assets/sebbys-christmasdrinks.jpg'; image.alt = promo.title; }
        var list = document.getElementById('promoProducts');
        if (list) {
          list.replaceChildren();
          var currentProducts = window.SebbysProducts || [];
          (promo.productIds || []).map(function (id) { return currentProducts.find(function (p) { return p.id === id; }); }).filter(Boolean).forEach(function (p) { list.appendChild(promoDrink(p)); });
          if (!list.children.length) list.appendChild(element('div', 'promo-drink', 'Explore the full menu for this special.'));
        }
      }
    } catch (error) {
      // Static fallback copy remains visible if the API is temporarily unavailable.
      console.warn('Could not refresh homepage data:', error.message);
    }
  }
  loadHome();
})();
