(function () {
  'use strict';
  var form = document.getElementById('contactForm'); if (!form) return;
  var status = document.getElementById('contactStatus'); var button = document.getElementById('contactSubmit');
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); status.textContent = ''; status.className = 'form-status'; button.disabled = true; button.textContent = 'Sending…';
    var payload = Object.fromEntries(new FormData(form).entries());
    try {
      var response = await fetch('/api/contact', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      var data = await response.json(); if (!response.ok) throw new Error(data.error || 'Your message could not be sent.');
      status.textContent = data.message + ' Our team will review it shortly.'; status.classList.add('success'); form.reset();
    } catch (error) { status.textContent = error.message || 'Could not reach the server. Please try again.'; status.classList.add('error'); }
    finally { button.disabled = false; button.textContent = 'Send message'; }
  });
})();
