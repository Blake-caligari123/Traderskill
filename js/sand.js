/*
 * Duneglass sand simulation
 * A small falling-sand cellular automaton rendered inside a round "glass" frame.
 * Sand rests on the ceiling after a flip and trickles down in streams,
 * building a new layered landscape every time.
 */
(function () {
  const SHADES = 8;

  function hexToRgb(h) {
    h = h.replace('#', '');
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }

  // Smooth 1D noise in [0,1] from a sum of random sines.
  function smoothNoise(n, octaves) {
    const out = new Float32Array(n);
    for (let o = 0; o < octaves; o++) {
      const freq = (o + 1) * (1 + Math.random() * 1.5);
      const amp = 1 / (o + 1);
      const phase = Math.random() * Math.PI * 2;
      for (let x = 0; x < n; x++) out[x] += Math.sin((x / n) * Math.PI * 2 * freq + phase) * amp;
    }
    let min = Infinity, max = -Infinity;
    for (let x = 0; x < n; x++) { if (out[x] < min) min = out[x]; if (out[x] > max) max = out[x]; }
    for (let x = 0; x < n; x++) out[x] = (out[x] - min) / (max - min || 1);
    return out;
  }

  class SandSim {
    constructor(canvas, opts = {}) {
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
      this.W = this.H = opts.size || 180;
      this.ticks = opts.ticks || 2;
      const N = this.W * this.H;
      this.type = new Uint8Array(N);
      this.shade = new Uint8Array(N);
      this.moving = new Uint8Array(N);
      this.mask = new Uint8Array(N);
      this.release = new Float32Array(this.W);
      // per sand type: chance to move each tick while falling (heavier = faster)
      this.speed = [0, 0.85, 0.55, 0.7, 0.95];
      this.bubbles = [];
      this.paused = false;
      this.visible = true;
      this.rot = 0;

      this.off = document.createElement('canvas');
      this.off.width = this.W; this.off.height = this.H;
      this.offCtx = this.off.getContext('2d');
      this.img = this.offCtx.createImageData(this.W, this.H);
      this.buf = new Uint32Array(this.img.data.buffer);

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
      const c = (W - 1) / 2, r = W / 2 - 1;
      for (let y = 0; y < H; y++)
        for (let x = 0; x < W; x++)
          this.mask[y * W + x] = (x - c) ** 2 + (y - c) ** 2 <= r * r ? 1 : 0;
    }

    resize() {
      const r = this.canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      this.canvas.width = Math.max(1, Math.round(r.width * dpr));
      this.canvas.height = Math.max(1, Math.round(r.height * dpr));
      this.bg = null;
      this.render();
    }

    setPalette(p) {
      this.palette = p;
      this.lut = new Uint32Array(5 * SHADES);
      p.sand.forEach((hex, i) => {
        const [r, g, b] = hexToRgb(hex);
        for (let s = 0; s < SHADES; s++) {
          const f = 0.8 + s * 0.05;
          const R = Math.min(255, r * f + 4), G = Math.min(255, g * f + 4), B = Math.min(255, b * f + 4);
          this.lut[(i + 1) * SHADES + s] = (255 << 24) | (B << 16) | (G << 8) | R;
        }
      });
      this.bg = null;
      this.render();
    }

    landscape() {
      const { W, H } = this;
      this.type.fill(0); this.moving.fill(0);
      const n = [smoothNoise(W, 3), smoothNoise(W, 4), smoothNoise(W, 4), smoothNoise(W, 5)];
      for (let x = 0; x < W; x++) {
        const h1 = H * (0.08 + 0.04 * n[0][x]);
        const h2 = h1 + H * (0.06 + 0.08 * n[1][x]);
        const h3 = h2 + H * (0.05 + 0.1 * n[2][x]);
        const h4 = h3 + H * (0.04 + 0.13 * n[3][x]);
        for (let y = H - 1; y >= 0; y--) {
          const d = H - 1 - y, i = y * W + x;
          if (!this.mask[i]) continue;
          const t = d < h1 ? 1 : d < h2 ? 2 : d < h3 ? 3 : d < h4 ? 4 : 0;
          if (!t) break;
          this.type[i] = t;
          this.shade[i] = (Math.random() * SHADES) | 0;
        }
      }
    }

    makeRelease() {
      const { W } = this;
      const n = smoothNoise(W, 5);
      for (let x = 0; x < W; x++) this.release[x] = 0.006 + 0.16 * Math.pow(n[x], 3);
      // narrow "leaks" that make the classic sand streams
      const leaks = 5 + ((Math.random() * 4) | 0);
      for (let k = 0; k < leaks; k++) {
        const x = (W * (0.12 + Math.random() * 0.76)) | 0;
        const w = 1 + ((Math.random() * 3) | 0);
        for (let j = 0; j < w && x + j < W; j++) this.release[x + j] = 0.5;
      }
    }

    flip() {
      this.type.reverse();
      this.shade.reverse();
      this.moving.fill(0);
      this.bubbles.length = 0;
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

    move(a, b) {
      const { type, shade, moving } = this;
      type[b] = type[a]; shade[b] = shade[a]; moving[b] = 1;
      type[a] = 0; moving[a] = 0;
    }

    step() {
      const { W, H, type, moving, mask, release, speed } = this;
      for (let y = H - 2; y >= 0; y--) {
        const ltr = Math.random() < 0.5;
        const row = y * W;
        for (let k = 0; k < W; k++) {
          const x = ltr ? k : W - 1 - k;
          const i = row + x;
          const t = type[i];
          if (!t) continue;
          const below = i + W;
          if (mask[below] && !type[below]) {
            if (!moving[i]) {
              if (Math.random() < release[x]) moving[i] = 1; else continue;
            }
            if (Math.random() < speed[t]) {
              let target = below;
              if (Math.random() < 0.12) {
                const dx = Math.random() < 0.5 ? -1 : 1;
                const nx = x + dx, d = below + dx;
                if (nx >= 0 && nx < W && mask[d] && !type[d]) target = d;
              }
              this.move(i, target);
            }
          } else if (moving[i]) {
            const dx = Math.random() < 0.5 ? -1 : 1;
            const a = below + dx, b = below - dx;
            if (x + dx >= 0 && x + dx < W && mask[a] && !type[a]) this.move(i, a);
            else if (x - dx >= 0 && x - dx < W && mask[b] && !type[b]) this.move(i, b);
            else moving[i] = 0;
          }
        }
      }
    }

    updateBubbles() {
      const { W, H, type, mask } = this;
      if (this.bubbles.length < 7 && Math.random() < 0.03) {
        const x = (W * (0.15 + Math.random() * 0.7)) | 0;
        for (let y = H - 2; y > H * 0.2; y--) {
          const i = y * W + x;
          if (mask[i] && !type[i]) {
            this.bubbles.push({ x, y, r: 0.8 + Math.random() * 1.8, vy: 0.12 + Math.random() * 0.2, p: Math.random() * 6 });
            break;
          }
        }
      }
      this.bubbles = this.bubbles.filter((b) => {
        b.y -= b.vy; b.p += 0.05; b.x += Math.sin(b.p) * 0.08;
        const i = Math.round(b.y) * W + Math.round(b.x);
        return b.y > 1 && mask[i] && !type[i];
      });
    }

    buildBg() {
      const { width: w, height: h } = this.canvas;
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const g = c.getContext('2d');
      const lin = g.createLinearGradient(0, 0, 0, h);
      lin.addColorStop(0, this.palette.bg[0]);
      lin.addColorStop(1, this.palette.bg[1]);
      g.fillStyle = lin; g.fillRect(0, 0, w, h);
      const rad = g.createRadialGradient(w * 0.35, h * 0.3, 0, w * 0.5, h * 0.5, w * 0.7);
      rad.addColorStop(0, 'rgba(255,255,255,0.35)');
      rad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = rad; g.fillRect(0, 0, w, h);
      this.bg = c;
    }

    render() {
      if (!this.lut) return;
      const { type, shade, buf, lut, ctx, canvas } = this;
      for (let i = 0; i < type.length; i++) {
        const t = type[i];
        buf[i] = t ? lut[t * SHADES + shade[i]] : 0;
      }
      this.offCtx.putImageData(this.img, 0, 0);
      if (!this.bg) this.buildBg();
      const w = canvas.width, h = canvas.height, s = w / this.W;
      ctx.drawImage(this.bg, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(this.off, 0, 0, w, h);
      for (const b of this.bubbles) {
        ctx.beginPath();
        ctx.arc(b.x * s, b.y * s, b.r * s, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        ctx.strokeStyle = 'rgba(255,255,255,0.6)';
        ctx.lineWidth = Math.max(1, s * 0.3);
        ctx.fill(); ctx.stroke();
      }
    }

    loop() {
      requestAnimationFrame(this.loop);
      if (!this.visible || document.hidden) return;
      if (!this.paused) {
        for (let k = 0; k < this.ticks; k++) this.step();
        this.updateBubbles();
      }
      this.render();
    }
  }

  window.SandSim = SandSim;
})();
