/*
  Звёздный Старатель — Фаза 2: игровое ядро.
  Чистый Canvas + JavaScript. Без сборщика, без зависимостей.
  Все игровые числа вынесены в CONFIG, чтобы баланс можно было менять без поиска по коду.
*/
(function () {
  'use strict';

  // ============================================================================
  // CONFIG: баланс, тайминги, формулы и награды.
  // ============================================================================
  const CONFIG = {
    save: { version: 1, key: 'star_miner_save_v1', autosaveMs: 15000 },
    start: { ore: 0, crystals: 15, starDust: 0, drones: 1 },
    mining: {
      baseTap: 1,                  // руда за тап без апгрейдов
      baseDronePerSec: 0.25,       // добыча одного дрона в секунду
      critChancePerLevel: 0.015,   // шанс критического тапа за уровень
      critMultiplier: 6            // множитель критического тапа
    },
    economy: {
      costGrowth: 1.17,            // рост цены по умолчанию
      discountPerLevel: 0.018,     // скидка от торгового модуля
      minCostFactor: 0.35          // цена не падает ниже 35% от базовой кривой
    },
    prestige: {
      unlockOre: 50000,            // руда в текущей галактике для первого прыжка
      baseDustGain: 8,             // база формулы пыли
      orePower: 0.5,               // 0.5 = квадратный корень, мягкий рост
      dustBonus: 0.04,             // +4% ко всей добыче за 1 звёздную пыль
      scannerBonus: 0.03           // +3% пыли за уровень сканера
    },
    offline: {
      capSeconds: 8 * 60 * 60,     // максимум оффлайн-дохода: 8 часов
      incomeFactor: 0.65,          // оффлайн менее выгоден, чем онлайн
      minSecondsToShow: 60         // окно оффлайна показывается от 1 минуты
    },
    daily: [
      { ore: 120, crystals: 1 },
      { ore: 450, crystals: 1 },
      { ore: 1200, crystals: 2 },
      { ore: 3000, crystals: 2 },
      { ore: 7500, crystals: 3 },
      { ore: 16000, crystals: 4 },
      { ore: 35000, crystals: 6 }
    ],
    upgrades: [
      { id: 'tap', name: 'Усилитель бура', desc: '+1 руда за тап', max: 200, cost: 15, growth: 1.16, tapAdd: 1, icon: 'icon_upgrade' },
      { id: 'drones', name: 'Новые дроны', desc: '+1 добывающий дрон', max: 120, cost: 60, growth: 1.18, dronesAdd: 1, icon: 'drone_basic' },
      { id: 'dronePower', name: 'Лазерные резцы', desc: '+0.18 руды/сек к дрону', max: 160, cost: 95, growth: 1.17, droneAdd: 0.18, icon: 'effect_spark' },
      { id: 'droneSpeed', name: 'Разгон двигателей', desc: '+6% скорости дронов', max: 120, cost: 180, growth: 1.18, speed: 0.06, icon: 'effect_tap_burst' },
      { id: 'mult', name: 'Рудный анализатор', desc: '+8% ко всей добыче', max: 100, cost: 550, growth: 1.22, global: 0.08, icon: 'currency_ore' },
      { id: 'crit', name: 'Критические трещины', desc: '+1.5% шанс крит. тапа', max: 50, cost: 1300, growth: 1.24, icon: 'effect_spark' },
      { id: 'discount', name: 'Торговый модуль', desc: 'Снижает цены апгрейдов', max: 50, cost: 2600, growth: 1.25, icon: 'icon_shop' },
      { id: 'offline', name: 'Ночная смена', desc: '+4% к оффлайн-доходу', max: 40, cost: 6000, growth: 1.28, offline: 0.04, icon: 'icon_daily' },
      { id: 'scanner', name: 'Сканер галактик', desc: '+3% пыли при прыжке', max: 60, cost: 15000, growth: 1.30, icon: 'icon_prestige' },
      { id: 'crystal', name: 'Кристальный фильтр', desc: 'Кристаллы за крупную добычу', max: 25, cost: 50000, growth: 1.34, icon: 'currency_crystal' }
    ],
    achievements: [
      { id: 'tap1', name: 'Первый удар', desc: 'Тапните астероид', value: 'taps', target: 1, crystals: 1 },
      { id: 'ore1k', name: 'Тысяча руды', desc: 'Добудьте 1K руды всего', value: 'totalOre', target: 1000, crystals: 2 },
      { id: 'ore1m', name: 'Миллионер', desc: 'Добудьте 1M руды всего', value: 'totalOre', target: 1000000, crystals: 5 },
      { id: 'drones5', name: 'Рой помощников', desc: 'Получите 5 дронов', value: 'drones', target: 5, crystals: 2 },
      { id: 'up20', name: 'Инженер', desc: 'Купите 20 уровней апгрейдов', value: 'upgradeLevels', target: 20, crystals: 3 },
      { id: 'prestige1', name: 'Новая галактика', desc: 'Сделайте первый прыжок', value: 'prestiges', target: 1, crystals: 6 },
      { id: 'dust100', name: 'Звёздный след', desc: 'Накопите 100 пыли', value: 'starDust', target: 100, crystals: 8 },
      { id: 'daily3', name: 'Возвращение', desc: 'Заберите ежедневку 3 дня', value: 'dailyStreak', target: 3, crystals: 3 }
    ]
  };

  const TEXT = {
    ore: 'Руда', crystals: 'Кристаллы', dust: 'Пыль', shop: 'Апгрейды', jump: 'Прыжок',
    ach: 'Достижения', daily: 'Ежедневно', settings: 'Настройки', buy: 'Купить', max: 'Макс.',
    close: 'Закрыть', collect: 'Забрать', notEnough: 'Не хватает руды', saved: 'Сохранено'
  };

  const canvas = document.getElementById('gameCanvas');
  const ctx = canvas.getContext('2d');
  const TAU = Math.PI * 2;
  let W = 1, H = 1, DPR = 1, last = performance.now(), autosaveAt = performance.now();
  let assets = window.StarMinerProceduralAssets ? window.StarMinerProceduralAssets.createAssets().sprites : {};
  let buttons = [], floaters = [], toasts = [], modal = null, modalScroll = 0, drag = null, pendingOffline = null;
  let tapPulse = 0, crystalBucket = 0;

  function defaultSave() {
    const upgrades = {};
    CONFIG.upgrades.forEach(u => upgrades[u.id] = 0);
    return {
      version: CONFIG.save.version,
      ore: CONFIG.start.ore,
      crystals: CONFIG.start.crystals,
      starDust: CONFIG.start.starDust,
      totalOre: 0,
      galaxyOre: 0,
      taps: 0,
      prestiges: 0,
      upgradeLevels: 0,
      upgrades,
      achievements: {},
      daily: { streak: 0, lastDate: '', pending: false },
      settings: { sound: false },
      lastSaveTime: Date.now()
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(CONFIG.save.key);
      const data = raw ? JSON.parse(raw) : null;
      const fresh = defaultSave();
      if (!data) return fresh;
      return {
        ...fresh,
        ...data,
        upgrades: { ...fresh.upgrades, ...(data.upgrades || {}) },
        achievements: { ...fresh.achievements, ...(data.achievements || {}) },
        daily: { ...fresh.daily, ...(data.daily || {}) },
        settings: { ...fresh.settings, ...(data.settings || {}) },
        version: CONFIG.save.version
      };
    } catch (e) {
      console.warn('Ошибка загрузки сохранения:', e);
      return defaultSave();
    }
  }

  let state = load();

  function save() {
    try {
      state.lastSaveTime = Date.now();
      localStorage.setItem(CONFIG.save.key, JSON.stringify(state));
      return true;
    } catch (e) {
      console.warn('Ошибка сохранения:', e);
      return false;
    }
  }

  function resize() {
    DPR = Math.min(2, Math.max(1, window.devicePixelRatio || 1));
    W = Math.max(320, Math.floor(innerWidth));
    H = Math.max(480, Math.floor(innerHeight));
    canvas.width = Math.floor(W * DPR);
    canvas.height = Math.floor(H * DPR);
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  }

  function fmt(n) {
    if (!isFinite(n)) return '0';
    const units = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc'];
    let u = 0;
    while (Math.abs(n) >= 1000 && u < units.length - 1) { n /= 1000; u++; }
    const d = Math.abs(n) >= 100 ? 0 : Math.abs(n) >= 10 ? 1 : u ? 2 : 0;
    return n.toFixed(d).replace(/\.0+$|(?<=\.\d)0+$/g, '') + units[u];
  }

  function rect(x, y, w, h, r = 14) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(str, x, y, size, color = '#f4f7ff', align = 'left', weight = '700') {
    ctx.font = `${weight} ${size}px Arial, sans-serif`;
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(str, x, y);
  }

  function lvl(id) { return state.upgrades[id] || 0; }
  function up(id) { return CONFIG.upgrades.find(u => u.id === id); }
  function discount() { return Math.max(CONFIG.economy.minCostFactor, 1 - lvl('discount') * CONFIG.economy.discountPerLevel); }
  function cost(u) { return Math.floor(u.cost * Math.pow(u.growth || CONFIG.economy.costGrowth, lvl(u.id)) * discount()); }
  function drones() { return CONFIG.start.drones + lvl('drones'); }
  function mult() { return 1 + state.starDust * CONFIG.prestige.dustBonus + lvl('mult') * up('mult').global; }
  function tapPower() { return (CONFIG.mining.baseTap + lvl('tap') * up('tap').tapAdd) * mult(); }
  function dps() {
    const power = CONFIG.mining.baseDronePerSec + lvl('dronePower') * up('dronePower').droneAdd;
    const speed = 1 + lvl('droneSpeed') * up('droneSpeed').speed;
    return drones() * power * speed * mult();
  }
  function offlineDps() { return dps() * CONFIG.offline.incomeFactor * (1 + lvl('offline') * up('offline').offline); }
  function dustGain() {
    if (state.galaxyOre < CONFIG.prestige.unlockOre) return 0;
    const base = Math.pow(state.galaxyOre / CONFIG.prestige.unlockOre, CONFIG.prestige.orePower) * CONFIG.prestige.baseDustGain;
    return Math.max(1, Math.floor(base * (1 + lvl('scanner') * CONFIG.prestige.scannerBonus)));
  }

  function addOre(amount) {
    if (amount <= 0 || !isFinite(amount)) return;
    state.ore += amount;
    state.totalOre += amount;
    state.galaxyOre += amount;
    if (lvl('crystal') > 0) {
      crystalBucket += amount;
      const threshold = Math.max(25000, 250000 / lvl('crystal'));
      while (crystalBucket >= threshold) {
        crystalBucket -= threshold;
        state.crystals += 1;
        toast('+1 кристалл');
      }
    }
  }

  function mine(x, y) {
    let amount = tapPower();
    const crit = Math.random() < lvl('crit') * CONFIG.mining.critChancePerLevel;
    if (crit) amount *= CONFIG.mining.critMultiplier;
    addOre(amount);
    state.taps += 1;
    tapPulse = 1;
    floater('+' + fmt(amount), x, y - 44, crit ? '#ffb923' : '#2bd8ff');
    if (crit) floater('КРИТ!', x, y - 76, '#ffb923');
    checkAchievements();
  }

  function buy(id) {
    const u = up(id);
    if (!u) return;
    if (lvl(id) >= u.max) return toast(TEXT.max);
    const price = cost(u);
    if (state.ore < price) return toast(TEXT.notEnough);
    state.ore -= price;
    state.upgrades[id]++;
    state.upgradeLevels++;
    floater('UP!', W / 2, H / 2 - 120, '#6ceb49');
    checkAchievements();
  }

  function prestige() {
    const gain = dustGain();
    if (!gain) return toast('Нужно больше руды для прыжка');
    save();
    state.starDust += gain;
    state.prestiges++;
    state.ore = 0;
    state.galaxyOre = 0;
    CONFIG.upgrades.forEach(u => state.upgrades[u.id] = 0);
    crystalBucket = 0;
    modal = null;
    toast('Прыжок! +' + fmt(gain) + ' пыли');
    checkAchievements();
    save();
  }

  function today() { return new Date().toISOString().slice(0, 10); }
  function dailyReward() { return CONFIG.daily[Math.min(state.daily.streak, CONFIG.daily.length - 1)]; }
  function prepareDaily() {
    if (state.daily.lastDate !== today()) {
      state.daily.pending = true;
      if (!modal) modal = 'daily';
    }
  }
  function claimDaily() {
    if (!state.daily.pending) return;
    const r = dailyReward();
    addOre(r.ore);
    state.crystals += r.crystals;
    state.daily.streak++;
    state.daily.lastDate = today();
    state.daily.pending = false;
    toast(`Ежедневка: +${fmt(r.ore)} руды, +${r.crystals} кр.`);
    modal = null;
    checkAchievements();
    save();
  }

  function applyOffline() {
    const seconds = Math.floor((Date.now() - (state.lastSaveTime || Date.now())) / 1000);
    if (seconds < CONFIG.offline.minSecondsToShow) return;
    const capped = Math.min(seconds, CONFIG.offline.capSeconds);
    const gain = offlineDps() * capped;
    if (gain > 1) {
      pendingOffline = { seconds, capped, gain };
      modal = 'offline';
    }
  }
  function collectOffline(multiplier) {
    if (!pendingOffline) return;
    addOre(pendingOffline.gain * multiplier);
    toast('Оффлайн: +' + fmt(pendingOffline.gain * multiplier) + ' руды');
    pendingOffline = null;
    modal = null;
    save();
  }

  function achievementValue(a) {
    if (a.value === 'drones') return drones();
    if (a.value === 'dailyStreak') return state.daily.streak;
    return state[a.value] || 0;
  }
  function checkAchievements() {
    CONFIG.achievements.forEach(a => {
      if (state.achievements[a.id]) return;
      if (achievementValue(a) >= a.target) {
        state.achievements[a.id] = true;
        state.crystals += a.crystals;
        toast('Достижение: +' + a.crystals + ' кр.');
      }
    });
  }

  function floater(label, x, y, color) { floaters.push({ label, x, y, color, life: 0.85 }); }
  function toast(label) { toasts.push({ label, life: 2.6 }); if (toasts.length > 4) toasts.shift(); }
  function btn(id, x, y, w, h, label, action) { buttons.push({ id, x, y, w, h, label, action }); }

  function asteroidBox() {
    const top = 104, bottom = 126;
    const free = Math.max(220, H - top - bottom);
    const r = Math.max(86, Math.min(160, Math.min(W, free) * 0.26));
    return { x: W / 2, y: top + free * 0.48, r };
  }

  function asteroidSprite() {
    const p = state.galaxyOre / CONFIG.prestige.unlockOre;
    if (p >= 3) return 'asteroid_legendary';
    if (p >= 1.25) return 'asteroid_gold';
    if (p >= 0.4) return 'asteroid_crystal';
    return 'asteroid_normal';
  }

  function drawBackground(time) {
    const bg = assets.background_space;
    if (bg) {
      const s = Math.max(W / bg.width, H / bg.height);
      ctx.drawImage(bg, (W - bg.width * s) / 2, (H - bg.height * s) / 2, bg.width * s, bg.height * s);
    } else {
      ctx.fillStyle = '#05081c'; ctx.fillRect(0, 0, W, H);
    }
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgba(0,0,0,.25)'); g.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.65)';
    for (let i = 0; i < 24; i++) {
      const x = (i * 97 + time * 0.006 * (i % 3 + 1)) % W;
      const y = (i * 53) % H;
      ctx.globalAlpha = 0.25 + (i % 5) * 0.12;
      ctx.beginPath(); ctx.arc(x, y, i % 4 ? 1 : 1.8, 0, TAU); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawTop() {
    rect(12, 12, W - 24, 78, 20);
    ctx.fillStyle = 'rgba(13,22,59,.88)'; ctx.fill();
    ctx.strokeStyle = 'rgba(43,216,255,.48)'; ctx.lineWidth = 2; ctx.stroke();
    drawCurrency(24, 50, 'currency_ore', TEXT.ore, state.ore);
    drawCurrency(W * 0.36, 50, 'currency_crystal', TEXT.crystals, state.crystals);
    drawCurrency(W * 0.68, 50, 'currency_dust', TEXT.dust, state.starDust);
    text(fmt(dps()) + '/сек', W - 24, 82, 13, '#6ceb49', 'right', '600');
  }

  function drawCurrency(x, y, icon, label, value) {
    if (assets[icon]) ctx.drawImage(assets[icon], x, y - 22, 40, 40);
    text(label, x + 46, y - 10, 11, '#9fb0dc', 'left', '600');
    text(fmt(value), x + 46, y + 12, 18, '#f4f7ff', 'left', '900');
  }

  function drawScene(time) {
    const a = asteroidBox();
    const count = Math.min(drones(), 8);
    const drone = assets.drone_basic;
    for (let i = 0; i < count && drone; i++) {
      const ang = TAU * i / count + time * 0.00045;
      const x = a.x + Math.cos(ang) * a.r * 1.45;
      const y = a.y + Math.sin(ang) * a.r * 0.72;
      const size = Math.max(48, Math.min(76, W * 0.075));
      ctx.save(); ctx.translate(x, y); ctx.rotate(Math.cos(ang) * 0.16);
      ctx.drawImage(drone, -size / 2, -size / 3, size, size * 0.64); ctx.restore();
    }
    const spr = assets[asteroidSprite()];
    const pulse = 1 + tapPulse * 0.08;
    if (spr) {
      ctx.save(); ctx.translate(a.x, a.y); ctx.rotate(Math.sin(time * 0.00035) * 0.04);
      const size = a.r * 2.08 * pulse;
      ctx.drawImage(spr, -size / 2, -size / 2, size, size); ctx.restore();
    }
    const bw = Math.max(240, Math.min(520, W * 0.72));
    drawProgress((W - bw) / 2, a.y + a.r + 34, bw, 24, state.galaxyOre / CONFIG.prestige.unlockOre,
      `${fmt(state.galaxyOre)} / ${fmt(CONFIG.prestige.unlockOre)}`);
    text('Тапайте астероид', W / 2, a.y + a.r + 82, 18, '#9fb0dc', 'center', '700');
  }

  function drawProgress(x, y, w, h, ratio, label) {
    ratio = Math.max(0, Math.min(1, ratio));
    rect(x, y, w, h, h / 2); ctx.fillStyle = 'rgba(2,7,25,.84)'; ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke();
    if (ratio > 0) { rect(x + 3, y + 3, Math.max(h - 6, (w - 6) * ratio), h - 6, h / 2); ctx.fillStyle = '#2bd8ff'; ctx.fill(); }
    text(label, x + w / 2, y + h / 2, 12, '#fff', 'center', '800');
  }

  function drawBottom() {
    const y = H - 110, pad = 10;
    rect(pad, y, W - pad * 2, 100, 22); ctx.fillStyle = 'rgba(6,12,37,.88)'; ctx.fill(); ctx.strokeStyle = 'rgba(43,216,255,.42)'; ctx.stroke();
    const items = [
      ['shop', TEXT.shop, 'icon_upgrade', () => open('shop')],
      ['jump', TEXT.jump, 'icon_prestige', () => open('prestige')],
      ['ach', TEXT.ach, 'icon_achievement', () => open('ach')],
      ['daily', TEXT.daily, 'icon_daily', () => open('daily')],
      ['set', TEXT.settings, 'icon_settings', () => open('settings')]
    ];
    const gap = 6, bw = (W - 38 - gap * 4) / 5;
    items.forEach((it, i) => {
      const x = 19 + i * (bw + gap), h = 76;
      rect(x, y + 12, bw, h, 16);
      ctx.fillStyle = it[0] === 'jump' && dustGain() > 0 ? 'rgba(255,185,35,.30)' : 'rgba(28,42,92,.88)'; ctx.fill();
      ctx.strokeStyle = it[0] === 'jump' && dustGain() > 0 ? '#ffb923' : 'rgba(255,255,255,.16)'; ctx.stroke();
      if (assets[it[2]]) ctx.drawImage(assets[it[2]], x + bw / 2 - 18, y + 20, 36, 36);
      text(it[1], x + bw / 2, y + 74, bw < 70 ? 10 : 12, '#fff', 'center', '900');
      btn(it[0], x, y + 12, bw, h, it[1], it[3]);
    });
  }

  function open(name) { modal = name; modalScroll = 0; }
  function modalBox() { const w = Math.min(760, W - 24), h = Math.min(H - 56, (modal === 'shop' || modal === 'ach') ? 640 : 520); return { x: (W - w) / 2, y: (H - h) / 2, w, h }; }
  function maxScroll() { const b = modalBox(); return modal === 'shop' ? Math.max(0, CONFIG.upgrades.length * 82 - (b.h - 128)) : modal === 'ach' ? Math.max(0, CONFIG.achievements.length * 74 - (b.h - 128)) : 0; }

  function drawModal() {
    ctx.fillStyle = 'rgba(0,0,0,.56)'; ctx.fillRect(0, 0, W, H);
    const b = modalBox(); rect(b.x, b.y, b.w, b.h, 24); ctx.fillStyle = 'rgba(27,40,92,.94)'; ctx.fill(); ctx.strokeStyle = 'rgba(43,216,255,.50)'; ctx.lineWidth = 2; ctx.stroke();
    const titles = { shop: TEXT.shop, prestige: 'Прыжок в новую галактику', ach: TEXT.ach, daily: 'Ежедневная награда', offline: 'Дроны работали без вас', settings: TEXT.settings };
    text(titles[modal] || 'Окно', b.x + 24, b.y + 34, 24, '#fff', 'left', '900');
    smallButton(b.x + b.w - 86, b.y + 16, 66, 38, '×', () => { modal = null; }, 'blue');
    if (modal === 'shop') drawShop(b); else if (modal === 'prestige') drawPrestige(b); else if (modal === 'ach') drawAchievements(b); else if (modal === 'daily') drawDaily(b); else if (modal === 'offline') drawOffline(b); else if (modal === 'settings') drawSettings(b);
  }

  function smallButton(x, y, w, h, label, action, color) {
    const fill = color === 'green' ? 'rgba(76,189,44,.95)' : color === 'orange' ? 'rgba(244,142,32,.95)' : color === 'red' ? 'rgba(255,88,106,.95)' : 'rgba(32,158,228,.88)';
    rect(x, y, w, h, 14); ctx.fillStyle = fill; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke();
    text(label, x + w / 2, y + h / 2, Math.min(16, h * 0.42), '#fff', 'center', '900'); btn('b' + Math.random(), x, y, w, h, label, action);
  }

  function drawShop(b) {
    const x = b.x + 18, startY = b.y + 74, w = b.w - 36, h = 72;
    ctx.save(); ctx.beginPath(); ctx.rect(b.x + 12, startY - 6, b.w - 24, b.h - 92); ctx.clip();
    CONFIG.upgrades.forEach((u, i) => {
      const y = startY + i * 82 - modalScroll; if (y > b.y + b.h || y + h < startY - 8) return;
      const level = lvl(u.id), price = cost(u), can = state.ore >= price && level < u.max;
      rect(x, y, w, h, 18); ctx.fillStyle = can ? 'rgba(26,61,96,.88)' : 'rgba(15,22,54,.86)'; ctx.fill(); ctx.strokeStyle = can ? '#2bd8ff' : 'rgba(255,255,255,.12)'; ctx.stroke();
      if (assets[u.icon]) ctx.drawImage(assets[u.icon], x + 10, y + 10, 52, 52);
      text(u.name, x + 74, y + 20, 16, '#fff', 'left', '800'); text(u.desc, x + 74, y + 43, 12, '#9fb0dc', 'left', '600'); text(`Lv ${level}/${u.max}`, x + 74, y + 61, 12, '#ffb923', 'left', '700');
      const bw = Math.max(96, Math.min(150, w * 0.24)), bx = x + w - bw - 12, by = y + 14;
      rect(bx, by, bw, h - 28, 14); ctx.fillStyle = level >= u.max ? 'rgba(120,120,140,.55)' : can ? 'rgba(76,189,44,.95)' : 'rgba(70,80,120,.72)'; ctx.fill(); ctx.strokeStyle = 'rgba(255,255,255,.28)'; ctx.stroke();
      text(level >= u.max ? TEXT.max : TEXT.buy, bx + bw / 2, by + 16, 13, '#fff', 'center', '900'); if (level < u.max) text(fmt(price), bx + bw / 2, by + 38, 13, '#fff', 'center', '900');
      btn('buy' + u.id, bx, by, bw, h - 28, TEXT.buy, () => buy(u.id));
    });
    ctx.restore();
  }

  function drawPrestige(b) {
    const gain = dustGain(), cx = b.x + b.w / 2;
    if (assets.currency_dust) ctx.drawImage(assets.currency_dust, cx - 54, b.y + 86, 108, 108);
    text(gain ? `+${fmt(gain)} звёздной пыли` : 'Нужно больше руды', cx, b.y + 224, 26, gain ? '#ffb923' : '#9fb0dc', 'center', '900');
    text(`${fmt(state.galaxyOre)} / ${fmt(CONFIG.prestige.unlockOre)} руды в галактике`, cx, b.y + 266, 16, '#9fb0dc', 'center', '600');
    text(`Множитель: x${mult().toFixed(2)} → x${(mult() + gain * CONFIG.prestige.dustBonus).toFixed(2)}`, cx, b.y + 304, 18, '#2bd8ff', 'center', '800');
    smallButton(b.x + 46, b.y + b.h - 86, b.w - 92, 56, 'Совершить прыжок', prestige, gain ? 'orange' : 'blue');
  }

  function drawAchievements(b) {
    const x = b.x + 18, startY = b.y + 76, w = b.w - 36, h = 64;
    ctx.save(); ctx.beginPath(); ctx.rect(b.x + 12, startY - 6, b.w - 24, b.h - 92); ctx.clip();
    CONFIG.achievements.forEach((a, i) => {
      const y = startY + i * 74 - modalScroll; if (y > b.y + b.h || y + h < startY - 8) return;
      const done = !!state.achievements[a.id], value = Math.min(achievementValue(a), a.target);
      rect(x, y, w, h, 16); ctx.fillStyle = done ? 'rgba(61,90,44,.82)' : 'rgba(15,22,54,.86)'; ctx.fill(); ctx.strokeStyle = done ? '#6ceb49' : 'rgba(255,255,255,.14)'; ctx.stroke();
      if (assets.icon_achievement) ctx.drawImage(assets.icon_achievement, x + 10, y + 8, 48, 48);
      text(a.name, x + 70, y + 18, 16, '#fff', 'left', '800'); text(a.desc, x + 70, y + 41, 12, '#9fb0dc', 'left', '600');
      text(done ? 'Получено' : `${fmt(value)}/${fmt(a.target)}`, x + w - 18, y + 22, 13, done ? '#6ceb49' : '#ffb923', 'right', '800'); text(`+${a.crystals} кр.`, x + w - 18, y + 46, 12, '#2bd8ff', 'right', '700');
    }); ctx.restore();
  }

  function drawDaily(b) {
    const r = dailyReward(), day = Math.min(state.daily.streak + 1, CONFIG.daily.length), cx = b.x + b.w / 2;
    if (assets.icon_daily) ctx.drawImage(assets.icon_daily, cx - 56, b.y + 86, 112, 112);
    text(`День ${day}`, cx, b.y + 224, 30, '#ffb923', 'center', '900'); text(`+${fmt(r.ore)} руды`, cx, b.y + 268, 22, '#fff', 'center', '800'); text(`+${r.crystals} крист.`, cx, b.y + 302, 20, '#2bd8ff', 'center', '800');
    if (state.daily.pending) smallButton(b.x + 46, b.y + b.h - 88, b.w - 92, 56, TEXT.collect, claimDaily, 'green'); else text('Уже получено сегодня', cx, b.y + b.h - 64, 20, '#6ceb49', 'center', '800');
  }

  function drawOffline(b) {
    const p = pendingOffline || { gain: 0, capped: 0 }, cx = b.x + b.w / 2;
    if (assets.drone_basic) ctx.drawImage(assets.drone_basic, cx - 86, b.y + 88, 172, 110);
    text('Пока вас не было, дроны добыли:', cx, b.y + 230, 18, '#9fb0dc', 'center', '600'); text('+' + fmt(p.gain) + ' руды', cx, b.y + 276, 32, '#2bd8ff', 'center', '900'); text(`${Math.floor(p.capped / 60)} мин. учтено`, cx, b.y + 314, 14, '#9fb0dc', 'center', '600');
    smallButton(b.x + 38, b.y + b.h - 88, (b.w - 92) / 2, 56, TEXT.collect, () => collectOffline(1), 'green'); smallButton(b.x + 54 + (b.w - 92) / 2, b.y + b.h - 88, (b.w - 92) / 2, 56, '×2 в фазе 3', () => toast('Rewarded-реклама будет подключена в фазе 3'), 'orange');
  }

  function drawSettings(b) {
    const x = b.x + 34; let y = b.y + 100;
    text(`Звук: ${state.settings.sound ? 'вкл' : 'выкл'}`, x, y, 20, '#fff', 'left', '800'); smallButton(b.x + b.w - 164, y - 24, 116, 48, state.settings.sound ? 'Выкл' : 'Вкл', () => { state.settings.sound = !state.settings.sound; save(); }, 'blue');
    y += 80; text('Таблица лидеров будет подключена через SDK в фазе 3.', x, y, 15, '#9fb0dc', 'left', '600');
    y += 80; text('Сброс нужен только для тестов.', x, y, 15, '#9fb0dc', 'left', '600'); smallButton(x, y + 30, b.w - 68, 52, 'Сбросить прогресс', () => { localStorage.removeItem(CONFIG.save.key); state = defaultSave(); modal = null; toast('Прогресс сброшен'); save(); }, 'red');
  }

  function drawFloaters(dt) {
    floaters = floaters.filter(f => { f.life -= dt; f.y -= 34 * dt; ctx.globalAlpha = Math.max(0, f.life / 0.85); text(f.label, f.x, f.y, 22, f.color, 'center', '900'); ctx.globalAlpha = 1; return f.life > 0; });
  }
  function drawToasts(dt) {
    toasts = toasts.filter((t, i) => { t.life -= dt; const w = Math.min(W - 32, 420), y = 112 + i * 42; ctx.globalAlpha = Math.min(1, t.life / 0.35); rect((W - w) / 2, y, w, 34, 16); ctx.fillStyle = 'rgba(6,12,37,.86)'; ctx.fill(); ctx.strokeStyle = 'rgba(43,216,255,.48)'; ctx.stroke(); text(t.label, W / 2, y + 17, 14, '#fff', 'center', '700'); ctx.globalAlpha = 1; return t.life > 0; });
  }

  function update(dt) {
    addOre(dps() * dt);
    tapPulse = Math.max(0, tapPulse - dt * 3.2);
    checkAchievements();
  }

  function frame(time) {
    const dt = Math.min(0.1, Math.max(0, (time - last) / 1000)); last = time;
    buttons = [];
    update(dt);
    ctx.clearRect(0, 0, W, H);
    drawBackground(time); drawTop(); drawScene(time); drawBottom(); drawFloaters(dt); drawToasts(dt); if (modal) drawModal();
    if (time - autosaveAt > CONFIG.save.autosaveMs) { save(); autosaveAt = time; }
    requestAnimationFrame(frame);
  }

  function point(e) { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }
  canvas.addEventListener('pointerdown', e => { e.preventDefault(); const p = point(e); drag = { x: p.x, y: p.y, lastY: p.y, moved: false }; });
  canvas.addEventListener('pointermove', e => { if (!drag) return; const p = point(e); const dy = p.y - drag.lastY; if (Math.abs(p.y - drag.y) > 8) drag.moved = true; if ((modal === 'shop' || modal === 'ach') && drag.moved) modalScroll = Math.max(0, Math.min(maxScroll(), modalScroll - dy)); drag.lastY = p.y; });
  canvas.addEventListener('pointerup', e => { e.preventDefault(); const p = point(e), wasDrag = drag && drag.moved; drag = null; if (wasDrag) return; click(p.x, p.y); });
  canvas.addEventListener('wheel', e => { if (modal === 'shop' || modal === 'ach') { e.preventDefault(); modalScroll = Math.max(0, Math.min(maxScroll(), modalScroll + e.deltaY)); } }, { passive: false });

  function click(x, y) {
    for (let i = buttons.length - 1; i >= 0; i--) { const b = buttons[i]; if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return b.action(); }
    if (!modal) { const a = asteroidBox(), dx = x - a.x, dy = y - a.y; if (dx * dx + dy * dy <= a.r * a.r) mine(x, y); }
  }

  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 120));
  document.addEventListener('visibilitychange', () => { if (document.hidden) save(); });
  addEventListener('beforeunload', save);

  window.STAR_MINER_CONFIG = CONFIG;
  resize(); applyOffline(); prepareDaily(); checkAchievements(); toast('Прогресс загружен'); requestAnimationFrame(frame);
})();
