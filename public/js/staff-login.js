(function () {
  'use strict';
  var form = document.getElementById('staffLoginForm'); if (!form) return;
  var status = document.getElementById('loginStatus'); var button = document.getElementById('staffLoginButton');
  function destination(role) { window.location.href = role === 'admin' ? 'admin.html' : 'barista.html'; }
  fetch('/api/auth/me').then(function (r) { return r.json(); }).then(function (data) { if (data.authenticated && data.user) destination(data.user.role); }).catch(function () {});
  form.addEventListener('submit', async function (event) {
    event.preventDefault(); status.textContent = ''; status.className = 'form-status'; button.disabled = true; button.textContent = 'Signing in…';
    try {
      var response = await fetch('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username: form.username.value.trim(), password: form.password.value }) });
      var data = await response.json(); if (!response.ok) throw new Error(data.error || 'Sign in failed.'); destination(data.user.role);
    } catch (error) { status.textContent = error.message || 'Could not reach the backend.'; status.classList.add('error'); }
    finally { button.disabled = false; button.textContent = 'Sign in'; }
  });
})();
