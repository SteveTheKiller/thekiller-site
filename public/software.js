/* Software page - CRT slideshow.
   Channel switching (wheel / arrows / swipe / buttons) plus a slow cycle of
   each app's screenshots while its channel is up. No dependencies.

   The page works without this file - see the <noscript> block in the layout,
   which unstacks the slides into a plain list.

   Rule that governs the whole file: the slideshow NEVER moves while the
   visitor is doing something. It stops while the lightbox is open and while
   the pointer is resting on the screenshot, and no input is acted on while
   the lightbox has the screen. Auto-advancing out from under someone who is
   reading, or closing the image they just opened, is the thing to avoid. */
(function () {
  'use strict';

  var pf = document.querySelector('.pf');
  if (!pf) { return; }

  var slides = [].slice.call(pf.querySelectorAll('.pf-slide'));
  var dots = [].slice.call(pf.querySelectorAll('.pf-dot'));
  var chOut = pf.querySelector('.js-ch');
  var count = slides.length;
  var cur = 0;
  var locked = false;          // debounce: one channel change per gesture
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  var SHOT_MS = 5000;          // was 3200 - too pushy to read against

  var shotTimer = null;
  var shots = [];              // shots of the slide currently up
  var shotIdx = 0;
  var hovering = false;
  var lightboxOpen = false;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  // ---- Screenshot cycling -------------------------------------------------

  function stopCycle() {
    if (shotTimer) { clearInterval(shotTimer); shotTimer = null; }
  }

  function startCycle() {
    stopCycle();
    if (shots.length < 2 || reduce || hovering || lightboxOpen) { return; }
    shotTimer = setInterval(advance, SHOT_MS);
  }

  function advance() {
    var prev = shotIdx;
    shotIdx = (shotIdx + 1) % shots.length;
    /* Fade the incoming shot in ON TOP of the outgoing one, which stays fully
       opaque underneath until the fade lands. Cross-fading both at once put
       each at ~50% over a black tube, so every transition dipped through
       black. */
    shots[shotIdx].style.zIndex = 2;
    shots[shotIdx].classList.add('is-on');
    setTimeout(function () {
      shots[prev].classList.remove('is-on');
      shots[prev].style.zIndex = 1;
    }, 760);
  }

  function loadShots(slide) {
    stopCycle();
    shots = [].slice.call(slide.querySelectorAll('.pf-shot'));
    shotIdx = 0;
    shots.forEach(function (s, i) {
      s.classList.toggle('is-on', i === 0);
      s.style.zIndex = i === 0 ? 2 : 1;
    });
    startCycle();
  }

  // ---- Channels -----------------------------------------------------------

  function go(n) {
    n = (n + count) % count;
    if (n === cur) { return; }
    cur = n;

    pf.classList.remove('is-switching');
    void pf.offsetWidth;             // restart the glitch animation
    pf.classList.add('is-switching');

    slides.forEach(function (s, i) {
      var on = i === cur;
      s.classList.toggle('is-on', on);
      s.setAttribute('aria-hidden', on ? 'false' : 'true');
    });
    dots.forEach(function (d, i) { d.classList.toggle('is-on', i === cur); });
    if (chOut) { chOut.textContent = pad(cur + 1); }

    loadShots(slides[cur]);
  }

  function step(dir) {
    if (locked || lightboxOpen) { return; }
    locked = true;
    go(cur + dir);
    setTimeout(function () { locked = false; }, 420);
  }

  // ---- Input --------------------------------------------------------------

  /* Wheel: only claim the gesture while the tube is on screen and only for
     deliberate vertical intent. Never while the lightbox is up - that was
     letting a scroll change channel behind the overlay and yank the image
     the visitor had just opened. */
  pf.addEventListener('wheel', function (e) {
    if (lightboxOpen) { return; }
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) { return; }
    if (Math.abs(e.deltaY) < 8) { return; }
    var r = pf.getBoundingClientRect();
    if (r.bottom < 120 || r.top > window.innerHeight - 120) { return; }
    // At the ends, let the page scroll normally so nobody gets trapped
    var atEnd = (e.deltaY > 0 && cur === count - 1) || (e.deltaY < 0 && cur === 0);
    if (atEnd) { return; }
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
    if (lightboxOpen) { return; }   // arrows belong to the lightbox then
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { step(1); }
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { step(-1); }
    else if (/^[1-9]$/.test(e.key) && +e.key <= count) { go(+e.key - 1); }
  });

  dots.forEach(function (d) {
    d.addEventListener('click', function () { go(+d.dataset.go); });
  });

  /* Touch: horizontal swipe across the tube */
  var x0 = null, y0 = null;
  pf.addEventListener('touchstart', function (e) {
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY;
  }, { passive: true });
  pf.addEventListener('touchend', function (e) {
    if (x0 === null || lightboxOpen) { x0 = y0 = null; return; }
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1);
    }
    x0 = y0 = null;
  }, { passive: true });

  /* Resting on the screenshot means you are looking at it - hold still. */
  slides.forEach(function (sl) {
    var box = sl.querySelector('.pf-shots');
    if (!box) { return; }
    box.addEventListener('mouseenter', function () { hovering = true; stopCycle(); });
    box.addEventListener('mouseleave', function () { hovering = false; startCycle(); });
  });

  // ---- Lightbox -----------------------------------------------------------

  /* A small built-in viewer rather than GLightbox.
     GLightbox is what the photos page uses and it is fine there, but on this
     page opening it froze the renderer outright, reproducibly, with its zoom
     and drag rig turned off and the CRT layers already hidden. Rather than
     keep guessing at a dependency, this is ~40 lines that do exactly what is
     needed: one image, prev/next, Esc, backdrop click. No freeze, and it can
     be themed amber like everything else. */
  var viewer = null;

  function closeViewer() {
    if (!viewer) { return; }
    document.removeEventListener('keydown', viewerKeys, true);
    viewer.remove();
    viewer = null;
    lightboxOpen = false;
    document.documentElement.classList.remove('lightbox-open');
    startCycle();
  }

  function viewerKeys(e) {
    if (!viewer) { return; }
    if (e.key === 'Escape') { e.stopPropagation(); closeViewer(); }
    else if (e.key === 'ArrowRight') { e.stopPropagation(); viewer.go(1); }
    else if (e.key === 'ArrowLeft') { e.stopPropagation(); viewer.go(-1); }
  }

  function openViewer(list, start) {
    lightboxOpen = true;
    stopCycle();
    document.documentElement.classList.add('lightbox-open');

    var i = start;
    var el = document.createElement('div');
    el.className = 'pf-viewer';
    el.innerHTML =
      '<button class="pf-v-close" aria-label="Close">&times;</button>' +
      '<button class="pf-v-nav pf-v-prev" aria-label="Previous">&#8249;</button>' +
      '<img class="pf-v-img" alt="">' +
      '<button class="pf-v-nav pf-v-next" aria-label="Next">&#8250;</button>' +
      '<p class="pf-v-count"></p>';
    document.body.appendChild(el);

    var im = el.querySelector('.pf-v-img');
    var ct = el.querySelector('.pf-v-count');
    function show(n) {
      i = (n + list.length) % list.length;
      im.src = list[i].src;
      im.alt = list[i].alt || '';
      ct.textContent = (i + 1) + ' / ' + list.length;
    }
    el.go = function (d) { show(i + d); };
    show(i);

    el.querySelector('.pf-v-close').addEventListener('click', closeViewer);
    el.querySelector('.pf-v-prev').addEventListener('click', function (ev) { ev.stopPropagation(); el.go(-1); });
    el.querySelector('.pf-v-next').addEventListener('click', function (ev) { ev.stopPropagation(); el.go(1); });
    // Backdrop click closes; clicking the image itself does not
    el.addEventListener('click', function (ev) { if (ev.target === el) { closeViewer(); } });
    im.addEventListener('click', function (ev) { ev.stopPropagation(); });

    document.addEventListener('keydown', viewerKeys, true);
    viewer = el;
  }

  pf.addEventListener('click', function (e) {
    var img = e.target.closest ? e.target.closest('.pf-shot') : null;
    if (!img) { return; }
    var slide = slides[cur];
    var list = [].slice.call(slide.querySelectorAll('.pf-shot'));
    openViewer(list, Math.max(0, list.indexOf(img)));
  });

  loadShots(slides[0]);
})();
