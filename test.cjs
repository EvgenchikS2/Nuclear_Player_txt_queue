const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

function load(react = {}, overrides = {}) {
  const context = { module: { exports: {} }, require: id => {
    assert.equal(id, 'react'); return react;
  }, setTimeout, clearTimeout, AbortController, TextDecoder, ...overrides };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, 'index.js'), 'utf8') +
    '\nmodule.exports.testAPI = {parseList, resolveList, appendSelected, matchScore, resolveLanguage, translate};', context);
  return context.module.exports;
}
const track = (artist, title) => ({ title, artists: [{ name: artist, roles: [] }], source: { provider: 'test', id: title } });

test('BOM, CRLF, Cyrillic, comments, numbering, tabs and duplicate lines', () => {
  const entries = load().testAPI.parseList('\uFEFF# comment\r\n\r\n1. Кино — Группа крови\r\n// comment\r\nRadiohead\tNo Surprises\r\nSong\r\nSong');
  assert.equal(entries.length, 4);
  assert.equal(entries[0].artist, 'Кино');
  assert.equal(entries[0].title, 'Группа крови');
  assert.equal(entries[0].line, 3);
  assert.equal(entries[1].query, 'Radiohead No Surprises');
  assert.equal(entries[2].title, entries[3].title);
});

test('empty and oversized lists fail before search; URLs and paths are rejected', () => {
  const { parseList } = load().testAPI;
  assert.throws(() => parseList('# comment\n'), /contains no songs/);
  assert.throws(() => parseList('Song\n'.repeat(1001)), /1000/);
  assert.throws(() => parseList('x'.repeat(2097153)), /2 MB/);
  for (const value of ['https://example.com/song', 'C:\\Music\\song.mp3', '/music/song.mp3']) {
    assert.match(parseList(value)[0].invalid, /URLs or file paths/);
  }
});

test('search ranks exact artist/title above covers and keeps input order', async () => {
  const { parseList, resolveList } = load().testAPI;
  const api = { Metadata: { search: async params => {
    assert.equal(params.types[0], 'tracks');
    return { tracks: params.query.startsWith('Кино')
      ? [track('Cover band', 'Группа крови'), track('Кино', 'Группа крови')]
      : [track('Radiohead', 'No Surprises')] };
  } } };
  const progress = [];
  const rows = await resolveList(api, parseList('Кино — Группа крови\nRadiohead - No Surprises'),
    new AbortController().signal, done => progress.push(done));
  assert.equal(rows[0].tracks[0].artists[0].name, 'Кино');
  assert.equal(rows[0].selected, 0);
  assert.equal(rows[1].tracks[0].title, 'No Surprises');
  assert.deepEqual(progress, [1, 2]);
});

test('approximate results require manual choice and invalid metadata is ignored', async () => {
  const { parseList, resolveList } = load().testAPI;
  const rows = await resolveList({ Metadata: { search: async () => ({ tracks: [
    { title: 'Broken' }, track('Cover band', 'Song live')
  ] }) } }, parseList('Artist — Song'), new AbortController().signal, () => {});
  assert.equal(rows[0].tracks.length, 1);
  assert.equal(rows[0].selected, -1);
});

test('search errors and missing results do not prevent later tracks', async () => {
  const { parseList, resolveList } = load().testAPI;
  const rows = await resolveList({ Metadata: { search: async ({ query }) => {
    if (query === 'Bad') throw new Error('provider unavailable');
    return { tracks: query === 'Missing' ? [] : [track('Artist', query)] };
  } } }, parseList('Bad\nMissing\nGood'), new AbortController().signal, () => {});
  assert.match(rows[0].error, /provider unavailable/);
  assert.match(rows[1].error, /No matches/);
  assert.equal(rows[2].selected, 0);
});

