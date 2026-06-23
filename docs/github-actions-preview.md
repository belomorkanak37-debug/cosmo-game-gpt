# Тестовый запуск через GitHub Actions

В репозитории настроен workflow:

```text
.github/workflows/test-and-deploy-pages.yml
```

Он делает две вещи:

1. Проверяет игру:
   - наличие `index.html` в корне;
   - наличие основных JS-файлов;
   - синтаксис JavaScript через `node --check`;
   - запуск временного HTTP-сервера внутри GitHub Actions;
   - проверку, что `index.html`, `js/game.js` и `assets/procedural-assets.js` отдаются по HTTP.

2. Публикует игру на GitHub Pages для теста.

## Как запустить вручную

1. Открой репозиторий на GitHub.
2. Перейди во вкладку `Actions`.
3. Выбери workflow `Test and deploy game preview`.
4. Нажми `Run workflow`.
5. Выбери ветку `main`.
6. Нажми зелёную кнопку запуска.

## Как включить GitHub Pages

Если деплой Pages не запустился с первого раза:

1. Открой `Settings` репозитория.
2. Перейди в `Pages`.
3. В разделе `Build and deployment` выбери source: `GitHub Actions`.
4. Сохрани.
5. Снова запусти workflow.

## Тестовый URL

После успешного деплоя игра будет доступна по адресу:

```text
https://belomorkanak37-debug.github.io/cosmo-game-gpt/
```

Также URL будет показан в job `Deploy preview to GitHub Pages` в поле `github-pages`.

## Важно

- Это тестовый web-preview, не полноценная среда Яндекс Игр.
- SDK Яндекса, реклама, покупки и лидерборды могут работать только в окружении Яндекс Игр или в их debug/preview-инструментах.
- Для проверки обычного геймплея, Canvas, сохранения localStorage и адаптивности GitHub Pages подходит.
