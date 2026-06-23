/* Звёздный Старатель — аварийно-стабильная играбельная версия. */
(function () {
  'use strict';

  const BUILD = 'playable-2026-06-24-02';
  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d', { alpha: false });
  const fallback = document.getElementById('fallbackMessage');
  if (fallback) fallback.style.display = 'none';

  const CONFIG = {
    saveKey: 'star_miner_playable_save_v2',
    autosaveMs: 8000,
    prestigeOre: 50000,
    dustBonus: 0.04,
    offlineCapSec: 8 * 60 * 60,
    asteroidImages: {
      normal: 'assets/asteroid_normal.svg',
      crystal: 'assets/asteroid_crystal.svg',
      gold: 'assets/asteroid_gold.svg',
      legendary: 'assets/asteroid_legendary.svg'
    },
    upgrades: [
      { id: 'tap', name: 'Усилитель бура', desc: '+1 руда за тап', base: 15, growth: 1.16, max: 200 },
      { id: 'drones', name: 'Дроны', desc: '+1 авто-дрон', base: 60, growth: 1.18, max: 120 },
      { id: 'power', name: 'Лазерные резцы', desc: '+0.2 руды/сек на дрон', base: 120, growth: 1.18, max: 150 },
      { id: 'speed', name: 'Разгон двигателей', desc: '+6% скорости дронов', base: 220, growth: 1.20, max: 120 },
      { id: 'mult', name: 'Рудный анализатор', desc: '+8% ко всей добыче', base: 650, growth: 1.22, max: 100 },
      { id: 'discount', name: 'Торговый модуль', desc: 'Скидка на апгрейды', base: 2500, growth: 1.25, max: 50 },
      { id: 'offline', name: 'Ночная смена', desc: '+5% к оффлайн-доходу', base: 6000, growth: 1.28, max: 40 },
      { id: 'scanner', name: 'Сканер галактик', desc: '+3% пыли при прыжке', base: 15000, growth: 1.30, max: 60 }
    ],
    daily: [120, 450, 1200, 3000, 7500, 16000, 35000]
  };

  const TAU = Math.PI * 2;
  let W = 1, H = 1, DPR = 1;
  let last = performance.now();
  let saveAt = performance.now();
  let buttons = [];
  let floaters = [];
  let toasts = [];
  let modal = null;
  let scroll = 0;
  let drag = null;
  let offlineReward = 0;
  let asteroidImages = {};
  let imagesReady = false;
  let pulse = 0;
  let state = load();

  window.STAR_MINER_BUILD = BUILD;

  function fresh() {
    const up = {};
    CONFIG.upgrades.forEach(u => { up[u.id] = 0; });
    return {
      ore: 0,
      crystals: 15,
      dust: 0,
      totalOre: 0,
      galaxyOre: 0,
      taps: 0,
      prestiges: 0,
      up,
      daily: { date: '', streak: 0 },
      lastSave: Date.now()
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(CONFIG.saveKey);
      const data = raw ? JSON.parse(raw) : null;
      const base = fresh();
      if (!data) return base;
      return Object.assign(base, data, { up: Object.assign(base.up, data.up || {}), daily: Object.assign(base.daily, data.daily || {}) });
    } catch (error) {
      return fresh();
    }
  }

  function save() {
    try {
      state.lastSave = Date.now();
      localStorage.setItem(CONFIG.saveKey, JSON.stringify(state));
    } catch (error) {}
  }

  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, window.innerWidth || 320);
    H = Math.max(480, window.innerHeight || 480);
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function loadImage(src) {
    return new Promise(resolve => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  async function loadAsteroids() {
    const entries = Object.entries(CONFIG.asteroidImages);
    const result = await Promise.all(entries.map(async ([key, src]) => [key, await loadImage(src)]));
    result.forEach(([key, img]) => { if (img) asteroidImages[key] = img; });
    imagesReady = Object.keys(asteroidImages).length > 0;
  }

  function lvl(id) { return state.up[id] || 0; }
  function upgrade(id) { return CONFIG.upgrades.find(u => u.id === id); }
  function discount() { return Math.max(0.35, 1 - lvl('discount') * 0.018); }
  function cost(u) { return Math.floor(u.base * Math.pow(u.growth, lvl(u.id)) * discount()); }
  function mult() { return 1 + state.dust * CONFIG.dustBonus + lvl('mult') * 0.08; }
  function tapPower() { return (1 + lvl('tap')) * mult(); }
  function drones() { return 1 + lvl('drones'); }
  function dps() { return drones() * (0.25 + lvl('power') * 0.2) * (1 + lvl('speed') * 0.06) * mult(); }
  function offlineDps() { return dps() * 0.65 * (1 + lvl('offline') * 0.05); }
  function dustGain() {
    if (state.galaxyOre < CONFIG.prestigeOre) return 0;
    return Math.max(1, Math.floor(Math.sqrt(state.galaxyOre / CONFIG.prestigeOre) * 8 * (1 + lvl('scanner') * 0.03)));
  }

  function format(value) {
    const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx'];
    let i = 0;
    while (Math.abs(value) >= 1000 && i < units.length - 1) { value /= 1000; i++; }
    const text = i ? value.toFixed(value < 10 ? 2 : value < 100 ? 1 : 0) : Math.floor(value).toString();
    return text.replace(/\.0$/, '') + units[i];
  }

  function addOre(value) {
    if (!Number.isFinite(value) || value <= 0) return;
    state.ore += value;
    state.totalOre += value;
    state.galaxyOre += value;
  }

  function mine(x, y) {
    const value = tapPower();
    addOre(value);
    state.taps += 1;
    pulse = 1;
    floaters.push({ x, y, text: '+' + format(value), color: '#2bd8ff', life: 0.85 });
  }

  function buy(id) {
    const u = upgrade(id);
    if (!u) return;
    if (lvl(id) >= u.max) return toast('Максимум');
    const price = cost(u);
    if (state.ore < price) return toast('Не хватает руды');
    state.ore -= price;
    state.up[id] += 1;
    toast('Улучшено');
    save();
  }

  function prestige() {
    const gain = dustGain();
    if (!gain) return toast('Нужно больше руды для прыжка');
    state.dust += gain;
    state.prestiges += 1;
    state.ore = 0;
    state.galaxyOre = 0;
    CONFIG.upgrades.forEach(u => { state.up[u.id] = 0; });
    modal = null;
    toast('Прыжок! +' + format(gain) + ' пыли');
    save();
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function claimDaily() {
    if (state.daily.date === today()) return toast('Уже получено сегодня');
    const reward = CONFIG.daily[Math.min(state.daily.streak, CONFIG.daily.length - 1)];
    addOre(reward);
    state.crystals += 1 + Math.floor(state.daily.streak / 3);
    state.daily.date = today();
    state.daily.streak += 1;
    modal = null;
    toast('Ежедневная награда получена');
    save();
  }

  function calcOffline() {
    const seconds = Math.floor((Date.now() - (state.lastSave || Date.now())) / 1000);
    if (seconds < 60) return;
    const capped = Math.min(seconds, CONFIG.offlineCapSec);
    offlineReward = offlineDps() * capped;
    if (offlineReward > 1) modal = 'offline';
  }

  function collectOffline() {
    addOre(offlineReward);
    offlineReward = 0;
    modal = null;
    toast('Оффлайн-доход получен');
    save();
  }

  function toast(message) {
    toasts.push({ message, life: 2.4 });
    if (toasts.length > 4) toasts.shift();
  }

  function rect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function label(text, x, y, size, color, align) {
    ctx.font = '800 ' + size + 'px Arial, sans-serif';
    ctx.fillStyle = color || '#ffffff';
    ctx.textAlign = align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y);
  }

  function button(id, x, y, w, h, text, action, color) {
    rect(x, y, w, h, 16);
    ctx.fillStyle = color || 'rgba(32,158,228,.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    label(text, x + w / 2, y + h / 2, Math.min(16, h * 0.42), '#fff', 'center');
    buttons.push({ id, x, y, w, h, action });
  }

  function drawBackground(time) {
    const grad = ctx.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#07112a');
    grad.addColorStop(0.52, '#111548');
    grad.addColorStop(1, '#260e50');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, W, H);

    for (let i = 0; i < 180; i++) {
      const x = (i * 109 + time * 0.007 * (1 + i % 4)) % W;
      const y = (i * 73) % H;
      const radius = i % 17 === 0 ? 3 : i % 7 === 0 ? 2 : 1;
      ctx.globalAlpha = 0.25 + (i % 6) * 0.1;
      ctx.fillStyle = i % 19 === 0 ? '#ffbe2e' : i % 13 === 0 ? '#2bd8ff' : '#ffffff';
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function asteroidStage() {
    const progress = state.galaxyOre / CONFIG.prestigeOre;
    if (progress >= 3) return 'legendary';
    if (progress >= 1.25) return 'gold';
    if (progress >= 0.4) return 'crystal';
    return 'normal';
  }

  function asteroidBox() {
    const top = 105;
    const bottom = 128;
    const free = Math.max(260, H - top - bottom);
    const radius = Math.max(105, Math.min(230, Math.min(W, free) * 0.25));
    return { x: W / 2, y: top + free * 0.43, r: radius };
  }

  function drawFallbackAsteroid(x, y, r, stage) {
    const colors = {
      normal: ['#b9aca0', '#665851', '#241f20'],
      crystal: ['#9c7a95', '#57365f', '#170d27'],
      gold: ['#fff062', '#f0a20d', '#392004'],
      legendary: ['#ff55d7', '#5630d6', '#00d7ff']
    }[stage];
    const grad = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, 10, x, y, r);
    grad.addColorStop(0, colors[0]);
    grad.addColorStop(0.55, colors[1]);
    grad.addColorStop(1, colors[2]);
    ctx.fillStyle = grad;
    ctx.beginPath();
    for (let i = 0; i < 22; i++) {
      const a = i / 22 * TAU;
      const rr = r * (0.82 + 0.16 * Math.sin(i * 2.7));
      const px = x + Math.cos(a) * rr;
      const py = y + Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = stage === 'gold' ? '#ffd34a' : '#2bd8ff';
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 5;
    ctx.stroke();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(0,0,0,.38)';
    for (let i = 0; i < 8; i++) {
      const a = i * 1.9;
      ctx.beginPath();
      ctx.ellipse(x + Math.cos(a) * r * 0.45, y + Math.sin(a * 1.3) * r * 0.4, r * 0.08, r * 0.055, a, 0, TAU);
      ctx.fill();
    }

    if (stage !== 'normal') {
      const gemColor = stage === 'gold' ? '#fff12a' : stage === 'crystal' ? '#df52ff' : '#2bd8ff';
      ctx.fillStyle = gemColor;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      for (let i = 0; i < (stage === 'legendary' ? 8 : 5); i++) {
        const a = i * 1.35;
        const cx = x + Math.cos(a) * r * 0.42;
        const cy = y + Math.sin(a * 1.18) * r * 0.36;
        const s = r * (0.12 + (i % 3) * 0.025);
        ctx.beginPath();
        ctx.moveTo(cx, cy - s);
        ctx.lineTo(cx + s * 0.7, cy);
        ctx.lineTo(cx, cy + s);
        ctx.lineTo(cx - s * 0.7, cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
    }
  }

  function drawTop() {
    rect(12, 12, W - 24, 78, 20);
    ctx.fillStyle = 'rgba(8,16,52,.92)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(43,216,255,.38)';
    ctx.stroke();

    label('Руда', 26, 34, 12, '#9fb0dc');
    label(format(state.ore), 26, 60, 22, '#ffffff');
    label('Кристаллы', W * 0.35, 34, 12, '#9fb0dc');
    label(format(state.crystals), W * 0.35, 60, 22, '#2bd8ff');
    label('Пыль', W * 0.66, 34, 12, '#9fb0dc');
    label(format(state.dust), W * 0.66, 60, 22, '#ffb923');
    label(format(dps()) + '/сек', W - 24, 88, 13, '#6ceb49', 'right');
  }

  function drawScene(time) {
    const box = asteroidBox();
    const stage = asteroidStage();
    const img = asteroidImages[stage];
    const size = box.r * 2.05 * (1 + pulse * 0.06);

    ctx.save();
    ctx.translate(box.x, box.y);
    ctx.rotate(Math.sin(time * 0.00035) * 0.04);
    if (img && img.complete !== false) {
      ctx.drawImage(img, -size / 2, -size / 2, size, size);
    } else {
      drawFallbackAsteroid(0, 0, box.r * 0.95, stage);
    }
    ctx.restore();
    pulse = Math.max(0, pulse - 0.08);

    buttons.push({ id: 'asteroid', x: box.x - box.r, y: box.y - box.r, w: box.r * 2, h: box.r * 2, action: () => mine(box.x, box.y - 30) });

    const barW = Math.max(250, Math.min(560, W * 0.72));
    const barX = (W - barW) / 2;
    const barY = box.y + box.r + 28;
    const p = Math.max(0, Math.min(1, state.galaxyOre / CONFIG.prestigeOre));
    rect(barX, barY, barW, 24, 12);
    ctx.fillStyle = 'rgba(3,9,30,.9)';
    ctx.fill();
    rect(barX + 3, barY + 3, Math.max(18, (barW - 6) * p), 18, 10);
    ctx.fillStyle = '#2bd8ff';
    ctx.fill();
    label(format(state.galaxyOre) + ' / ' + format(CONFIG.prestigeOre), W / 2, barY + 12, 12, '#fff', 'center');
    label('Тапайте астероид', W / 2, barY + 58, 18, '#b8c6ff', 'center');
  }

  function drawBottom() {
    const y = H - 108;
    const gap = 8;
    const bw = (W - 40 - gap * 4) / 5;
    rect(10, y, W - 20, 98, 22);
    ctx.fillStyle = 'rgba(6,12,37,.92)';
    ctx.fill();

    const items = [
      ['Апгрейды', () => { modal = 'shop'; scroll = 0; }],
      ['Прыжок', () => { modal = 'prestige'; }],
      ['Ежедневно', () => { modal = 'daily'; }],
      ['Статус', () => { modal = 'stats'; }],
      ['Сброс', () => { localStorage.removeItem(CONFIG.saveKey); state = fresh(); modal = null; toast('Прогресс сброшен'); }]
    ];
    items.forEach((item, i) => {
      const color = item[0] === 'Прыжок' && dustGain() ? 'rgba(244,142,32,.95)' : 'rgba(28,48,108,.95)';
      button('nav' + i, 20 + i * (bw + gap), y + 14, bw, 70, item[0], item[1], color);
    });
  }

  function drawModal() {
    if (!modal) return;
    ctx.fillStyle = 'rgba(0,0,0,.64)';
    ctx.fillRect(0, 0, W, H);
    const mw = Math.min(760, W - 24);
    const mh = Math.min(620, H - 56);
    const mx = (W - mw) / 2;
    const my = (H - mh) / 2;
    rect(mx, my, mw, mh, 24);
    ctx.fillStyle = 'rgba(22,34,88,.97)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(43,216,255,.45)';
    ctx.lineWidth = 2;
    ctx.stroke();
    button('close', mx + mw - 76, my + 14, 56, 38, '×', () => { modal = null; }, 'rgba(32,158,228,.88)');

    if (modal === 'shop') {
      label('Апгрейды', mx + 24, my + 36, 24);
      let y = my + 78 - scroll;
      CONFIG.upgrades.forEach(u => {
        if (y > my + 60 && y < my + mh - 20) {
          rect(mx + 20, y, mw - 40, 66, 16);
          ctx.fillStyle = 'rgba(12,24,61,.92)';
          ctx.fill();
          ctx.strokeStyle = 'rgba(255,255,255,.14)';
          ctx.stroke();
          label(u.name, mx + 38, y + 18, 16);
          label(u.desc + ' · Lv ' + lvl(u.id) + '/' + u.max, mx + 38, y + 43, 12, '#b8c6ff');
          const can = state.ore >= cost(u) && lvl(u.id) < u.max;
          button('buy_' + u.id, mx + mw - 140, y + 12, 104, 42, lvl(u.id) >= u.max ? 'MAX' : format(cost(u)), () => buy(u.id), can ? 'rgba(76,189,44,.95)' : 'rgba(78,88,130,.78)');
        }
        y += 76;
      });
    }

    if (modal === 'prestige') {
      const gain = dustGain();
      label('Прыжок в новую галактику', mx + 24, my + 36, 24);
      label(gain ? '+' + format(gain) + ' звёздной пыли' : 'Нужно больше руды', mx + mw / 2, my + 180, 30, gain ? '#ffb923' : '#b8c6ff', 'center');
      label(format(state.galaxyOre) + ' / ' + format(CONFIG.prestigeOre), mx + mw / 2, my + 232, 18, '#b8c6ff', 'center');
      label('Пыль даёт постоянный множитель ко всей добыче.', mx + mw / 2, my + 272, 15, '#9fb0dc', 'center');
      button('prestige', mx + 48, my + mh - 92, mw - 96, 58, 'Совершить прыжок', prestige, gain ? 'rgba(244,142,32,.95)' : 'rgba(78,88,130,.78)');
    }

    if (modal === 'daily') {
      const reward = CONFIG.daily[Math.min(state.daily.streak, CONFIG.daily.length - 1)];
      label('Ежедневная награда', mx + 24, my + 36, 24);
      label('День ' + Math.min(7, state.daily.streak + 1), mx + mw / 2, my + 160, 30, '#ffb923', 'center');
      label('+' + format(reward) + ' руды и кристаллы', mx + mw / 2, my + 212, 22, '#ffffff', 'center');
      button('daily', mx + 48, my + mh - 92, mw - 96, 58, state.daily.date === today() ? 'Уже получено' : 'Забрать', claimDaily, 'rgba(76,189,44,.95)');
    }

    if (modal === 'offline') {
      label('Дроны работали без вас', mx + 24, my + 36, 24);
      label('+' + format(offlineReward) + ' руды', mx + mw / 2, my + 200, 34, '#2bd8ff', 'center');
      button('offline', mx + 48, my + mh - 92, mw - 96, 58, 'Забрать', () => { addOre(offlineReward); offlineReward = 0; modal = null; save(); }, 'rgba(76,189,44,.95)');
    }

    if (modal === 'stats') {
      label('Статус шахтёра', mx + 24, my + 36, 24);
      label('Всего руды: ' + format(state.totalOre), mx + 50, my + 120, 18);
      label('Дронов: ' + drones(), mx + 50, my + 160, 18);
      label('DPS: ' + format(dps()) + '/сек', mx + 50, my + 200, 18);
      label('Прыжков: ' + state.prestiges, mx + 50, my + 240, 18);
      label('Билд: ' + BUILD, mx + 50, my + 300, 14, '#9fb0dc');
    }
  }

  function update(dt) {
    addOre(dps() * dt);
  }

  function drawFloaters(dt) {
    floaters = floaters.filter(f => {
      f.life -= dt;
      f.y -= 38 * dt;
      ctx.globalAlpha = Math.max(0, f.life / 0.85);
      label(f.text, f.x, f.y, 22, f.color, 'center');
      ctx.globalAlpha = 1;
      return f.life > 0;
    });
  }

  function drawToasts(dt) {
    toasts = toasts.filter((t, i) => {
      t.life -= dt;
      const w = Math.min(W - 32, 460);
      const y = 110 + i * 40;
      rect((W - w) / 2, y, w, 32, 16);
      ctx.fillStyle = 'rgba(6,12,37,.92)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(43,216,255,.42)';
      ctx.stroke();
      label(t.message, W / 2, y + 16, 14, '#fff', 'center');
      return t.life > 0;
    });
  }

  function frame(time) {
    const dt = Math.min(0.1, Math.max(0, (time - last) / 1000));
    last = time;
    buttons = [];
    update(dt);
    drawBackground(time);
    drawTop();
    drawScene(time);
    drawBottom();
    drawFloaters(dt);
    drawToasts(dt);
    drawModal();
    if (time - saveAt > CONFIG.autosaveMs) { save(); saveAt = time; }
    requestAnimationFrame(frame);
  }

  function pointer(event) {
    const box = canvas.getBoundingClientRect();
    return { x: event.clientX - box.left, y: event.clientY - box.top };
  }

  canvas.addEventListener('pointerdown', event => {
    const p = pointer(event);
    drag = { y: p.y, last: p.y, moved: false };
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointermove', event => {
    if (!drag) return;
    const p = pointer(event);
    const dy = p.y - drag.last;
    if (Math.abs(p.y - drag.y) > 8) drag.moved = true;
    if (modal === 'shop' && drag.moved) scroll = Math.max(0, scroll - dy);
    drag.last = p.y;
    event.preventDefault();
  }, { passive: false });

  canvas.addEventListener('pointerup', event => {
    const p = pointer(event);
    const moved = drag && drag.moved;
    drag = null;
    event.preventDefault();
    if (moved) return;
    for (let i = buttons.length - 1; i >= 0; i--) {
      const b = buttons[i];
      if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) {
        b.action();
        return;
      }
    }
  }, { passive: false });

  canvas.addEventListener('wheel', event => {
    if (modal === 'shop') {
      scroll = Math.max(0, scroll + event.deltaY);
      event.preventDefault();
    }
  }, { passive: false });

  window.addEventListener('resize', resize);
  window.addEventListener('beforeunload', save);
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  window.addEventListener('error', event => {
    console.error('[StarMiner error]', event.error || event.message);
    try {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.fillStyle = '#05081c';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    } catch (_) {}
  });

  async function boot() {
    resize();
    calcOffline();
    if (!offlineReward && state.daily.date !== today()) modal = 'daily';
    requestAnimationFrame(frame);
    loadAsteroids().then(() => toast(imagesReady ? 'Астероиды загружены' : 'Астероиды рисуются fallback-режимом'));
    toast('Игра запущена: ' + BUILD);
  }

  boot();
})();
