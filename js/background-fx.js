/* Background FX: twinkling stars and rare comets. */
(function () {
  'use strict';

  const stars = [];
  let comets = [];
  let lastTime = performance.now();
  let lastSize = '';

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function canvasInfo() {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return null;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    return { canvas, ctx: canvas.getContext('2d'), dpr, w: canvas.width / dpr, h: canvas.height / dpr };
  }

  function initStars(w, h) {
    stars.length = 0;
    const count = Math.max(35, Math.min(90, Math.floor(w * h / 18000)));
    for (let i = 0; i < count; i += 1) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: rand(0.6, 2.3),
        phase: Math.random() * Math.PI * 2,
        speed: rand(0.7, 2.6),
        alpha: rand(0.25, 0.85),
        color: Math.random() < 0.12 ? '#ffd36b' : (Math.random() < 0.22 ? '#62ddff' : '#ffffff')
      });
    }
  }

  function spawnComet(w, h) {
    const speed = rand(520, 900);
    const fromTop = Math.random() < 0.68;
    comets.push({
      x: fromTop ? rand(w * 0.15, w * 1.05) : rand(w * 0.82, w + 140),
      y: fromTop ? rand(-90, h * 0.18) : rand(-40, h * 0.35),
      vx: -speed * rand(0.74, 1.0),
      vy: speed * rand(0.28, 0.46),
      size: rand(70, 150),
      life: rand(0.85, 1.55)
    });
  }

  function draw(time) {
    const info = canvasInfo();
    if (!info) {
      requestAnimationFrame(draw);
      return;
    }

    const { ctx, dpr, w, h } = info;
    const size = w + 'x' + h;
    if (size !== lastSize) {
      lastSize = size;
      initStars(w, h);
    }

    const dt = Math.min(0.1, Math.max(0, (time - lastTime) / 1000));
    lastTime = time;

    if (Math.random() < 0.12 * dt) spawnComet(w, h);
    comets = comets.filter(c => {
      c.x += c.vx * dt;
      c.y += c.vy * dt;
      c.life -= dt;
      return c.life > 0 && c.x > -300 && c.y < h + 300;
    });

    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    for (const s of stars) {
      const twinkle = (Math.sin(time * 0.001 * s.speed + s.phase) + 1) * 0.5;
      ctx.globalAlpha = Math.min(1, s.alpha * (0.35 + twinkle * 1.05));
      ctx.fillStyle = s.color;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = 1;
    for (const c of comets) {
      const len = Math.hypot(c.vx, c.vy) || 1;
      const tx = c.x + (c.vx / len) * 135;
      const ty = c.y + (c.vy / len) * 135;
      const grad = ctx.createLinearGradient(c.x, c.y, tx, ty);
      grad.addColorStop(0, 'rgba(255,255,255,0.95)');
      grad.addColorStop(0.18, 'rgba(125,220,255,0.72)');
      grad.addColorStop(1, 'rgba(125,220,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = Math.max(2, c.size * 0.06);
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(c.x, c.y);
      ctx.lineTo(tx, ty);
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(c.x, c.y, Math.max(2, c.size * 0.04), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    requestAnimationFrame(draw);
  }

  requestAnimationFrame(draw);
})();
