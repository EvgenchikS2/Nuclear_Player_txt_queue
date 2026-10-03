'use strict';

// Nuclear supplies React. No npm install, Node filesystem or private APIs needed.
const React = require('react');
const h = React.createElement;
const MAX_BYTES = 2 * 1024 * 1024;
const MAX_LINES = 1000;
// Native Windows dropdowns do not consistently inherit the select's background.
// Set both foreground and background on the select and every option.
const selectColors = { color: '#f5f5f5', backgroundColor: '#202020', colorScheme: 'dark' };
const activeJobs = new Set();
let enabled = false;

// Nuclear stores the application language in core.general.language.
// Read once on enable: Settings.subscribe only watches plugin-owned settings.
const LANGUAGE_SETTING = 'core.general.language';
const RUSSIAN = {
  "The list is too large (maximum 2 MB).": "Список слишком большой (максимум 2 МБ).",
  "Enter song names, not URLs or file paths.": "Нужны названия песен, а не ссылки или пути к файлам.",
  "The song title is missing.": "Не указано название песни.",
  "The file contains no songs.": "В файле нет песен.",
  "A maximum of 1000 songs can be imported at once.": "Максимум 1000 песен за один импорт.",
  "Import cancelled.": "Импорт отменён.",
  "Search did not respond within 20 seconds.": "Поиск не ответил за 20 секунд.",
  "No matches. Check the song name and metadata provider.": "Не найдено. Проверь название и источник поиска.",
  "Select matching songs first.": "Сначала выбери найденные песни.",
  "Choose a TXT file or paste a list: Artist — Title.": "Выбери TXT или вставь список: Исполнитель — Песня.",
  "The file exceeds 2 MB.": "Файл больше 2 МБ.",
  "File loaded. Click \"Find songs\".": "Файл прочитан. Нажми «Найти песни».",
  "Could not read TXT: ${error.message}. Try Windows-1251 encoding.": "Не удалось прочитать TXT: ${error.message}. Попробуй Windows-1251.",
  "Searching: ${done} of ${total}…": "Поиск: ${done} из ${total}…",
  "Search cancelled. The queue is unchanged.": "Поиск отменён. Очередь не изменена.",
  "Review the results. Select approximate matches manually.": "Проверь результаты. Неточные совпадения нужно выбрать вручную.",
  "Added to the end of the queue: ${count}.": "Добавлено в конец очереди: ${count}.",
  "Could not add songs: ${error.message}": "Не удалось добавить песни: ${error.message}",
  "Encoding: ": "Кодировка: ",
  "TXT file: ": "TXT-файл: ",
  "Song list": "Список песен",
  "Find songs": "Найти песни",
  "Add to queue (${selected})": "Добавить в очередь (${selected})",
  "Cancel search": "Отменить поиск",
  "Match for ${row.entry.label}": "Результат для ${row.entry.label}",
  "Skip / choose a match": "Пропустить / выбрать совпадение",
  "Requires a modern Tauri version of Nuclear with Settings.registerWidget, Metadata and Queue APIs.": "Требуется Nuclear с API Settings.registerWidget, Metadata и Queue (современная версия на Tauri).",
  "Import songs from TXT": "Импорт музыки из TXT",
  "Find songs and append selected matches to the queue.": "Поиск песен и добавление выбранных результатов в конец очереди.",
  "TXT → Queue": "TXT → Очередь",
  "Choose TXT file": "Выбрать TXT-файл"
};
let language = 'en';
const languageListeners = new Set();

function resolveLanguage(value) {
  return /^ru(?:[_-]|$)/i.test(String(value || '')) ? 'ru' : 'en';
}

