(function () {
  'use strict';
  var menuToggle = document.getElementById('menuToggle');
  var navMenu = document.getElementById('navMenu');
  if (menuToggle && navMenu) {
    menuToggle.addEventListener('click', function () {
      var open = navMenu.classList.toggle('show');
      menuToggle.textContent = open ? '✕' : '☰';
      menuToggle.setAttribute('aria-expanded', String(open));
    });
    navMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navMenu.classList.remove('show');
        menuToggle.textContent = '☰';
        menuToggle.setAttribute('aria-expanded', 'false');
      });
    });
  }

  document.querySelectorAll('#newsletterForm').forEach(function (form) {
    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      var emailInput = form.querySelector('input[name="email"]');
      var button = form.querySelector('button[type="submit"], button:not([type])');
      var status = form.parentElement.querySelector('[data-newsletter-status]');
      if (!emailInput) return;
      if (status) { status.textContent = ''; status.className = 'newsletter-status'; }
      if (button) button.disabled = true;
      try {
        var response = await fetch('/api/newsletter', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: emailInput.value.trim() })
        });
        var data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Unable to subscribe right now.');
        if (status) { status.textContent = data.message; status.classList.add('success'); }
        emailInput.value = '';
      } catch (error) {
        if (status) { status.textContent = error.message || 'Could not reach the server. Please try again.'; status.classList.add('error'); }
      } finally {
        if (button) button.disabled = false;
      }
    });
  });
})();
