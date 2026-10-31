/* Larder global scripts: header offset, cart drawer, AJAX cart, variant picker */
(function () {
  'use strict';

  var routes = window.LarderRoutes || { cart_add_url: '/cart/add', cart_change_url: '/cart/change', cart_url: '/cart' };
  var cartType = document.documentElement.dataset.cartType || 'drawer';

  /* Header offset for the mobile menu panel */
  function setHeaderBottom() {
    var header = document.querySelector('.header-wrapper');
    if (!header) return;
    var rect = header.getBoundingClientRect();
    document.documentElement.style.setProperty('--header-bottom', Math.max(rect.bottom, 0) + 'px');
  }
  setHeaderBottom();
  window.addEventListener('resize', setHeaderBottom);
  document.addEventListener('toggle', function (e) {
    if (e.target.classList && e.target.classList.contains('menu-drawer')) {
      setHeaderBottom();
      document.body.style.overflow = e.target.open ? 'hidden' : '';
    }
  }, true);

  /* Close dropdowns on outside click / Escape */
  document.addEventListener('click', function (e) {
    document.querySelectorAll('details.dropdown[open]').forEach(function (d) {
      if (!d.contains(e.target)) d.removeAttribute('open');
    });
  });

  /* Cart drawer */
  var drawer = null;
  var lastFocus = null;

  function getDrawer() {
    drawer = drawer || document.getElementById('CartDrawer');
    return drawer;
  }

  function openDrawer() {
    var d = getDrawer();
    if (!d) { window.location.href = routes.cart_url; return; }
    lastFocus = document.activeElement;
    d.classList.add('is-open');
    d.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    var close = d.querySelector('[data-drawer-close]');
    if (close) setTimeout(function () { close.focus(); }, 50);
  }

  function closeDrawer() {
    var d = getDrawer();
    if (!d) return;
    d.classList.remove('is-open');
    d.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
    if (lastFocus) lastFocus.focus();
  }

  document.addEventListener('click', function (e) {
    var opener = e.target.closest('[data-cart-open]');
    if (opener && cartType === 'drawer' && getDrawer()) {
      e.preventDefault();
      openDrawer();
      return;
    }
    if (e.target.closest('[data-drawer-close]')) {
      e.preventDefault();
      closeDrawer();
    }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var d = getDrawer();
    if (d && d.classList.contains('is-open')) closeDrawer();
    document.querySelectorAll('details.dropdown[open], details.menu-drawer[open]').forEach(function (el) { el.removeAttribute('open'); });
  });

  /* Re-render cart drawer and counts via the Section Rendering API */
  function renderSections(sections) {
    if (!sections) return;
    if (sections['cart-drawer']) {
      var html = new DOMParser().parseFromString(sections['cart-drawer'], 'text/html');
      var fresh = html.querySelector('#CartDrawerInner');
      var current = document.getElementById('CartDrawerInner');
      if (fresh && current) current.replaceWith(fresh);
    }
    if (sections['cart-count']) {
      var countHtml = new DOMParser().parseFromString(sections['cart-count'], 'text/html');
      var count = countHtml.querySelector('[data-cart-count-value]');
      if (count) {
        var value = count.getAttribute('data-cart-count-value');
        document.querySelectorAll('[data-cart-count]').forEach(function (el) {
          el.textContent = value === '0' ? '' : value;
          el.setAttribute('data-count', value);
        });
      }
    }
  }

  function sectionIds() {
    var ids = ['cart-count'];
    if (getDrawer()) ids.push('cart-drawer');
    return ids;
  }

  /* Add to cart */
  document.addEventListener('submit', function (e) {
    var form = e.target.closest('form[data-cart-form]');
    if (!form || cartType !== 'drawer' || !getDrawer()) return;
    e.preventDefault();
    var button = form.querySelector('[type="submit"]');
    var errorEl = form.querySelector('[data-form-error]');
    if (button) { button.classList.add('is-loading'); button.setAttribute('aria-busy', 'true'); }
    if (errorEl) errorEl.textContent = '';

    var body = new FormData(form);
    body.append('sections', sectionIds().join(','));
    body.append('sections_url', window.location.pathname);

    fetch(routes.cart_add_url, { method: 'POST', headers: { Accept: 'application/json', 'X-Requested-With': 'XMLHttpRequest' }, body: body })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.status) {
          if (errorEl) errorEl.textContent = data.description || data.message;
          return;
        }
        renderSections(data.sections);
        var qa = form.closest('[data-quick-add-dialog]');
        if (qa && qa.open) qa.close();
        openDrawer();
      })
      .catch(function () { form.submit(); })
      .finally(function () {
        if (button) { button.classList.remove('is-loading'); button.removeAttribute('aria-busy'); }
      });
  });

  /* Quantity change / remove inside drawer or cart page */
  function changeLine(line, quantity) {
    var payload = { line: line, quantity: quantity, sections: sectionIds(), sections_url: window.location.pathname };
    return fetch(routes.cart_change_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (data) {
      if (document.body.classList.contains('template-cart')) { window.location.reload(); return; }
      renderSections(data.sections);
    });
  }

  document.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-qty-change]');
    if (btn) {
      e.preventDefault();
      var wrap = btn.closest('[data-line]');
      var input = wrap.querySelector('input[type="number"]');
      var next = Math.max(0, parseInt(input.value, 10) + parseInt(btn.dataset.qtyChange, 10));
      input.value = next;
      changeLine(parseInt(wrap.dataset.line, 10), next);
      return;
    }
    var rm = e.target.closest('[data-line-remove]');
    if (rm) {
      e.preventDefault();
      changeLine(parseInt(rm.dataset.lineRemove, 10), 0);
    }
  });

  document.addEventListener('change', function (e) {
    var input = e.target.closest('[data-line] input[type="number"]');
    if (!input) return;
    var wrap = input.closest('[data-line]');
    changeLine(parseInt(wrap.dataset.line, 10), Math.max(0, parseInt(input.value, 10) || 0));
  });

  /* Variant picker (product page) */
  document.querySelectorAll('[data-variant-picker]').forEach(function (picker) {
    var root = picker.closest('[data-product]');
    var dataEl = root.querySelector('[data-variants-json]');
    if (!dataEl) return;
    var variants = JSON.parse(dataEl.textContent);
    var idInput = root.querySelector('input[name="id"]');
    var priceEl = root.querySelector('[data-price]');
    var button = root.querySelector('[data-add-button]');
    var buttonText = button ? button.querySelector('span') : null;
    var strings = window.LarderStrings || {};

    picker.addEventListener('change', function () {
      var selected = Array.prototype.map.call(picker.querySelectorAll('fieldset'), function (fs) {
        var checked = fs.querySelector('input:checked');
        return checked ? checked.value : null;
      });
      var variant = variants.find(function (v) {
        return v.options.every(function (opt, i) { return opt === selected[i]; });
      });
      if (!variant) {
        if (button) button.setAttribute('disabled', '');
        if (buttonText) buttonText.textContent = strings.unavailable || 'Unavailable';
        return;
      }
      idInput.value = variant.id;
      if (priceEl) priceEl.innerHTML = variant.price_html;
      if (button) {
        if (variant.available) { button.removeAttribute('disabled'); if (buttonText) buttonText.textContent = strings.addToCart || 'Add to cart'; }
        else { button.setAttribute('disabled', ''); if (buttonText) buttonText.textContent = strings.soldOut || 'Sold out'; }
      }
      var url = new URL(window.location.href);
      url.searchParams.set('variant', variant.id);
      window.history.replaceState({}, '', url.toString());
      if (variant.media_id) {
        var media = root.querySelector('[data-media-id="' + variant.media_id + '"]');
        if (media) media.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
      }
    });
  });

  /* Collection sort */
  document.querySelectorAll('[data-sort-select]').forEach(function (select) {
    select.addEventListener('change', function () {
      var url = new URL(window.location.href);
      url.searchParams.set('sort_by', select.value);
      url.searchParams.delete('page');
      window.location.href = url.toString();
    });
  });
})();

