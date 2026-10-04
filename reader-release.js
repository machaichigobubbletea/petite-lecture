/* Small standalone Le Petit Prince Reader for the V4 release. */
'use strict';
const RELEASE_KEY = 'petite-lecture:reader-release-v1';
let releaseSaved = {};
try { releaseSaved = JSON.parse(localStorage.getItem(RELEASE_KEY) || '{}') || {}; } catch (_) {}
const state = {
  lang: releaseSaved.lang === 'en' ? 'en' : 'ja',
  readerChapter: /^chapter_\d{2}$/.test(releaseSaved.readerChapter || '')
    ? releaseSaved.readerChapter : 'chapter_01'
};
let readerChapter = state.readerChapter;
let readerBook = 'le-petit-prince';
let page = 'read';
let speed = 1;
const app = document.getElementById('app');
const readerLabels = {
  ja: {
    readerChapterNavigation: '章の移動', readerPreviousChapter: '前の章', readerNextChapter: '次の章',
    readerNarrationTitle: '章を聴く', readerNarrationSeek: '再生位置',
    readerNarrationBack: '10秒戻る', readerNarrationForward: '10秒進む',
    readerNarrationPlay: '再生', readerNarrationPause: '一時停止',
    readerNarrationRate: '再生速度', readerNarrationRetry: '再試行',
    readerNarrationError: '音声を読み込めませんでした。再試行できます。'
  },
  en: {
    readerChapterNavigation: 'Chapter navigation', readerPreviousChapter: 'Previous chapter', readerNextChapter: 'Next chapter',
    readerNarrationTitle: 'Listen to chapter', readerNarrationSeek: 'Playback position',
    readerNarrationBack: 'Back 10 seconds', readerNarrationForward: 'Forward 10 seconds',
    readerNarrationPlay: 'Play', readerNarrationPause: 'Pause',
    readerNarrationRate: 'Playback speed', readerNarrationRetry: 'Retry',
    readerNarrationError: 'Could not load audio. Please retry.'
  }
};
window.PETITE_UI = readerLabels;
function save() {
  try { localStorage.setItem(RELEASE_KEY, JSON.stringify({ lang: state.lang, readerChapter: state.readerChapter })); }
  catch (_) {}
}
function stopReaderSpeech() { window.speechSynthesis?.cancel(); }
window.PETITE_STOP_READER_SPEECH = stopReaderSpeech;
window.PETITE_SAVE_READER_POSITION = () => {
  const reader = app.querySelector('.pgaBookContent');
  if (reader) window.PETITE_READER_POSITION?.saveVisible(reader, window.innerHeight);
};
window.speak = (text) => {
  if (!text || !window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
  window.PETITE_READER_NARRATION?.pauseForOtherAudio();
  stopReaderSpeech();
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = 'fr-FR';
  utterance.rate = speed;
  window.speechSynthesis.speak(utterance);
};
function escapeReader(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[character]));
}
function render() {
  window.PETITE_READER_NARRATION?.unmount();
  stopReaderSpeech();
  if (readerBook !== 'le-petit-prince') { location.href = './index.html'; return; }
  document.documentElement.lang = state.lang;
  const label = state.lang === 'ja' ? 'ホームへ' : 'Home';
  const language = state.lang === 'ja' ? 'English' : '日本語';
  app.innerHTML = '<div class="shell"><header class="top"><div class="brand"><b>é</b> Petite Lecture</div>' +
    '<nav class="nav"><a class="readerHomeLink" href="./index.html">← ' + label + '</a></nav>' +
    '<button class="lang" type="button" onclick="toggleReaderReleaseLanguage()">' + language + '</button></header>' +
    (window.PETITE_FULL_BOOK_READER ? window.PETITE_FULL_BOOK_READER() : '<main>Loading…</main>') + '</div>';
  const reader = app.querySelector('.pgaBookContent');
  if (reader) {
    const card = document.createElement('section');
    card.className = 'readerReleaseCard';
    card.hidden = true;
    card.setAttribute('aria-live', 'polite');
    reader.append(card);
    window.PETITE_READER_NARRATION?.mount(reader);
  }
}
window.render = render;
window.toggleReaderReleaseLanguage = () => {
  state.lang = state.lang === 'ja' ? 'en' : 'ja';
  save();
  render();
};
function showReaderCard(sentenceId, phraseIndex = null) {
  const reader = app.querySelector('.pgaBookContent');
  const card = reader?.querySelector('.readerReleaseCard');
  const chapter = window.PETITE_BOOK_LIBRARY?.['le-petit-prince']?.chapters
    ?.find((entry) => entry.id === reader?.dataset.chapterId);
  const sentence = chapter?.sentences?.find((entry) => entry.id === sentenceId);
  if (!card || !sentence) return;
  const phrase = phraseIndex === null ? null : sentence.phrases?.[phraseIndex];
  const selected = phrase || sentence;
  const french = selected.originalFrench;
  const meaning = selected[state.lang === 'ja' ? 'japanese' : 'english'];
  card.innerHTML = '<div class="readerReleaseCardHeading"><strong lang="fr">' + escapeReader(french) + '</strong>' +
    '<button type="button" data-reader-speak="1" aria-label="' + (state.lang === 'ja' ? 'フランス語を再生' : 'Play French') + '">🔊</button>' +
    '<button type="button" data-reader-close="1" aria-label="' + (state.lang === 'ja' ? '閉じる' : 'Close') + '">×</button></div>' +
    (meaning ? '<p>' + escapeReader(meaning) + '</p>' : '') +
    (!phrase && sentence.phrases?.length ? '<div class="readerReleasePhrases">' + sentence.phrases.map((entry, index) =>
      '<button type="button" data-reader-phrase="' + index + '" data-sentence-id="' + escapeReader(sentenceId) + '">' +
      escapeReader(entry.originalFrench) + '</button>').join('') + '</div>' : '');
  card.dataset.speechText = french;
  card.hidden = false;
}
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (target.closest('[data-reader-close]')) {
    const card = app.querySelector('.readerReleaseCard');
    if (card) card.hidden = true;
    return;
  }
  if (target.closest('[data-reader-speak]')) {
    window.speak(app.querySelector('.readerReleaseCard')?.dataset.speechText);
    return;
  }
  const phrase = target.closest('[data-reader-phrase]');
  if (phrase) { showReaderCard(phrase.dataset.sentenceId, Number(phrase.dataset.readerPhrase)); return; }
  const sentence = target.closest('.pgaChapterText [data-sentence-id]');
  if (sentence) showReaderCard(sentence.dataset.sentenceId);
});
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const sentence = event.target.closest?.('.pgaChapterText [data-sentence-id]');
  if (sentence) { event.preventDefault(); showReaderCard(sentence.dataset.sentenceId); }
});