function translate(text, locale = language) {
  text = String(text);
  if (locale !== 'ru') return text;
  if (Object.prototype.hasOwnProperty.call(RUSSIAN, text)) return RUSSIAN[text];
  for (const [english, russian] of Object.entries(RUSSIAN)) {
    const slots = english.match(/\$\{[^}]+\}/g);
    if (!slots) continue;
    const parts = english.split(/\$\{[^}]+\}/g);
    const escape = value => value.replace(/[.*+?^{}$()|[\]\\]/g, '\\$&');
    const match = text.match(new RegExp('^' + parts.map(escape).join('(.*?)') + '$', 's'));
    if (!match) continue;
    let output = russian;
    slots.forEach((slot, index) => { output = output.replace(slot, () => translate(match[index + 1], locale)); });
    return output;
  }
  return text; // Provider error messages and song names retain their original text.
}

async function readLanguage(api) {
  if (typeof api.Settings.getGlobal !== 'function') return 'en';
  try { return resolveLanguage(await api.Settings.getGlobal(LANGUAGE_SETTING)); }
  catch { return language; }
}

function importDefinition() {
  return { id: 'import', title: translate('Import songs from TXT'),
    description: translate('Find songs and append selected matches to the queue.'),
    category: translate('TXT → Queue'), kind: 'custom', widgetId: 'txt-import' };
}


function normalize(text) {
  return String(text).normalize('NFKC').toLowerCase().replace(/ё/g, 'е')
    .replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}

function parseList(text) {
  if (text.length > MAX_BYTES) throw new Error('The list is too large (maximum 2 MB).');
  const entries = [];
  text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/).forEach((raw, index) => {
    const label = raw.trim();
    if (!label || label.startsWith('#') || label.startsWith('//')) return;
    const value = label.replace(/^\d+[.)]\s+/, '').trim();
    const parts = value.split(/\s+[-–—]\s+|\t+/);
    const artist = parts.length > 1 ? parts.shift().trim() : '';
    const title = parts.join(' - ').trim();
    const invalid = /^(?:https?:\/\/|file:|[a-z]:[\\/]|[\\/])/i.test(value)
      ? 'Enter song names, not URLs or file paths.'
      : !title || !normalize(title) ? 'The song title is missing.' : '';
    entries.push({ line: index + 1, label, artist, title, query: `${artist} ${title}`.trim(), invalid });
  });
  if (!entries.length) throw new Error('The file contains no songs.');
  if (entries.length > MAX_LINES) throw new Error('A maximum of 1000 songs can be imported at once.');
  return entries;
}

function trackLabel(track) {
  const artists = (track.artists || []).map(a => a.name).join(', ');
  return `${artists ? artists + ' — ' : ''}${track.title}`;
}

function isTrack(track) {
  return track && typeof track.title === 'string' && Array.isArray(track.artists)
    && track.source && typeof track.source.id === 'string'
    && typeof track.source.provider === 'string';
}

function matchScore(entry, track) {
  const title = normalize(track.title);
  const wanted = normalize(entry.title);
  const artist = normalize((track.artists || []).map(a => a.name).join(' '));
  const wantedArtist = normalize(entry.artist);
  const exactTitle = title === wanted;
  const exactArtist = !wantedArtist || (track.artists || []).some(a => normalize(a.name) === wantedArtist);
  return (exactTitle ? 4 : title.includes(wanted) ? 1 : 0)
    + (exactArtist ? 2 : artist.includes(wantedArtist) ? 1 : 0);
}

function timedSearch(api, entry, signal, timeoutMs) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (fn, value) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', abort);
      fn(value);
    };
    const abort = () => finish(reject, new Error('Import cancelled.'));
    if (signal.aborted) return abort();
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(reject, new Error('Search did not respond within 20 seconds.')), timeoutMs);
    Promise.resolve().then(() => api.Metadata.search({ query: entry.query, types: ['tracks'], limit: 5 }))
      .then(value => finish(resolve, value), error => finish(reject, error));
  });
}

