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

  // ---- Copy well ----------------------------------------------------------

  /* The blurb + why paragraphs live in a fixed-height box so the plate can
     never grow. When the copy is taller than the box it drifts down, pauses at
     the bottom, and comes back, so the whole thing is readable without a
     scrollbar. Resting the pointer on it stops the drift; it also parks at the
     top and stays there on reduced motion. */
  var COPY_HOLD = 7000;     // pause at each end
  var copyTimers = [];

  function copyStop() {
    copyTimers.forEach(clearTimeout);
    copyTimers = [];
  }

  function copyPark(slide) {
    var inner = slide && slide.querySelector('.pf-copy-inner');
    if (inner) { inner.style.transform = 'translateY(0)'; }
  }

  function copyDrift(slide) {
    copyStop();
    copyPark(slide);
    if (reduce) { return; }
    var well = slide && slide.querySelector('.js-pf-copy');
    var inner = well && well.querySelector('.pf-copy-inner');
    if (!inner) { return; }

    var over = inner.scrollHeight - well.clientHeight;
    if (over < 6) { return; }          // it all fits; nothing to drift

    /* Step by a bit less than one wellful so consecutive stops OVERLAP. A
       single jump straight to the bottom leaves the band in the middle showing
       only in passing, which is unreadable. Works for copy of any length. */
    var stepPx = Math.max(40, well.clientHeight - 26);
    var stops = [0];
    for (var y = stepPx; y < over; y += stepPx) { stops.push(y); }
    stops.push(over);

    var at = 0;
    var dir = 1;
    (function tick() {
      copyTimers.push(setTimeout(function () {
        if (hovering || lightboxOpen) { tick(); return; }
        if (at + dir >= stops.length || at + dir < 0) { dir = -dir; }
        at += dir;
        inner.style.transform = 'translateY(' + (-stops[at]) + 'px)';
        tick();
      }, COPY_HOLD));
    }());
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
    copyDrift(slides[cur]);
  }

  function step(dir) {
    if (locked || lightboxOpen) { return; }
    locked = true;
    go(cur + dir);
    setTimeout(function () { locked = false; }, 420);
  }

  // ---- Input --------------------------------------------------------------

  /* NO wheel handler, deliberately. Changing channel on scroll meant the page
     stopped moving when the pointer happened to be over the tube - the visitor
     is trying to read down the page and the app switches under them instead.
     Scroll belongs to the page. Channels change by tab, arrow key, number key
     or swipe, all of which are things you do ON PURPOSE. */

  document.addEventListener('keydown', function (e) {
    if (lightboxOpen || !appsVisible()) { return; }   // arrows belong to the lightbox then
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

  // ---- Language bar: swaps the family panel below it ----------------------

  var fams = [].slice.call(pf.querySelectorAll('.pf-fam'));
  var langBtns = [].slice.call(pf.querySelectorAll('.pf-lang[data-fam]'));

  function appsVisible() {
    var f = pf.querySelector('.pf-fam[data-fam="apps"]');
    return f && !f.hidden;
  }

  function showFam(name) {
    fams.forEach(function (f) { f.hidden = f.dataset.fam !== name; });
    langBtns.forEach(function (b) {
      b.setAttribute('aria-pressed', b.dataset.fam === name ? 'true' : 'false');
    });
    // Each panel's animation only runs while that panel is the visible one
    if (name === 'apps') { startCycle(); } else { stopCycle(); }
    if (name === 'powershell') { psStart(); } else { psStop(); }
  }

  /* ---- PowerShell terminal showcase ----
     Types each script name at a prompt and prints its title + description,
     both taken verbatim from the killer-scripts repo (via the page's JSON
     island). Appends like a real session, keeps a short scrollback. */
  var psScreen = document.querySelector('.js-ps-screen');
  var psData = [];
  try {
    var island = document.querySelector('.js-ps-data');
    if (island) {
      psData = JSON.parse(island.textContent) || [];
      // Belt and braces against template double-encoding
      if (typeof psData === 'string') { psData = JSON.parse(psData) || []; }
      if (!Array.isArray(psData)) { psData = []; }
    }
  } catch (e) {}
  var psPicks = [].slice.call(document.querySelectorAll('.pf-ps-pick'));
  var psTimers = [];
  var psIdx = 0;
  var psManual = false;     // set once the visitor picks a script themselves

  /* Every line is painted in ITS OWN script's color and keeps it in the
     scrollback, so a window holding DEFEND, FACTS and AMORT shows cyan, green
     and amber together - the terminal reads like the scripts actually do. */
  function psLine(cls, text, hex) {
    var p = document.createElement('p');
    p.className = cls;
    p.textContent = text;
    if (hex) { p.style.color = hex; }
    psScreen.appendChild(p);
    while (psScreen.children.length > 9) { psScreen.removeChild(psScreen.firstChild); }
    return p;
  }

  function psStop() {
    psTimers.forEach(clearTimeout);
    psTimers = [];
    /* Drop any half-typed prompt. Interrupting the typewriter (a click, or
       switching family) used to strand lines like "PS> AM" in the scrollback,
       so the window filled with partial duplicates of the same script. */
    if (psScreen) {
      [].slice.call(psScreen.querySelectorAll('.pf-ps-live')).forEach(function (el) {
        el.remove();
      });
    }
  }

  /* The terminal takes each script's own console color, so picking MACE turns
     the window red the way the script itself does.

     Which color: $AccentCol first, but 13 of the 18 scripts set it to Yellow,
     which is the shell default and maps to the site amber - those all landed on
     the same color the terminal already was, so only the five non-yellow ones
     appeared to do anything. So a script whose $AccentCol is Yellow falls
     through to its own $BorderCol, then $LineCol, then $ArtCol, then $MainCol,
     taking the first that is not a neutral. That resolved color is `term` in
     software.yaml; `accent` stays the true $AccentCol. All 18 change now. */
  var PS_ACCENTS = {
    black: '#3a3a3a',
    darkblue: '#2a4a9a',
    darkgreen: '#1f8a4c',
    darkcyan: '#2a8a8a',
    darkred: '#a83240',
    darkmagenta: '#8f4bb8',
    darkyellow: '#c08a2e',
    gray: '#a8a8a8',
    darkgray: '#6a6a6a',
    blue: '#4f7fe8',
    green: '#3fbf6f',
    cyan: '#2ec9c9',
    red: '#e8485a',
    magenta: '#c56ce0',
    yellow: '#ffb642',
    white: '#ececec',
  };

  /* Every script draws a horizontal rule with Write-HLine: "- " repeated, each
     DASH cycling through the script's four console colors (BorderCol, ArtCol,
     AccentCol, DimCol) and each SPACE left in the dim color. Rebuilt here
     character for character. */
  function psRule(cols) {
    var wrap = document.createElement('p');
    wrap.className = 'pf-ps-rule';
    var dim = PS_ACCENTS[cols[3]] || PS_ACCENTS.darkgray;
    var n = 0;
    /* 90 characters, the scripts' own $script:Width. At half that, with letter
       spacing on top, the dashes read as scattered confetti instead of a rule -
       the pattern only resolves at the density the console actually draws. */
    for (var c = 0; c < 90; c++) {
      var span = document.createElement('span');
      if (c % 2 === 1) {                      // the space in "- "
        span.textContent = ' ';
        span.style.color = dim;
      } else {
        span.textContent = '-';
        span.style.color = PS_ACCENTS[cols[n % cols.length]] || PS_ACCENTS.yellow;
        n++;
      }
      wrap.appendChild(span);
    }
    psScreen.appendChild(wrap);
    while (psScreen.children.length > 11) { psScreen.removeChild(psScreen.firstChild); }
    return wrap;
  }

  /* The list button and the terminal frame follow the CURRENT script; the
     printed lines keep their own colors (see psLine). */
  function psMark(i) {
    psPicks.forEach(function (b, n) { b.classList.toggle('is-on', n === i); });
    var pick = psPicks[i];
    var term = psScreen && psScreen.closest('.pf-ps-term');
    if (!pick || !term) { return; }
    var hex = PS_ACCENTS[pick.dataset.accent] || PS_ACCENTS.yellow;
    term.style.setProperty('--ps-accent', hex);
    pick.style.setProperty('--ps-accent', hex);
  }

  /* Print one entry. `advance` continues the tour afterwards; a manual pick
     passes false so the terminal stays on what was chosen. */
  function psShow(i, advance) {
    if (!psScreen || !psData.length) { return; }
    psStop();
    var s = psData[i % psData.length];
    var hex = PS_ACCENTS[s.term || s.accent] || PS_ACCENTS.yellow;
    psMark(i % psData.length);

    /* The TEXT stays the terminal's own amber. Painting the command and title
       in each script's $AccentCol read as scattered random color, and it could
       never be consistent: 13 of the 18 scripts use Yellow, so only 5 would
       ever look different. The per-script identity lives in the RULE instead,
       where all 18 differ because the four-color cycle differs. */
    if (reduce) {
      psLine('pf-ps-cmd', 'PS> ' + s.name);
      if (s.rule) { psRule(s.rule); }
      psLine('pf-ps-out pf-ps-title', s.title);
      psLine('pf-ps-out', s.desc);
      return;
    }

    var cmd = psLine('pf-ps-cmd pf-ps-live', 'PS> ');
    var c = 0;
    function typeCh() {
      if (c < s.name.length) {
        cmd.textContent = 'PS> ' + s.name.slice(0, ++c);
        psTimers.push(setTimeout(typeCh, 55 + Math.random() * 65));
      } else {
        cmd.classList.remove('pf-ps-live');
        psTimers.push(setTimeout(function () {
          if (s.rule) { psRule(s.rule); }
          psLine('pf-ps-out pf-ps-title', s.title);
          psLine('pf-ps-out', s.desc);
          if (advance && !psManual) {
            psIdx = (i + 1) % psData.length;
            psTimers.push(setTimeout(function () { psShow(psIdx, true); }, 2600));
          }
        }, 300));
      }
    }
    psTimers.push(setTimeout(typeCh, 400));
  }

  function psStart() {
    // Once someone has chosen a script, the tour does not resume and steal it
    if (psManual) { return; }
    psShow(psIdx, true);
  }

  psPicks.forEach(function (b) {
    b.addEventListener('click', function () {
      psManual = true;              // hand the terminal over for good
      psShow(+b.dataset.i, false);
    });
  });

  /* Reading is reading: hold the tour while the pointer rests on the bench */
  if (psScreen) {
    var psBox = psScreen.closest('.pf-ps-bench') || psScreen.closest('.pf-ps-demo');
    psBox.addEventListener('mouseenter', psStop);
    psBox.addEventListener('mouseleave', function () {
      if (!psScreen.closest('.pf-fam').hidden) { psStart(); }
    });
  }

  // ---- Web family: card slideshow -----------------------------------------

  /* Same contract as everything else here: never move while the visitor is on
     it. Pauses while the pointer rests anywhere on the card stack, and does
     not run at all under reduced motion (the CSS unstacks the cards into a
     plain list instead, so nothing is hidden). Every change - auto or arrow -
     fires the CRT static burst, and the incoming card fades in under it.
     Clicking an arrow hands the show over for good, like the terminal list. */
  var WEB_MS = 12000;
  var webCards = [].slice.call(pf.querySelectorAll('.pf-web-card'));
  var webBox = pf.querySelector('.pf-web');
  var webTimer = null;
  var webIdx = 0;
  var webManual = false;

  function webShow(i) {
    webIdx = (i + webCards.length) % webCards.length;
    if (!reduce && webBox) {
      webBox.classList.remove('is-tuning');
      void webBox.offsetWidth;           // restart the static burst
      webBox.classList.add('is-tuning');
    }
    webCards.forEach(function (c, n) {
      c.classList.toggle('is-on', n === webIdx);
    });
  }

  function webStop() {
    if (webTimer) { clearInterval(webTimer); webTimer = null; }
  }

  function webStart() {
    webStop();
    if (reduce || webManual || webCards.length < 2) { return; }
    webTimer = setInterval(function () { webShow(webIdx + 1); }, WEB_MS);
  }

  if (webBox && webCards.length) {
    webStart();
    webBox.addEventListener('mouseenter', webStop);
    webBox.addEventListener('mouseleave', webStart);
    [].slice.call(webBox.querySelectorAll('.pf-web-arrow')).forEach(function (b) {
      b.addEventListener('click', function () {
        webManual = true;
        webStop();
        webShow(webIdx + (+b.dataset.dir));
      });
    });
  }

  langBtns.forEach(function (b) {
    b.addEventListener('click', function () { showFam(b.dataset.fam); });
  });

  /* Everything this page links to is somewhere ELSE - an app site, a repo, a
     vendor's docs - so it opens in its own tab and leaves the showcase where
     the visitor left it. Site-internal links (index, /software/, /photos/)
     keep the normal same-tab behavior, so the header nav is untouched.
     Applied here rather than in the template: the links come from a dozen
     separate ranges, and one rule cannot be forgotten when a card is added.
     `noopener` is required with a named target - without it the opened page
     gets a handle back to this window. */
  [].slice.call(pf.querySelectorAll('a[href]')).forEach(function (a) {
    var href = a.getAttribute('href') || '';
    if (href.charAt(0) === '#') { return; }              // in-page anchor
    if (a.hostname && a.hostname !== window.location.hostname) {
      a.target = '_blank';
      a.rel = 'noopener noreferrer';
    }
  });

  loadShots(slides[0]);
  copyDrift(slides[0]);
})();
