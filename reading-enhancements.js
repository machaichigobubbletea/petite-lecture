(() => {
  const style = document.createElement('style');
  style.textContent = `.reading .sentence{font-size:var(--reading-font-size,22px);scroll-margin-top:100px}.reading .sentenceTools{display:flex;gap:8px;justify-content:flex-end;margin-top:10px}.reading .sentenceTools button,.readingFontControls button,.voicePreviewButton{min-width:44px;min-height:44px;touch-action:manipulation}.reading .sentenceSpeaking{background:rgba(229,211,58,.2);border-radius:12px;outline:2px solid rgba(229,211,58,.55)}.reading .sentenceTranslation[hidden]{display:none!important}.reading .sentenceTranslation{display:block!important;margin-top:8px;font-size:.78em;color:#777}.reading .readingFontControls{display:flex;align-items:center;gap:8px;flex-wrap:wrap}`;
  document.head.append(style);
  const LAST_SENTENCE = 'petite-lecture:last-sentence';
  const FONT_SIZE = 'petite-lecture:font-size';
  const SAMPLE = 'Bonjour ! Je suis très heureuse de vous rencontrer.';
  let mountedReader = null;
  let restoreTimer = 0;
  let scrollTimer = 0;
  let scrollHandlerInstalled = false;

  const clampFont = (value) => Math.max(18, Math.min(30, Number(value) || 22));
  const setFont = (value) => {
    const size = clampFont(value);
    document.documentElement.style.setProperty('--reading-font-size', `${size}px`);
    try { localStorage.setItem(FONT_SIZE, String(size)); } catch (_) {}
    const label = document.querySelector('[data-font-size-label]');
    if (label) label.textContent = `${size}px`;
  };

  try { setFont(localStorage.getItem(FONT_SIZE)); } catch (_) { setFont(22); }

  const highlightSentence = (element) => {
    document.querySelectorAll('.sentence.sentenceSpeaking').forEach((item) => item.classList.remove('sentenceSpeaking'));
    if (element) {
      element.classList.add('sentenceSpeaking');
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  };

  // Keep the existing voice-picker speech wrapper and add a reading position highlight.
  if (window.speechSynthesis && !window.__petiteLectureHighlightSpeech) {
    window.__petiteLectureHighlightSpeech = true;
    const synth = window.speechSynthesis;
    const originalSpeak = synth.speak.bind(synth);
    synth.speak = (utterance) => {
      const text = utterance && utterance.text;
      const sentence = [...document.querySelectorAll('.sentence[data-reading-index]')]
        .find((item) => item.dataset.speechText === text);
      if (sentence) {
        const index = Number(sentence.dataset.readingIndex);
        try { localStorage.setItem(LAST_SENTENCE, String(index)); } catch (_) {}
        utterance.addEventListener('start', () => highlightSentence(sentence), { once: true });
        const clear = () => sentence.classList.remove('sentenceSpeaking');
        utterance.addEventListener('end', clear, { once: true });
        utterance.addEventListener('error', clear, { once: true });
      }
      return originalSpeak(utterance);
    };
  }

  function addVoicePreview(controls) {
    if (controls.querySelector('[data-voice-preview]')) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'voicePreviewButton';
    button.dataset.voicePreview = 'true';
    button.textContent = '▶ 試聴';
    button.addEventListener('click', () => {
      if (!window.speechSynthesis || !window.SpeechSynthesisUtterance) return;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(SAMPLE);
      utterance.lang = 'fr-FR';
      window.speechSynthesis.speak(utterance);
    });
    controls.append(button);
  }

  function addFontControls(controls) {
    if (controls.querySelector('.readingFontControls')) return;
    const group = document.createElement('div');
    group.className = 'readingFontControls';
    group.setAttribute('aria-label', '文字サイズ');
    const minus = document.createElement('button');
    minus.type = 'button'; minus.textContent = 'A−'; minus.setAttribute('aria-label', '文字を小さく');
    const label = document.createElement('span'); label.dataset.fontSizeLabel = 'true';
    const plus = document.createElement('button');
    plus.type = 'button'; plus.textContent = 'A+'; plus.setAttribute('aria-label', '文字を大きく');
    minus.addEventListener('click', () => setFont(clampFont(getComputedStyle(document.documentElement).getPropertyValue('--reading-font-size').replace('px', '')) - 2));
    plus.addEventListener('click', () => setFont(clampFont(getComputedStyle(document.documentElement).getPropertyValue('--reading-font-size').replace('px', '')) + 2));
    group.append(minus, label, plus);
    controls.append(group);
    setFont(getComputedStyle(document.documentElement).getPropertyValue('--reading-font-size').replace('px', ''));
  }

  function enhanceSentences(reader) {
    reader.querySelectorAll('.sentence').forEach((sentence, index) => {
      sentence.dataset.readingIndex = String(index);
      const text = sentence.querySelector(':scope > span:not(.trans)')?.textContent?.trim()
        || [...sentence.childNodes].filter((node) => node.nodeType === Node.TEXT_NODE).map((node) => node.textContent).join('').trim();
      if (text) sentence.dataset.speechText = text;

      const storyLine = window.PETITE_STORY && window.PETITE_STORY[index];
      const storedTranslation = sentence.dataset.translation || (storyLine && (storyLine.en || storyLine.ja)) || '';
      let translation = sentence.querySelector('.trans');
      if (!translation) {
        translation = document.createElement('span');
        translation.className = 'trans sentenceTranslation';
        translation.textContent = storedTranslation;
        if (!translation.textContent) translation.hidden = true;
        sentence.append(translation);
      } else if (!translation.textContent.trim() && storedTranslation) {
        translation.textContent = storedTranslation;
      }

      let tools = sentence.querySelector('.sentenceTools');
      if (!tools) {
        tools = document.createElement('div');
        tools.className = 'sentenceTools';
        const play = document.createElement('button');
        play.type = 'button'; play.className = 'sentencePlay'; play.textContent = '▶';
        play.setAttribute('aria-label', 'この文をフランス語で再生');
        play.addEventListener('click', (event) => {
          event.stopPropagation();
          if (text && typeof window.speak === 'function') window.speak(text);
          else if (text && window.speechSynthesis && window.SpeechSynthesisUtterance) {
            const utterance = new SpeechSynthesisUtterance(text); utterance.lang = 'fr-FR'; window.speechSynthesis.speak(utterance);
          }
        });
        const translate = document.createElement('button');
        translate.type = 'button'; translate.className = 'sentenceTranslationToggle';
        translate.textContent = '訳'; translate.setAttribute('aria-label', 'この文の訳を表示');
        translate.addEventListener('click', (event) => {
          event.stopPropagation();
          translation.hidden = !translation.hidden;
          translate.textContent = translation.hidden ? '訳' : '訳を隠す';
          translate.setAttribute('aria-expanded', String(!translation.hidden));
        });
        tools.append(play, translate);
        sentence.append(tools);
      }
    });
  }

  function savePosition(reader) {
    const sentences = [...reader.querySelectorAll('.sentence[data-reading-index]')];
    if (!sentences.length) return;
    const mid = window.innerHeight * 0.45;
    let nearest = sentences[0];
    let distance = Infinity;
    sentences.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const d = Math.abs((rect.top + rect.height / 2) - mid);
      if (d < distance) { distance = d; nearest = item; }
    });
    try { localStorage.setItem(LAST_SENTENCE, nearest.dataset.readingIndex); } catch (_) {}
  }

  function restorePosition(reader) {
    clearTimeout(restoreTimer);
    restoreTimer = setTimeout(() => {
      let index = 0;
      try { index = Number(localStorage.getItem(LAST_SENTENCE)) || 0; } catch (_) {}
      const target = reader.querySelector(`.sentence[data-reading-index="${index}"]`);
      target?.scrollIntoView({ block: 'start' });
    }, 220);
  }

  function mount() {
    const reader = document.querySelector('#app .reading');
    if (!reader) { mountedReader = null; return; }
    const controls = reader.querySelector('.controls');
    if (controls) {
      addFontControls(controls);
      addVoicePreview(controls);
    }
    if (reader === mountedReader && reader.dataset.enhanced === 'true') return;
    mountedReader = reader;
    reader.dataset.enhanced = 'true';
    enhanceSentences(reader);
    restorePosition(reader);
    if (!scrollHandlerInstalled) {
      scrollHandlerInstalled = true;
      window.addEventListener('scroll', () => {
        clearTimeout(scrollTimer);
        const active = mountedReader;
        if (active) scrollTimer = setTimeout(() => savePosition(active), 250);
      }, { passive: true });
    }
  }

  const observer = new MutationObserver(mount);
  function start() {
    const app = document.querySelector('#app') || document.body;
    observer.observe(app, { childList: true, subtree: true });
    mount();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
})();
