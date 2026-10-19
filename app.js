/* Zach Store: storefront logic. Routing, the collection and its budget ruler, compare, cart, checkout and business quotes. */
(() => {
  'use strict';

  // ── Config ────────────────────────────────────────────────────────────────
  // Demo setup: shows the "DEMO SITE" banner and the "nothing is sent" notes on forms.
  // Set to false only once real products, contact details, payments and form delivery are in place.
  const DEMO_MODE = true;
  const W1_PRICE = 1899;
  const BULK_MIN = 8;
  const BULK_RATE = 0.1;
  const PROMO_CODE = 'WELCOME5';
  const PROMO_RATE = 0.05;
  const MAX_COMPARE = 4;
  const CART_KEY = 'zach.cart';

  const PRODUCTS = [
    { id: 'w1', cat: 'LAPTOP', name: 'MUSONY W1', price: W1_PRICE, stock: 'In stock', img: './assets/w1-plate-640.webp', imgPos: 'center', s: { display: '16" 2.5K IPS, 120 Hz', chip: 'Core Ultra 7 + RTX 4090', memory: '120 GB RAM', storage: 'TBC', battery: '99 Wh, up to 15 hr', camera: 'TBC' }, why: 'Desktop-class graphics and a 15-hour battery in one machine.' },
    { id: 'redmi', cat: 'PHONE', name: 'Redmi Note 13 5G', price: 199, stock: 'In stock', best: true, img: './assets/redmi-plate.webp', imgPos: 'center 22%', s: { display: '6.67" AMOLED, 120 Hz', chip: 'Dimensity 6080', memory: '6 GB', storage: '128 GB', battery: '5,000 mAh', camera: '108 MP main' }, why: '120 Hz AMOLED and a 108 MP camera for under $200.' },
    { id: 'm35', cat: 'PHONE', name: 'Samsung Galaxy M35', price: 229, stock: 'In stock', s: { display: '6.6" Super AMOLED, 120 Hz', chip: 'Exynos 1380', memory: '6 GB', storage: '128 GB', battery: '6,000 mAh', camera: '50 MP main' }, why: 'The biggest battery we sell: two days of use for $30 more than the Redmi.' },
    { id: 'ideapad', cat: 'LAPTOP', name: 'Lenovo IdeaPad Slim 3', price: 459, stock: 'In stock', best: true, s: { display: '15.6" FHD IPS', chip: 'Ryzen 5 7520U', memory: '8 GB', storage: '512 GB SSD', battery: 'Up to 10 hr', camera: '720p' }, why: 'A full 512 GB SSD in a slim, light body. Our pick for everyday work.' },
    { id: 'hp', cat: 'LAPTOP', name: 'HP 15s Ryzen 5', price: 529, stock: 'Only 5 left', low: true, img: './assets/hp-plate.webp', imgPos: 'center 42%', s: { display: '15.6" FHD', chip: 'Ryzen 5 5500U, 6-core', memory: '16 GB', storage: '512 GB SSD', battery: 'Up to 9 hr', camera: '720p' }, why: 'Six cores for heavier spreadsheets and multitasking.' },
    { id: 'charger', cat: 'ACCESSORY', name: '65 W USB-C charger', price: 29, stock: 'In stock', acc: true, rows: [{ k: 'Output', v: '65 W, USB-C PD' }, { k: 'Works with', v: 'Phones & USB-C laptops' }], why: 'One charger for your phone and laptop.' },
    { id: 'sleeve', cat: 'ACCESSORY', name: 'Laptop sleeve 15.6"', price: 19, stock: 'In stock', acc: true, rows: [{ k: 'Fits', v: 'Up to 15.6" laptops' }, { k: 'Material', v: 'Padded, water-resistant' }], why: 'Protects the screen in a bag for less than a repair costs.' },
    { id: 'mouse', cat: 'ACCESSORY', name: 'Wireless mouse', price: 15, stock: 'In stock', acc: true, rows: [{ k: 'Connection', v: '2.4 GHz USB receiver' }, { k: 'Battery', v: '12 months, AA' }], why: 'Quiet clicks, a year per battery.' },
  ];
  const KEYS = [['display', 'Display'], ['chip', 'Processor'], ['memory', 'Memory'], ['storage', 'Storage'], ['battery', 'Battery'], ['camera', 'Camera']];
  const BUDGET_KEY = 'zach.budget';
  // Route → where it lands. Categories land on the first object of that kind on the wall.
  const SECTIONS = {
    collection: 'collection', shop: 'collection',
    accessories: 'p-mouse', phones: 'p-redmi', laptops: 'p-ideapad',
    w1: 'w1', business: 'business', questions: 'questions', visit: 'visit', contact: 'visit',
  };
  const TITLES = {
    home: 'Zach Store, Chennai: phones and laptops with the full price on every label',
    about: 'Our story | Zach Store, Chennai',
    checkout: 'Checkout | Zach Store',
  };

  // ── Helpers ───────────────────────────────────────────────────────────────
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const byId = id => PRODUCTS.find(p => p.id === id);
  const r2 = n => Math.round(n * 100) / 100;
  const fmt = n => '$' + r2(n).toLocaleString('en-US', { minimumFractionDigits: r2(n) % 1 ? 2 : 0, maximumFractionDigits: 2 });
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const setText = (sel, text) => $$(sel).forEach(el => { el.textContent = text; });
  const setHidden = (sel, hidden) => $$(sel).forEach(el => { el.hidden = hidden; });

  const storage = {
    get(key, fallback) {
      try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode etc. */ }
    },
  };

  function cleanCart(raw) {
    const cart = {};
    for (const [id, qty] of Object.entries(raw || {})) {
      if (byId(id) && Number.isInteger(qty) && qty > 0) cart[id] = Math.min(qty, 999);
    }
    return cart;
  }

  // ── State ─────────────────────────────────────────────────────────────────
  const state = {
    page: 'home',
    cart: cleanCart(storage.get(CART_KEY, {})),
    cartOpen: false,
    compare: [],
    compareNote: '',
    compareOpen: false,
    promo: false,
    promoMsg: '',
    delivery: 'Ship',
    pay: 'Card',
    placed: null,
    qN: 10,
    qSent: false,
    budget: storage.get(BUDGET_KEY, 500),
  };
  if (!(state.budget >= 10 && state.budget <= 2000)) state.budget = 500;
  let lastFocus = null;
  // The scroll engine drives the home page's acts. Without it the page is still complete, just still.
  const sc = window.ScrollCraft ? window.ScrollCraft.mount(document.body) : null;

  function totals() {
    const lines = Object.entries(state.cart).map(([id, qty]) => {
      const p = byId(id);
      const gross = p.price * qty;
      return { p, id, qty, gross, bulk: qty >= BULK_MIN ? gross * BULK_RATE : 0 };
    });
    const subtotal = lines.reduce((a, l) => a + l.gross, 0);
    const bulk = lines.reduce((a, l) => a + l.bulk, 0);
    const promo = state.promo ? (subtotal - bulk) * PROMO_RATE : 0;
    const count = lines.reduce((a, l) => a + l.qty, 0);
    return { lines, subtotal, bulk, promo, total: subtotal - bulk - promo, count };
  }

  // ── Rendering ─────────────────────────────────────────────────────────────
  function render() {
    // Re-rendered lists replace their buttons; remember which one had focus so keyboard users keep their place.
    const active = document.activeElement;
    const focusKey = active && active.dataset && active.dataset.action
      ? [active.dataset.action, active.dataset.id || '', active.dataset.value || ''] : null;

    const t = totals();
    setText('[data-cart-count]', t.count);
    syncProducts();
    renderTotals(t);
    renderCart(t);
    renderSummary(t);
    renderCheckoutState();
    renderCompare();
    renderQuote();
    renderBudget(t);
    document.body.classList.toggle('is-locked', state.cartOpen || (state.compareOpen && state.compare.length > 1));
    storage.set(CART_KEY, state.cart);

    if (focusKey && !active.isConnected) {
      const match = $$(`[data-action="${focusKey[0]}"]`).find(el => (el.dataset.id || '') === focusKey[1] && (el.dataset.value || '') === focusKey[2]);
      if (match) match.focus();
    }
  }

  // The collection is static markup (it is what search engines read); this only syncs button state.
  function syncProducts() {
    $$('[data-action="add"][data-id]').forEach(btn => {
      if (btn.closest('.compare-table')) return;
      const qty = state.cart[btn.dataset.id] || 0;
      btn.textContent = qty ? `In cart (${qty})` : 'Add to cart';
    });
    $$('[data-action="toggle-compare"]').forEach(btn => {
      const on = state.compare.includes(btn.dataset.id);
      btn.setAttribute('aria-pressed', String(on));
      btn.textContent = on ? 'Comparing' : 'Compare';
    });
  }

  function renderTotals(t) {
    setText('[data-subtotal]', fmt(t.subtotal));
    setText('[data-bulk]', fmt(t.bulk));
    setText('[data-promo]', fmt(t.promo));
    setText('[data-total]', fmt(t.total));
    setHidden('[data-bulk-row]', t.bulk <= 0);
    setHidden('[data-promo-row]', t.promo <= 0);
  }

  function renderCart(t) {
    $('#cart-overlay').hidden = !state.cartOpen;
    $('#cart-checkout').disabled = t.count === 0;
    if (!t.count) {
      $('#cart-lines').innerHTML = '<p class="drawer-empty">Your cart is empty.</p>';
      return;
    }
    $('#cart-lines').innerHTML = t.lines.map(l => {
      const note = l.bulk ? '10% bulk discount applied' : l.qty >= 5 ? `Add ${BULK_MIN - l.qty} more for 10% off` : '';
      const thumb = l.p.img ? ` style="background-image:url('${l.p.img}')"` : '';
      return `<div class="line">
        <div class="line-thumb"${thumb} aria-hidden="true"></div>
        <div class="line-info">
          <span class="line-name">${esc(l.p.name)}</span>
          <div class="qty">
            <button type="button" class="btn-x" data-action="dec" data-id="${l.id}" aria-label="Decrease quantity of ${esc(l.p.name)}">−</button>
            <span class="qty-val" aria-label="Quantity">${l.qty}</span>
            <button type="button" class="btn-x" data-action="inc" data-id="${l.id}" aria-label="Increase quantity of ${esc(l.p.name)}">+</button>
          </div>
          ${note ? `<span class="line-note">${note}</span>` : ''}
        </div>
        <div class="line-side">
          <span>${fmt(l.gross)}</span>
          <button type="button" class="btn-text" data-action="remove" data-id="${l.id}">Remove</button>
        </div>
      </div>`;
    }).join('');
  }

  function renderSummary(t) {
    $('#summary-lines').innerHTML = t.count
      ? t.lines.map(l => `<div class="summary-line"><span>${l.qty} × ${esc(l.p.name)}</span><span>${fmt(l.gross)}</span></div>`).join('')
      : '<p class="summary-empty">Your cart is empty. <a href="#/shop">Browse the shop</a>.</p>';
    $('#place-order').disabled = t.count === 0;
    $('#promo-msg').textContent = state.promoMsg;
  }

  function renderCheckoutState() {
    $('#order-confirm').hidden = !state.placed;
    $('#checkout-body').hidden = !!state.placed;
    if (state.placed) {
      setText('[data-order="no"]', state.placed.no);
      setText('[data-order="total"]', state.placed.total);
    }
    $$('[data-seg]').forEach(group => {
      const current = state[group.dataset.seg];
      $$('.seg-btn', group).forEach(b => b.setAttribute('aria-pressed', String(b.dataset.value === current)));
    });
    // Hidden panels are also disabled so their required fields don't block submission.
    $$('[data-panel]').forEach(panel => {
      const [key, value] = panel.dataset.panel.split(':');
      const off = state[key] !== value;
      panel.hidden = off;
      panel.disabled = off;
    });
  }

  function renderCompare() {
    const n = state.compare.length;
    const showBar = n > 0 && state.page === 'home';
    $('#compare-bar').hidden = !showBar;
    document.body.classList.toggle('has-compare-bar', showBar);
    $('#compare-msg').textContent = state.compareNote ||
      (n < 2 ? 'Pick one more device to compare.' : `Comparing ${n} devices (up to ${MAX_COMPARE}).`);
    $('#compare-open-btn').disabled = n < 2;

    const open = state.compareOpen && n > 1;
    $('#compare-overlay').hidden = !open;
    if (!open) return;
    const items = state.compare.map(byId);
    const minPrice = Math.min(...items.map(p => p.price));
    $('#compare-table').innerHTML = `
      <thead><tr><th></th>${items.map(p => `<th class="product-col" scope="col">${esc(p.name)}</th>`).join('')}</tr></thead>
      <tbody>
        <tr><td>Price</td>${items.map(p => `<td${p.price === minPrice ? ' class="cheapest"' : ''}>${fmt(p.price)}</td>`).join('')}</tr>
        ${KEYS.map(([k, label]) => `<tr><td>${label}</td>${items.map(p => `<td>${esc(p.s[k])}</td>`).join('')}</tr>`).join('')}
        <tr><td></td>${items.map(p => `<td><button type="button" class="btn btn-primary" data-action="add" data-id="${p.id}">Add</button></td>`).join('')}</tr>
      </tbody>`;
  }

  function renderQuote() {
    const qN = Math.max(1, Math.floor(+state.qN) || 1);
    const discount = qN >= BULK_MIN ? BULK_RATE : 0;
    const unit = W1_PRICE * (1 - discount);
    setText('[data-q="tier"]', discount ? '10% bulk price' : 'List price');
    setText('[data-q="total"]', fmt(unit * qN));
    setText('[data-q="units"]', qN + (qN === 1 ? ' unit' : ' units'));
    setText('[data-q="unit"]', fmt(unit));
    setText('[data-q="note"]', discount ? `You save ${fmt(W1_PRICE * discount * qN)}.` : `Add ${BULK_MIN - qN} more for 10% off.`);
    $('#quote-form').hidden = state.qSent;
    $('#quote-success').hidden = !state.qSent;
  }

  // ── The collection: rail geometry and the budget ruler ─────────────────────
  // The ruler is logarithmic, $10 to $2,000, so a $15 mouse and a $1,899 laptop both get room.
  const R_MIN = 10, R_MAX = 2000;
  const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const pos = price => Math.log(price / R_MIN) / Math.log(R_MAX / R_MIN);
  const priceAt = f => {
    const raw = R_MIN * Math.pow(R_MAX / R_MIN, f);
    const step = raw < 100 ? 5 : raw < 1000 ? 10 : 50;
    return Math.max(R_MIN, Math.min(R_MAX, Math.round(raw / step) * step));
  };
  const SHORT = { mouse: 'Mouse', sleeve: 'Sleeve', charger: 'Charger', redmi: 'Redmi Note 13', m35: 'Galaxy M35', ideapad: 'IdeaPad Slim 3', hp: 'HP 15s', w1: 'MUSONY W1' };
  const gallery = { act: $('#collection'), rail: $('#rail'), stage: $('.collection-stage'), input: $('#budget') };
  const railTravel = () => (gallery.rail.scrollWidth - window.innerWidth) * (1 + (parseFloat(gallery.rail.dataset.scPan) || 0));

  // Where the page must be scrolled for an element of the rail to sit at the left gutter.
  function railTargetY(el) {
    const { act, rail } = gallery;
    const travel = railTravel();
    const gutter = parseFloat(getComputedStyle(rail).paddingLeft) || 0;
    const p = travel > 0 ? Math.min(1, Math.max(0, (el.offsetLeft - gutter) / travel)) : 0;
    const top = act.getBoundingClientRect().top + window.scrollY;
    return top + p * Math.max(0, act.offsetHeight - window.innerHeight);
  }

  function showOnWall(el, smooth) {
    const behavior = smooth && !reduceMotion() ? 'smooth' : 'instant';
    if (reduceMotion()) {
      // Without motion the rail is an ordinary horizontal scroll region.
      window.scrollTo({ top: gallery.act.getBoundingClientRect().top + window.scrollY, behavior });
      gallery.stage.scrollTo({ left: Math.max(0, el.offsetLeft - 16), behavior });
      return;
    }
    window.scrollTo({ top: railTargetY(el), behavior });
  }

  function buildRuler() {
    const majors = [10, 50, 100, 500, 1000, 2000];
    const minors = [20, 30, 40, 60, 70, 80, 90, 200, 300, 400, 600, 700, 800, 900, 1500];
    $('#ruler-scale').innerHTML =
      minors.map(v => `<i class="ruler-tick" style="left:${(pos(v) * 100).toFixed(2)}%"></i>`).join('') +
      majors.map(v => `<i class="ruler-tick ruler-tick--major" style="left:${(pos(v) * 100).toFixed(2)}%"><span>${fmt(v)}</span></i>`).join('');
    $('#ruler-marks').innerHTML = PRODUCTS.map(p =>
      `<button type="button" class="ruler-mark" data-mark="${p.id}" style="left:${(pos(p.price) * 100).toFixed(2)}%" aria-label="${esc(p.name)}, ${fmt(p.price)}. Show it on the wall"><span class="ruler-mark-tip">${esc(SHORT[p.id])} · ${fmt(p.price)}</span></button>`
    ).join('');
    gallery.input.value = String(Math.round(pos(state.budget) * 1000));
    layoutMarks();
  }

  // Neighbouring prices (the two phones, the two everyday laptops) get staggered rows on narrow rulers.
  function layoutMarks() {
    const width = $('#ruler-marks').offsetWidth;
    let lastX = -99, row = 0;
    $$('.ruler-mark').forEach(m => {
      const x = pos(byId(m.dataset.mark).price) * width;
      row = x - lastX < 16 ? 1 - row : 0;
      m.style.top = row ? '-10px' : '2px';
      lastX = x;
    });
  }

  function renderBudget(t) {
    const b = state.budget;
    const fits = PRODUCTS.filter(p => p.price <= b);
    $$('.obj[data-id]').forEach(el => {
      const p = byId(el.dataset.id);
      const over = p.price > b;
      el.classList.toggle('is-over', over);
      $('[data-budget-line]', el).textContent = over ? `Over your budget by ${fmt(p.price - b)}`
        : p.price === b ? 'Exactly your budget' : `Leaves you ${fmt(b - p.price)}`;
    });
    $$('.ruler-mark').forEach(m => m.classList.toggle('is-over', byId(m.dataset.mark).price > b));
    $('#budget-out').textContent = fmt(b);
    gallery.input.setAttribute('aria-valuetext', `${fmt(b)}. ${fits.length} of ${PRODUCTS.length} fit.`);
    gallery.input.style.setProperty('--fill', `calc(10px + (100% - 20px) * ${pos(b).toFixed(4)})`);
    const picks = PRODUCTS.filter(p => p.best && p.price <= b);
    $('#budget-sum').textContent = !fits.length
      ? `Nothing on the wall fits ${fmt(b)} yet. The wireless mouse is ${fmt(byId('mouse').price)}.`
      : `${fits.length} of ${PRODUCTS.length} fit.` + (picks.length
        ? ` Zach's ${picks.length > 1 ? 'picks' : 'pick'} inside it: ${picks.map(p => `${p.name} leaves ${fmt(b - p.price)}`).join(', ')}.`
        : '');
    $('#drawer-budget').textContent = t && t.count
      ? `Your budget is ${fmt(b)}. This cart is ${t.total <= b ? fmt(b - t.total) + ' under' : fmt(t.total - b) + ' over'} it.`
      : '';
  }

  // The bracket on the ruler marks the price range currently on the wall.
  function renderView() {
    const { act, rail, stage } = gallery;
    if (state.page !== 'home' || !act.offsetHeight) return;
    const r = act.getBoundingClientRect();
    document.body.classList.toggle('on-collection', r.top < window.innerHeight * 0.5 && r.bottom > window.innerHeight * 0.5);
    const p = Math.min(1, Math.max(0, -r.top / Math.max(1, act.offsetHeight - window.innerHeight)));
    const x0 = reduceMotion() ? stage.scrollLeft : railTravel() * p;
    // An object counts as on the wall once roughly two thirds of it is in view.
    const seen = $$('.obj', rail).filter(o => {
      const slack = o.offsetWidth * 0.35;
      return o.offsetLeft >= x0 - slack && o.offsetLeft + o.offsetWidth <= x0 + window.innerWidth + slack;
    });
    const view = $('#ruler-view');
    if (!seen.length) { view.style.width = '0'; return; }
    const prices = seen.map(o => +o.dataset.price);
    const a = pos(Math.min(...prices)), b = pos(Math.max(...prices));
    view.style.left = `calc(10px + (100% - 20px) * ${a.toFixed(4)} - 7px)`;
    view.style.width = `calc((100% - 20px) * ${(b - a).toFixed(4)} + 14px)`;
  }

  let viewQueued = false;
  function queueView() {
    if (viewQueued) return;
    viewQueued = true;
    requestAnimationFrame(() => { viewQueued = false; renderView(); });
  }

  // ── Routing (hash based: #/, #/about, #/checkout, #/collection, #/phones, #/w1, #/business…) ──
  function parseHash() {
    const h = location.hash.replace(/^#\/?/, '');
    if (h === 'about' || h === 'checkout') return { page: h };
    if (SECTIONS[h]) return { page: 'home', section: SECTIONS[h] };
    return { page: 'home' };
  }

  function scrollToSection(id, smooth) {
    const el = id && document.getElementById(id);
    if (el && el.classList.contains('obj')) { showOnWall(el, smooth); return; }
    // Pinned acts are entered at their top: their stage already clears the bar.
    const pinned = el && el.hasAttribute('data-sc-act') && el.getAttribute('data-sc-act') !== 'flow';
    const offset = pinned ? 0 : $('.bar').offsetHeight;
    const top = el ? el.getBoundingClientRect().top + window.scrollY - offset : 0;
    window.scrollTo({ top: Math.max(0, top), behavior: smooth && !reduceMotion() ? 'smooth' : 'instant' });
  }

  function applyRoute(smooth) {
    const { page, section } = parseHash();
    // A fresh visit to checkout with items in the cart starts a new order.
    if (page === 'checkout' && Object.keys(state.cart).length) state.placed = null;
    state.page = page;
    state.cartOpen = false;
    state.compareOpen = false;
    $$('main[data-page]').forEach(m => { m.hidden = m.dataset.page !== page; });
    $$('.bar-index a[data-page-link]').forEach(a => {
      if (a.dataset.pageLink === page) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    });
    document.title = TITLES[page];
    render();
    // The acts may have been measured while their page was hidden; measure again.
    if (sc) sc.layout();
    if (page === 'home') layoutMarks();
    scrollToSection(section, smooth); // reading layout here forces reflow, so the new page is measured correctly
    queueView();
  }

  function navigate(href) {
    if (location.hash !== href) history.pushState(null, '', href);
    applyRoute(true);
  }

  // ── Cart & overlays ───────────────────────────────────────────────────────
  function setQty(id, qty) {
    if (qty <= 0) delete state.cart[id];
    else state.cart[id] = Math.min(qty, 999);
  }

  function openOverlay(name) {
    lastFocus = document.activeElement;
    state.cartOpen = name === 'cart';
    state.compareOpen = name === 'compare';
    render();
    const closeBtn = $(`#${name}-overlay [data-action="close-${name}"]`);
    if (closeBtn) closeBtn.focus();
  }

  function closeOverlays() {
    state.cartOpen = false;
    state.compareOpen = false;
    render();
    if (lastFocus && lastFocus.isConnected) lastFocus.focus();
    lastFocus = null;
  }

  function applyPromo() {
    const code = $('#promo-input').value.trim().toUpperCase();
    state.promo = code === PROMO_CODE;
    state.promoMsg = !code ? 'Enter a promo code.' : state.promo ? `${PROMO_CODE} applied: 5% off.` : 'That code isn’t valid.';
    render();
  }

  // ── Events ────────────────────────────────────────────────────────────────
  document.addEventListener('click', e => {
    const link = e.target.closest('a[href^="#"]');
    if (link) {
      const href = link.getAttribute('href');
      if (href === '#visit') {
        e.preventDefault();
        if (state.cartOpen || state.compareOpen) closeOverlays();
        scrollToSection('visit', true);
        return;
      }
      if (href.startsWith('#/')) {
        e.preventDefault();
        navigate(href);
        return;
      }
    }

    const overlay = e.target.closest('[data-overlay]');
    if (overlay && e.target === overlay) { closeOverlays(); return; }

    const seg = e.target.closest('[data-seg] .seg-btn');
    if (seg) {
      state[seg.closest('[data-seg]').dataset.seg] = seg.dataset.value;
      render();
      return;
    }

    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    const { action, id, value } = btn.dataset;
    switch (action) {
      case 'add':
        setQty(id, (state.cart[id] || 0) + 1);
        openOverlay('cart');
        break;
      case 'inc': setQty(id, (state.cart[id] || 0) + 1); render(); break;
      case 'dec': setQty(id, (state.cart[id] || 0) - 1); render(); break;
      case 'remove': setQty(id, 0); render(); break;
      case 'filter': state.filter = value; render(); break;
      case 'toggle-compare':
        state.compareNote = '';
        if (state.compare.includes(id)) state.compare = state.compare.filter(x => x !== id);
        else if (state.compare.length >= MAX_COMPARE) state.compareNote = `You can compare up to ${MAX_COMPARE} devices. Remove one first.`;
        else state.compare = [...state.compare, id];
        render();
        break;
      case 'clear-compare': state.compare = []; state.compareNote = ''; render(); break;
      case 'open-compare': openOverlay('compare'); break;
      case 'close-compare':
      case 'close-cart': closeOverlays(); break;
      case 'open-cart': openOverlay('cart'); break;
      case 'checkout': navigate('#/checkout'); break;
      case 'apply-promo': applyPromo(); break;
      case 'quote-reset':
        state.qSent = false;
        ['#q-company', '#q-contact', '#q-reach', '#q-notes'].forEach(sel => { $(sel).value = ''; });
        render();
        $('#q-units').focus();
        break;
    }
  });

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && (state.cartOpen || state.compareOpen)) closeOverlays();
  });

  $('#promo-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); applyPromo(); }
  });

  $('#checkout-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = totals();
    if (!t.count) return;
    state.placed = { no: 'ZS-' + Math.floor(10000 + Math.random() * 90000), total: fmt(t.total) };
    state.cart = {};
    state.promo = false;
    state.promoMsg = '';
    state.delivery = 'Ship';
    state.pay = 'Card';
    e.target.reset();
    $('#promo-input').value = '';
    render();
    window.scrollTo({ top: 0 });
  });

  const qRange = $('#q-range');
  const qUnits = $('#q-units');
  qRange.addEventListener('input', () => { state.qN = qRange.value; qUnits.value = qRange.value; renderQuote(); });
  qUnits.addEventListener('input', () => {
    state.qN = qUnits.value;
    qRange.value = Math.min(100, Math.max(1, +qUnits.value || 1));
    renderQuote();
  });
  $('#quote-form').addEventListener('submit', e => {
    e.preventDefault();
    state.qSent = true;
    renderQuote();
  });

  gallery.input.addEventListener('input', () => {
    state.budget = priceAt(+gallery.input.value / 1000);
    storage.set(BUDGET_KEY, state.budget);
    renderBudget(totals());
  });
  $('#ruler-marks').addEventListener('click', e => {
    const m = e.target.closest('.ruler-mark');
    if (m) showOnWall(document.getElementById('p-' + m.dataset.mark), true);
  });
  // Keyboard focus inside the rail walks the rail to that object, so focus never lands off screen.
  gallery.rail.addEventListener('focusin', e => {
    const obj = e.target.closest('.obj, .rail-end');
    if (!obj || reduceMotion()) return;
    const r = obj.getBoundingClientRect();
    if (r.left >= 0 && r.right <= window.innerWidth) return;
    window.scrollTo({ top: railTargetY(obj), behavior: 'instant' });
  });
  window.addEventListener('scroll', queueView, { passive: true });
  window.addEventListener('resize', () => { layoutMarks(); queueView(); }, { passive: true });
  gallery.stage.addEventListener('scroll', queueView, { passive: true });

  window.addEventListener('hashchange', () => applyRoute(false));
  // Keep the cart in sync when the store is open in more than one tab.
  window.addEventListener('storage', e => {
    if (e.key === CART_KEY) { state.cart = cleanCart(storage.get(CART_KEY, {})); render(); }
  });

  // ── Boot ──────────────────────────────────────────────────────────────────
  if ('scrollRestoration' in history) history.scrollRestoration = 'manual';
  buildRuler();
  if (!DEMO_MODE) $$('#demo-banner, .demo-only').forEach(el => el.remove());
  setText('[data-w1-price]', fmt(W1_PRICE));
  setText('[data-w1-bulk]', fmt(W1_PRICE * (1 - BULK_RATE)));
  applyRoute(false);
})();