/* Product page, gallery, recommendations, filters, predictive search */
(function () {
  'use strict';

  /* Quantity steppers on the product form */
  document.addEventListener('click', function (e) {
    var step = e.target.closest('[data-qty-step]');
    if (!step) return;
    var input = step.parentElement.querySelector('input[type="number"]');
    var min = parseInt(input.min || '1', 10);
    input.value = Math.max(min, (parseInt(input.value, 10) || min) + parseInt(step.dataset.qtyStep, 10));
  });

  /* Selling plan prices follow the selected variant */
  document.querySelectorAll('[data-product]').forEach(function (root) {
    var dataEl = root.querySelector('[data-variants-json]');
    var picker = root.querySelector('[data-variant-picker]');
    if (!dataEl || !picker) return;
    var variants = JSON.parse(dataEl.textContent);
    picker.addEventListener('change', function () {
      var idInput = root.querySelector('input[name="id"]');
      var v = variants.find(function (x) { return String(x.id) === idInput.value; });
      if (!v) return;
      root.querySelectorAll('[data-plan-price]').forEach(function (el) {
        var key = el.getAttribute('data-plan-price');
        el.textContent = key === '' ? v.price : (v.plans[key] || '');
      });
      if (v.media_id) goToSlide(root.querySelector('[data-gallery]'), String(v.media_id));
    });
  });

  /* Gallery: thumbnails, active state, lightbox */
  function goToSlide(gallery, id) {
    if (!gallery) return;
    var track = gallery.querySelector('[data-gallery-track]');
    var slide = gallery.querySelector('.gallery__slide[data-media-id="' + id + '"]');
    if (track && slide) track.scrollTo({ left: slide.offsetLeft - track.offsetLeft, behavior: 'smooth' });
    gallery.querySelectorAll('[data-thumb]').forEach(function (t) {
      var on = t.dataset.thumb === id;
      t.classList.toggle('is-active', on);
      if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
    });
  }

  document.querySelectorAll('[data-gallery]').forEach(function (gallery) {
    var track = gallery.querySelector('[data-gallery-track]');
    gallery.addEventListener('click', function (e) {
      var thumb = e.target.closest('[data-thumb]');
      if (thumb) { goToSlide(gallery, thumb.dataset.thumb); return; }
      var zoom = e.target.closest('[data-zoom]');
      var box = gallery.querySelector('[data-lightbox]');
      if (zoom && box && typeof box.showModal === 'function') {
        var img = box.querySelector('[data-lightbox-img]');
        var src = zoom.querySelector('img');
        img.src = zoom.dataset.zoom;
        img.alt = src ? src.alt : '';
        box.showModal();
        return;
      }
      if (e.target.closest('[data-lightbox-close]') || e.target.matches('[data-lightbox]')) {
        gallery.querySelector('[data-lightbox]').close();
      }
    });
    if (track && 'IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (entries) {
        entries.forEach(function (en) {
          if (en.isIntersecting && en.intersectionRatio > 0.6) {
            var id = en.target.dataset.mediaId;
            gallery.querySelectorAll('[data-thumb]').forEach(function (t) {
              var on = t.dataset.thumb === id;
              t.classList.toggle('is-active', on);
              if (on) t.setAttribute('aria-current', 'true'); else t.removeAttribute('aria-current');
            });
          }
        });
      }, { root: track, threshold: [0.6] });
      track.querySelectorAll('.gallery__slide').forEach(function (s) { io.observe(s); });
    }
  });

  /* Product recommendations */
  document.querySelectorAll('[data-recommendations]').forEach(function (el) {
    if (el.children.length) return;
    fetch(el.dataset.url).then(function (r) { return r.text(); }).then(function (html) {
      var doc = new DOMParser().parseFromString(html, 'text/html');
      var fresh = doc.querySelector('[data-recommendations]');
      if (fresh && fresh.innerHTML.trim()) el.innerHTML = fresh.innerHTML;
    }).catch(function () {});
  });

  /* Filters */
  function facetQuery(form) {
    var params = new URLSearchParams(new FormData(form));
    Array.from(params.keys()).forEach(function (k) { if (params.get(k) === '') params.delete(k); });
    return params.toString();
  }
  document.querySelectorAll('[data-facets]').forEach(function (form) {
    var timer, controller;
    var deferred = form.hasAttribute('data-facets-deferred');
    var submit = form.querySelector('[data-facets-submit]');
    var drawer = form.closest('[data-filter-drawer]');

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      window.location.href = form.action + '?' + facetQuery(form);
    });

    form.addEventListener('change', function (e) {
      if (!e.target.matches('[data-facet-input]')) return;
      clearTimeout(timer);
      timer = setTimeout(function () {
        var query = facetQuery(form);
        if (!deferred) { window.location.href = form.action + '?' + query; return; }
        /* Drawer: update the result count without leaving the panel */
        if (!submit || !drawer) return;
        if (controller) controller.abort();
        controller = new AbortController();
        submit.classList.add('is-loading');
        fetch(form.action + '?' + query + (query ? '&' : '') + 'section_id=' + drawer.dataset.sectionId, { signal: controller.signal })
          .then(function (r) { return r.text(); })
          .then(function (html) {
            var doc = new DOMParser().parseFromString(html, 'text/html');
            var countEl = doc.querySelector('[data-results-count]');
            if (countEl) submit.textContent = submit.dataset.label.replace('[count]', countEl.getAttribute('data-results-count'));
          })
          .catch(function () {})
          .then(function () { submit.classList.remove('is-loading'); });
      }, e.target.type === 'number' ? 600 : 0);
    });
  });

  document.querySelectorAll('[data-filter-open]').forEach(function (btn) {
    var drawer = document.getElementById(btn.getAttribute('aria-controls'));
    if (!drawer || typeof drawer.showModal !== 'function') return;
    btn.addEventListener('click', function () {
      drawer.showModal();
      btn.setAttribute('aria-expanded', 'true');
    });
    drawer.addEventListener('close', function () { btn.setAttribute('aria-expanded', 'false'); btn.focus(); });
    drawer.addEventListener('click', function (e) {
      if (e.target === drawer || e.target.closest('[data-filter-close]')) drawer.close();
    });
  });

  /* Quick add for products with variants */
  var qaDialog = document.querySelector('[data-quick-add-dialog]');
  if (qaDialog && typeof qaDialog.showModal === 'function') {
    var qaBody = qaDialog.querySelector('[data-quick-add-body]');
    var qaTrigger = null;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-quick-add], [data-quick-view]');
      if (!btn) return;
      e.preventDefault();
      qaTrigger = btn;
      btn.classList.add('is-loading');
      var isView = btn.hasAttribute('data-quick-view');
      var url = btn.getAttribute(isView ? 'data-quick-view' : 'data-quick-add');
      fetch(url + (url.indexOf('?') > -1 ? '&' : '?') + 'section_id=' + (isView ? 'quick-view' : 'quick-add'))
        .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
        .then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var content = doc.querySelector('[data-quick-add-content]');
          if (!content) throw new Error('empty');
          qaBody.innerHTML = '';
          qaBody.appendChild(content);
          qaDialog.classList.toggle('quick-add-dialog--view', isView);
          initQuickGallery(content);
          qaDialog.showModal();
          var first = qaBody.querySelector('select, [type="submit"]');
          if (first) first.focus();
        })
        .catch(function () { window.location.href = url; })
        .then(function () { btn.classList.remove('is-loading'); });
    });
    function initQuickGallery(root) {
      var track = root.querySelector('[data-qv-track]');
      var dots = root.querySelectorAll('[data-qv-dots] button');
      if (!track || !dots.length) return;
      dots.forEach(function (d, i) {
        d.addEventListener('click', function () { track.scrollTo({ left: i * track.clientWidth, behavior: 'smooth' }); });
      });
      var raf;
      track.addEventListener('scroll', function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          var i = Math.round(track.scrollLeft / track.clientWidth);
          dots.forEach(function (d, j) { if (j === i) d.setAttribute('aria-current', 'true'); else d.removeAttribute('aria-current'); });
        });
      }, { passive: true });
    }
    qaDialog.addEventListener('click', function (e) {
      if (e.target === qaDialog || e.target.closest('[data-quick-add-close]')) qaDialog.close();
    });
    qaDialog.addEventListener('close', function () { if (qaTrigger) qaTrigger.focus(); });
  }

  /* Order cut-off countdown ("Order within 2h 15m for dispatch today") */
  document.querySelectorAll('[data-cutoff]').forEach(function (el) {
    var hour = parseInt(el.dataset.hour, 10);
    var tz = el.dataset.timezone || undefined;
    var days = (el.dataset.days || '1,2,3,4,5').split(',').map(Number);
    var out = el.querySelector('[data-cutoff-text]');
    function zoned() {
      try {
        var parts = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
        var get = function (t) { return (parts.find(function (p) { return p.type === t; }) || {}).value; };
        var wd = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
        return { day: wd, mins: parseInt(get('hour'), 10) * 60 + parseInt(get('minute'), 10) };
      } catch (err) { var d = new Date(); return { day: d.getDay(), mins: d.getHours() * 60 + d.getMinutes() }; }
    }
    function nextDayName(from) {
      for (var i = 1; i <= 7; i++) {
        var d = (from + i) % 7;
        if (days.indexOf(d) > -1) {
          if (i === 1) return el.dataset.tomorrow;
          try { return new Intl.DateTimeFormat(document.documentElement.lang || 'en', { weekday: 'long', timeZone: tz }).format(new Date(Date.now() + i * 864e5)); }
          catch (err) { return ''; }
        }
      }
      return '';
    }
    function render() {
      var now = zoned();
      var left = hour * 60 - now.mins;
      if (days.indexOf(now.day) > -1 && left > 0) {
        var h = Math.floor(left / 60), m = left % 60;
        var time = (h > 0 ? h + 'h ' : '') + m + 'm';
        out.innerHTML = el.dataset.before.replace('[time]', '<strong>' + time + '</strong>');
      } else {
        out.innerHTML = el.dataset.after.replace('[day]', '<strong>' + nextDayName(now.day) + '</strong>');
      }
      el.hidden = false;
    }
    render();
    setInterval(render, 60000);
  });

  /* Horizontal filter dropdowns: one open at a time, close on outside click or Escape */
  var dds = Array.prototype.slice.call(document.querySelectorAll('[data-facet-dd]'));
  if (dds.length) {
    dds.forEach(function (dd) {
      dd.addEventListener('toggle', function () {
        if (dd.open) dds.forEach(function (o) { if (o !== dd) o.open = false; });
      });
    });
    document.addEventListener('click', function (e) {
      dds.forEach(function (dd) { if (dd.open && !dd.contains(e.target)) dd.open = false; });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Escape') return;
      dds.forEach(function (dd) { if (dd.open) { dd.open = false; dd.querySelector('summary').focus(); } });
    });
  }

  /* Predictive search */
  var dialog = document.getElementById('SearchDialog');
  if (dialog && typeof dialog.showModal === 'function') {
    var input = dialog.querySelector('[data-predictive-input]');
    var results = dialog.querySelector('[data-predictive-results]');
    var url = dialog.dataset.predictiveUrl;
    var timer, controller;
    document.addEventListener('click', function (e) {
      if (e.target.closest('[data-search-open]')) {
        e.preventDefault();
        dialog.showModal();
        setTimeout(function () { input.focus(); }, 30);
      } else if (e.target.closest('[data-search-close]') || e.target === dialog) {
        dialog.close();
      }
    });
    input.addEventListener('input', function () {
      var q = input.value.trim();
      clearTimeout(timer);
      if (q.length < 2) { results.innerHTML = ''; return; }
      timer = setTimeout(function () {
        if (controller) controller.abort();
        controller = new AbortController();
        var u = url + '?q=' + encodeURIComponent(q) + '&resources[type]=product,collection,article,query&resources[limit]=5&section_id=predictive-search';
        fetch(u, { signal: controller.signal }).then(function (r) { return r.text(); }).then(function (html) {
          var doc = new DOMParser().parseFromString(html, 'text/html');
          var fresh = doc.getElementById('PredictiveResults');
          results.innerHTML = fresh ? fresh.innerHTML : '';
        }).catch(function () {});
      }, 220);
    });
  }
})();
