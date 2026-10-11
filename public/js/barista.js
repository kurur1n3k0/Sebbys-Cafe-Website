(function () {
  'use strict';
  var orders = [];
  var activeFilter = 'all';
  var refreshing = false;
  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };
  function node(tag, className, text) { var item = document.createElement(tag); if (className) item.className = className; if (text !== undefined && text !== null) item.textContent = text; return item; }
  function money(value) { return '₱' + Number(value || 0).toLocaleString('en-PH'); }
  function time(value) { var date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-PH'); }
  function status(message, kind) { $('#baristaStatus').textContent = message || ''; $('#baristaStatus').className = 'form-status' + (kind ? ' ' + kind : ''); }
  async function api(url, options) {
    options = options || {}; options.credentials = 'same-origin'; options.cache = 'no-store'; options.headers = options.headers || {};
    if (options.body && typeof options.body !== 'string') { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
    var response = await fetch(url, options); var data = await response.json();
    if (response.status === 401) { window.location.href = 'staff-login.html'; throw new Error('Please sign in again.'); }
    if (!response.ok) throw new Error(data.error || 'The request failed.');
    return data;
  }
  async function authorize() {
    try {
      var result = await api('/api/auth/me');
      if (!result.authenticated || !result.user || !['barista', 'admin'].includes(result.user.role)) { window.location.href = 'staff-login.html'; return false; }
      $('#staffUser').textContent = result.user.username + ' · ' + (result.user.role === 'admin' ? 'Admin' : 'Barista');
      return true;
    } catch (_) { window.location.href = 'staff-login.html'; return false; }
  }
  async function refresh(silent) {
    if (refreshing || document.hidden) return;
    refreshing = true;
    try {
      orders = await api('/api/barista/orders');
      render();
      if (!silent) status('Orders refreshed.', 'success');
    } catch (error) {
      if (!silent) status(error.message, 'error');
      if (silent) console.error('Background order refresh failed:', error);
    } finally { refreshing = false; }
  }
  function render() {
    var wrap = $('#ordersList'); wrap.replaceChildren();
    var visible = orders.filter(function (order) { return activeFilter === 'all' || order.status === activeFilter; });
    if (!visible.length) {
      var message = activeFilter === 'all' ? 'No active orders right now. New orders appear automatically.' : 'No ' + activeFilter + ' orders found.';
      wrap.appendChild(node('p', 'muted empty-cell', message));
      return;
    }
    visible.forEach(function (order) {
      var card = node('article', 'order-card order-' + order.status);
      var top = node('div', 'order-card-top'); var identity = node('div');
      identity.appendChild(node('span', 'order-number', order.number));
      identity.appendChild(node('h2', '', order.customerName));
      identity.appendChild(node('small', 'muted', 'Placed ' + time(order.createdAt)));
      top.appendChild(identity);
      top.appendChild(node('span', 'status-pill status-' + order.status, order.status === 'pending' ? 'Pending payment' : order.status === 'paid' ? 'Paid · In preparation' : 'Received'));
      card.appendChild(top);
      var list = node('ul', 'order-item-list');
      order.items.forEach(function (item) {
        var li = node('li'); li.appendChild(node('span', '', item.quantity + ' × ' + item.name)); li.appendChild(node('strong', '', money(item.subtotal))); list.appendChild(li);
      });
      card.appendChild(list);
      var bottom = node('div', 'order-card-bottom'); bottom.appendChild(node('span', 'order-total-label', 'Order total')); bottom.appendChild(node('strong', 'order-total', money(order.total))); card.appendChild(bottom);
      var actions = node('div', 'order-actions');
      if (order.status === 'pending') {
        var paid = node('button', 'btn primary-btn', 'Confirm payment'); paid.type = 'button'; paid.dataset.orderId = order.id; paid.dataset.nextStatus = 'paid'; actions.appendChild(paid);
      } else if (order.status === 'paid') {
        var received = node('button', 'btn primary-btn', 'Mark as received'); received.type = 'button'; received.dataset.orderId = order.id; received.dataset.nextStatus = 'received'; actions.appendChild(received);
      } else {
        actions.classList.add('order-actions-completed');
        actions.appendChild(node('p', 'received-note', '✓ Order completed'));
        var archive = node('button', 'archive-order-btn', 'Remove'); archive.type = 'button'; archive.dataset.archiveOrderId = order.id; actions.appendChild(archive);
      }
      card.appendChild(actions); wrap.appendChild(card);
    });
  }
  $$('.order-filters [data-order-status]').forEach(function (button) {
    button.addEventListener('click', function () {
      activeFilter = button.dataset.orderStatus;
      $$('.order-filters [data-order-status]').forEach(function (candidate) { var active = candidate === button; candidate.classList.toggle('active', active); candidate.setAttribute('aria-pressed', String(active)); });
      render();
    });
  });
  $('#refreshOrders').addEventListener('click', function () { refresh(false); });
  $('#ordersList').addEventListener('click', async function (event) {
    var button = event.target.closest('button[data-order-id], button[data-archive-order-id]'); if (!button) return;
    var archiveOrderId = button.dataset.archiveOrderId;
    if (archiveOrderId) {
      var confirmed = await window.SebbyDialogs.confirm({ title: 'Remove completed order?', message: 'Remove this order from the active barista queue? The order and its sales details will remain available in the manager’s history.', confirmText: 'Remove order', danger: true });
      if (!confirmed) return;
    }
    var label = button.textContent; button.disabled = true; button.textContent = 'Saving…'; status('');
    try {
      if (archiveOrderId) {
        await api('/api/barista/orders/' + encodeURIComponent(archiveOrderId) + '/archive', { method: 'PATCH', body: {} });
        await refresh(true); status('Order removed from the active queue. It remains in sales history.', 'success');
      } else {
        await api('/api/barista/orders/' + encodeURIComponent(button.dataset.orderId) + '/status', { method: 'PATCH', body: { status: button.dataset.nextStatus } });
        await refresh(true); status(button.dataset.nextStatus === 'paid' ? 'Payment marked as paid.' : 'Order marked as received.', 'success');
      }
    } catch (error) { button.disabled = false; button.textContent = label; status(error.message, 'error'); }
  });
  $('#logoutButton').addEventListener('click', async function () { try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) {} window.location.href = 'staff-login.html'; });
  authorize().then(function (ok) { if (ok) { refresh(true); window.setInterval(function () { refresh(true); }, 3000); document.addEventListener('visibilitychange', function () { if (!document.hidden) refresh(true); }); window.addEventListener('focus', function () { refresh(true); }); } });
})();
