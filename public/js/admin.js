(function () {
  'use strict';
  var state = { products: [], promotions: [], subscribers: [], customers: [], contacts: [], categories: [], orders: [], contactView: 'inbox', summary: null, knownSubscriberIds: null, newSubscriberIds: new Set(), liveBusy: false };
  var $ = function (selector) { return document.querySelector(selector); };
  var $$ = function (selector) { return Array.from(document.querySelectorAll(selector)); };
  var globalStatus = $('#adminGlobalStatus');
  var pendingImage = null;
  function money(n) { return '₱' + Number(n || 0).toLocaleString('en-PH'); }
  function dateTime(value) { if (!value) return '—'; var date = new Date(value); return Number.isNaN(date.getTime()) ? value : date.toLocaleString('en-PH'); }
  function node(tag, className, text) { var el = document.createElement(tag); if (className) el.className = className; if (text !== undefined && text !== null) el.textContent = text; return el; }
  function say(message, kind) { if (!globalStatus) return; globalStatus.textContent = message || ''; globalStatus.className = 'form-status global-status' + (kind ? ' ' + kind : ''); }
  async function api(url, options) {
    options = options || {}; options.credentials = 'same-origin'; options.cache = 'no-store'; options.headers = options.headers || {};
    if (options.body && !(options.body instanceof FormData) && typeof options.body !== 'string') { options.headers['Content-Type'] = 'application/json'; options.body = JSON.stringify(options.body); }
    var response = await fetch(url, options); var data;
    try { data = await response.json(); } catch (_) { data = {}; }
    if (response.status === 401) { window.location.href = 'staff-login.html'; throw new Error('Please sign in again.'); }
    if (!response.ok) throw new Error(data.error || 'The request failed.');
    return data;
  }
  async function requireAdmin() {
    try {
      var me = await api('/api/auth/me');
      if (!me.authenticated || !me.user || me.user.role !== 'admin') { window.location.href = 'staff-login.html'; return false; }
      $('#staffUser').textContent = me.user.username + ' · Admin';
      return true;
    } catch (_) { window.location.href = 'staff-login.html'; return false; }
  }
  function setVisiblePanel(panelId) {
    if (panelId === 'newsletterPanel' && state.newSubscriberIds) { state.newSubscriberIds.clear(); renderTabBadges(); }
    $$('.staff-tab[data-panel]').forEach(function (tab) { var active = tab.dataset.panel === panelId; tab.classList.toggle('active', active); tab.setAttribute('aria-selected', String(active)); });
    $$('.staff-panel').forEach(function (panel) { var active = panel.id === panelId; panel.hidden = !active; panel.classList.toggle('active', active); });
    say('');
    if (panelId === 'ordersPanel') loadOrderHistory().catch(function (error) { say(error.message, 'error'); });
    if (panelId === 'contactsPanel') loadContacts().catch(function (error) { say(error.message, 'error'); });
    if (panelId === 'newsletterPanel') loadSubscribers().catch(function (error) { say(error.message, 'error'); });
  }
  $$('.staff-tab[data-panel]').forEach(function (tab) { tab.addEventListener('click', function () { setVisiblePanel(tab.dataset.panel); }); });
  $('#logoutButton').addEventListener('click', async function () { try { await api('/api/auth/logout', { method: 'POST', body: {} }); } catch (_) {} window.location.href = 'staff-login.html'; });

  async function refreshSummary() {
    var data = await api('/api/admin/summary'); state.summary = data;
    var stats = $('#dashboardStats'); stats.replaceChildren();
    [['Menu items', data.products], ['Unread messages', data.unreadContacts], ['Subscribers', data.subscribers], ['Pending orders', data.pendingOrders]].forEach(function (pair) {
      var card = node('div', 'stat-card'); card.appendChild(node('span', '', pair[0])); card.appendChild(node('strong', '', pair[1])); stats.appendChild(card);
    });
    renderTabBadges();
  }
  async function loadCategories() {
    var categories = await api('/api/admin/categories');
    state.categories = categories;
    var select = $('#productCategory'); var current = select.value;
    select.replaceChildren();
    categories.forEach(function (category) { var option = document.createElement('option'); option.value = category; option.textContent = category; select.appendChild(option); });
    if (categories.includes(current)) select.value = current;
    else if (categories.includes('Coffee')) select.value = 'Coffee';
  }
  async function loadProducts() { state.products = await api('/api/admin/products'); renderProducts(); renderPromoChoices(); }
  function renderProducts() {
    var tbody = $('#productsTable'); tbody.replaceChildren();
    if (!state.products.length) { tbody.appendChild(tableMessage(5, 'No menu items found. Add the first item above.')); return; }
    state.products.forEach(function (product) {
      var tr = document.createElement('tr'); var nameCell = node('td', 'table-item');
      var image = node('img', 'table-thumb'); image.src = product.image || '/assets/sebbys-coffee.jpg'; image.alt = ''; nameCell.appendChild(image);
      var meta = node('div'); meta.appendChild(node('strong', '', product.name)); meta.appendChild(node('small', '', product.id)); nameCell.appendChild(meta); tr.appendChild(nameCell);
      tr.appendChild(node('td', '', product.category)); tr.appendChild(node('td', '', (product.variants && product.variants.length ? 'From ' : '') + money(product.price)));
      var availability = node('td'); availability.appendChild(node('span', 'status-pill ' + (product.available ? 'status-available' : 'status-unavailable'), product.available ? 'Available' : 'Unavailable')); tr.appendChild(availability);
      var actions = node('td', 'table-actions'); var edit = node('button', 'small-action', 'Edit'); edit.type = 'button'; edit.dataset.editProduct = product.id; var del = node('button', 'small-action danger-action', 'Delete'); del.type = 'button'; del.dataset.deleteProduct = product.id; actions.appendChild(edit); actions.appendChild(del); tr.appendChild(actions); tbody.appendChild(tr);
    });
  }
  function tableMessage(colspan, text) { var tr = document.createElement('tr'); var td = node('td', 'empty-cell', text); td.colSpan = colspan; tr.appendChild(td); return tr; }
  function variantsToText(variants) { return (variants || []).map(function (v) { return [v.id, v.name, v.price].join(' | '); }).join('\n'); }
  function variantsFromText(text) {
    if (!text.trim()) return [];
    return text.split(/\r?\n/).map(function (line) { var parts = line.split('|').map(function (part) { return part.trim(); }); if (parts.length < 3 || !parts[0] || !parts[1] || parts[2] === '') throw new Error('Variants must use: variant-id | Flavor name | price (one variant per line).'); var price = Number(parts[2]); if (!Number.isFinite(price) || price < 0) throw new Error('Variant prices must be non-negative numbers.'); return { id: parts[0], name: parts[1], price: price }; });
  }
  function resetProductForm() { $('#productForm').reset(); $('#productOriginalId').value = ''; $('#productAvailable').value = 'true'; $('#productForm').hidden = true; $('#productNewButton').textContent = '+ New menu item'; }
  function fillProductForm(product) {
    $('#productOriginalId').value = product ? product.id : '';
    $('#productName').value = product ? product.name : '';
    $('#productCategory').value = product ? product.category : 'Coffee';
    $('#productPrice').value = product ? product.price : '';
    $('#productAvailable').value = product ? String(product.available) : 'true';
    $('#productDescription').value = product ? product.description : '';
    $('#productImage').value = product ? product.image : '';
    $('#productVariants').value = product ? variantsToText(product.variants) : '';
    $('#productForm').hidden = false; $('#productNewButton').textContent = product ? 'Editing menu item' : '+ New menu item';
    $('#productName').focus();
  }
  $('#productNewButton').addEventListener('click', function () { fillProductForm(null); });
  $('#productCancelButton').addEventListener('click', resetProductForm);
  $('#addCategoryButton').addEventListener('click', async function () {
    var name = await window.SebbyDialogs.prompt({ title: 'Add a menu category', message: 'Create a category that can be assigned to menu items and shown as a filter on the public menu.', label: 'Category name', placeholder: 'e.g. Seasonal drinks', confirmText: 'Add category' });
    if (name === null) return;
    name = name.trim();
    if (!name) { say('Enter a category name.', 'error'); return; }
    try {
      var result = await api('/api/admin/categories', { method: 'POST', body: { name: name } });
      await loadCategories();
      $('#productCategory').value = result.category;
      say('Category “' + result.category + '” added. It will appear as a menu filter when a product uses it.', 'success');
    } catch (error) { say(error.message, 'error'); }
  });
  $('#productsTable').addEventListener('click', async function (event) {
    var edit = event.target.closest('[data-edit-product]'); var del = event.target.closest('[data-delete-product]');
    if (edit) { fillProductForm(state.products.find(function (p) { return p.id === edit.dataset.editProduct; })); return; }
    if (del) {
      var product = state.products.find(function (p) { return p.id === del.dataset.deleteProduct; });
      if (!product) return;
      var confirmed = await window.SebbyDialogs.confirm({ title: 'Delete menu item?', message: 'Remove “' + product.name + '” from the active menu? Existing order history will be retained.', confirmText: 'Delete item', danger: true });
      if (!confirmed) return;
      try { await api('/api/admin/products/' + encodeURIComponent(product.id), { method: 'DELETE' }); say('Menu item deleted.', 'success'); await loadProducts(); await refreshSummary(); } catch (error) { say(error.message, 'error'); }
    }
  });
  $('#productForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      var originalId = $('#productOriginalId').value;
      var payload = { id: originalId || undefined, name: $('#productName').value, category: $('#productCategory').value, categoryKey: categoryKey($('#productCategory').value), price: Number($('#productPrice').value), available: $('#productAvailable').value === 'true', description: $('#productDescription').value, image: $('#productImage').value.trim(), variants: variantsFromText($('#productVariants').value) };
      var url = originalId ? '/api/admin/products/' + encodeURIComponent(originalId) : '/api/admin/products';
      await api(url, { method: originalId ? 'PUT' : 'POST', body: payload }); resetProductForm(); say('Menu item saved successfully.', 'success'); await loadProducts(); await refreshSummary();
    } catch (error) { say(error.message, 'error'); }
  });
  function categoryKey(category) { return ({ 'Coffee': 'coffee', 'Non-Coffee': 'noncoffee', 'Pastry': 'pastry', 'Food': 'food', 'Christmas': 'christmas' })[category] || category.toLowerCase().replace(/[^a-z0-9]/g, ''); }
  async function uploadFor(input, target, nameInput, kind) {
    var file = input.files && input.files[0]; if (!file) return;
    if (file.size > 6 * 1024 * 1024) { say('Image must be 6 MB or smaller.', 'error'); input.value = ''; return; }
    var suggested = nameInput.value.trim();
    if (!suggested) {
      suggested = await window.SebbyDialogs.prompt({ title: kind === 'promotion' ? 'Name this promotion image' : 'Name this product image', message: 'The uploaded file will be saved in the assets folder using this name.', label: kind === 'promotion' ? 'Promotion title' : 'Product name', placeholder: kind === 'promotion' ? 'e.g. Holiday special' : 'e.g. Iced Ube Latte', confirmText: 'Continue' });
      if (!suggested || !suggested.trim()) { input.value = ''; return; }
      nameInput.value = suggested.trim();
    }
    var formData = new FormData();
    // Send the display name before the file so the backend saves it as sebbys-{slug}.{ext}.
    formData.append('name', nameInput.value.trim());
    formData.append('kind', kind);
    formData.append('image', file);
    try {
      var result = await api('/api/admin/upload', { method: 'POST', body: formData });
      pendingImage = { url: result.image, target: target, name: result.storedName || result.image, originalName: file.name };
      var modal = $('#uploadConfirmModal');
      if (modal) {
        $('#uploadConfirmPreview').src = result.image;
        $('#uploadConfirmPreview').alt = 'Preview of ' + file.name;
        $('#uploadConfirmText').textContent = 'Saved as ' + (result.storedName || result.image.split('/').pop()) + '. Confirm to attach it to this form.';
        modal.hidden = false;
        $('#confirmUseImage').focus();
      } else {
        target.value = result.image;
        say('Image uploaded as ' + (result.storedName || result.image.split('/').pop()) + '. Save the form to apply it.', 'success');
      }
    } catch (error) { say(error.message, 'error'); }
    finally { input.value = ''; }
  }
  function closeUploadConfirmation(apply) {
    var modal = $('#uploadConfirmModal');
    if (!pendingImage) { if (modal) modal.hidden = true; return; }
    if (apply) { pendingImage.target.value = pendingImage.url; say('Image ' + pendingImage.name + ' attached to the form. Save the form to apply it.', 'success'); }
    else say('Upload ' + pendingImage.name + ' was saved but not attached to this form.', '');
    pendingImage = null;
    if (modal) modal.hidden = true;
  }
  $('#confirmUseImage').addEventListener('click', function () { closeUploadConfirmation(true); });
  $('#cancelUseImage').addEventListener('click', function () { closeUploadConfirmation(false); });
  $('#uploadConfirmModal').addEventListener('click', function (event) { if (event.target.id === 'uploadConfirmModal') closeUploadConfirmation(false); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && !$('#uploadConfirmModal').hidden) closeUploadConfirmation(false); });
  $('#productImageFile').addEventListener('change', function () { uploadFor(this, $('#productImage'), $('#productName'), 'product'); });

  async function loadPromotions() { state.promotions = await api('/api/admin/promotions'); renderPromotions(); renderPromoChoices(); }
  function renderPromoChoices(selected) {
    var wrap = $('#promoProductChoices'); if (!wrap) return; wrap.replaceChildren();
    if (!state.products.length) { wrap.appendChild(node('p', 'muted', 'Load menu items before linking them.')); return; }
    state.products.forEach(function (product) {
      var label = node('label', 'checkbox-choice'); var input = document.createElement('input'); input.type = 'checkbox'; input.name = 'promoProductId'; input.value = product.id; input.checked = (selected || []).includes(product.id);
      label.appendChild(input); label.appendChild(node('span', '', product.name)); wrap.appendChild(label);
    });
  }
  function resetPromoForm() { $('#promoForm').reset(); $('#promoOriginalId').value = ''; $('#promoBackground').value = '#edf7ef'; $('#promoTextColor').value = '#315b46'; $('#promoForm').hidden = true; $('#promoNewButton').textContent = '+ New promotion'; renderPromoChoices([]); }
  function fillPromoForm(promo) {
    $('#promoOriginalId').value = promo ? promo.id : '';
    $('#promoTitleInput').value = promo ? promo.title : '';
    $('#promoLabelInput').value = promo ? promo.label : 'SPECIAL OFFER';
    $('#promoDescriptionInput').value = promo ? promo.description : '';
    $('#promoStart').value = promo ? promo.startDate : new Date().toISOString().slice(0, 10);
    $('#promoEnd').value = promo ? promo.endDate : new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
    $('#promoBackground').value = promo ? promo.backgroundColor : '#edf7ef'; $('#promoTextColor').value = promo ? promo.textColor : '#315b46';
    $('#promoImage').value = promo ? promo.image : ''; $('#promoCtaText').value = promo ? promo.ctaText : 'Explore the menu';
    renderPromoChoices(promo ? promo.productIds : []); $('#promoForm').hidden = false; $('#promoNewButton').textContent = promo ? 'Editing promotion' : '+ New promotion'; $('#promoTitleInput').focus();
  }
  $('#promoNewButton').addEventListener('click', function () { fillPromoForm(null); }); $('#promoCancelButton').addEventListener('click', resetPromoForm);
  $('#promoImageFile').addEventListener('change', function () { uploadFor(this, $('#promoImage'), $('#promoTitleInput'), 'promotion'); });
  function renderPromotions() {
    var wrap = $('#promotionsList'); wrap.replaceChildren();
    if (!state.promotions.length) { wrap.appendChild(node('p', 'muted', 'No promotions yet. Create one to publish it on the homepage during its date range.')); return; }
    state.promotions.forEach(function (promo) {
      var card = node('article', 'promo-admin-card'); card.style.backgroundColor = promo.backgroundColor; card.style.color = promo.textColor;
      if (promo.image) { var image = node('img', 'promo-admin-image'); image.src = promo.image; image.alt = ''; card.appendChild(image); }
      var body = node('div', 'promo-admin-body'); body.appendChild(node('span', 'promo-admin-label', promo.label)); body.appendChild(node('h3', '', promo.title)); body.appendChild(node('p', '', promo.description));
      body.appendChild(node('p', 'promo-dates', promo.startDate + ' → ' + promo.endDate));
      var today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Manila' });
      body.appendChild(node('span', 'status-pill ' + (promo.startDate <= today && promo.endDate >= today ? 'status-available' : 'status-unavailable'), promo.startDate <= today && promo.endDate >= today ? 'Active on website' : 'Scheduled / expired'));
      var menuNames = (promo.productIds || []).map(function (id) { var p = state.products.find(function (item) { return item.id === id; }); return p ? p.name : id; });
      body.appendChild(node('p', 'promo-included', 'Included: ' + (menuNames.length ? menuNames.join(', ') : 'No menu items linked')));
      var actions = node('div', 'record-actions'); var edit = node('button', 'small-action', 'Edit'); edit.type = 'button'; edit.dataset.editPromo = promo.id; var del = node('button', 'small-action danger-action', 'Delete'); del.type = 'button'; del.dataset.deletePromo = promo.id; actions.appendChild(edit); actions.appendChild(del); body.appendChild(actions); card.appendChild(body); wrap.appendChild(card);
    });
  }
  $('#promoForm').addEventListener('submit', async function (event) {
    event.preventDefault();
    try {
      var originalId = $('#promoOriginalId').value;
      var productIds = $$('input[name="promoProductId"]:checked').map(function (input) { return input.value; });
      var payload = { id: originalId || undefined, title: $('#promoTitleInput').value, label: $('#promoLabelInput').value, description: $('#promoDescriptionInput').value, startDate: $('#promoStart').value, endDate: $('#promoEnd').value, backgroundColor: $('#promoBackground').value, textColor: $('#promoTextColor').value, image: $('#promoImage').value.trim(), ctaText: $('#promoCtaText').value.trim() || 'Explore the menu', productIds: productIds };
      var url = originalId ? '/api/admin/promotions/' + encodeURIComponent(originalId) : '/api/admin/promotions';
      await api(url, { method: originalId ? 'PUT' : 'POST', body: payload }); resetPromoForm(); say('Promotion saved. It appears on the homepage only during its configured dates.', 'success'); await loadPromotions(); await refreshSummary();
    } catch (error) { say(error.message, 'error'); }
  });
  $('#promotionsList').addEventListener('click', async function (event) {
    var edit = event.target.closest('[data-edit-promo]'); var del = event.target.closest('[data-delete-promo]');
    if (edit) { fillPromoForm(state.promotions.find(function (promo) { return promo.id === edit.dataset.editPromo; })); return; }
    if (del) {
      var promo = state.promotions.find(function (item) { return item.id === del.dataset.deletePromo; });
      if (!promo) return;
      var confirmed = await window.SebbyDialogs.confirm({ title: 'Delete promotion?', message: 'Delete “' + promo.title + '” from the promotion list? This action cannot be undone.', confirmText: 'Delete promotion', danger: true });
      if (!confirmed) return;
      try { await api('/api/admin/promotions/' + encodeURIComponent(promo.id), { method: 'DELETE' }); say('Promotion deleted.', 'success'); await loadPromotions(); await refreshSummary(); } catch (error) { say(error.message, 'error'); }
    }
  });

  async function loadContacts(viewOverride) {
    var view = viewOverride || state.contactView;
    var incoming = await api('/api/admin/contacts?view=' + view);
    if (view === state.contactView) {
      var changed = JSON.stringify(state.contacts) !== JSON.stringify(incoming);
      state.contacts = incoming;
      if (changed || !$('#contactsList').dataset.rendered) { renderContacts(); $('#contactsList').dataset.rendered = 'true'; }
    }
    renderTabBadges();
  }
  function setTabBadge(selector, count, label) {
    var badge = $(selector);
    if (!badge) return;
    count = Math.max(0, Number(count) || 0);
    badge.textContent = count > 99 ? '99+' : String(count);
    badge.hidden = count === 0;
    badge.setAttribute('aria-label', label);
    badge.title = label;
  }
  function renderTabBadges() {
    var unread = state.summary ? Number(state.summary.unreadContacts || 0) : 0;
    setTabBadge('#contactUnreadBadge', unread, unread + ' unread contact message' + (unread === 1 ? '' : 's'));
    var freshSubscribers = state.newSubscriberIds.size;
    setTabBadge('#subscriberNewBadge', freshSubscribers, freshSubscribers + ' new subscriber' + (freshSubscribers === 1 ? '' : 's') + ' since this dashboard opened');
  }
  function renderContacts() {
    var wrap = $('#contactsList'); wrap.replaceChildren();
    if (!state.contacts.length) { wrap.appendChild(node('p', 'muted', state.contactView === 'trash' ? 'Trash is empty.' : 'There are no contact messages yet.')); return; }
    state.contacts.forEach(function (message) {
      var card = node('article', 'message-card' + (!message.readAt && state.contactView === 'inbox' ? ' message-unread' : ''));
      var heading = node('div', 'message-heading'); var titleWrap = node('div'); titleWrap.appendChild(node('h3', '', message.subject)); titleWrap.appendChild(node('p', 'message-byline', message.name + ' · ' + message.email)); heading.appendChild(titleWrap); heading.appendChild(node('small', '', dateTime(message.createdAt))); card.appendChild(heading);
      card.appendChild(node('p', 'message-copy', message.message)); card.appendChild(node('div', 'message-actions'));
      var actions = card.querySelector('.message-actions');
      if (state.contactView === 'trash') {
        var restore = node('button', 'small-action', 'Restore'); restore.type = 'button'; restore.dataset.restoreContact = message.id;
        var forever = node('button', 'small-action danger-action', 'Delete forever'); forever.type = 'button'; forever.dataset.foreverContact = message.id; actions.appendChild(restore); actions.appendChild(forever);
      } else {
        var read = node('button', 'small-action', message.readAt ? 'Mark unread' : 'Mark as read'); read.type = 'button'; read.dataset.readContact = message.id; read.dataset.action = message.readAt ? 'markUnread' : 'markRead'; actions.appendChild(read);
        var trash = node('button', 'small-action danger-action', 'Move to trash'); trash.type = 'button'; trash.dataset.trashContact = message.id; actions.appendChild(trash);
        actions.appendChild(node('span', 'message-read-state', message.readAt ? 'Read' : 'Unread'));
      }
      wrap.appendChild(card);
    });
  }
  $('#inboxButton').addEventListener('click', async function () { state.contactView = 'inbox'; $('#inboxButton').setAttribute('aria-pressed', 'true'); $('#trashButton').setAttribute('aria-pressed', 'false'); try { await loadContacts(); } catch (error) { say(error.message, 'error'); } });
  $('#trashButton').addEventListener('click', async function () { state.contactView = 'trash'; $('#inboxButton').setAttribute('aria-pressed', 'false'); $('#trashButton').setAttribute('aria-pressed', 'true'); try { await loadContacts(); } catch (error) { say(error.message, 'error'); } });
  $('#contactsList').addEventListener('click', async function (event) {
    var action = null; var method = null; var endpoint = null; var button = event.target.closest('button'); if (!button) return;
    if (button.dataset.readContact) { action = button.dataset.action; method = 'PATCH'; endpoint = '/api/admin/contacts/' + encodeURIComponent(button.dataset.readContact); }
    if (button.dataset.trashContact) { var moveToTrash = await window.SebbyDialogs.confirm({ title: 'Move message to trash?', message: 'This message will be removed from the inbox. You can restore it from Trash later.', confirmText: 'Move to trash', danger: true }); if (!moveToTrash) return; method = 'DELETE'; endpoint = '/api/admin/contacts/' + encodeURIComponent(button.dataset.trashContact); }
    if (button.dataset.restoreContact) { action = 'restore'; method = 'PATCH'; endpoint = '/api/admin/contacts/' + encodeURIComponent(button.dataset.restoreContact); }
    if (button.dataset.foreverContact) { var deleteForever = await window.SebbyDialogs.confirm({ title: 'Delete message permanently?', message: 'This message will be permanently deleted and cannot be restored.', confirmText: 'Delete forever', danger: true }); if (!deleteForever) return; method = 'DELETE'; endpoint = '/api/admin/contacts/' + encodeURIComponent(button.dataset.foreverContact) + '/forever'; }
    if (!endpoint) return;
    try { await api(endpoint, { method: method, body: method === 'PATCH' ? { action: action } : undefined }); await loadContacts(); await refreshSummary(); say('Contact inbox updated.', 'success'); }
    catch (error) { say(error.message, 'error'); }
  });

  async function loadSubscribers() {
    var incoming = await api('/api/admin/newsletter');
    if (state.knownSubscriberIds === null) state.knownSubscriberIds = new Set(incoming.map(function (record) { return record.id; }));
    else incoming.forEach(function (record) {
      if (!state.knownSubscriberIds.has(record.id)) { state.newSubscriberIds.add(record.id); state.knownSubscriberIds.add(record.id); }
    });
    var changed = JSON.stringify(state.subscribers) !== JSON.stringify(incoming);
    state.subscribers = incoming;
    if (changed || !$('#subscribersTable').dataset.rendered) { renderSubscribers(); $('#subscribersTable').dataset.rendered = 'true'; }
    renderTabBadges();
  }
  function renderSubscribers() {
    var tbody = $('#subscribersTable'); tbody.replaceChildren();
    if (!state.subscribers.length) { tbody.appendChild(tableMessage(2, 'No subscribers yet. Emails submitted in the footer are saved here.')); return; }
    state.subscribers.forEach(function (record) { var tr = document.createElement('tr'); tr.appendChild(node('td', '', record.email)); tr.appendChild(node('td', '', dateTime(record.subscribedAt))); tbody.appendChild(tr); });
  }
  $('#copySubscribersButton').addEventListener('click', async function () {
    var text = state.subscribers.map(function (record) { return record.email; }).join('\n'); var status = $('#subscriberStatus');
    if (!text) { status.textContent = 'There are no subscriber emails to copy yet.'; status.className = 'form-status error'; return; }
    try {
      if (navigator.clipboard && window.isSecureContext) await navigator.clipboard.writeText(text);
      else { var area = document.createElement('textarea'); area.value = text; area.style.position = 'fixed'; area.style.opacity = '0'; document.body.appendChild(area); area.select(); var ok = document.execCommand('copy'); area.remove(); if (!ok) throw new Error('Copy was blocked by this browser.'); }
      status.textContent = 'Copied ' + state.subscribers.length + ' subscriber email(s), one per line.'; status.className = 'form-status success';
    } catch (_) { status.textContent = 'Unable to copy automatically. Select and copy emails from the table.'; status.className = 'form-status error'; }
  });
  async function loadOrderHistory() {
    var tbody = $('#orderHistoryTable');
    try {
      var data = await api('/api/admin/orders');
      if (!data || !Array.isArray(data.orders) || !data.summary) {
        throw new Error('The backend returned an unexpected order-history response. Restart the updated backend and try again.');
      }
      var changed = JSON.stringify(state.orders) !== JSON.stringify(data.orders);
      state.orders = data.orders;
      var summary = $('#salesStats'); summary.replaceChildren();
      [['All-time orders', data.summary.totalOrders], ["Today's orders", data.summary.todayOrders], ["Today's recorded paid sales", money(data.summary.todayPaidSales)], ['Removed from barista queue', data.summary.archivedOrders]].forEach(function (pair) {
        var card = node('div', 'stat-card'); card.appendChild(node('span', '', pair[0])); card.appendChild(node('strong', '', pair[1])); summary.appendChild(card);
      });
      if (changed || !tbody.dataset.rendered || tbody.dataset.loadError === 'true') renderOrderHistoryTable();
      tbody.dataset.rendered = 'true';
      tbody.dataset.loadError = '';
      return data;
    } catch (error) {
      tbody.replaceChildren(tableMessage(8, 'Could not load sales history: ' + (error.message || 'Unknown error') + ' Check the server is running from the updated project folder, then select Refresh history.'));
      tbody.dataset.loadError = 'true';
      throw error;
    }
  }
  function renderOrderHistoryTable() {
    var tbody = $('#orderHistoryTable'); tbody.replaceChildren();
    if (!state.orders.length) { tbody.appendChild(tableMessage(8, 'No orders have been placed yet. Orders remain in this history even after being removed from the barista queue.')); return; }
    state.orders.forEach(function (order) {
      var tr = document.createElement('tr');
      tr.appendChild(node('td', '', order.number));
      tr.appendChild(node('td', '', dateTime(order.createdAt)));
      tr.appendChild(node('td', '', order.customerName));
      tr.appendChild(node('td', '', (order.items || []).reduce(function (sum, item) { return sum + Number(item.quantity || 0); }, 0) + ' item(s)'));
      tr.appendChild(node('td', '', order.paymentStatus === 'paid' ? 'Paid' : 'Unpaid'));
      tr.appendChild(node('td', '', order.status.charAt(0).toUpperCase() + order.status.slice(1)));
      tr.appendChild(node('td', '', money(order.total)));
      tr.appendChild(node('td', 'queue-state', order.archivedFromQueueAt ? 'Removed from queue' : 'In queue'));
      tbody.appendChild(tr);
    });
  }
  $('#refreshHistoryButton').addEventListener('click', async function () { try { await loadOrderHistory(); say('Sales history refreshed.', 'success'); } catch (error) { say(error.message, 'error'); } });

  async function loadCustomers() {
    state.customers = await api('/api/customers'); var tbody = $('#customersTable'); tbody.replaceChildren();
    state.customers.forEach(function (record) { var tr = document.createElement('tr'); tr.appendChild(node('td', '', record.id)); tr.appendChild(node('td', '', record.name)); tr.appendChild(node('td', '', record.email)); tr.appendChild(node('td', '', record.notes)); tbody.appendChild(tr); });
    if (!state.customers.length) tbody.appendChild(tableMessage(4, 'No sample customers found.'));
  }
  async function liveRefresh() {
    if (state.liveBusy || document.hidden) return;
    state.liveBusy = true;
    try {
      var tasks = [
        ['summary', refreshSummary()],
        ['contact inbox', loadContacts('inbox')],
        ['subscribers', loadSubscribers()]
      ];
      if (!$('#ordersPanel').hidden) tasks.push(['sales history', loadOrderHistory()]);
      var results = await Promise.allSettled(tasks.map(function (task) { return task[1]; }));
      results.forEach(function (result, index) {
        if (result.status === 'rejected') console.error('Admin background refresh failed for ' + tasks[index][0] + ':', result.reason);
      });
    } finally { state.liveBusy = false; }
  }
  async function init() {
    if (!(await requireAdmin())) return;
    // Refresh the working data quietly in the background, while visible.
    window.setInterval(function () { liveRefresh().catch(function (error) { console.error('Admin background refresh failed:', error); }); }, 3000);
    document.addEventListener('visibilitychange', function () { if (!document.hidden) liveRefresh().catch(function (error) { console.error('Admin background refresh failed:', error); }); });
    window.addEventListener('focus', function () { liveRefresh().catch(function (error) { console.error('Admin background refresh failed:', error); }); });
    var startup = [
      ['summary', refreshSummary()], ['categories', loadCategories()], ['menu', loadProducts()],
      ['promotions', loadPromotions()], ['contact inbox', loadContacts()],
      ['subscribers', loadSubscribers()], ['customer dataset', loadCustomers()]
    ];
    var results = await Promise.allSettled(startup.map(function (task) { return task[1]; }));
    var failures = [];
    results.forEach(function (result, index) {
      if (result.status === 'rejected') {
        failures.push(startup[index][0] + ': ' + (result.reason && result.reason.message ? result.reason.message : 'request failed'));
        console.error('Admin startup failed for ' + startup[index][0] + ':', result.reason);
      }
    });
    if (failures.length) say('Some dashboard data could not load. It will retry automatically. ' + failures.join(' | '), 'error');
  }
  init().catch(function (error) { say(error.message || 'Unable to initialize admin dashboard.', 'error'); console.error('Unable to initialize admin dashboard:', error); });
})();