async function resolveList(api, entries, signal, onProgress, timeoutMs = 20000) {
  const rows = [];
  for (const entry of entries) {
    if (signal.aborted) break;
    let row = { entry, tracks: [], selected: -1, error: entry.invalid };
    if (!entry.invalid) {
      try {
        const result = await timedSearch(api, entry, signal, timeoutMs);
        if (signal.aborted) break;
        const tracks = (result.tracks || []).filter(isTrack)
          .sort((a, b) => matchScore(entry, b) - matchScore(entry, a)).slice(0, 5);
        // Auto-select exact matches only; user explicitly chooses approximate results.
        row = { entry, tracks, selected: tracks.length && matchScore(entry, tracks[0]) === 6 ? 0 : -1,
          error: tracks.length ? '' : 'No matches. Check the song name and metadata provider.' };
      } catch (error) {
        if (signal.aborted) break;
        row.error = error instanceof Error ? error.message : String(error);
      }
    }
    rows.push(row);
    onProgress(rows.length, entries.length);
  }
  return rows;
}

async function appendSelected(api, rows) {
  const tracks = rows.filter(row => row.selected >= 0 && row.tracks[row.selected])
    .map(row => row.tracks[row.selected]);
  if (!tracks.length) throw new Error('Select matching songs first.');
  await api.Queue.addToQueue(tracks);
  return tracks.length;
}

