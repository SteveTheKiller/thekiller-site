/* Portfolio CRT slideshow.
   Channel switching (wheel / arrows / swipe / buttons) plus a slow cycle of
   each app's screenshots while its channel is up. No dependencies.

   The page works without this file - see the <noscript> block in the layout,
   which unstacks the slides into a plain list. */
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
  var shotTimer = null;
  var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function pad(n) { return (n < 10 ? '0' : '') + n; }

  /* Cycle the screenshots inside whichever slide is up. Restarted on every
     channel change so a fresh channel always opens on its first shot. */
  function cycleShots(slide) {
    if (shotTimer) { clearInterval(shotTimer); shotTimer = null; }
    var shots = [].slice.call(slide.querySelectorAll('.pf-shot'));
    shots.forEach(function (s, i) { s.classList.toggle('is-on', i === 0); });
    if (shots.length < 2 || reduce) { return; }
    var i = 0;
    shotTimer = setInterval(function () {
      shots[i].classList.remove('is-on');
      i = (i + 1) % shots.length;
      shots[i].classList.add('is-on');
    }, 3200);
  }

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

    cycleShots(slides[cur]);
  }

  function step(dir) {
    if (locked) { return; }
    locked = true;
    go(cur + dir);
    setTimeout(function () { locked = false; }, 420);
  }

  /* Wheel: only claim the gesture while the tube is actually on screen, and
     only for deliberate vertical intent - a trackpad's horizontal drift
     should not flip channels. */
  pf.addEventListener('wheel', function (e) {
    if (Math.abs(e.deltaY) < Math.abs(e.deltaX)) { return; }
    if (Math.abs(e.deltaY) < 8) { return; }
    var r = pf.getBoundingClientRect();
    if (r.bottom < 120 || r.top > window.innerHeight - 120) { return; }
    // At the ends, let the page scroll normally so the visitor is never trapped
    var atEnd = (e.deltaY > 0 && cur === count - 1) || (e.deltaY < 0 && cur === 0);
    if (atEnd) { return; }
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  }, { passive: false });

  document.addEventListener('keydown', function (e) {
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
    if (x0 === null) { return; }
    var dx = e.changedTouches[0].clientX - x0;
    var dy = e.changedTouches[0].clientY - y0;
    if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) {
      step(dx < 0 ? 1 : -1);
    }
    x0 = y0 = null;
  }, { passive: true });

  cycleShots(slides[0]);
})();
