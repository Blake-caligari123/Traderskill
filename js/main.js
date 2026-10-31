/* Duneglass storefront logic: configurator, cart, animations. */
(function () {
  // ---------------------------------------------------------------------------
  // STORE CONFIG — edit these to match your supplier costs and payment setup.
  // ---------------------------------------------------------------------------
  const CONFIG = {
    currency: 'A$',
    freeShippingThreshold: 100,
    shippingFee: 9.95,
    // Quantity-break bundles (applied automatically on total cart quantity)
    tiers: [
      { qty: 1, off: 0, label: '1 frame', sub: 'Just for me' },
      { qty: 2, off: 0.15, label: '2 frames', sub: 'Save 15% · Most popular', badge: 'Most popular' },
      { qty: 3, off: 0.2, label: '3 frames', sub: 'Save 20% · Best value', badge: 'Best value' },
    ],
    // Paste a Shopify / Stripe Payment Link / checkout URL here when ready.
    checkoutUrl: '',
    // POST endpoint for newsletter sign-ups (Klaviyo, Mailchimp, etc.).
    newsletterEndpoint: '',
  };

  const SIZES = [
    { id: 'petite', name: 'Petite', inch: '7″', price: 89 },
    { id: 'classic', name: 'Classic', inch: '10″', price: 119 },
    { id: 'grand', name: 'Grand', inch: '12″', price: 149 },
  ];

  const PALETTES = {
    ocean: { name: 'Deep Ocean', sand: ['#0d1f4a', '#2456b8', '#7aa7e6', '#eef3fa', '#05070d', '#d4a64a'], weights: [3, 3, 2, 2, 2, 0.3], bg: ['#2f7c83', '#113a41'], glow: '#2f8f99' },
    desert: { name: 'Desert Gold', sand: ['#3b2414', '#8f5424', '#d79a4f', '#f5e6c8', '#0d0906', '#f0c75e'], weights: [3, 3, 2, 2, 1.5, 0.4], bg: ['#c99a5e', '#5c3818'], glow: '#d99a4e' },
    midnight: { name: 'Midnight', sand: ['#0a0b0e', '#3a3f4a', '#8b93a3', '#f4f4f0', '#1d2028', '#cfd3dc'], weights: [3, 2, 2, 2, 2, 0.4], bg: ['#56677a', '#1a222c'], glow: '#7f93ad' },
    blush: { name: 'Blush', sand: ['#4a1530', '#a83c66', '#ea8fac', '#fcf0f2', '#16080f', '#dcb46a'], weights: [3, 3, 2, 2, 1.5, 0.3], bg: ['#a85574', '#40162a'], glow: '#e0809f' },
  };

  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const money = (n) => CONFIG.currency + (Number.isInteger(n) ? n : n.toFixed(2));
  const round2 = (n) => Math.round(n * 100) / 100;

  const state = { palette: 'ocean', size: 'petite', tier: 1 };

  // ---------------------------------------------------------------------------
  // SAND SIMULATIONS
  // ---------------------------------------------------------------------------
  const sims = {};
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  function initSims() {
    if (!window.SandSim) return;
    const small = innerWidth < 700;
    sims.hero = new SandSim($('#heroCanvas'), { size: small ? 200 : 280, ticks: 2, palette: PALETTES.ocean, autoFlip: !reduce });
    sims.shop = new SandSim($('#shopCanvas'), { size: small ? 170 : 220, palette: PALETTES.ocean, autoFlip: false });
    $$('[data-flip]').forEach((b) =>
      b.addEventListener('click', () => {
        const key = b.dataset.flip;
        const disc = $(`[data-frame="${key}"] [data-disc]`);
        sims[key] && sims[key].flipAnimated(disc);
      })
    );
  }

  // ---------------------------------------------------------------------------
  // CONFIGURATOR
  // ---------------------------------------------------------------------------
  const sizeOf = () => SIZES.find((s) => s.id === state.size);
  const tierOf = () => CONFIG.tiers.find((t) => t.qty === state.tier);

  function renderOptions() {
    $('#swatches').innerHTML = Object.entries(PALETTES)
      .map(([id, p]) => `
        <button type="button" role="radio" class="swatch" data-palette="${id}" aria-checked="${id === state.palette}" aria-label="${p.name}"
          style="--a:${p.bg[1]};--b:${p.sand[0]};--c:${p.sand[1]};--d:${p.sand[3]}"><span></span></button>`)
      .join('');
    $('#sizes').innerHTML = SIZES.map((s) => `
        <button type="button" role="radio" class="pill" data-size="${s.id}" aria-checked="${s.id === state.size}">
          <strong>${s.name} ${s.inch}</strong><span>${money(s.price)}</span>
        </button>`).join('');
    $('#bundles').innerHTML = CONFIG.tiers.map((t) => {
      const unit = round2(sizeOf().price * (1 - t.off));
      const total = round2(unit * t.qty);
      const save = round2(sizeOf().price * t.qty - total);
      return `
        <button type="button" role="radio" class="bundle" data-tier="${t.qty}" aria-checked="${t.qty === state.tier}">
          ${t.badge ? `<span class="badge">${t.badge}</span>` : ''}
          <span class="radio" aria-hidden="true"></span>
          <span class="b-main"><strong>${t.label}</strong><span>${t.off ? `${money(unit)} each` : 'Single frame'}</span></span>
          <span class="b-price"><strong>${money(total)}</strong>${save ? `<span class="save">You save ${money(save)}</span>` : ''}</span>
        </button>`;
    }).join('');
  }

  function updateSummary() {
    const s = sizeOf(), t = tierOf(), p = PALETTES[state.palette];
    const total = round2(s.price * (1 - t.off) * t.qty);
    $('#price').textContent = money(s.price);
    $('#priceNote').textContent = t.off ? `per frame · ${Math.round(t.off * 100)}% off when you buy ${t.qty}` : 'per frame';
    $('#ctaTotal').textContent = money(total);
    $('#paletteLabel').textContent = p.name;
    $('#previewName').textContent = p.name;
    $('#sbName').textContent = `${p.name} · ${s.name} ${s.inch}`;
    $('#sbPrice').textContent = t.qty > 1 ? `${t.qty} × · ${money(total)}` : money(total);
    $('#sbDot').style.background = `linear-gradient(135deg, ${p.bg[1]}, ${p.sand[0]})`;
    document.documentElement.style.setProperty('--glow', p.glow);
  }

  function bindOptions() {
    $('#shop').addEventListener('click', (e) => {
      const sw = e.target.closest('[data-palette]');
      const sz = e.target.closest('[data-size]');
      const bd = e.target.closest('[data-tier]');
      if (sw) {
        state.palette = sw.dataset.palette;
        sims.shop && sims.shop.setPalette(PALETTES[state.palette]);
        sims.hero && sims.hero.setPalette(PALETTES[state.palette]);
      } else if (sz) state.size = sz.dataset.size;
      else if (bd) state.tier = +bd.dataset.tier;
      else return;
      renderOptions();
      updateSummary();
    });
    // keyboard: arrow keys within radiogroups
    $$('[role="radiogroup"]').forEach((g) =>
      g.addEventListener('keydown', (e) => {
        if (!['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'].includes(e.key)) return;
        const items = $$('[role="radio"]', g);
        const i = items.indexOf(document.activeElement);
        if (i < 0) return;
        e.preventDefault();
        const n = items[(i + (e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length];
        n.click();
        const sel = n.dataset.palette ? `[data-palette="${n.dataset.palette}"]` : n.dataset.size ? `[data-size="${n.dataset.size}"]` : `[data-tier="${n.dataset.tier}"]`;
        $(sel).focus();
      })
    );
    const add = () => {
      addToCart(state.palette, state.size, state.tier);
      openCart();
    };
    $('#addToCart').addEventListener('click', add);
    $('#sbAdd').addEventListener('click', add);
  }

  // ---------------------------------------------------------------------------
  // CART
  // ---------------------------------------------------------------------------
  let cart = [];
  try { cart = JSON.parse(localStorage.getItem('dg_cart') || '[]'); } catch (_) { cart = []; }
  const save = () => { try { localStorage.setItem('dg_cart', JSON.stringify(cart)); } catch (_) {} };

  function addToCart(palette, size, qty) {
    const line = cart.find((l) => l.palette === palette && l.size === size);
    if (line) line.qty += qty; else cart.push({ palette, size, qty });
    save(); renderCart();
    bump();
  }

  function totals() {
    const qty = cart.reduce((a, l) => a + l.qty, 0);
    const subtotal = cart.reduce((a, l) => a + SIZES.find((s) => s.id === l.size).price * l.qty, 0);
    const tier = [...CONFIG.tiers].reverse().find((t) => qty >= t.qty) || CONFIG.tiers[0];
    const discount = round2(subtotal * tier.off);
    const after = round2(subtotal - discount);
    const shipping = qty === 0 ? 0 : after >= CONFIG.freeShippingThreshold ? 0 : CONFIG.shippingFee;
    return { qty, subtotal, tier, discount, after, shipping, total: round2(after + shipping) };
  }

  function renderCart() {
    const t = totals();
    $('#cartCount').textContent = t.qty;
    $('#cartCount').classList.toggle('show', t.qty > 0);

    $('#cartItems').innerHTML = cart.length
      ? cart.map((l, i) => {
          const p = PALETTES[l.palette], s = SIZES.find((z) => z.id === l.size);
          return `
          <div class="cart-line">
            <span class="line-thumb" style="--a:${p.bg[0]};--b:${p.bg[1]};--c:${p.sand[0]};--d:${p.sand[1]}"></span>
            <div class="line-info"><strong>${p.name}</strong><span>${s.name} ${s.inch} · ${money(s.price)}</span>
              <div class="qty"><button type="button" data-dec="${i}" aria-label="Decrease quantity">−</button><span>${l.qty}</span><button type="button" data-inc="${i}" aria-label="Increase quantity">+</button></div>
            </div>
            <button class="line-remove" type="button" data-rm="${i}" aria-label="Remove ${p.name}">Remove</button>
          </div>`;
        }).join('')
      : `<div class="empty"><p>Your cart is empty.</p><a href="#shop" class="btn ghost" data-close>Find your colourway</a></div>`;

    // free-shipping progress
    const left = round2(CONFIG.freeShippingThreshold - t.after);
    $('#shipMsg').innerHTML = t.qty === 0
      ? `Free shipping on orders over ${money(CONFIG.freeShippingThreshold)}`
      : left > 0 ? `You're <strong>${money(left)}</strong> away from free shipping` : `<strong>You've unlocked free shipping</strong> 🎉`;
    $('#shipBar').style.width = Math.min(100, (t.after / CONFIG.freeShippingThreshold) * 100) + '%';

    // upsell: nudge to the next bundle tier
    const next = CONFIG.tiers.find((x) => x.qty > t.qty);
    const ups = $('#upsell');
    if (t.qty > 0 && next) {
      const pal = Object.keys(PALETTES).find((k) => !cart.some((l) => l.palette === k)) || state.palette;
      const need = next.qty - t.qty;
      ups.innerHTML = `
        <span class="line-thumb" style="--a:${PALETTES[pal].bg[0]};--b:${PALETTES[pal].bg[1]};--c:${PALETTES[pal].sand[0]};--d:${PALETTES[pal].sand[1]}"></span>
        <div><strong>Add ${need} more, save ${Math.round(next.off * 100)}% on everything</strong><span>Try ${PALETTES[pal].name}. It looks great next to the first one.</span></div>
        <button class="btn small" type="button" data-upsell="${pal}">Add</button>`;
      ups.hidden = false;
    } else ups.hidden = true;

    $('#subtotal').textContent = money(t.subtotal);
    $('#discountRow').hidden = !t.discount;
    $('#discountLabel').textContent = `Bundle savings (${Math.round(t.tier.off * 100)}%)`;
    $('#discount').textContent = '−' + money(t.discount);
    $('#shipping').textContent = t.qty === 0 ? '—' : t.shipping ? money(t.shipping) : 'Free';
    $('#total').textContent = money(t.total);
    $('#checkout').disabled = t.qty === 0;
  }

  function bindCart() {
    $('#drawer').addEventListener('click', (e) => {
      const d = e.target.closest('[data-dec]'), inc = e.target.closest('[data-inc]'), rm = e.target.closest('[data-rm]');
      const up = e.target.closest('[data-upsell]');
      if (d) { const l = cart[+d.dataset.dec]; l.qty--; if (l.qty <= 0) cart.splice(+d.dataset.dec, 1); }
      else if (inc) cart[+inc.dataset.inc].qty++;
      else if (rm) cart.splice(+rm.dataset.rm, 1);
      else if (up) { addToCart(up.dataset.upsell, cart[0] ? cart[0].size : state.size, 1); return; }
      else if (e.target.closest('[data-close]')) { closeCart(); return; }
      else return;
      save(); renderCart();
    });
    $('#cartOpen').addEventListener('click', openCart);
    $('#cartClose').addEventListener('click', closeCart);
    $('#scrim').addEventListener('click', closeCart);
    addEventListener('keydown', (e) => e.key === 'Escape' && closeCart());
    $('#checkout').addEventListener('click', () => {
      if (CONFIG.checkoutUrl) { location.href = CONFIG.checkoutUrl; return; }
      toast('Checkout isn\'t connected yet. Add your Shopify or Stripe link in js/main.js.');
    });
  }

  let lastFocus;
  function openCart() {
    lastFocus = document.activeElement;
    $('#scrim').hidden = false;
    requestAnimationFrame(() => document.body.classList.add('cart-open'));
    $('#drawer').setAttribute('aria-hidden', 'false');
    $('#cartClose').focus();
  }
  function closeCart() {
    if (!document.body.classList.contains('cart-open')) return;
    document.body.classList.remove('cart-open');
    $('#drawer').setAttribute('aria-hidden', 'true');
    setTimeout(() => ($('#scrim').hidden = true), 300);
    lastFocus && lastFocus.focus && lastFocus.focus();
  }
  function bump() {
    const c = $('#cartCount');
    c.classList.remove('bump'); void c.offsetWidth; c.classList.add('bump');
  }

  let toastTimer;
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3800);
  }

  // ---------------------------------------------------------------------------
  // ANIMATIONS
  // ---------------------------------------------------------------------------
  function initReveal() {
    const els = $$('[data-reveal]');
    if (!('IntersectionObserver' in window)) { els.forEach((e) => e.classList.add('in')); return; }
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
    }), { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
    els.forEach((e) => io.observe(e));

    const counters = $$('[data-count]');
    const cio = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (!en.isIntersecting) return;
      cio.unobserve(en.target);
      const end = +en.target.dataset.count, t0 = performance.now();
      const tick = (t) => {
        const k = Math.min(1, (t - t0) / 1200);
        en.target.textContent = Math.round(end * (1 - Math.pow(1 - k, 3)));
        if (k < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }), { threshold: 0.6 });
    counters.forEach((c) => cio.observe(c));
  }

  function initWords() {
    const el = $('[data-words]');
    const words = el.textContent.trim().split(/\s+/);
    el.innerHTML = words.map((w) => `<span>${w}</span>`).join(' ');
    const spans = $$('span', el);
    const sec = $('#statement');
    const update = () => {
      const r = sec.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight * 0.85 - r.top) / (r.height * 0.9)));
      const n = Math.round(p * spans.length);
      spans.forEach((s, i) => s.classList.toggle('lit', i < n));
    };
    addEventListener('scroll', update, { passive: true });
    update();
  }

  function initScrollUI() {
    const nav = $('#nav'), sb = $('#stickyBuy'), shop = $('#shop'), hero = $('.hero');
    let shopVisible = false, heroVisible = true;
    const sync = () => {
      const show = !heroVisible && !shopVisible;
      sb.classList.toggle('show', show);
      sb.setAttribute('aria-hidden', String(!show));
      $('#sbAdd').tabIndex = show ? 0 : -1;
    };
    new IntersectionObserver((e) => { shopVisible = e[0].isIntersecting; sync(); }, { threshold: 0.05 }).observe(shop);
    new IntersectionObserver((e) => { heroVisible = e[0].isIntersecting; sync(); }, { threshold: 0.1 }).observe(hero);
    addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 30), { passive: true });

    // subtle pointer parallax on the hero frame
    const art = $('.hero-art');
    if (!reduce && matchMedia('(pointer: fine)').matches) {
      hero.addEventListener('pointermove', (e) => {
        const r = hero.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        art.style.transform = `translate3d(${x * 14}px, ${y * 14}px, 0)`;
      });
      hero.addEventListener('pointerleave', () => (art.style.transform = ''));
    }
  }

  function initNewsletter() {
    $('#nlForm').addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = $('#nlEmail').value.trim();
      if (CONFIG.newsletterEndpoint) {
        try {
          await fetch(CONFIG.newsletterEndpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
        } catch (_) { toast('Something went wrong. Please try again.'); return; }
        toast('You\'re on the list. Check your inbox for your code.');
        e.target.reset();
      } else {
        toast('Newsletter isn\'t connected yet. Set newsletterEndpoint in js/main.js.');
      }
    });
  }

  // ---------------------------------------------------------------------------
  document.addEventListener('DOMContentLoaded', () => {
    $('#year').textContent = new Date().getFullYear();
    document.body.classList.add('loaded');
    initSims();
    renderOptions();
    updateSummary();
    bindOptions();
    renderCart();
    bindCart();
    initReveal();
    initWords();
    initScrollUI();
    initNewsletter();
  });
})();
