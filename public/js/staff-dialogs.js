(function () {
  'use strict';

  var previousFocus = null;
  var activeResolve = null;
  var activeMode = 'confirm';
  var root = document.createElement('div');
  root.className = 'staff-dialog-backdrop';
  root.id = 'sebbyDialogBackdrop';
  root.hidden = true;
  root.innerHTML = '<section class="staff-dialog" role="dialog" aria-modal="true" aria-labelledby="sebbyDialogTitle" aria-describedby="sebbyDialogMessage">' +
    '<p class="section-label staff-dialog-eyebrow">SEBBY\'S CAFE</p>' +
    '<span class="staff-dialog-icon" aria-hidden="true">?</span>' +
    '<h2 id="sebbyDialogTitle">Please confirm</h2>' +
    '<p id="sebbyDialogMessage" class="staff-dialog-message"></p>' +
    '<form id="sebbyDialogForm" novalidate>' +
    '<div class="staff-dialog-input-wrap" hidden><label id="sebbyDialogInputLabel" for="sebbyDialogInput">Name</label><input id="sebbyDialogInput" type="text" maxlength="120" autocomplete="off"><p id="sebbyDialogError" class="staff-dialog-error" aria-live="polite"></p></div>' +
    '<div class="staff-dialog-actions"><button type="button" class="btn secondary-btn" id="sebbyDialogCancel">Cancel</button><button type="submit" class="btn primary-btn" id="sebbyDialogAccept">Confirm</button></div>' +
    '</form></section>';
  document.body.appendChild(root);

  var panel = root.querySelector('.staff-dialog');
  var form = root.querySelector('#sebbyDialogForm');
  var title = root.querySelector('#sebbyDialogTitle');
  var message = root.querySelector('#sebbyDialogMessage');
  var icon = root.querySelector('.staff-dialog-icon');
  var inputWrap = root.querySelector('.staff-dialog-input-wrap');
  var input = root.querySelector('#sebbyDialogInput');
  var inputLabel = root.querySelector('#sebbyDialogInputLabel');
  var error = root.querySelector('#sebbyDialogError');
  var cancelButton = root.querySelector('#sebbyDialogCancel');
  var acceptButton = root.querySelector('#sebbyDialogAccept');
  var actions = root.querySelector('.staff-dialog-actions');

  function finish(value) {
    if (!activeResolve) return;
    var resolve = activeResolve;
    activeResolve = null;
    root.hidden = true;
    document.removeEventListener('keydown', onKeydown, true);
    if (previousFocus && typeof previousFocus.focus === 'function') previousFocus.focus();
    previousFocus = null;
    resolve(value);
  }

  function cancelValue() { return activeMode === 'prompt' ? null : false; }

  function onKeydown(event) {
    if (event.key === 'Escape') {
      event.preventDefault();
      finish(cancelValue());
      return;
    }
    if (event.key !== 'Tab') return;
    var focusable = Array.from(panel.querySelectorAll('button:not([disabled]), input:not([disabled])')).filter(function (el) { return !el.closest('[hidden]'); });
    if (!focusable.length) return;
    var first = focusable[0];
    var last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function open(options, mode) {
    options = options || {};
    if (activeResolve) finish(cancelValue());
    activeMode = mode;
    previousFocus = document.activeElement;
    title.textContent = options.title || (mode === 'prompt' ? 'Enter a value' : mode === 'alert' ? 'Notice' : 'Please confirm');
    message.textContent = options.message || '';
    icon.textContent = options.icon || (options.danger ? '!' : mode === 'alert' ? '✓' : mode === 'prompt' ? '✎' : '?');
    icon.classList.toggle('is-danger', !!options.danger);
    inputWrap.hidden = mode !== 'prompt';
    input.value = options.value || '';
    input.placeholder = options.placeholder || '';
    inputLabel.textContent = options.label || 'Name';
    error.textContent = '';
    acceptButton.textContent = options.confirmText || (mode === 'prompt' ? 'Continue' : mode === 'alert' ? 'Okay' : 'Confirm');
    cancelButton.textContent = options.cancelText || 'Cancel';
    cancelButton.hidden = mode === 'alert';
    cancelButton.style.display = mode === 'alert' ? 'none' : '';
    acceptButton.classList.toggle('staff-dialog-confirm-danger', !!options.danger);
    actions.classList.toggle('staff-dialog-actions-single', mode === 'alert');
    root.hidden = false;
    document.addEventListener('keydown', onKeydown, true);

    return new Promise(function (resolve) {
      activeResolve = resolve;
      window.requestAnimationFrame(function () {
        if (mode === 'prompt') input.focus();
        else acceptButton.focus();
      });
    });
  }

  cancelButton.addEventListener('click', function () { finish(cancelValue()); });
  root.addEventListener('click', function (event) { if (event.target === root) finish(cancelValue()); });
  form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (activeMode === 'prompt') {
      var value = input.value.trim();
      if (!value) { error.textContent = 'Please enter a value before continuing.'; input.focus(); return; }
      finish(value);
    } else finish(true);
  });

  window.SebbyDialogs = {
    confirm: function (options) { return open(options, 'confirm'); },
    prompt: function (options) { return open(options, 'prompt'); },
    alert: function (options) { return open(options, 'alert'); }
  };
})();
