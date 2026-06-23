/* Звёздный Старатель — стабильный игровой рендер с внешними астероидами. */
(function () {
  'use strict';

  const CONFIG = {
    saveKey: 'star_miner_playable_v1',
    autosaveMs: 10000,
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
      { id: 'speed', name: 'Разгон двигателей', desc: '+6% скорости дронов', base: 220, growth: 1.2, max: 120 },
      { id: 'mult', name: 'Рудный анализатор', desc: '+8% ко всей добыче', base: 650, growth: 1.22, max: 100 },
      { id: 'discount', name: 'Торговый модуль', desc: 'Скидка на апгрейды', base: 2500, growth: 1.25, max: 50 },
      { id: 'offline', name: 'Ночная смена', desc: '+5% к оффлайн-доходу', base: 6000, growth: 1.28, max: 40 },
      { id: 'scanner', name: 'Сканер галактик', desc: '+3% пыли при прыжке', base: 15000, growth: 1.3, max: 60 }
    ],
    daily: [120, 450, 1200, 3000, 7500, 16000, 35000]
  };

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const SDK = window.StarMinerSDK || null;
  const TAU = Math.PI * 2;
  let W = 1, H = 1, DPR = 1, last = performance.now(), saveAt = performance.now();
  let images = {}, buttons = [], floats = [], toasts = [], modal = null, scroll = 0, drag = null, offlineReward = null;
  let state = load();

  function fresh() {
    const up = {}; CONFIG.upgrades.forEach(u => up[u.id] = 0);
    return { ore: 0, crystals: 15, dust: 0, totalOre: 0, galaxyOre: 0, taps: 0, prestiges: 0, up, daily: { date: '', streak: 0 }, lastSave: Date.now(), sound: false };
  }
  function load() {
    try { return Object.assign(fresh(), JSON.parse(localStorage.getItem(CONFIG.saveKey) || 'null') || {}); }
    catch (_) { return fresh(); }
  }
  function save() {
    try { state.lastSave = Date.now(); localStorage.setItem(CONFIG.saveKey, JSON.stringify(state)); } catch (_) {}
  }
  function resize() {
    DPR = Math.min(2, window.devicePixelRatio || 1);
    W = Math.max(320, innerWidth); H = Math.max(480, innerHeight);
    canvas.width = Math.round(W * DPR); canvas.height = Math.round(H * DPR);
    canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }
  function loadImage(src) { return new Promise(resolve => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => resolve(null); img.src = src; }); }
  async function loadImages() {
    for (const [k, src] of Object.entries(CONFIG.asteroidImages)) images[k] = await loadImage(src);
  }
  function lvl(id) { return state.up[id] || 0; }
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
  function fmt(n) {
    const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi']; let i = 0;
    while (Math.abs(n) >= 1000 && i < units.length - 1) { n /= 1000; i++; }
    return (i ? n.toFixed(n < 10 ? 2 : n < 100 ? 1 : 0) : Math.floor(n)).replace(/\.0$/, '') + units[i];
  }
  function addOre(v) { if (v <= 0) return; state.ore += v; state.totalOre += v; state.galaxyOre += v; }
  function mine(x, y) { const v = tapPower(); addOre(v); state.taps++; floats.push({ x, y, t: '+' + fmt(v), c: '#2bd8ff', life: 0.8 }); }
  function buy(id) {
    const u = CONFIG.upgrades.find(x => x.id === id); if (!u) return;
    if (lvl(id) >= u.max) return toast('Максимум');
    const c = cost(u); if (state.ore < c) return toast('Не хватает руды');
    state.ore -= c; state.up[id]++; toast('Улучшено'); save();
  }
  function prestige() {
    const g = dustGain(); if (!g) return toast('Нужно больше руды');
    state.dust += g; state.prestiges++; state.ore = 0; state.galaxyOre = 0;
    CONFIG.upgrades.forEach(u => state.up[u.id] = 0);
    modal = null; toast('Прыжок! +' + fmt(g) + ' пыли'); save();
  }
  function today() { return new Date().toISOString().slice(0, 10); }
  function claimDaily() {
    if (state.daily.date === today()) return toast('Уже получено сегодня');
    const reward = CONFIG.daily[Math.min(state.daily.streak, CONFIG.daily.length - 1)];
    addOre(reward); state.crystals += 1 + Math.floor(state.daily.streak / 3);
    state.daily.streak++; state.daily.date = today(); modal = null; toast('Ежедневка получена'); save();
  }
  function calcOffline() {
    const sec = Math.floor((Date.now() - (state.lastSave || Date.now())) / 1000);
    if (sec < 60) return;
    const capped = Math.min(sec, CONFIG.offlineCapSec), reward = offlineDps() * capped;
    if (reward > 1) { offlineReward = reward; modal = 'offline'; }
  }
  function collectOffline(k) { if (!offlineReward) return; addOre(offlineReward * k); offlineReward = null; modal = null; toast('Оффлайн-доход получен'); save(); }
  function toast(t) { toasts.push({ t, life: 2.2 }); if (toasts.length > 4) toasts.shift(); }

  function rect(x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function text(t, x, y, s, c, a) { ctx.font = '800 ' + s + 'px Arial'; ctx.fillStyle = c || '#fff'; ctx.textAlign = a || 'left'; ctx.textBaseline = 'middle'; ctx.fillText(t, x, y); }
  function btn(x, y, w, h, label, action, color) { rect(x, y, w, h, 16); ctx.fillStyle = color || 'rgba(32,158,228,.9)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke(); text(label, x + w / 2, y + h / 2, Math.min(16, h * .42), '#fff', 'center'); buttons.push({ x, y, w, h, action }); }
  function drawBg(time) {
    const g = ctx.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#061022'); g.addColorStop(0.5, '#101441'); g.addColorStop(1, '#220c48'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 150; i++) { const x = (i * 113 + time * 0.006 * (i % 4 + 1)) % W, y = (i * 79) % H, r = i % 11 === 0 ? 3 : i % 5 === 0 ? 2 : 1; ctx.globalAlpha = 0.25 + (i % 7) * 0.08; ctx.fillStyle = i % 17 === 0 ? '#ffbf2e' : i % 13 === 0 ? '#28d7ff' : '#ffffff'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); } ctx.globalAlpha = 1;
  }
  function stage() { const p = state.galaxyOre / CONFIG.prestigeOre; return p >= 3 ? 'legendary' : p >= 1.25 ? 'gold' : p >= 0.4 ? 'crystal' : 'normal'; }
  function asteroidBox() { const free = Math.max(260, H - 220), r = Math.max(105, Math.min(230, Math.min(W, free) * 0.24)); return { x: W / 2, y: 120 + free * 0.42, r }; }
  function drawTop() {
    rect(12, 12, W - 24, 76, 18); ctx.fillStyle = 'rgba(10,18,55,.9)'; ctx.fill();
    text('Руда', 62, 38, 13, '#b8c6ff'); text(fmt(state.ore), 62, 62, 20);
    text('Кристаллы', W * .35, 38, 13, '#b8c6ff'); text(fmt(state.crystals), W * .35, 62, 20, '#2bd8ff');
    text('Пыль', W * .66, 38, 13, '#b8c6ff'); text(fmt(state.dust), W * .66, 62, 20, '#ffb923');
    text(fmt(dps()) + '/сек', W - 24, 88, 13, '#6ceb49', 'right');
  }
  function drawAsteroid(time) {
    const b = asteroidBox(), img = images[stage()];
    if (img) { ctx.save(); ctx.translate(b.x, b.y); ctx.rotate(Math.sin(time * 0.00035) * 0.04); ctx.drawImage(img, -b.r, -b.r, b.r * 2, b.r * 2); ctx.restore(); }
    else { ctx.fillStyle = '#8a807a'; ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, TAU); ctx.fill(); }
    buttons.push({ x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2, action: () => mine(b.x, b.y - 20) });
    const bw = Math.min(560, W * .72), x = (W - bw) / 2, y = b.y + b.r + 30, p = Math.min(1, state.galaxyOre / CONFIG.prestigeOre);
    rect(x, y, bw, 24, 12); ctx.fillStyle = 'rgba(5,9,28,.88)'; ctx.fill(); rect(x + 3, y + 3, Math.max(18, (bw - 6) * p), 18, 10); ctx.fillStyle = '#2bd8ff'; ctx.fill();
    text(fmt(state.galaxyOre) + ' / ' + fmt(CONFIG.prestigeOre), W / 2, y + 12, 12, '#fff', 'center'); text('Тапайте астероид', W / 2, y + 58, 18, '#b8c6ff', 'center');
  }
  function drawBottom() {
    const y = H - 108, gap = 8, bw = (W - 40 - gap * 4) / 5;
    rect(10, y, W - 20, 98, 22); ctx.fillStyle = 'rgba(6,12,37,.9)'; ctx.fill();
    const items = [['Апгрейды', () => modal = 'shop'], ['Прыжок', () => modal = 'prestige'], ['Ежедневно', () => modal = 'daily'], ['Статус', () => modal = 'stats'], ['Сброс', () => { localStorage.removeItem(CONFIG.saveKey); state = fresh(); toast('Сброшено'); }]];
    items.forEach((it, i) => btn(20 + i * (bw + gap), y + 14, bw, 70, it[0], it[1], it[0] === 'Прыжок' && dustGain() ? 'rgba(244,142,32,.95)' : 'rgba(31,55,112,.92)'));
  }
  function drawModal() {
    if (!modal) return; ctx.fillStyle = 'rgba(0,0,0,.62)'; ctx.fillRect(0, 0, W, H);
    const w = Math.min(760, W - 24), h = Math.min(620, H - 56), x = (W - w) / 2, y = (H - h) / 2;
    rect(x, y, w, h, 24); ctx.fillStyle = 'rgba(23,35,88,.96)'; ctx.fill(); ctx.strokeStyle = 'rgba(43,216,255,.45)'; ctx.stroke(); btn(x + w - 76, y + 14, 56, 38, '×', () => modal = null);
    if (modal === 'shop') { text('Апгрейды', x + 24, y + 34, 24); let yy = y + 78 - scroll; CONFIG.upgrades.forEach(u => { if (yy > y + 60 && yy < y + h - 20) { rect(x + 20, yy, w - 40, 66, 16); ctx.fillStyle = 'rgba(12,24,61,.9)'; ctx.fill(); text(u.name, x + 38, yy + 18, 16); text(u.desc + ' · Lv ' + lvl(u.id) + '/' + u.max, x + 38, yy + 43, 12, '#b8c6ff'); btn(x + w - 138, yy + 12, 100, 40, lvl(u.id) >= u.max ? 'MAX' : fmt(cost(u)), () => buy(u.id), state.ore >= cost(u) ? 'rgba(76,189,44,.95)' : 'rgba(80,90,130,.75)'); } yy += 76; }); }
    if (modal === 'prestige') { const g = dustGain(); text('Прыжок в новую галактику', x + 24, y + 34, 24); text(g ? '+' + fmt(g) + ' звёздной пыли' : 'Нужно больше руды', x + w / 2, y + 180, 30, g ? '#ffb923' : '#b8c6ff', 'center'); text(fmt(state.galaxyOre) + ' / ' + fmt(CONFIG.prestigeOre), x + w / 2, y + 230, 18, '#b8c6ff', 'center'); btn(x + 48, y + h - 92, w - 96, 58, 'Совершить прыжок', prestige, g ? 'rgba(244,142,32,.95)' : 'rgba(80,90,130,.75)'); }
    if (modal === 'daily') { text('Ежедневная награда', x + 24, y + 34, 24); const reward = CONFIG.daily[Math.min(state.daily.streak, CONFIG.daily.length - 1)]; text('День ' + Math.min(7, state.daily.streak + 1), x + w / 2, y + 160, 30, '#ffb923', 'center'); text('+' + fmt(reward) + ' руды и кристаллы', x + w / 2, y + 212, 22, '#fff', 'center'); btn(x + 48, y + h - 92, w - 96, 58, state.daily.date === today() ? 'Уже получено' : 'Забрать', claimDaily, 'rgba(76,189,44,.95)'); }
    if (modal === 'offline') { text('Дроны работали без вас', x + 24, y + 34, 24); text('+' + fmt(offlineReward || 0) + ' руды', x + w / 2, y + 200, 34, '#2bd8ff', 'center'); btn(x + 48, y + h - 92, w - 96, 58, 'Забрать', () => collectOffline(1), 'rgba(76,189,44,.95)'); }
    if (modal === 'stats') { text('Статус шахтёра', x + 24, y + 34, 24); text('Всего руды: ' + fmt(state.totalOre), x + 50, y + 120, 18); text('Дронов: ' + drones(), x + 50, y + 160, 18); text('DPS: ' + fmt(dps()) + '/сек', x + 50, y + 200, 18); text('Прыжков: ' + state.prestiges, x + 50, y + 240, 18); }
  }
  function render(time) {
    const dt = Math.min(0.1, (time - last) / 1000); last = time; buttons = []; addOre(dps() * dt);
    ctx.clearRect(0, 0, W, H); drawBg(time); drawTop(); drawAsteroid(time); drawBottom();
    floats = floats.filter(f => { f.life -= dt; f.y -= 35 * dt; ctx.globalAlpha = Math.max(0, f.life / .8); text(f.t, f.x, f.y, 22, f.c, 'center'); ctx.globalAlpha = 1; return f.life > 0; });
    toasts = toasts.filter((o, i) => { o.life -= dt; rect(W / 2 - 190, 116 + i * 40, 380, 32, 16); ctx.fillStyle = 'rgba(6,12,37,.9)'; ctx.fill(); text(o.t, W / 2, 132 + i * 40, 14, '#fff', 'center'); return o.life > 0; });
    drawModal(); if (time - saveAt > CONFIG.autosaveMs) { save(); saveAt = time; } requestAnimationFrame(render);
  }
  function pointer(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => { const p = pointer(e); drag = { y: p.y, last: p.y, moved: false }; e.preventDefault(); });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const p = pointer(e), dy = p.y - drag.last; if (Math.abs(p.y - drag.y) > 8) drag.moved = true; if (modal === 'shop' && drag.moved) scroll = Math.max(0, scroll - dy); drag.last = p.y; e.preventDefault(); });
  canvas.addEventListener('pointerup', e => { const p = pointer(e), moved = drag && drag.moved; drag = null; e.preventDefault(); if (moved) return; for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h) return b.action(); } });
  canvas.addEventListener('wheel', e => { if (modal === 'shop') { scroll = Math.max(0, scroll + e.deltaY); e.preventDefault(); } }, { passive: false });
  addEventListener('resize', resize); addEventListener('beforeunload', save); document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });

  async function boot() {
    resize(); await loadImages(); calcOffline(); if (state.daily.date !== today() && !offlineReward) modal = 'daily';
    if (SDK) { try { await SDK.init({}); SDK.loadingReady(); SDK.gameplayStart(); } catch (_) {} }
    requestAnimationFrame(render); toast('Игра загружена');
  }
  boot();
})();