function ImportWidget({ api }) {
  const [locale, setLocale] = React.useState(language);
  const t = value => translate(value, locale);
  const [text, setText] = React.useState('');
  const [encoding, setEncoding] = React.useState('utf-8');
  const [filename, setFilename] = React.useState('');
  const [rows, setRows] = React.useState([]);
  const [busy, setBusy] = React.useState(false);
  const [message, setMessage] = React.useState('Choose a TXT file or paste a list: Artist — Title.');
  const job = React.useRef(null);
  const mounted = React.useRef(true);
  const locked = React.useRef(false);
  const fileGeneration = React.useRef(0);
  const fileInput = React.useRef(null);
  React.useEffect(() => {
    mounted.current = true;
    languageListeners.add(setLocale);
    setLocale(language);
    return () => {
      mounted.current = false;
      languageListeners.delete(setLocale);
      fileGeneration.current++;
      if (job.current) { job.current.abort(); activeJobs.delete(job.current); }
    };
  }, []);
  const updateText = value => { setText(value); setRows([]); };
  const readFile = async event => {
    const file = event.target.files && event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const generation = ++fileGeneration.current;
    locked.current = true;
    setBusy(true);
    setRows([]);
    try {
      if (file.size > MAX_BYTES) throw new Error('The file exceeds 2 MB.');
      const bytes = await file.arrayBuffer();
      const decoded = new TextDecoder(encoding, { fatal: true }).decode(bytes);
      if (!mounted.current || generation !== fileGeneration.current) return;
      updateText(decoded);
      setFilename(file.name);
      setMessage('File loaded. Click "Find songs".');
    } catch (error) {
      if (mounted.current) setMessage(`Could not read TXT: ${error.message}. Try Windows-1251 encoding.`);
    } finally {
      if (mounted.current) { locked.current = false; setBusy(false); }
    }
  };
  const search = async () => {
    if (locked.current || !enabled) return;
    locked.current = true;
    setBusy(true);
    setRows([]);
    const controller = new AbortController();
    job.current = controller;
    activeJobs.add(controller);
    try {
      const entries = parseList(text);
      const found = await resolveList(api, entries, controller.signal, (done, total) => {
        if (mounted.current) setMessage(`Searching: ${done} of ${total}…`);
      });
      if (!mounted.current) return;
      if (controller.signal.aborted) { setMessage('Search cancelled. The queue is unchanged.'); return; }
      setRows(found);
      setMessage('Review the results. Select approximate matches manually.');
    } catch (error) {
      if (mounted.current) setMessage(error.message);
    } finally {
      activeJobs.delete(controller);
      job.current = null;
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const add = async () => {
    if (locked.current || !enabled) return;
    locked.current = true;
    setBusy(true);
    try {
      const count = await appendSelected(api, rows);
      if (mounted.current) {
        setMessage(`Added to the end of the queue: ${count}.`);
        setRows(previous => previous.filter(row => row.selected < 0));
      }
    } catch (error) {
      if (mounted.current) setMessage(`Could not add songs: ${error.message}`);
    } finally {
      locked.current = false;
      if (mounted.current) setBusy(false);
    }
  };
  const selected = rows.filter(row => row.selected >= 0).length;
  const controlStyle = { color: 'inherit', background: 'transparent', border: '1px solid #888', borderRadius: 4, padding: '6px 10px' };
  const button = (label, action, disabled) => h('button', { type: 'button', onClick: action, disabled, style: controlStyle }, t(label));
  return h('div', { style: { display: 'grid', gap: 12, width: '100%', minWidth: 0 } },
    h('label', null, t('Encoding: '), h('select', { value: encoding, disabled: busy, onChange: e => setEncoding(e.target.value), style: { ...controlStyle, ...selectColors } },
      h('option', { value: 'utf-8', style: selectColors }, 'UTF-8'), h('option', { value: 'windows-1251', style: selectColors }, 'Windows-1251'), h('option', { value: 'utf-16le', style: selectColors }, 'UTF-16 LE'))),
    h('div', null,
      button('Choose TXT file', () => fileInput.current && fileInput.current.click(), busy),
      h('input', { ref: fileInput, type: 'file', accept: '.txt,text/plain', disabled: busy, onChange: readFile, style: { display: 'none' } })),
    filename && h('span', null, filename),
    h('textarea', { 'aria-label': t('Song list'), rows: 7, value: text, disabled: busy,
      placeholder: 'Radiohead — No Surprises\nDaft Punk — Get Lucky',
      onChange: e => { fileGeneration.current++; updateText(e.target.value); },
      style: { ...controlStyle, width: '100%', boxSizing: 'border-box', resize: 'vertical' } }),
    h('div', { style: { display: 'flex', flexWrap: 'wrap', gap: 8 } },
      button('Find songs', search, busy || !text.trim() || !enabled),
      button(`Add to queue (${selected})`, add, busy || !selected || !enabled),
      job.current && button('Cancel search', () => job.current && job.current.abort(), false)),
    h('p', { role: 'status', 'aria-live': 'polite', style: { margin: 0 } }, t(message)),
    rows.length > 0 && h('div', { style: { maxHeight: 400, overflow: 'auto' } },
      rows.map((row, index) => h('div', { key: row.entry.line, style: { padding: '10px 0', borderBottom: '1px solid #888' } },
        h('div', null, `${row.entry.line}. ${row.entry.label}`),
        row.error ? h('div', null, t(row.error)) : h('select', {
          'aria-label': t(`Match for ${row.entry.label}`), value: row.selected, disabled: busy, style: { ...controlStyle, ...selectColors, maxWidth: '100%' },
          onChange: e => { const value = Number(e.target.value); setRows(previous => previous.map((r, i) => i === index ? { ...r, selected: value } : r)); }
        }, h('option', { value: -1, style: selectColors }, t('Skip / choose a match')),
        row.tracks.map((track, i) => h('option', { key: i, value: i, style: selectColors }, trackLabel(track)))))))
  );
}

module.exports = {
  async onEnable(api) {
    if (!api.Settings.registerWidget || !api.Metadata || !api.Queue) {
      throw new Error('Requires a modern Tauri version of Nuclear with Settings.registerWidget, Metadata and Queue APIs.');
    }
    api.Settings.registerWidget('txt-import', ImportWidget);
    try {
      language = await readLanguage(api);
      languageListeners.forEach(listener => listener(language));
      await api.Settings.register([importDefinition()]);
      enabled = true;
    } catch (error) {
      api.Settings.unregisterWidget('txt-import');
      throw error;
    }
  },
  onDisable(api) {
    enabled = false;
    activeJobs.forEach(controller => controller.abort());
    activeJobs.clear();
    api.Settings.unregisterWidget('txt-import');
  },
  onUnload() {
    enabled = false;
    activeJobs.forEach(controller => controller.abort());
    activeJobs.clear();
  }
};
