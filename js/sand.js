/*
 * Duneglass sand simulation
 * A falling-sand cellular automaton rendered inside a round glass frame.
 * - Many thin, wavy strata of coloured sand (marbled look)
 * - Sand clings to the ceiling after a flip, erodes and pours in streams
 * - Falling sand is drawn as a soft, glowing "waterfall" mist
 * - A line of foam bubbles sits under the ceiling sand; small bubbles rise
 */
(function () {
  const SHADES = 8;
  const SHADE_F = [0.9, 0.93, 0.96, 0.99, 1.01, 1.04, 1.07, 1.35];

  function hexToRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const lum = ([r, g, b]) => (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  const rgba = (r, g, b, a) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0;
  const clamp = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
  const randShade = () => (Math.random() < 0.012 ? 7 : (Math.random() * 7) | 0);

  // Smooth 1D noise in [0,1] from a sum of random sines.
  function smoothNoise(n, octaves) {
    const out = new Float32Array(n);
    for (let o = 0; o < octaves; o++) {
      const freq = (o + 1) * (0.8 + Math.random() * 1.6);
      const amp = 1 / (o + 1);
      const phase = Math.random() * Math.PI * 2;
      for (let x = 0; x < n; x++) out[x] += Math.sin((x / n) * Math.PI * 2 * freq + phase) * amp;
    }
    let min = Infinity, max = -Infinity;
    for (let x = 0; x < n; x++) { if (out[x] < min) min = out[x]; if (out[x] > max) max = out[x]; }
    for (let x = 0; x < n; x++) out[x] = (out[x] - min) / (max - min || 1);
    return out;
  }

  function layer(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    return { c, ctx };
  }

  class SandSim {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.W = this.H = opts.size || 280;
      this.ticks = opts.ticks || 2;
      const { W, H } = this, N = W * H;
      this.type = new Uint8Array(N);
      this.shade = new Uint8Array(N);
      this.moving = new Uint8Array(N);
      this.mask = new Uint8Array(N);
      this.rowCount = new Int32Array(H);
      this.release = new Float32Array(W);
      this.colTop = new Int16Array(W);
      this.foamSeed = Float32Array.from({ length: W }, Math.random);
      this.bubbles = [];
      this.paused = false;
      this.visible = true;
      this.frame = 0;
      this.maxPx = 900;      // backing-store cap; lowered automatically on slow devices
      this.perf = { t: 0, n: 0, sum: 0 };

      this.sett = layer(W, H);
      this.fall = layer(W, H);
      this.mist = layer(Math.ceil(W / 3), Math.ceil(H / 3));
      this.img = this.sett.ctx.createImageData(W, H);
      this.imgF = this.fall.ctx.createImageData(W, H);
      this.buf = new Uint32Array(this.img.data.buffer);
      this.bufF = new Uint32Array(this.imgF.data.buffer);

      this.buildMask();
      this.setPalette(opts.palette);
      this.landscape();
      if (opts.autoFlip !== false) this.flip();

      this.resize();
      if ('ResizeObserver' in window) new ResizeObserver(() => this.resize()).observe(canvas);
      if ('IntersectionObserver' in window) {
        new IntersectionObserver((e) => { this.visible = e[0].isIntersecting; }).observe(canvas);
      }
      this.loop = this.loop.bind(this);
      requestAnimationFrame(this.loop);
    }

    buildMask() {
      const { W, H } = this;
      const c = (W - 1) / 2, r = W / 2 - 0.5;
      this.colTop.fill(-1);
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++) {
          const inside = (x - c) ** 2 + (y - c) ** 2 <= r * r;
          this.mask[y * W + x] = inside ? 1 : 0;
          if (inside && this.colTop[x] < 0) this.colTop[x] = y;
        }
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      // cap the backing store: past ~900px the grain texture is finer than the eye can see
      const dpr = Math.min(window.devicePixelRatio || 1, 2, this.maxPx / Math.max(1, r.width));
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.bg = null;
      this.render();
    }

    countRows() {
      const { W, H, type, rowCount } = this;
      rowCount.fill(0);
      for (let y = 0; y < H; y++) {
        let n = 0;
        for (let i = y * W, e = i + W; i < e; i++) if (type[i]) n++;
        rowCount[y] = n;
      }
    }

    setPalette(p) {
      this.palette = p;
      const n = p.sand.length;
      this.lut = new Uint32Array((n + 1) * SHADES);
      this.lutF = new Uint32Array((n + 1) * SHADES);
      this.speed = new Float32Array(n + 1);
      p.sand.forEach((hex, i) => {
        const rgb = hexToRgb(hex);
        // darker grains are heavier and sink faster; this is what separates the strata
        this.speed[i + 1] = 0.92 - 0.42 * lum(rgb);
        for (let s = 0; s < SHADES; s++) {
          const f = SHADE_F[s];
          const [r, g, b] = rgb.map((v) => clamp(v * f + (s === 7 ? 40 : 0)));
          this.lut[(i + 1) * SHADES + s] = rgba(r, g, b, 255);
          // falling grains: lighter and translucent, like sand suspended in liquid
          this.lutF[(i + 1) * SHADES + s] = rgba(clamp(r + (255 - r) * 0.65), clamp(g + (255 - g) * 0.65), clamp(b + (255 - b) * 0.65), 230);
        }
      });
      this.bg = null;
      this.render();
    }

    // Build a resting landscape made of many thin, wavy strata.
    landscape() {
      const { W, H, mask, type, shade } = this;
      const p = this.palette;
      const weights = p.weights || p.sand.map(() => 1);
      const wsum = weights.reduce((a, b) => a + b, 0);
      const pick = (prev) => {
        for (let tries = 0; tries < 6; tries++) {
          let r = Math.random() * wsum, t = 0;
          while ((r -= weights[t]) > 0) t++;
          if (t + 1 !== prev) return t + 1;
        }
        return (prev % p.sand.length) + 1;
      };
      const bands = [];
      let prev = 0;
      for (let k = 0; k < 34; k++) {
        const t = pick(prev); prev = t;
        const fleck = weights[t - 1] < 0.5;
        bands.push({ t, base: fleck ? 0.25 + Math.random() * 0.4 : 0.6 + Math.random() * 1.6, n: smoothNoise(W, 3) });
      }
      const fill = H * 0.4;
      const sum = bands.reduce((a, b) => a + b.base, 0);
      const k = fill / sum;
      const hill = smoothNoise(W, 2);
      type.fill(0); this.moving.fill(0);
      for (let x = 0; x < W; x++) {
        let c = 0;
        for (const b of bands) {
          const th = b.base * k * (0.25 + 1.5 * b.n[x]) * (0.7 + 0.6 * hill[x]);
          const end = c + th;
          for (let d = Math.ceil(c); d < end; d++) {
            const y = H - 1 - d;
            if (y < 0) break;
            const i = y * W + x;
            if (!mask[i]) continue;
            type[i] = b.t; shade[i] = randShade();
          }
          c = end;
        }
      }
      this.countRows();
    }

    makeRelease() {
      const { W } = this;
      const n = smoothNoise(W, 4);
      for (let x = 0; x < W; x++) this.release[x] = 0.0006 + 0.006 * Math.pow(n[x], 4);
      // a few "leaks": where the main waterfalls start. They widen into funnels over time (see widenLeaks).
      const leaks = 3 + ((Math.random() * 3) | 0);
      for (let j = 0; j < leaks; j++) {
        const x0 = (W * (0.15 + Math.random() * 0.7)) | 0;
        const w = Math.max(2, Math.round((2 + Math.random() * 3) * (W / 280)));
        for (let x = x0; x < x0 + w && x < W; x++) this.release[x] = 0.6;
      }
      this.frame = 0;
    }

    // When a leak column has drained up to the ceiling, the hole widens to its neighbours.
    widenLeaks() {
      const { W, type, colTop, release } = this;
      const next = release.slice();
      for (let x = 0; x < W; x++) {
        if (release[x] < 0.1 || colTop[x] < 0) continue;
        const top = colTop[x] * W + x;
        if (type[top] || type[top + W]) continue; // still sand at the ceiling here
        const r = release[x] * 0.9;
        if (x > 0 && next[x - 1] < r) next[x - 1] = r;
        if (x < W - 1 && next[x + 1] < r) next[x + 1] = r;
      }
      this.release = next;
    }

    flip() {
      this.type.reverse();
      this.shade.reverse();
      this.moving.fill(0);
      this.bubbles.length = 0;
      this.foamSeed = Float32Array.from({ length: this.W }, Math.random);
      this.countRows();
      this.makeRelease();
    }

    // Animated physical flip of the disc element, then swap the data.
    flipAnimated(el) {
      if (this.flipping) return;
      const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.flipping = true;
      this.paused = true;
      const dur = reduce ? 0 : 1100;
      el.style.transition = `transform ${dur}ms cubic-bezier(.7,0,.3,1)`;
      el.style.transform = 'rotate(180deg)';
      setTimeout(() => {
        el.style.transition = 'none';
        this.flip();
        this.render();
        el.style.transform = 'rotate(0deg)';
        this.paused = false;
        this.flipping = false;
      }, dur);
    }

    // Colour of the next grain to settle. Landing sand arrives in thin colour bands
    // (heavier grains sort out in the liquid), which builds the marbled strata.
    depositType() {
      const p = this.palette;
      if (!this.depo || this.depo.left-- <= 0) {
        const weights = p.weights || p.sand.map(() => 1);
        const wsum = weights.reduce((a, b) => a + b, 0);
        let t, tries = 0;
        do {
          let r = Math.random() * wsum; t = 0;
          while ((r -= weights[t]) > 0) t++;
          t++;
        } while (this.depo && t === this.depo.t && tries++ < 6);
        const fleck = weights[t - 1] < 0.5;
        const unit = this.W * 2.6;
        this.depo = { t, left: Math.round(unit * (fleck ? 0.3 + Math.random() * 0.4 : 0.8 + Math.random() * 2.6)) };
      }
      return this.depo.t;
    }

    settle(i) {
      this.moving[i] = 0;
      this.type[i] = this.depositType();
      this.shade[i] = randShade();
    }

    move(a, b) {
      const { type, shade, moving } = this;
      type[b] = type[a]; shade[b] = shade[a]; moving[b] = 1;
      type[a] = 0; moving[a] = 0;
      const W = this.W;
      this.rowCount[(a / W) | 0]--;
      this.rowCount[(b / W) | 0]++;
    }

    step() {
      const { W, H, type, moving, mask, release, speed } = this;
      const empty = (j) => mask[j] && !type[j];
      const rowCount = this.rowCount;
      for (let y = H - 2; y >= 0; y--) {
        if (!rowCount[y]) continue;
        const ltr = Math.random() < 0.5;
        const row = y * W;
        for (let k = 0; k < W; k++) {
          const x = ltr ? k : W - 1 - k;
          const i = row + x;
          const t = type[i];
          if (!t) continue;
          const below = i + W;
          if (empty(below)) {
            if (!moving[i]) {
              if (Math.random() < release[x]) moving[i] = 1; else continue;
            }
            if (Math.random() < speed[t]) {
              let target = below;
              // lateral diffusion: streams widen into veils as they fall
              if (Math.random() < 0.13) {
                const dx = Math.random() < 0.5 ? -1 : 1, nx = x + dx;
                if (nx >= 0 && nx < W && empty(below + dx)) target = below + dx;
              }
              this.move(i, target);
            }
          } else {
            // landing on sand that is itself still falling: wait, don't freeze mid-air
            if (moving[i] && mask[below] && moving[below]) continue;
            const dx = Math.random() < 0.5 ? -1 : 1;
            const a = below + dx, b = below - dx;
            const okA = x + dx >= 0 && x + dx < W && empty(a);
            const okB = x - dx >= 0 && x - dx < W && empty(b);
            if (moving[i]) {
              if (okA) this.move(i, a);
              else if (okB) this.move(i, b);
              else this.settle(i);
            } else if ((okA || okB) && Math.random() < 0.003) {
              // resting grains on an overhang slowly cave in (erodes the ceiling pile)
              this.move(i, okA ? a : b);
            }
          }
        }
      }
    }

    updateBubbles() {
      const { W, H, type, mask } = this;
      if (this.bubbles.length < 8 && Math.random() < 0.04) {
        const x = (W * (0.15 + Math.random() * 0.7)) | 0;
        for (let y = H - 2; y > H * 0.25; y--) {
          const i = y * W + x;
          if (mask[i] && !type[i]) {
            this.bubbles.push({ x, y, r: 0.6 + Math.random() * 1.4, vy: 0.15 + Math.random() * 0.25, p: Math.random() * 6 });
            break;
          }
        }
      }
      this.bubbles = this.bubbles.filter((b) => {
        b.y -= b.vy; b.p += 0.05; b.x += Math.sin(b.p) * 0.1;
        const i = Math.round(b.y) * W + Math.round(b.x);
        return b.y > 1 && mask[i] && !type[i];
      });
    }

    buildBg() {
      const { width: w, height: h } = this.canvas;
      const [top, bot] = this.palette.bg;
      // the liquid is a CSS background behind the (transparent) canvas: no per-frame cost
      this.canvas.style.background =
        `radial-gradient(circle at 40% 35%, rgba(255,255,255,.16), rgba(255,255,255,0) 62%), linear-gradient(${top}, ${bot})`;
      this.bg = true;

      // fine grain texture at device-pixel resolution, applied only on top of sand
      const { c: nc, ctx: ng } = layer(w, h);
      const img = ng.createImageData(w, h);
      const d = new Uint32Array(img.data.buffer);
      for (let i = 0; i < d.length; i++) {
        const v = Math.random();
        d[i] = v < 0.14 ? rgba(0, 0, 0, 25 + ((v * 300) | 0))
          : v > 0.95 ? rgba(255, 255, 255, 25 + (((v - 0.95) * 1200) | 0))
          : 0;
      }
      ng.putImageData(img, 0, 0);
      this.grain = nc;
    }

    drawFoam(ctx, s) {
      const { W, H, type, mask, colTop, foamSeed } = this;
      ctx.lineWidth = Math.max(0.8, s * 0.22);
      ctx.strokeStyle = 'rgba(255,255,255,0.55)';
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      for (let x = 1; x < W - 1; x++) {
        const seed = foamSeed[x];
        if (seed < 0.45) continue;
        let y = colTop[x];
        if (y < 0 || !type[y * W + x]) continue; // sand must be stuck to the ceiling
        while (y < H - 1 && type[y * W + x]) y++;
        if (y >= H - 2 || y > H * 0.85 || !mask[y * W + x]) continue;
        const r = (0.35 + seed * 1.1) * s;
        const cx = (x + 0.5 + (seed - 0.7) * 2) * s, cy = y * s + r * 0.9;
        ctx.moveTo(cx + r, cy);
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
      }
      ctx.fill(); ctx.stroke();
    }

    render() {
      if (!this.lut) return;
      const { W, type, shade, moving, mask, buf, bufF, lut, lutF, ctx, canvas } = this;
      const N = type.length;
      let falling = 0;
      for (let i = 0; i < N; i++) {
        const t = type[i];
        if (!t) { buf[i] = 0; bufF[i] = 0; continue; }
        const b = i + W;
        if (moving[i] && b < N && mask[b] && !type[b]) {
          bufF[i] = lutF[t * SHADES + shade[i]]; buf[i] = 0; falling++;
        } else {
          buf[i] = lut[t * SHADES + shade[i]]; bufF[i] = 0;
        }
      }
      this.sett.ctx.putImageData(this.img, 0, 0);
      if (!this.bg) this.buildBg();
      const w = canvas.width, h = canvas.height, s = w / W;
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.clearRect(0, 0, w, h);
      // sand layer: smooth upscale, then fine grain texture clipped to the sand
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(this.sett.c, 0, 0, w, h);
      ctx.globalCompositeOperation = 'source-atop';
      ctx.drawImage(this.grain, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      if (falling) {
        this.fall.ctx.putImageData(this.imgF, 0, 0);
        const m = this.mist;
        m.ctx.clearRect(0, 0, m.c.width, m.c.height);
        m.ctx.imageSmoothingEnabled = true;
        m.ctx.drawImage(this.fall.c, 0, 0, m.c.width, m.c.height);
        // glowing veil (cheap blur: downscale then upscale)
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = 0.8;
        ctx.drawImage(m.c, 0, 0, w, h);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 0.55;
        ctx.drawImage(this.fall.c, 0, 0, w, h);
        ctx.globalAlpha = 1;
      }

      this.drawFoam(ctx, s);

      ctx.lineWidth = Math.max(1, s * 0.25);
      for (const b of this.bubbles) {
        ctx.beginPath();
        ctx.arc(b.x * s, b.y * s, b.r * s, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.fill(); ctx.stroke();
      }
    }

    // Adaptive quality: if frames run slow, render the canvas at a lower resolution.
    trackPerf(now) {
      const p = this.perf;
      if (p.t) { p.sum += now - p.t; p.n++; }
      p.t = now;
      if (p.n === 90) {
        const avg = p.sum / p.n;
        if (avg > 24 && this.maxPx > 480) { this.maxPx = Math.round(this.maxPx * 0.8); this.resize(); }
        p.n = 0; p.sum = 0;
      }
    }

    loop(now) {
      requestAnimationFrame(this.loop);
      if (!this.visible || document.hidden) { this.perf.t = 0; return; }
      this.trackPerf(now);
      if (!this.paused) {
        for (let k = 0; k < this.ticks; k++) this.step();
        if (++this.frame % 12 === 0) this.widenLeaks();
        this.updateBubbles();
      }
      this.render();
    }
  }

  window.SandSim = SandSim;
})();
