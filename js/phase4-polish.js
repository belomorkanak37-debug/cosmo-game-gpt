/*
  Звёздный Старатель — Фаза 4: тонкая полировка окружения.
  Основная логика удержания уже находится в js/game.js: оффлайн-доход,
  ежедневная награда, короткие числа, звук, сохранение при потере фокуса.
  Этот файл добавляет безопасные браузерные мелочи вокруг Canvas-игры.
*/
(function () {
  'use strict';

  const root = document.documentElement;
  const body = document.body;

  // Дополнительная защита от системного скролла, pull-to-refresh и выделения текста.
  root.style.overflow = 'hidden';
  root.style.overscrollBehavior = 'none';
  root.style.touchAction = 'none';
  body.style.overflow = 'hidden';
  body.style.overscrollBehavior = 'none';
  body.style.touchAction = 'none';
  body.style.webkitUserSelect = 'none';
  body.style.userSelect = 'none';

  // На мобильных браузерах иногда приходит contextmenu после долгого тапа.
  // Для игры это лишний системный оверлей, поэтому блокируем его.
  window.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  }, { passive: false });

  // Дублирующий timestamp выхода. Игровое ядро сохраняет полный прогресс,
  // а этот ключ помогает при отладке оффлайн-дохода и восстановлении сессии.
  function markExitMoment() {
    try {
      localStorage.setItem('star_miner_phase4_last_exit_marker', String(Date.now()));
    } catch (_) {}
  }

  window.addEventListener('pagehide', markExitMoment);
  window.addEventListener('freeze', markExitMoment);
  window.addEventListener('blur', markExitMoment);

  // Лёгкая диагностика для тестирования в консоли браузера.
  window.StarMinerPhase4 = {
    ready: true,
    notes: 'Retention polish loaded: mobile overscroll guard, contextmenu guard, exit marker.',
    getLastExitMarker: function () {
      try { return Number(localStorage.getItem('star_miner_phase4_last_exit_marker') || 0); }
      catch (_) { return 0; }
    }
  };
})();
