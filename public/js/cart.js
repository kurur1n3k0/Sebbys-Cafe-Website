(function () {
  'use strict';
  var store = window.SebbysCart;
  if (!store) return;
  var grid = document.getElementById('menuGrid');
  var toast = document.getElementById('cartToast');
  var timer;
  var modal = document.getElementById('flavorModal');
  var form = document.getElementById('flavorForm');
  var options = document.getElementById('flavorOptions');
  var title = document.getElementById('flavorTitle');
  var photo = document.getElementById('flavorPhoto');
  var addButton = document.getElementById('flavorAdd');
  var cancelButton = document.getElementById('flavorCancel');
  var selectedProduct = null;

  function notify(message) {
    if (!toast) return;
    toast.textContent = message; toast.classList.add('show'); clearTimeout(timer);
    timer = setTimeout(function () { toast.classList.remove('show'); }, 2200);
  }
  function cartItem(product, variant) {
    return { id: product.id + (variant ? '--' + variant.id : ''), productId: product.id, variantId: variant ? variant.id : null,
      name: product.name + (variant ? ' (' + variant.name + ')' : ''), price: variant ? variant.price : product.price, img: product.image || '' };
  }
  function addProduct(product, variant, button) {
    store.add(cartItem(product, variant));
    notify((product.name + (variant ? ' (' + variant.name + ')' : '')) + ' added to your cart.');
    if (button) {
      var old = button.textContent; button.classList.add('added'); button.textContent = 'Added ✓';
      window.setTimeout(function () { button.classList.remove('added'); if (button.isConnected) button.textContent = old; }, 1000);
    }
  }
  function chosenVariant() { var selected = form && form.querySelector('input[name="flavor"]:checked'); return selected && selected.value; }
  function updateAddLabel() {
    var selected = form && form.querySelector('input[name="flavor"]:checked');
    var variant = selected && selected.dataset.price;
    if (addButton) addButton.textContent = selected ? 'Add to cart · ₱' + Number(variant).toLocaleString('en-PH') : 'Add to cart';
  }
  function openFlavor(product, button) {
    if (!modal || !form || !options) { addProduct(product, null, button); return; }
    selectedProduct = { product: product, button: button };
    title.textContent = product.name;
    if (product.image) { photo.src = product.image; photo.alt = product.name; photo.hidden = false; } else photo.hidden = true;
    options.replaceChildren();
    product.variants.forEach(function (variant, index) {
      var label = document.createElement('label'); label.className = 'flavor-option';
      var input = document.createElement('input'); input.type = 'radio'; input.name = 'flavor'; input.value = variant.id; input.dataset.price = variant.price; input.checked = index === 0;
      var meta = document.createElement('span'); var name = document.createElement('span'); name.textContent = variant.name; var cost = document.createElement('span'); cost.className = 'flavor-price'; cost.textContent = store.money(variant.price);
      meta.appendChild(name); meta.appendChild(cost); label.appendChild(input); label.appendChild(meta); options.appendChild(label);
    });
    updateAddLabel(); modal.classList.add('open'); modal.setAttribute('aria-hidden', 'false');
    var first = form.querySelector('input[name="flavor"]'); if (first) first.focus();
  }
  function closeFlavor() { if (!modal) return; modal.classList.remove('open'); modal.setAttribute('aria-hidden', 'true'); if (selectedProduct && selectedProduct.button) selectedProduct.button.focus(); selectedProduct = null; }
  if (grid) grid.addEventListener('click', function (event) {
    var button = event.target.closest('button.add-to-cart'); if (!button || button.disabled) return;
    var product = (window.SebbysProducts || []).find(function (p) { return p.id === button.dataset.productId; });
    if (!product || !product.available) { notify('This menu item is currently unavailable.'); return; }
    if (product.variants && product.variants.length) openFlavor(product, button); else addProduct(product, null, button);
  });
  if (form) form.addEventListener('submit', function (event) {
    event.preventDefault();
    if (!selectedProduct) return;
    var variantId = chosenVariant();
    var variant = selectedProduct.product.variants.find(function (item) { return item.id === variantId; });
    if (!variant) return;
    addProduct(selectedProduct.product, variant, selectedProduct.button); closeFlavor();
  });
  if (options) options.addEventListener('change', updateAddLabel);
  if (cancelButton) cancelButton.addEventListener('click', closeFlavor);
  if (modal) modal.addEventListener('click', function (event) { if (event.target === modal) closeFlavor(); });
  document.addEventListener('keydown', function (event) { if (event.key === 'Escape' && modal && modal.classList.contains('open')) closeFlavor(); });
})();
