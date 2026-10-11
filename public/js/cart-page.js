(function () {
  'use strict';
  var store = window.SebbysCart;
  if (!store) return;
  var layout = document.getElementById('cartLayout');
  var itemsList = document.getElementById('cartItems');
  var emptyMsg = document.getElementById('cartEmpty');
  var summaryBox = document.getElementById('checkoutForm');
  var summaryCount = document.getElementById('summaryCount');
  var totalEl = document.getElementById('cartTotal');
  var nameInput = document.getElementById('orderName');
  var checkoutBtn = document.getElementById('checkoutBtn');
  var clearBtn = document.getElementById('clearCart');
  var done = document.getElementById('cartDone');
  var checkoutStatus = document.getElementById('checkoutStatus');
  var submitted = false;
  function setStatus(message, kind) { if (!checkoutStatus) return; checkoutStatus.textContent = message || ''; checkoutStatus.className = 'form-status' + (kind ? ' ' + kind : ''); }
  function makeButton(label, act, aria) { var button = document.createElement('button'); button.type = 'button'; button.className = 'qty-btn'; button.dataset.act = act; button.textContent = label; button.setAttribute('aria-label', aria); return button; }
  function render() {
    var items = store.items(); var isEmpty = items.length === 0; itemsList.replaceChildren();
    items.forEach(function (item) {
      var li = document.createElement('li'); li.className = 'cart-item'; li.dataset.id = item.id;
      var img = document.createElement('img'); img.alt = ''; if (item.img) img.src = item.img; else img.hidden = true;
      var details = document.createElement('div'); var name = document.createElement('span'); name.className = 'cart-item-name'; name.textContent = item.name;
      var per = document.createElement('span'); per.className = 'cart-item-price'; per.textContent = store.money(item.price) + ' each';
      var qty = document.createElement('div'); qty.className = 'qty'; qty.appendChild(makeButton('−', 'minus', 'Fewer ' + item.name)); var number = document.createElement('span'); number.className = 'qty-num'; number.setAttribute('aria-live', 'polite'); number.textContent = item.qty; qty.appendChild(number); qty.appendChild(makeButton('+', 'plus', 'More ' + item.name));
      details.appendChild(name); details.appendChild(per); details.appendChild(qty);
      var totals = document.createElement('div'); var line = document.createElement('div'); line.className = 'cart-line-total'; line.textContent = store.money(item.price * item.qty); var remove = document.createElement('button'); remove.type = 'button'; remove.className = 'cart-remove'; remove.dataset.act = 'remove'; remove.textContent = 'Remove'; remove.setAttribute('aria-label', 'Remove ' + item.name); totals.appendChild(line); totals.appendChild(remove);
      li.appendChild(img); li.appendChild(details); li.appendChild(totals); itemsList.appendChild(li);
    });
    emptyMsg.hidden = !isEmpty; summaryBox.hidden = isEmpty; layout.classList.toggle('is-empty', isEmpty);
    summaryCount.textContent = store.count(); totalEl.textContent = store.money(store.total()); checkoutBtn.disabled = isEmpty || submitted;
  }
  itemsList.addEventListener('click', function (event) {
    var button = event.target.closest('button[data-act]'); if (!button) return;
    var id = button.closest('.cart-item').dataset.id;
    if (button.dataset.act === 'plus') store.changeQty(id, 1); else if (button.dataset.act === 'minus') store.changeQty(id, -1); else store.remove(id);
    setStatus('', '');
  });
  clearBtn.addEventListener('click', function () { store.clear(); setStatus('', ''); });
  summaryBox.addEventListener('submit', async function (event) {
    event.preventDefault(); if (submitted) return;
    var items = store.items(); if (!items.length) return;
    setStatus('', ''); submitted = true; checkoutBtn.disabled = true; checkoutBtn.textContent = 'Placing order…';
    try {
      var response = await fetch('/api/orders', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ customerName: nameInput.value.trim(), items: items.map(function (item) { return { productId: item.productId, variantId: item.variantId || null, quantity: item.qty }; }) }) });
      var data = await response.json(); if (!response.ok) throw new Error(data.error || 'Could not place your order.');
      var order = data.order;
      var list = document.getElementById('doneItems'); list.replaceChildren();
      order.items.forEach(function (item) { var li = document.createElement('li'); var left = document.createElement('span'); var right = document.createElement('span'); left.textContent = item.quantity + ' × ' + item.name; right.textContent = store.money(item.subtotal); li.appendChild(left); li.appendChild(right); list.appendChild(li); });
      document.getElementById('doneName').textContent = order.customerName; document.getElementById('doneNumber').textContent = order.number; document.getElementById('doneTotal').textContent = store.money(order.total);
      layout.hidden = true; done.hidden = false; store.clear(); window.scrollTo(0, 0);
    } catch (error) {
      submitted = false; checkoutBtn.textContent = 'Place order'; checkoutBtn.disabled = false; setStatus(error.message || 'Could not reach the server. Please try again.', 'error');
    }
  });
  store.onChange(render); render();
})();
