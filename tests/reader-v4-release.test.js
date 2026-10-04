'use strict';
const assert = require('node:assert/strict');
const { readFileSync, statSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const test = require('node:test');
const vm = require('node:vm');
const { createServer } = require('../server.js');

const root = path.resolve(__dirname, '..');
const bookRoot = path.join(root, 'books/le-petit-prince');
const packRelative = 'books/le-petit-prince/audio/reader-narration/pause-extended/packs/sANWqF1bCMzR6eyZbCGw--eleven_v4--fr';
const json = (file) => JSON.parse(readFileSync(file, 'utf8'));
const bookMeta = json(path.join(bookRoot, 'book.json'));
const book = { ...bookMeta, frontMatter: json(path.join(bookRoot, 'front-matter.json')),
  chapters: bookMeta.chapters.map((entry) => json(path.join(bookRoot, entry.file))) };
const chapterName = (number) => `chapter-${String(number).padStart(2, '0')}`;
const chapterId = (number) => `chapter_${String(number).padStart(2, '0')}`;
const metadataFor = (number) => json(path.join(root, packRelative, chapterName(number), 'metadata.json'));
const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex');

test('all 27 original chapters and V4 final assets map one-to-one', () => {
  assert.equal(book.bookId, 'le-petit-prince');
  assert.equal(book.chapters.length, 27);
  for (let number = 1; number <= 27; number += 1) {
    const chapter = book.chapters[number - 1];
    const entry = bookMeta.chapters[number - 1];
    const name = chapterName(number);
    assert.equal(entry.id, chapterId(number));
    assert.equal(chapter.id, entry.id);
    assert.equal(chapter.number, number);
    assert.ok(chapter.sentences.length > 0);
    const sentenceIds = new Set(chapter.sentences.map((sentence) => sentence.id));
    assert.equal(sentenceIds.size, chapter.sentences.length);
    const paragraphIds = chapter.paragraphs.flatMap((paragraph) => paragraph.sentenceIds);
    assert.deepEqual([...paragraphIds].sort(), [...sentenceIds].sort(), `source coverage ${name}`);
    const metadata = metadataFor(number);
    const mp3 = readFileSync(path.join(root, packRelative, name, `${name}.mp3`));
    assert.equal(metadata.bookId, book.bookId);
    assert.equal(metadata.chapterId, name);
    assert.equal(metadata.voiceId, 'sANWqF1bCMzR6eyZbCGw');
    assert.equal(metadata.modelId, 'eleven_v4');
    assert.equal(metadata.languageCode, 'fr');
    assert.equal(metadata.stability, 0.4);
    assert.equal(metadata.styleId, 'v4-b-comfort');
    assert.equal(metadata.processingVersion, 1);
    assert.ok(metadata.outputDurationSeconds > 0);
    assert.equal(metadata.outputAudioChecksum, sha256(mp3), `checksum ${name}`);
    assert.equal(metadata.fileSize, mp3.length, `size ${name}`);
    assert.ok(mp3.length > 0);
  }
});

function playerHarness(number = 1, storage = new Map()) {
  const script = readFileSync(path.join(root, 'reader-narration-player.js'), 'utf8');
  const metadata = metadataFor(number);
  const controls = Object.fromEntries(['Time', 'Seek', 'Play', 'Back', 'Forward', 'Rate', 'Status'].map((name) => [name, {
    textContent: '', value: '0', disabled: false, handlers: {},
    setAttribute(key, value) { this[key] = value; },
    addEventListener(name, handler) { this.handlers[name] = handler; },
    fire(name) { return this.handlers[name]?.(); }
  }]));
  const rootElement = { querySelector(selector) { return controls[selector.replace('.readerNarration', '')] || null; } };
  const reader = (n) => ({ dataset: { bookId: 'le-petit-prince', chapterId: chapterId(n) },
    querySelector(selector) { return selector === '.readerNarration' ? rootElement : null; } });
  const audioInstances = [];
  let stopSpeechCount = 0;
  class FakeAudio {
    constructor(url) {
      this.url = url; this.paused = true; this.duration = metadata.outputDurationSeconds;
      this.handlers = {}; this._currentTime = 0;
      audioInstances.push(this);
      queueMicrotask(() => { this.fire('timeupdate'); this.fire('loadedmetadata'); });
    }
    addEventListener(name, handler) { this.handlers[name] = handler; }
    fire(name) { return this.handlers[name]?.(); }
    get currentTime() { return this._currentTime; }
    set currentTime(value) { this._currentTime = value; queueMicrotask(() => this.fire('seeked')); }
    async play() { this.paused = false; }
    pause() { this.paused = true; this.fire('pause'); }
    removeAttribute() {}
    load() {}
  }
  const labels = { readerNarrationTitle: 'Listen', readerNarrationSeek: 'Position',
    readerNarrationBack: 'Back 10', readerNarrationForward: 'Forward 10',
    readerNarrationPlay: 'Play', readerNarrationPause: 'Pause', readerNarrationRate: 'Speed',
    readerNarrationRetry: 'Retry', readerNarrationError: 'Error' };
  const browser = { PETITE_UI: { ja: labels, en: labels }, addEventListener() {},
    PETITE_STOP_READER_SPEECH() { stopSpeechCount += 1; } };
  const context = { window: browser, Audio: FakeAudio, URL,
    document: { baseURI: 'http://127.0.0.1:4173/', documentElement: { lang: 'en' }, addEventListener() {} },
    localStorage: { getItem(key) { return storage.get(key) ?? null; }, setItem(key, value) { storage.set(key, value); } },
    fetch: async (url) => {
      const match = /chapter-(\d{2})\/metadata\.json$/.exec(url);
      assert.ok(match, url);
      return { ok: true, json: async () => metadataFor(Number(match[1])) };
    } };
  vm.runInNewContext(script, context);
  return { api: browser.PETITE_READER_NARRATION, reader, controls, audioInstances, storage,
    stopSpeechCount: () => stopSpeechCount };
}
const flush = () => new Promise((resolve) => setImmediate(resolve));

test('Player URLs and availability match every chapter and reject absent chapters', () => {
  const { api } = playerHarness();
  for (let number = 1; number <= 27; number += 1) {
    const asset = api.assetFor('le-petit-prince', chapterId(number));
    const name = chapterName(number);
    assert.equal(new URL(asset.metadataUrl).pathname,
      `/${packRelative}/${name}/metadata.json`);
    assert.equal(new URL(asset.audioUrl).pathname,
      `/${packRelative}/${name}/${name}.mp3`);
    assert.match(api.html({ bookId: 'le-petit-prince' }, { id: chapterId(number) }), /readerNarrationSeek/);
  }
  assert.equal(api.assetFor('le-petit-prince', chapterId(28)), null);
  assert.equal(api.assetFor('sample-book', chapterId(1)), null);
});

test('play, pause, seek, resume, vocabulary interruption, and chapter cleanup', async () => {
  const h = playerHarness(3);
  await h.api.mount(h.reader(3));
  await flush();
  assert.equal(h.audioInstances.length, 0, 'opening reader must not autoplay');
  await h.controls.Play.fire('click');
  await flush();
  const first = h.audioInstances[0];
  assert.equal(first.paused, false);
  assert.equal(h.stopSpeechCount(), 1);
  first.currentTime = 40;
  await flush();
  first.pause();
  assert.equal(JSON.parse(h.storage.get(h.api.storageKey)).positions['le-petit-prince:chapter_03'].positionSeconds, 40);
  h.api.unmount();
  assert.equal(first.paused, true);
  await h.api.mount(h.reader(3));
  await flush();
  assert.match(h.controls.Time.textContent, /^00:40/);
  await h.controls.Play.fire('click');
  await flush();
  const resumed = h.audioInstances[1];
  assert.equal(resumed.currentTime, 40);
  h.controls.Forward.fire('click');
  assert.equal(resumed.currentTime, 50);
  h.controls.Back.fire('click');
  assert.equal(resumed.currentTime, 40);
  h.controls.Seek.value = '500';
  h.controls.Seek.fire('input');
  h.controls.Seek.fire('change');
  await flush();
  assert.ok(Math.abs(resumed.currentTime - metadataFor(3).outputDurationSeconds / 2) < 0.01);
  h.controls.Rate.value = '1.25';
  h.controls.Rate.fire('change');
  assert.equal(resumed.playbackRate, 1.25);
  h.api.pauseForOtherAudio();
  assert.equal(resumed.paused, true);
  await h.api.mount(h.reader(4));
  await flush();
  assert.equal(resumed.paused, true, 'old chapter audio must be stopped');
  const positions = JSON.parse(h.storage.get(h.api.storageKey)).positions;
  assert.ok(positions['le-petit-prince:chapter_03'].positionSeconds > 0);
  assert.equal(positions['le-petit-prince:chapter_04'], undefined);
});

test('Reader view renders chapter text and moves through actual chapter IDs', () => {
  const browser = { PETITE_BOOK_LIBRARY: { 'le-petit-prince': book },
    PETITE_UI: { ja: { readerChapterNavigation: '章', readerPreviousChapter: '前', readerNextChapter: '次' } },
    PETITE_READER_NARRATION: { html: (_book, section) => `<section data-player-for="${section.id}"></section>` },
    addEventListener() {} };
  const context = vm.createContext({ window: browser, localStorage: { getItem: () => null, setItem() {} } });
  vm.runInContext(`const state={lang:'ja',readerChapter:'chapter_03'};
    let readerChapter='chapter_03',readerBook='le-petit-prince',page='read',speed=1;
    function save(){} function render(){}`, context);
  vm.runInContext(readFileSync(path.join(bookRoot, 'reader-view.js'), 'utf8'), context);
  const html3 = browser.PETITE_FULL_BOOK_READER();
  assert.match(html3, /data-chapter-id="chapter_03"/);
  assert.match(html3, /data-player-for="chapter_03"/);
  assert.ok(html3.includes(book.chapters[2].sentences[0].originalFrench.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll("\"", "&quot;").replaceAll("\u0027", "&#39;")));
  browser.stepReaderChapter(1);
  const html4 = browser.PETITE_FULL_BOOK_READER();
  assert.match(html4, /data-chapter-id="chapter_04"/);
  assert.match(html4, /data-player-for="chapter_04"/);
  browser.selectReaderChapter('chapter_27');
  assert.match(browser.PETITE_FULL_BOOK_READER(), /data-chapter-id="chapter_27"/);
  browser.stepReaderChapter(1);
  assert.match(browser.PETITE_FULL_BOOK_READER(), /data-chapter-id="chapter_27"/);
});

test('Reader card speech pauses narration before speaking', () => {
  let paused = 0, spoken = 0, cancelled = 0;
  const app = { querySelector: () => null };
  class Utterance { constructor(text) { this.text = text; } }
  const browser = { PETITE_READER_NARRATION: { pauseForOtherAudio() { paused += 1; } },
    speechSynthesis: { cancel() { cancelled += 1; }, speak(utterance) { assert.equal(utterance.text, 'bonjour'); spoken += 1; } },
    SpeechSynthesisUtterance: Utterance };
  const context = { window: browser, document: { getElementById: () => app, addEventListener() {} },
    localStorage: { getItem: () => null }, Element: class {}, location: {} };
  vm.runInNewContext(readFileSync(path.join(root, 'reader-release.js'), 'utf8'), context);
  browser.speak('bonjour');
  assert.equal(paused, 1);
  assert.equal(spoken, 1);
  assert.equal(cancelled, 1);
});

test('local server serves V4 metadata and byte-range MP3 without a 404', async () => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    for (const number of [1, 3, 4, 27]) {
      const name = chapterName(number);
      const directory = `${packRelative}/${name}`;
      const response = await fetch(`${base}/${directory}/metadata.json`);
      assert.equal(response.status, 200);
      assert.equal((await response.json()).chapterId, name);
      const size = statSync(path.join(root, directory, `${name}.mp3`)).size;
      const audio = await fetch(`${base}/${directory}/${name}.mp3`, { headers: { Range: 'bytes=0-1023' } });
      assert.equal(audio.status, 206);
      assert.equal(audio.headers.get('accept-ranges'), 'bytes');
      assert.equal(audio.headers.get('content-range'), `bytes 0-1023/${size}`);
      assert.equal((await audio.arrayBuffer()).byteLength, 1024);
    }
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('main app exposes Reader and standalone scripts load in dependency order', () => {
  const appScript = readFileSync(path.join(root, 'app.js'), 'utf8');
  const page = readFileSync(path.join(root, 'reader.html'), 'utf8');
  assert.match(appScript, /href="reader\.html"/);
  const scripts = ['books/le-petit-prince/loader.js', 'reader-narration-player.js',
    'reader-release.js', 'books/le-petit-prince/reader-view.js'];
  let previous = -1;
  for (const script of scripts) {
    const index = page.indexOf(`src="${script}"`);
    assert.ok(index > previous, `script order: ${script}`);
    previous = index;
  }
});

test('service worker caches Reader runtime but bypasses MP3 and Range requests', () => {
  const script = readFileSync(path.join(root, 'service-worker.js'), 'utf8');
  const handlers = {};
  const context = { self: { location: { origin: 'http://example.test' },
    addEventListener(name, handler) { handlers[name] = handler; }, skipWaiting() {}, clients: { claim() {} } },
    URL, caches: { open: async () => ({ addAll() {}, put() {} }), keys: async () => [], match: async () => null },
    fetch: async () => ({ ok: false }) };
  vm.runInNewContext(script, context);
  assert.ok(script.includes("'./reader.html'"));
  assert.ok(script.includes("'./reader-narration-player.js'"));
  assert.doesNotMatch(script, /FILES\s*=\s*\[[^\]]*\.mp3/s);
  let responded = false;
  handlers.fetch({ request: { method: 'GET', url: 'http://example.test/chapter-01.mp3',
    headers: { has: () => false } }, respondWith() { responded = true; } });
  assert.equal(responded, false);
  handlers.fetch({ request: { method: 'GET', url: 'http://example.test/reader.html',
    headers: { has: () => true } }, respondWith() { responded = true; } });
  assert.equal(responded, false);
});

test('existing home renders a working Reader entry after language selection', () => {
  const app = { innerHTML: '' };
  const browser = { addEventListener() {} };
  const context = vm.createContext({ window: browser,
    document: { getElementById: () => app, documentElement: { lang: 'ja' } },
    localStorage: { getItem: () => JSON.stringify({ lang: 'ja', progress: {}, streak: 0, lastDay: null }), setItem() {} } });
  for (const script of ['i18n/ui.js', 'books/sample-book/chapter-1.js', 'app.js']) {
    vm.runInContext(readFileSync(path.join(root, script), 'utf8'), context, { filename: script });
  }
  assert.match(app.innerHTML, /<a class="readerHomeLink" href="reader\.html">Le Petit Prince<\/a>/);
});