test('hung providers time out and cancellation stops subsequent searches', async () => {
  const { parseList, resolveList } = load().testAPI;
  const hung = { Metadata: { search: () => new Promise(() => {}) } };
  const timeoutRows = await resolveList(hung, parseList('Song'), new AbortController().signal, () => {}, 10);
  assert.match(timeoutRows[0].error, /did not respond/);
  const controller = new AbortController();
  const pending = resolveList(hung, parseList('Song\nNext'), controller.signal, () => {}, 10000);
  controller.abort();
  assert.equal((await pending).length, 0);
});

test('append uses one queue call in order, preserves duplicates and skips unselected rows', async () => {
  const { appendSelected } = load().testAPI;
  const song = track('Artist', 'Song');
  const calls = [];
  const api = { Queue: { addToQueue: async tracks => calls.push(tracks) } };
  const count = await appendSelected(api, [
    { selected: 0, tracks: [song] }, { selected: -1, tracks: [track('Other', 'Other')] },
    { selected: 0, tracks: [song] }
  ]);
  assert.equal(count, 2);
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0], song);
  assert.equal(calls[0][1], song);
  await assert.rejects(() => appendSelected(api, []), /Select matching/);
  await assert.rejects(() => appendSelected({ Queue: { addToQueue: async () => { throw new Error('queue failure'); } } },
    [{ selected: 0, tracks: [song] }]), /queue failure/);
});

test('loader contract registers a custom widget, renders controls and cleans up', async () => {
  const controls = [];
  const react = {
    createElement: (type, props, ...children) => { const element = { type, props: props || {}, children }; controls.push(element); return element; },
    useState: value => [value, () => {}], useRef: value => ({ current: value }), useEffect: () => {}
  };
  const plugin = load(react);
  let component;
  const events = [];
  const api = { Metadata: {}, Queue: {}, Settings: {
    registerWidget: (id, widget) => { events.push(id); component = widget; },
    register: async defs => { assert.equal(defs[0].kind, 'custom'); assert.equal(defs[0].widgetId, 'txt-import'); },
    unregisterWidget: id => events.push(`remove:${id}`)
  } };
  await plugin.onEnable(api);
  component({ api });
  assert.ok(controls.some(c => c.type === 'input' && c.props.type === 'file'));
  assert.ok(controls.some(c => c.type === 'textarea'));
  assert.ok(controls.some(c => c.type === 'button' && c.children[0] === 'Find songs'));
  plugin.onDisable(api);
  assert.deepEqual(events, ['txt-import', 'remove:txt-import']);
});

test('registration failure removes widget', async () => {
  const plugin = load();
  let cleaned = false;
  await assert.rejects(() => plugin.onEnable({ Metadata: {}, Queue: {}, Settings: {
    registerWidget() {}, register: async () => { throw new Error('failure'); },
    unregisterWidget() { cleaned = true; }
  } }), /failure/);
  assert.equal(cleaned, true);
});

test('widget flow reads TXT, searches and appends once despite a double click', async () => {
  const slots = [];
  let cursor = 0;
  let elements = [];
  const react = {
    createElement: (type, props, ...children) => {
      const element = { type, props: props || {}, children }; elements.push(element); return element;
    },
    useState: value => {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { slots[index] = typeof next === 'function' ? next(slots[index]) : next; }];
    },
    useRef: value => { const index = cursor++; if (!(index in slots)) slots[index] = { current: value }; return slots[index]; },
    useEffect: () => {}
  };
  const plugin = load(react);
  let component;
  const calls = [];
  const api = {
    Settings: { registerWidget: (_id, widget) => { component = widget; }, register: async () => {}, unregisterWidget() {} },
    Metadata: { search: async () => ({ tracks: [track('Кино', 'Группа крови')] }) },
    Queue: { addToQueue: async tracks => { calls.push(tracks); } }
  };
  await plugin.onEnable(api);
  const render = () => { cursor = 0; elements = []; component({ api }); };
  const button = prefix => elements.find(el => el.type === 'button' && el.children[0].startsWith(prefix));
  render();
  const bytes = new TextEncoder().encode('Кино — Группа крови');
  await elements.find(el => el.type === 'input').props.onChange({ target: { files: [{
    name: 'songs.txt', size: bytes.length, arrayBuffer: async () => bytes.buffer
  }], value: 'songs.txt' } });
  render();
  assert.equal(elements.find(el => el.type === 'textarea').props.value, 'Кино — Группа крови');
  await button('Find').props.onClick();
  render();
  assert.equal(button('Add').props.disabled, false);
  const dropdowns = elements.filter(el => el.type === 'select' || el.type === 'option');
  assert.ok(dropdowns.length > 0);
  for (const dropdown of dropdowns) {
    assert.equal(dropdown.props.style.color, '#f5f5f5');
    assert.equal(dropdown.props.style.backgroundColor, '#202020');
  }
  const add = button('Add').props.onClick;
  await Promise.all([add(), add()]);
  render();
  assert.equal(calls.length, 1);
  assert.equal(calls[0][0].title, 'Группа крови');
  assert.equal(button('Add').props.disabled, true);
  plugin.onDisable(api);
});

