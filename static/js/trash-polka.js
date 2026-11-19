/* Trash Polka for the home page: a direct port of KillerPDF's theme.
 *
 *   KillerPDF/Controls/TrashPolkaInk.cs   the ink pieces (this file's Ink class, line for line)
 *   KillerPDF/Controls/ThemeMotif.cs      how the pieces paint the window and the panes
 *   KillerUI/Controls/GrainTexture.cs     the film grain tile
 *   KillerPDF/Themes/TrashPolka.xaml      the palette and opacities
 *
 * The app seeds System.Random, so DotNetRandom below reproduces .NET's seeded generator exactly and every
 * seed draws the same picture it draws in the app. Like the app, each piece is drawn once at screen size
 * (scale 1.25) and pinned to the window: the background (seed 162) under the page at 26 percent on ink
 * black, and the panes' own piece (seed 160) at 41 percent on PaneBrush charcoal. The grain tile sits on
 * those surfaces at GrainOpacity 0.24, never over the content.
 */
(function () {
  'use strict';

  var ACCENT = [0xD7, 0x26, 0x3D];            // PrimaryBrush, Blood
  var BLACK = [0x0b, 0x0b, 0x0b];
  var BONE = [0xE8, 0xE4, 0xDC];
  var SCALE = 1.25;                           // TrashPolkaInk.Scale
  var WINDOW_SEED = 160, BACKGROUND_SEED = 162;
  var PANE_OPACITY = 0.41;
  var BACKGROUND_OPACITY = 0.5;               // The app uses 0.26; the site runs it louder (2026-11-18).
  var GRAIN_OPACITY = 0.24;                   // TrashPolka.xaml GrainOpacity

  // ---- System.Random with a seed (.NET's Knuth subtractive generator) ---------------------------------
  function DotNetRandom(seed) {
    var MBIG = 2147483647, MSEED = 161803398;
    var a = new Array(56).fill(0);
    var sub = seed === -2147483648 ? MBIG : Math.abs(seed);
    var mj = MSEED - sub, mk = 1, ii;
    a[55] = mj;
    for (var i = 1; i < 55; i++) {
      ii = (21 * i) % 55;
      a[ii] = mk;
      mk = mj - mk;
      if (mk < 0) mk += MBIG;
      mj = a[ii];
    }
    for (var k = 1; k < 5; k++)
      for (i = 1; i < 56; i++) {
        a[i] -= a[1 + (i + 30) % 55];
        if (a[i] < 0) a[i] += MBIG;
      }
    var inext = 0, inextp = 21;
    function sample() {
      if (++inext >= 56) inext = 1;
      if (++inextp >= 56) inextp = 1;
      var r = a[inext] - a[inextp];
      if (r === MBIG) r--;
      if (r < 0) r += MBIG;
      a[inext] = r;
      return r * (1.0 / MBIG);
    }
    this.nextDouble = sample;
    this.next = function (max) { return Math.floor(sample() * max); };
  }

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function same(c, d) { return c[0] === d[0] && c[1] === d[1] && c[2] === d[2]; }

  // ---- TrashPolkaInk.Ink ----------------------------------------------------------------------------
  function Ink(ctx, seed, scratch) {
    var rnd = new DotNetRandom(seed);
    function R(a, b) { return a + rnd.nextDouble() * (b - a); }
    function N(n) { return rnd.next(n); }

    // Accent marks use 5 percent alpha steps, everything else a byte alpha, as in the app.
    function B(c, a) {
      if (a === undefined) a = 1;
      if (same(c, ACCENT)) return rgba(ACCENT, Math.round(clamp(a, 0, 1) * 20) * 255 / 20 / 255);
      return rgba(c, Math.floor(a * 255) / 255);
    }
    function accentShade(alpha, dark) {
      var f = dark ? 0.55 : 1;
      var c = [Math.floor(ACCENT[0] * f), Math.floor(ACCENT[1] * f), Math.floor(ACCENT[2] * f)];
      return rgba(c, Math.floor(Math.round(clamp(alpha, 0, 1) * 20) * 255 / 20) / 255);
    }

    function ellipse(fill, stroke, width, x, y, rx, ry) {
      ctx.beginPath();
      ctx.ellipse(x, y, Math.abs(rx), Math.abs(ry), 0, 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
    }
    function line(stroke, width, x1, y1, x2, y2, cap) {
      ctx.beginPath();
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
      ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = cap || 'butt';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }
    function arc(stroke, width, cx, cy, r, a0deg, a1deg, cap) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, a0deg * Math.PI / 180, a1deg * Math.PI / 180, false);
      ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.lineCap = cap || 'butt';
      ctx.stroke();
      ctx.lineCap = 'butt';
    }

    function tilted(x, y, deg, draw) {
      ctx.save();
      ctx.translate(x, y); ctx.rotate(deg * Math.PI / 180); ctx.translate(-x, -y);
      draw();
      ctx.restore();
    }

    // Draws into the scratch canvas with the current transform, then composites at an opacity or through
    // a mask, the way the app's PushOpacity and PushOpacityMask do.
    function layer(draw, finish) {
      var main = ctx;
      var t = main.getTransform();
      var s = scratch.getContext('2d');
      s.setTransform(1, 0, 0, 1, 0, 0);
      s.globalAlpha = 1;
      s.globalCompositeOperation = 'source-over';
      s.clearRect(0, 0, scratch.width, scratch.height);
      s.setTransform(t);
      ctx = s;
      draw();
      if (finish) finish(s);
      ctx = main;
      return s;
    }
    function blit(alpha) {
      var t = ctx.getTransform();
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.globalAlpha = alpha;
      ctx.drawImage(scratch, 0, 0);
      ctx.restore();
      ctx.setTransform(t);
    }

    this.piece = function (w, h) {
      sleeve(0, 0, w, h);
      splatter(w - 0.4 * 430, 0.82 * h, 44, BLACK);
      splatter(0.6 * 430, 0.25 * h, 24, ACCENT);
    };

    function sleeve(left, top, width, height) {
      var right = left + width, bottom = top + height;
      var across = Math.max(3, Math.floor(width / 300)), i, x, y;
      // Back layer at 35 percent.
      layer(function () {
        for (i = 0; i < across * 3; i++) {
          x = left + (i % across + R(0.1, 0.9)) * width / across;
          y = top + (Math.floor(i / across) + R(0.1, 0.9)) * height / 3;
          var hr = R(12, 30), hc = 6 + N(8), ho = R(0, 1) < 0.5, hb = R(0, 1) < 0.5;
          hexCluster(x, y, hr, hc, ho, hb);
          var ax = x + R(-80, 80), ay = y + R(-80, 80);
          var r0 = R(50, 90), r1 = R(110, 180), sd = R(0, 360), sw = R(70, 160);
          halftoneArc(ax, ay, r0, r1, sd, sw, R(0, 1) < 0.5 ? ACCENT : BLACK);
          var sx = x + R(-120, 120), sy = y + R(-120, 120), ss = R(14, 30);
          splatter(sx, sy, ss, R(0, 1) < 0.3 ? ACCENT : BLACK);
        }
      });
      blit(0.35);

      // Middle layer: mini-pieces in loose columns.
      var angles = [-62, -35, -12, 8, 27, 51, 74];
      for (var col = left + 60; col < right; col += R(230, 320))
        for (y = top + R(20, 120); y < bottom; y += R(170, 260)) {
          (function (cx, cy) {
            var ang = angles[N(angles.length)];
            switch (N(4)) {
              case 0:
                tilted(cx, cy, ang, function () { dryBrush(cx - 180, cy, cx + 180, cy, R(26, 50), BLACK); });
                var hx = cx + R(-60, 60), hy = cy + R(-60, 60), hr = R(14, 24), hc = 5 + N(6);
                hexCluster(hx, hy, hr, hc, false, R(0, 1) < 0.5);
                break;
              case 1:
                tilted(cx, cy, ang, function () { smearBar(cx - 160, cy - 13, 320, R(16, 30), false, ACCENT); });
                var px = cx + R(-50, 50), py = cy + R(-30, 30);
                splatter(px, py, R(22, 44), BLACK);
                break;
              case 2:
                var br = R(70, 130), bs = R(0, 360), bw = R(90, 170), bt = R(22, 38);
                brushArc(cx, cy, br, bs, bw, bt, BLACK);
                var hs = R(0, 360), hw = R(80, 140);
                halftoneArc(cx, cy, 40, 90, hs, hw, ACCENT);
                break;
              default:
                starburst(cx, cy, 14, R(70, 120));
                var ex = R(50, 90), ey = R(50, 90);
                ellipse(null, B(ACCENT, 0.9), 2, cx, cy, ex, ey);
                var kx = cx + R(-40, 40), ky = cy + R(-40, 40), kr = R(10, 18);
                hexCluster(kx, ky, kr, 6, true, R(0, 1) < 0.5);
                break;
            }
          })(col + R(-70, 70), y);
        }

      // Wavy dot ribbons.
      for (i = 0; i < across * 3; i++) {
        var x0 = R(left - 60, right - 200), y0 = R(top, bottom - 150);
        var len = R(260, 420), wa = R(-50, 50), amp = R(18, 40), fr = R(0.012, 0.03), rows = 4 + N(4);
        dotWave(x0, y0, len, wa, amp, fr, rows, i % 3 === 0 ? BLACK : ACCENT);
      }
      // Hexagon clusters, black and accent.
      for (i = 0; i < across * 5; i++) {
        var mx = R(left, right), my = R(top + 20, bottom - 40);
        var mr = R(11, 30), mc = 5 + N(9);
        hexMix(mx, my, mr, mc);
      }
      // Center piece.
      var midX = left + width * 0.5, midY = top + height * 0.42;
      hexCluster(midX - 60, midY - 80, 28, 12, false, false);
      tilted(midX, midY, -18, function () { smearBar(midX - width * 0.45, midY + 40, width * 0.9, 36, false, ACCENT); });
      brushArc(midX, midY, 220, 160, 150, 56, BLACK);
      dryBrush(midX - 300, midY + 260, midX + 320, midY - 240, 60, BLACK);
      halftoneArc(midX + 80, midY + 60, 120, 220, 200, 130, ACCENT);
      splatter(midX + 140, midY + 200, 58, BLACK);
      starburst(midX - 220, midY - 60, 20, 160);
      ellipse(null, B(ACCENT, 0.9), 2.4, midX, midY, 170, 160);
      // Front layer, main piece: right margin, centered low.
      var mX = right - 200, mY = top + height * 0.58;
      halftoneArc(mX, mY, 150, 200, -150, 120, ACCENT);
      tilted(mX, mY, 12, function () { smearBar(mX - 22, top - 20, 44, height * 0.9, true, ACCENT); });
      brushArc(mX + 40, mY - 30, 175, 200, 140, 46, BLACK);
      hexCluster(mX + 50, mY - 230, 26, 9, false, false);
      hexCluster(mX - 120, mY - 150, 14, 7, true, true);
      splatter(mX - 10, mY + 90, 70, BLACK);
      dryBrush(mX - 230, mY + 210, mX + 230, mY - 20, 52, BLACK);
      starburst(mX - 150, mY - 20, 22, 140);
      ellipse(null, B(ACCENT, 0.9), 2.2, mX + 20, mY - 60, 110, 104);
      splatter(mX + 120, mY - 330, 20, ACCENT);
      // Second piece: left margin, high.
      var sX = left + 140, sY = top + 230;
      hexCluster(sX - 40, sY - 90, 20, 10, false, true);
      hexCluster(sX + 70, sY + 40, 11, 6, true, false);
      tilted(sX, sY, -28, function () { smearBar(sX - 200, sY + 30, 380, 24, false, ACCENT); });
      dryBrush(sX + 60, sY - 220, sX - 40, sY + 260, 40, BLACK);
      halftoneArc(sX + 20, sY + 120, 70, 120, 20, 140, BLACK);
      splatter(sX + 90, sY + 170, 30, ACCENT);
      ellipse(null, B(BLACK, 0.85), 1.4, sX, sY, 120, 112);
      // Steve's tattoo on top.
      var t1x = left + width * 0.38, t1y = top + height * 0.18;
      bubbleHalo(t1x + 180, t1y + 260, 300);
      tattooPiece(t1x, t1y, clamp(height / 22, 26, 44));
      var t2x = right - width * 0.2, t2y = top + height * 0.12;
      bubbleHalo(t2x + 120, t2y + 220, 220);
      tattooPiece(t2x, t2y, clamp(height / 30, 20, 34));
      dotClump(left + width * 0.18, top + height * 0.78, 90);
      dotClump(right - width * 0.12, top + height * 0.82, 70);
      streakSplat(left + width * 0.12, top + height * 0.3, 46);
      streakSplat(left + width * 0.7, top + height * 0.85, 40);
      // Stray drops.
      for (i = 0; i < across * 20; i++) {
        var qx = R(left, right), qy = R(top, bottom);
        var rr = Math.pow(R(0, 1), 3) * 4 + 0.7;
        ellipse(B(i % 4 === 0 ? ACCENT : BLACK, 0.9), null, 0, qx, qy, rr, rr);
      }
    }

    function tattooPiece(ax, ay, r) {
      var gap = Math.max(3, r * 0.12);
      var dx = r * Math.sqrt(3) + gap, dy = r * 1.5 + gap * 0.87;
      function cell(q, s) { return [ax + dx * (q + s / 2.0), ay + r * 4.2 + dy * s]; }
      var cells = [], s, q;
      for (s = 0; s < 7; s++) {
        var w = (s === 0 || s === 6) ? 2 : 3 + (s % 2);
        var start = -Math.trunc(s / 2) + (s > 3 ? 1 : 0);
        for (q = start; q < start + w; q++) cells.push([q, s]);
      }
      var bone = B(BONE), ink = B(BLACK);
      cells.forEach(function (c) {
        var p = cell(c[0], c[1]);
        hex(p[0], p[1], r, BLACK, true);
        switch (N(7)) {
          case 0: case 1: hex(p[0], p[1], r * 0.62, BONE, true); hex(p[0], p[1], r * 0.4, BLACK, true); break;
          case 2: ellipse(B(ACCENT), null, 0, p[0], p[1], r * 0.17, r * 0.17); break;
          case 3: hex(p[0], p[1], r * 0.6, BONE, true); hex(p[0], p[1], r * 0.46, BLACK, true); hex(p[0], p[1], r * 0.3, BONE, true); break;
          default: break;
        }
      });
      var tw = Math.max(2, r * 0.1);
      for (var i = 0; i < 4; i++) {
        var a = cells[N(cells.length)];
        var bq = a[0] + (N(2) === 0 ? 0 : -1), bs = a[1] + 1 + N(2);
        var pa = cell(a[0], a[1]), pb = cell(bq, bs);
        line(bone, tw, pa[0], pa[1], pa[0], (pa[1] + pb[1]) / 2);
        line(bone, tw, pa[0], (pa[1] + pb[1]) / 2, pb[0], pb[1]);
        ellipse(ink, bone, tw, pb[0], pb[1], r * 0.24, r * 0.24);
      }
      var fw = Math.max(1.6, r * 0.07);
      var last = cells[cells.length - 1], o = cell(last[0], last[1]);
      for (var k = 0; k < 6; k++) {
        var s0 = [o[0] + r * 0.3 * k, o[1] + r];
        var s1 = [s0[0], s0[1] + r * (1.2 + k * 0.35)];
        var s2 = [s1[0] + r * (1 + k * 0.2), s1[1] + r * (1 + k * 0.2)];
        var s3 = [s2[0], s2[1] + r * R(0.8, 2)];
        line(ink, fw, s0[0], s0[1], s1[0], s1[1]); line(ink, fw, s1[0], s1[1], s2[0], s2[1]); line(ink, fw, s2[0], s2[1], s3[0], s3[1]);
        ellipse(ink, null, 0, s3[0], s3[1], r * 0.13, r * 0.13);
      }
      var f = cell(cells[0][0], cells[0][1]);
      for (k = 0; k < 4; k++) {
        var u0 = [f[0] - r * 1.2, f[1] - r * 0.4 * k];
        var u1 = [u0[0] - r * (1.5 + k * 0.5), u0[1] - r * (1.5 + k * 0.5)];
        var u2 = [u1[0] - r * 2, u1[1]];
        line(ink, fw, u0[0], u0[1], u1[0], u1[1]); line(ink, fw, u1[0], u1[1], u2[0], u2[1]);
        ellipse(ink, null, 0, u2[0], u2[1], r * 0.12, r * 0.12);
      }
      gauge(ax + dx * 0.2, ay + r * 0.6, r * 2.6);
    }

    function gauge(cx, cy, rad) {
      var ink = B(BLACK);
      brushArc(cx, cy, rad, 0, 360, rad * 0.22, BLACK);
      ellipse(null, B(ACCENT, 0.8), 1.6, cx, cy, rad * 1.04, rad * 1.04);
      for (var i = 0; i < 40; i++) {
        var a = R(0, Math.PI * 2), d = rad * R(0.95, 1.25), rr = R(0.6, 2.4);
        ellipse(B(i % 3 === 0 ? BLACK : ACCENT, 0.9), null, 0, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, rr);
      }
      var thin = Math.max(1.4, rad * 0.025);
      [0.78, 0.62, 0.48].forEach(function (f) {
        var a0 = R(0, 360), sweep = R(120, 260);
        arc(ink, rad * 0.06, cx, cy, rad * f, a0, a0 + sweep);
      });
      for (i = 0; i < 9; i++) {
        var a2 = i * Math.PI * 2 / 9 + R(-0.1, 0.1);
        var ox = cx + Math.cos(a2) * rad * 0.86, oy = cy + Math.sin(a2) * rad * 0.86;
        var mx = cx + Math.cos(a2) * rad * 0.55, my = cy + Math.sin(a2) * rad * 0.55;
        var nx = cx + Math.cos(a2 + 0.3) * rad * 0.4, ny = cy + Math.sin(a2 + 0.3) * rad * 0.4;
        line(ink, thin, ox, oy, mx, my); line(ink, thin, mx, my, nx, ny);
      }
      ellipse(null, B(ACCENT), rad * 0.04, cx, cy, rad * 0.24, rad * 0.24);
      hex(cx, cy, rad * 0.16, ACCENT, true);
      hex(cx, cy, rad * 0.08, BLACK, true);
    }

    function bubbleHalo(cx, cy, radius) {
      var ink = B(BLACK, 0.9);
      for (var i = 0; i < 420; i++) {
        var a = R(0, Math.PI * 2), d = radius * Math.sqrt(R(0, 1));
        if (R(0, 1) < d / radius * 0.6) continue;
        var rr = R(2.5, 6.5) * (1 - d / radius * 0.5);
        var px = cx + Math.cos(a) * d, py = cy + Math.sin(a) * d;
        if (R(0, 1) < 0.5) ellipse(ink, null, 0, px, py, rr, rr);
        else ellipse(null, ink, rr * 0.5, px, py, rr * 0.8, rr * 0.8);
      }
    }

    function dotClump(cx, cy, radius) {
      for (var i = 0; i < 70; i++) {
        var a = R(0, Math.PI * 2), d = radius * Math.pow(R(0, 1), 0.8);
        var rr = (1 - d / radius) * R(6, 16) + 1.2;
        ellipse(B(ACCENT, 0.9), null, 0, cx + Math.cos(a) * d, cy + Math.sin(a) * d, rr, rr);
      }
    }

    function streakSplat(cx, cy, size) {
      splatter(cx, cy, size, BLACK);
      var ink = B(BLACK);
      for (var i = 0; i < 5; i++) {
        var a = R(0, Math.PI * 2), len = size * R(2.5, 5);
        var ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
        line(ink, R(1.5, 3.5), cx, cy, ex, ey);
        var rx = R(2, 5), ry = R(2, 5);
        ellipse(ink, null, 0, ex, ey, rx, ry);
      }
    }

    function brushArc(cx, cy, radius, startDeg, sweepDeg, width, col) {
      var bristles = Math.trunc(width * 1.4);
      for (var i = 0; i < bristles; i++) {
        var rr = radius + (i / bristles - 0.5) * width;
        var edge = Math.abs(i / bristles - 0.5) * 2;
        var a0 = startDeg + R(0, 15 + edge * 30), a1 = startDeg + sweepDeg - R(0, 10 + edge * 50);
        var a = a0;
        while (a < a1) {
          var b = Math.min(a1, a + R(15, 70));
          var w = edge < 0.6 ? R(2.4, 4) : R(1, 2.4);
          arc(B(col, R(0.7, 1)), w, cx, cy, rr, a, b, 'round');
          a = b + (R(0, 1) < 0.1 + edge * 0.45 ? R(2, 10) : 0);
        }
      }
    }

    function dotWave(sx, sy, length, angleDeg, amp, freq, rows, col) {
      var a = angleDeg * Math.PI / 180, ph = R(0, 6);
      var dx = Math.cos(a), dy = Math.sin(a), nx = -dy, ny = dx;
      for (var row = 0; row < rows; row++) {
        var across = 1 - Math.abs(row - (rows - 1) / 2.0) / ((rows + 1) / 2.0);
        for (var t = 0; t < length; t += 11) {
          var wave = amp * Math.sin(t * freq * Math.PI * 2 / 10 + ph);
          var pulse = 0.5 + 0.5 * Math.sin(t / length * Math.PI);
          var rad = 4.8 * across * pulse;
          if (rad < 0.9) continue;
          var off = wave + (row - (rows - 1) / 2.0) * 11 + ((t / 11) % 2) * 2;
          ellipse(B(col, 0.92), null, 0, sx + dx * t + nx * off, sy + dy * t + ny * off, rad, rad);
        }
      }
    }

    function halftoneArc(cx, cy, r0, r1, startDeg, sweepDeg, col) {
      for (var r = r0; r <= r1; r += 13) {
        var step = 13 / r * 180 / Math.PI;
        for (var a = 0; a <= sweepDeg; a += step) {
          var t = a / sweepDeg, across = 1 - Math.abs((r - r0) / (r1 - r0) - 0.5) * 2;
          var rad = 5.6 * Math.pow(t, 0.9) * (0.45 + 0.55 * across);
          if (rad < 0.9) continue;
          var ang = (startDeg + a) * Math.PI / 180;
          ellipse(B(col, 0.95), null, 0, cx + r * Math.cos(ang), cy + r * Math.sin(ang), rad, rad);
        }
      }
    }

    function starburst(cx, cy, rays, reach) {
      var pen = B(BLACK, 0.8);
      for (var i = 0; i < rays; i++) {
        var a = R(0, Math.PI * 2), len = reach * Math.pow(R(0.2, 1), 0.6);
        var ex = cx + Math.cos(a) * len, ey = cy + Math.sin(a) * len;
        line(pen, 1, cx, cy, ex, ey);
        if (R(0, 1) < 0.35) ellipse(B(BLACK), null, 0, ex, ey, 3.2, 3.2);
      }
      ellipse(B(BLACK), null, 0, cx, cy, 4.5, 4.5);
    }

    var NEIGHBOURS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]];
    function grow(count) {
      var taken = { '0,0': 1 }, cells = [[0, 0]];
      while (cells.length < count) {
        var c = cells[N(cells.length)];
        var d = NEIGHBOURS[N(6)];
        var key = (c[0] + d[0]) + ',' + (c[1] + d[1]);
        if (!taken[key]) { taken[key] = 1; cells.push([c[0] + d[0], c[1] + d[1]]); }
      }
      return cells;
    }

    function hexCluster(ax, ay, r, count, outlineOnly, colorBone) {
      var dx = r * Math.sqrt(3) + 4, dy = r * 1.5 + 3.5;
      grow(count).forEach(function (c) {
        var kind = N(10);
        var col = kind < 4 ? ACCENT : colorBone ? BONE : BLACK;
        hex(ax + dx * (c[0] + c[1] / 2.0), ay + dy * c[1], r, col, !outlineOnly && kind % 3 === 0);
      });
    }

    function hexMix(ax, ay, r, count) {
      var dx = r * Math.sqrt(3) + 4, dy = r * 1.5 + 3.5;
      grow(count).forEach(function (c) {
        var col = R(0, 1) < 0.5 ? ACCENT : BLACK;
        hex(ax + dx * (c[0] + c[1] / 2.0), ay + dy * c[1], r, col, R(0, 1) < 0.45);
      });
    }

    function hex(cx, cy, r, col, fill) {
      ctx.beginPath();
      for (var i = 0; i < 6; i++) {
        var a = Math.PI / 6 + i * Math.PI / 3;
        var px = cx + r * Math.cos(a), py = cy + r * Math.sin(a);
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if (fill) { ctx.fillStyle = B(col, 0.92); ctx.fill(); }
      else { ctx.strokeStyle = B(col, 0.95); ctx.lineWidth = Math.max(2, r * 0.13); ctx.lineJoin = 'miter'; ctx.stroke(); }
    }

    function dryBrush(ax, ay, bx, by, width, col) {
      var vx = bx - ax, vy = by - ay, len = Math.hypot(vx, vy);
      var dx = vx / len, dy = vy / len, nx = -dy, ny = dx;
      var n = 40, topPts = [], bot = [], i;
      for (i = 0; i <= n; i++) {
        var t = i / n;
        var half = width * 0.38 * Math.sin(Math.PI * Math.pow(t, 0.7)) * (0.85 + R(0, 0.15));
        var o1 = half + R(-2, 2);
        topPts.push([ax + dx * len * t * 0.92 + nx * o1, ay + dy * len * t * 0.92 + ny * o1]);
        var o2 = half * R(0.75, 1) + R(-2, 2);
        bot.push([ax + dx * len * t * 0.86 - nx * o2, ay + dy * len * t * 0.86 - ny * o2]);
      }
      ctx.beginPath();
      ctx.moveTo(topPts[0][0], topPts[0][1]);
      for (i = 1; i < topPts.length; i++) ctx.lineTo(topPts[i][0], topPts[i][1]);
      for (i = bot.length - 1; i >= 0; i--) ctx.lineTo(bot[i][0], bot[i][1]);
      ctx.closePath();
      ctx.fillStyle = B(col, 0.95); ctx.fill();
      var bristles = Math.trunc(width * 1.6);
      for (i = 0; i < bristles; i++) {
        var off = (i / bristles - 0.5) * width;
        var edge = Math.abs(off) / (width / 2);
        var start = R(0, 0.18 + edge * 0.25) * len, end = len - R(0, 0.1 + edge * 0.45) * len;
        var tt = start;
        while (tt < end) {
          var seg = R(len * 0.08, len * 0.5);
          var t2 = Math.min(end, tt + seg);
          var j1 = off + R(-0.6, 0.6), j2 = off + R(-1.2, 1.2);
          var st = B(col, R(0.75, 1)), lw = R(1.2, 2.6);
          line(st, lw, ax + dx * tt + nx * j1, ay + dy * tt + ny * j1, ax + dx * t2 + nx * j2, ay + dy * t2 + ny * j2, 'round');
          tt = t2 + (R(0, 1) < 0.15 + edge * 0.4 ? R(4, 18) : 0);
        }
      }
      for (i = 0; i < 14; i++) {
        var o = R(-width / 2, width / 2);
        var f = len * R(0.85, 0.98);
        var p1x = ax + dx * f + nx * o, p1y = ay + dy * f + ny * o;
        var fl = R(20, 70), sd = R(-6, 6);
        var p2x = p1x + dx * fl + nx * sd, p2y = p1y + dy * fl + ny * sd;
        var st2 = B(col, R(0.5, 0.9));
        line(st2, R(0.8, 1.6), p1x, p1y, p2x, p2y);
      }
    }

    function smearBar(x, y, w, h, vertical, col) {
      layer(function () {
        ctx.fillStyle = B(col, 0.55);
        ctx.fillRect(x, y, w, h);
        var across = vertical ? w : h;
        for (var o = 0; o < across; o += R(0.8, 2.2)) {
          var a1 = R(0, 0.12), a2 = R(0.75, 1.05);
          var jit = R(-2, 2);
          var p1 = vertical ? [x + o, y + h * a1] : [x + w * a1, y + o];
          var p2 = vertical ? [x + o + jit, y + h * a2] : [x + w * a2, y + o + jit];
          var dark = R(0, 1) < 0.15;
          var alpha = R(0.35, 0.95);
          var brush = same(col, ACCENT) ? accentShade(alpha, dark)
            : B(dark ? [Math.floor(col[0] * 0.55), Math.floor(col[1] * 0.55), Math.floor(col[2] * 0.55)] : col, alpha);
          line(brush, R(0.8, 2), p1[0], p1[1], p2[0], p2[1]);
        }
      }, function (s) {
        // The fade: solid to 62 percent of the way along, then out to nothing.
        var g = vertical ? s.createLinearGradient(0, y, 0, y + h) : s.createLinearGradient(x, 0, x + w, 0);
        g.addColorStop(0, 'rgba(0,0,0,1)');
        g.addColorStop(0.62, 'rgba(0,0,0,1)');
        g.addColorStop(1, 'rgba(0,0,0,0)');
        s.globalCompositeOperation = 'destination-in';
        s.fillStyle = g;
        s.fillRect(x - 40, y - 40, w + 80, h + 80);
        s.globalCompositeOperation = 'source-over';
        // destination-in clears everything outside the rectangle too; the bar's strokes stay inside it.
      });
      blit(1);
    }

    function splatter(cx, cy, size, col) {
      var brush = B(col, 0.96), k, i;
      for (k = 0; k < 9; k++) {
        var bx = cx + R(-size * 0.6, size * 0.6), by = cy + R(-size * 0.3, size * 0.3);
        var br = size * R(0.28, 0.55);
        var n = 40, ph = R(0, 6), ph2 = R(0, 6);
        ctx.beginPath();
        for (i = 0; i <= n; i++) {
          var a = i * Math.PI * 2 / n;
          var rr = br * (1 + 0.12 * Math.sin(a * 4 + ph) + 0.07 * Math.sin(a * 7 + ph2) + R(-0.04, 0.04));
          var px = bx + rr * Math.cos(a), py = by + rr * Math.sin(a) * 0.85;
          if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
        }
        ctx.closePath();
        ctx.fillStyle = brush; ctx.fill();
      }
      for (i = 0; i < 260; i++) {
        var a3 = R(0, Math.PI * 2), d = size * (0.75 + Math.pow(R(0, 1), 1.8) * 1.9);
        var rad = Math.max(0.6, size * 0.075 * Math.pow(R(0, 1), 3) * (2.7 - d / size));
        var qx = cx + Math.cos(a3) * d * 1.15, qy = cy + Math.sin(a3) * d * 0.8;
        if (R(0, 1) < 0.08 && rad > 1.4) {
          var tl = rad * R(2, 3.5);
          line(brush, rad * 1.4, qx, qy, qx + Math.cos(a3) * tl, qy + Math.sin(a3) * tl, 'round');
        } else ellipse(brush, null, 0, qx, qy, rad, rad * R(0.85, 1.15));
      }
      var drips = 4 + N(4);
      for (i = 0; i < drips; i++) {
        var x = cx + R(-size * 0.75, size * 0.75);
        var y0 = cy + size * 0.15, y1 = y0 + R(size * 0.5, size * 1.8);
        var wTop = R(4, 9), wBot = wTop * 0.45;
        ctx.beginPath();
        ctx.moveTo(x - wTop / 2, y0); ctx.lineTo(x + wTop / 2, y0);
        ctx.lineTo(x + wBot / 2, y1); ctx.lineTo(x - wBot / 2, y1);
        ctx.closePath();
        ctx.fillStyle = brush; ctx.fill();
        ellipse(brush, null, 0, x, y1, wBot * 1.1, wBot * 1.35);
      }
    }
  }

  // ---- GrainTexture (KillerUI) ----------------------------------------------------------------------
  function grainTile() {
    var SIZE = 256, ALPHA = 70, SPREAD = 150, SOFTEN = 0.10, CONTRAST = 1.35, LEAN_SHARE = 0.40, LEAN_MIX = 0.80;
    function c255(v) { return v < 0 ? 0 : v > 255 ? 255 : v; }
    var rng = new DotNetRandom(1337);
    var raw = new Float64Array(SIZE * SIZE), leaning = new Uint8Array(SIZE * SIZE), i;
    for (i = 0; i < raw.length; i++) {
      var u1 = 1.0 - rng.nextDouble(), u2 = rng.nextDouble();
      raw[i] = c255(128 + SPREAD * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2));
      leaning[i] = rng.nextDouble() < LEAN_SHARE ? 1 : 0;
    }
    // Reds lean orange-brown: FromHsv(25, 0.55, 0.85).
    var lean = [217, 145, 98];
    var canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    var g = canvas.getContext('2d'), img = g.createImageData(SIZE, SIZE), px = img.data;
    for (var y = 0; y < SIZE; y++)
      for (var x = 0; x < SIZE; x++) {
        var around = (raw[((y + SIZE - 1) % SIZE) * SIZE + x] + raw[((y + 1) % SIZE) * SIZE + x]
          + raw[y * SIZE + (x + SIZE - 1) % SIZE] + raw[y * SIZE + (x + 1) % SIZE]) / 4;
        var soft = raw[y * SIZE + x] * (1 - SOFTEN) + around * SOFTEN;
        var shade = Math.round(c255(128 + (soft - 128) * CONTRAST));
        var j = y * SIZE + x, r = shade, gg = shade, b = shade;
        if (leaning[j]) {
          var k = 0.35 + 1.1 * shade / 255.0;
          r = shade * (1 - LEAN_MIX) + c255(lean[0] * k) * LEAN_MIX;
          gg = shade * (1 - LEAN_MIX) + c255(lean[1] * k) * LEAN_MIX;
          b = shade * (1 - LEAN_MIX) + c255(lean[2] * k) * LEAN_MIX;
        }
        px[j * 4] = Math.round(r); px[j * 4 + 1] = Math.round(gg); px[j * 4 + 2] = Math.round(b);
        // GrainOpacity baked in, since a CSS background layer has no opacity of its own.
        px[j * 4 + 3] = Math.round(ALPHA * GRAIN_OPACITY);
      }
    g.putImageData(img, 0, 0);
    return canvas;
  }

  // ---- Paint ----------------------------------------------------------------------------------------
  function piece(seed, opacity, w, h, dpr, scratch) {
    var canvas = document.createElement('canvas');
    canvas.width = Math.ceil(w * SCALE * dpr);
    canvas.height = Math.ceil(h * SCALE * dpr);
    var ctx = canvas.getContext('2d');
    ctx.setTransform(SCALE * dpr, 0, 0, SCALE * dpr, 0, 0);
    new Ink(ctx, seed, scratch).piece(w, h);
    if (opacity === 1) return canvas;
    var out = document.createElement('canvas');
    out.width = canvas.width; out.height = canvas.height;
    var o = out.getContext('2d');
    o.globalAlpha = opacity;
    o.drawImage(canvas, 0, 0);
    return out;
  }

  function toUrl(canvas) {
    return new Promise(function (resolve) {
      canvas.toBlob(function (blob) { resolve(URL.createObjectURL(blob)); }, 'image/png');
    });
  }

  function paint() {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    // The piece covers the screen, not the window, so resizing only shows more or less of one image.
    var sw = Math.max(screen.width, window.innerWidth), sh = Math.max(screen.height, window.innerHeight);
    var w = Math.ceil(sw / SCALE), h = Math.ceil(sh / SCALE);
    var scratch = document.createElement('canvas');
    scratch.width = Math.ceil(w * SCALE * dpr);
    scratch.height = Math.ceil(h * SCALE * dpr);
    var root = document.documentElement.style;
    Promise.all([
      toUrl(grainTile()),
      toUrl(piece(BACKGROUND_SEED, BACKGROUND_OPACITY, w, h, dpr, scratch)),
      toUrl(piece(WINDOW_SEED, PANE_OPACITY, w, h, dpr, scratch))
    ]).then(function (urls) {
      root.setProperty('--tp-grain', 'url("' + urls[0] + '")');
      root.setProperty('--tp-background', 'url("' + urls[1] + '")');
      root.setProperty('--tp-pane', 'url("' + urls[2] + '")');
      root.setProperty('--tp-size', sw + 'px ' + sh + 'px');
      document.body.classList.add('tp-ready');
    });
  }

  // The branding banners reuse the same port (thekiller-branding/trash-polka).
  window.TrashPolka = { Ink: Ink, grainTile: grainTile, SCALE: SCALE, ACCENT: ACCENT };
  if (window.TRASH_POLKA_NO_PAINT) return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', paint);
  else paint();
})();
