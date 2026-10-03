# TXT → Queue

[English](#english) · [Русский](#русский)

## English

A Nuclear Player plugin that imports song names from a TXT file and appends selected matches to the playback queue.

**Author:** EvgenchikS · **Version:** 1.0.2 · **License:** MIT

The interface follows Nuclear's language setting: Russian for Russian locales and English for all other languages. The language is read once when the plugin is enabled. After changing Nuclear's language, disable and re-enable the plugin to update its interface. No build step or npm dependency installation is needed.

### Compatibility

Requires the modern Tauri version of Nuclear with `Settings.registerWidget`, `Metadata.search`, and `Queue.addToQueue`. Legacy Electron versions are not supported.

The implementation was checked against Nuclear's `master` source, with player version 1.49.1, on October 2, 2026. All 12 automated tests pass using mocked APIs and a simulated plugin loader. I confirmed that the released plugin works in the actual Nuclear player on October 3, 2026. I also tested the updated plugin without language polling in Nuclear and confirmed that it works.
The current SDK's `Settings.subscribe()` watches plugin-owned settings, not global settings such as `core.general.language`. To avoid periodic calls to `getGlobal()`, this plugin reads the language only on enable.

### Installation

1. Download the repository using **Code → Download ZIP**, then extract it, or clone the repository. Keep the plugin folder in a permanent location.
2. Open Nuclear → **Preferences / Plugins**.
3. Click **Add Plugin** and select the folder containing `package.json` and `index.js`.
4. Enable **TXT → Queue**.
5. Open settings and find **TXT → Queue → Import songs from TXT**.

Menu names may vary depending on Nuclear's interface language.

### TXT format

Write one song per line:

```text
# One song per line
Radiohead — No Surprises
Daft Punk - Get Lucky
Кино — Группа крови
```

- Separate the artist and title with a hyphen (`-`), en dash (`–`), or em dash (`—`), with spaces on both sides, or use a tab.
- A title alone is accepted, but specifying the artist improves matching.
- Numbering such as `1. ` or `1) ` is removed automatically.
- Empty lines and lines beginning with `#` or `//` are ignored.
- Repeated songs are preserved, as is their original order.

See [example.txt](example.txt). This version imports **song names**, not YouTube/Spotify links, audio URLs, or local file paths. Limits: **2 MB** and **1000 songs** per import.

### Usage

1. In **Sources**, select a metadata provider that supports track search and enable a streaming provider. These providers are installed separately.
2. Select the file encoding and click **Choose TXT file**, or paste the list into the text field. UTF-8 is the default; Windows-1251 and UTF-16 LE are also available. After changing the encoding, select the file again.
3. Click **Find songs**. The plugin searches sequentially using Nuclear's active metadata provider.
4. Review the results. Exact artist/title matches are selected automatically; approximate matches require a manual selection. Check for covers and different recordings with identical names.
5. Click **Add to queue**. Selected tracks are appended in their original order. Existing queue items are preserved, and playback is not started automatically.

Added rows disappear from the results to prevent a second click from adding them again. To import the same list again intentionally, click **Find songs** again. Unselected and unmatched rows remain visible.

**Cancel search** stops the search without changing the queue. A provider's current network request may still finish, but its result will be ignored.

If no matches are found, check the metadata provider and the song names. Adding a track does not guarantee that playable audio is available: Nuclear's streaming provider resolves the stream during playback.

### Privacy

TXT files are read locally. Song names are sent to the selected metadata provider through Nuclear for searching. The plugin does not persist the TXT contents in settings.

### Source and tests

- `index.js`: plugin implementation.
- `package.json`: plugin manifest.
- `test.cjs`: automated tests.

With Node.js installed, run this from the plugin folder:

```sh
npm test
```

Tests cover TXT parsing, order and duplicates, match selection, errors and timeouts, cancellation, queue operations, widget registration, language switching, and dropdown colors.

### API references

- [Getting started with plugins](https://docs.nuclearplayer.com/nuclear/plugins/getting-started)
- [Settings API](https://docs.nuclearplayer.com/nuclear/plugins/settings)
- [Metadata API](https://docs.nuclearplayer.com/nuclear/plugins/metadata)
- [Queue API](https://docs.nuclearplayer.com/nuclear/plugins/queue)
- [Nuclear plugin loader](https://github.com/nukeop/nuclear/blob/master/packages/player/src/services/plugins/PluginLoader.ts)

Released under the [MIT License](LICENSE).

---

## Русский

Плагин Nuclear Player для поиска песен из TXT-файла и добавления выбранных совпадений в конец очереди воспроизведения.

**Автор:** EvgenchikS · **Версия:** 1.0.2 · **Лицензия:** MIT

Интерфейс следует настройке языка Nuclear: при русском языке плеера используется русский, при любом другом — английский. Язык читается один раз при включении плагина. После смены языка Nuclear выключи и снова включи плагин для обновления интерфейса. Сборка и установка npm-зависимостей не нужны.

### Совместимость

Требуется современный Nuclear на Tauri с API `Settings.registerWidget`, `Metadata.search` и `Queue.addToQueue`. Старые версии на Electron не поддерживаются.

Реализация проверена по исходникам Nuclear в ветке `master` с версией player 1.49.1 на 2 октября 2026 года. Все 12 автоматических тестов проходят с имитацией API и загрузчика плагинов. 3 октября 2026 года я подтвердил работу выпущенного плагина в самом Nuclear. Я также проверил обновлённый плагин без периодического опроса языка в Nuclear и подтвердил, что он работает.

В текущем SDK метод `Settings.subscribe()` следит за настройками самого плагина, а не за глобальными настройками вроде `core.general.language`. Чтобы избежать периодических вызовов `getGlobal()`, плагин читает язык только при включении.

### Установка

1. Скачай репозиторий через **Code → Download ZIP** и распакуй его или клонируй репозиторий. Сохрани папку плагина в постоянном месте.
2. Открой Nuclear → **Preferences / Plugins** (Настройки / Плагины).
3. Нажми **Add Plugin** и выбери папку с `package.json` и `index.js`.
4. Включи **TXT → Queue**.
5. В настройках найди **TXT → Очередь → Импорт музыки из TXT**. При английском языке это **TXT → Queue → Import songs from TXT**.

Названия меню могут различаться в зависимости от языка интерфейса Nuclear.

### Формат TXT

Запиши по одной песне на строку:

```text
# Одна песня на строку
Кино — Группа крови
Radiohead - No Surprises
Daft Punk — Get Lucky
```

- Разделяй исполнителя и название дефисом (`-`), коротким (`–`) или длинным (`—`) тире с пробелами с обеих сторон либо табуляцией.
- Можно указать только название, но исполнитель повышает точность поиска.
- Нумерация вида `1. ` или `1) ` снимается автоматически.
- Пустые строки и строки, начинающиеся с `#` или `//`, пропускаются.
- Повторные песни и исходный порядок сохраняются.

Пример: [example.txt](example.txt). Эта версия импортирует **названия песен**, а не ссылки на YouTube/Spotify, ссылки на аудио или пути к локальным файлам. Лимиты: **2 МБ** и **1000 песен** за один импорт.

### Использование

1. В **Sources / Источниках** выбери провайдер метаданных с поиском треков и включи провайдер потокового воспроизведения. Они устанавливаются отдельно.
2. Выбери кодировку и нажми **Выбрать TXT-файл** или вставь список в текстовое поле. По умолчанию используется UTF-8; доступны Windows-1251 и UTF-16 LE. После смены кодировки выбери файл повторно.
3. Нажми **Найти песни**. Плагин последовательно ищет песни через активный источник метаданных Nuclear.
4. Проверь результаты. Точные совпадения исполнителя и названия выбираются автоматически, приблизительные нужно выбрать вручную. Обрати внимание на каверы и разные записи с одинаковыми названиями.
5. Нажми **Добавить в очередь**. Выбранные песни добавятся в исходном порядке. Текущая очередь сохраняется, воспроизведение автоматически не запускается.

Добавленные строки исчезают из результатов, чтобы второй клик не добавил их повторно. Для намеренного повторного импорта снова нажми **Найти песни**. Невыбранные и ненайденные строки остаются видимыми.

**Отменить поиск** прекращает поиск без изменения очереди. Текущий сетевой запрос провайдера может завершиться позже, но его результат будет проигнорирован.

Если совпадений нет, проверь провайдер метаданных и написание названий. Добавление трека не гарантирует доступность аудио: провайдер Nuclear ищет поток при воспроизведении.

### Приватность

TXT читается локально. Для поиска названия песен передаются выбранному провайдеру метаданных через Nuclear. Плагин не сохраняет содержимое TXT в настройки.

### Исходники и тесты

- `index.js` — реализация плагина.
- `package.json` — манифест.
- `test.cjs` — автоматические тесты.

С установленным Node.js запусти из папки плагина:

```sh
npm test
```

Тесты проверяют разбор TXT, порядок и дубликаты, выбор совпадений, ошибки и таймауты, отмену поиска, операции с очередью, регистрацию интерфейса, переключение языка и цвета выпадающих списков.

### Документация API

- [Начало работы с плагинами](https://docs.nuclearplayer.com/nuclear/plugins/getting-started)
- [API настроек](https://docs.nuclearplayer.com/nuclear/plugins/settings)
- [API метаданных](https://docs.nuclearplayer.com/nuclear/plugins/metadata)
- [API очереди](https://docs.nuclearplayer.com/nuclear/plugins/queue)
- [Загрузчик плагинов Nuclear](https://github.com/nukeop/nuclear/blob/master/packages/player/src/services/plugins/PluginLoader.ts)

Распространяется под [лицензией MIT](LICENSE).