test('Russian for ru locales; English for all others; dynamic messages and literal symbols', () => {
  const { resolveLanguage, translate } = load().testAPI;
  for (const value of ['ru', 'ru_RU', 'ru-RU', 'RU_ru']) assert.equal(resolveLanguage(value), 'ru');
  for (const value of ['en_US', 'de_DE', 'fr', 'ja_JP', undefined, null, 'russian']) assert.equal(resolveLanguage(value), 'en');
  assert.equal(translate('Find songs', 'ru'), 'Найти песни');
  assert.equal(translate('Find songs', 'en'), 'Find songs');
  assert.equal(translate('Searching: 2 of 10…', 'ru'), 'Поиск: 2 из 10…');
  assert.equal(translate('Add to queue (5)', 'ru'), 'Добавить в очередь (5)');
  assert.equal(translate('Added to the end of the queue: 3.', 'ru'), 'Добавлено в конец очереди: 3.');
  assert.equal(translate('Could not add songs: Select matching songs first.', 'ru'), 'Не удалось добавить песни: Сначала выбери найденные песни.');
  assert.equal(translate('Match for Artist $& — Song (live)', 'ru'), 'Результат для Artist $& — Song (live)');
});

test('app language is read once per enable without polling and refreshed on re-enable', async () => {
  let reads = 0;
  let appLanguage = 'ru_RU';
  let widget;
  const definitions = [];
  const elements = [];
  const listeners = [];
  const cleanup = [];
  const react = {
    createElement: (type, props, ...children) => { const el = { type, props, children }; elements.push(el); return el; },
    useState: initial => [initial, value => listeners.push(value)],
    useRef: value => ({ current: value }),
    useEffect: effect => cleanup.push(effect())
  };
  const plugin = load(react, {
    setTimeout: () => { throw new Error('Language must not be polled'); }
  });
  const api = { Metadata: {}, Queue: {}, Settings: {
    getGlobal: async id => { reads++; assert.equal(id, 'core.general.language'); return appLanguage; },
    registerWidget: (_id, component) => { widget = component; },
    register: async defs => definitions.push(defs[0]), unregisterWidget() {}
  } };
  await plugin.onEnable(api);
  assert.equal(definitions[0].title, 'Импорт музыки из TXT');
  widget({ api });
  assert.ok(elements.some(el => el.type === 'button' && el.children[0] === 'Найти песни'));
  assert.equal(reads, 1);
  appLanguage = 'de_DE';
  plugin.onDisable(api);
  await plugin.onEnable(api);
  assert.equal(reads, 2);
  assert.equal(definitions[1].title, 'Import songs from TXT');
  assert.ok(listeners.includes('en'));
  cleanup.forEach(fn => fn && fn());
  plugin.onDisable(api);
  plugin.onUnload();
  assert.equal(reads, 2);
});
