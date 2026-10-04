/* Optional loader for rights-cleared book content. The existing sample story
   continues to load through its current path; this API is inert until called. */
(function () {
  'use strict';

  function assertUniqueIds(records, label) {
    const seen = new Set();
    for (const record of records || []) {
      if (!record || typeof record.id !== 'string' || !record.id.trim()) {
        throw new Error(label + ' contains a record without a stable id.');
      }
      if (seen.has(record.id)) throw new Error('Duplicate ' + label + ' id: ' + record.id);
      seen.add(record.id);
    }
  }

  function wordsIn(text) {
    return String(text || '').match(/[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+(?:[’'][A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]+)*/g) || [];
  }

  function splitFrenchTokens(text) {
    const tokens = wordsIn(text);
    return tokens.flatMap((token) => {
      const contraction = token.match(/^([cdjlmnst][’'])(.+)$/i);
      return contraction ? [contraction[1], contraction[2]] : [token];
    });
  }

  function normalizedWords(text) {
    return wordsIn(String(text || '').normalize('NFC').toLocaleLowerCase('fr'))
      .map((word) => word.normalize('NFC'));
  }

  function withoutPunctuation(text) {
    return String(text || '').normalize('NFC')
      .replace(/[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~«»‹›“”„‘’…–—]/g, '');
  }

  function spacingSignature(text) {
    return withoutPunctuation(text).replace(/\r\n?/g, '\n').replace(/\n\s*\n/g, '\u2029').replace(/\n/g, ' ');
  }

  function paragraphWordCounts(text) {
    return String(text || '').trim().split(/\n\s*\n/).filter(Boolean).map((part) => wordsIn(part).length);
  }

  function compareFrench(masterText, existingText) {
    const master = String(masterText || '').normalize('NFC');
    const existing = String(existingText || '').normalize('NFC');
    const masterWords = normalizedWords(master);
    const existingWords = normalizedWords(existing);
    const wordDifferences = [];
    const count = Math.max(masterWords.length, existingWords.length);
    for (let i = 0; i < count; i += 1) {
      if (masterWords[i] !== existingWords[i]) {
        wordDifferences.push({ position: i + 1, master: masterWords[i] || null, existing: existingWords[i] || null });
      }
    }
    const differences = [];
    if (master !== existing) {
      const paragraphStructureChanged = paragraphWordCounts(master).join(',') !== paragraphWordCounts(existing).join(',');
      if (paragraphStructureChanged) differences.push('paragraph-structure');
      if (!wordDifferences.length) {
        if (master.replace(/\s/g, '') !== existing.replace(/\s/g, '')) differences.push('punctuation');
        if (!paragraphStructureChanged && spacingSignature(master) !== spacingSignature(existing)) differences.push('spacing');
      }
      if (wordDifferences.length) differences.push('words');
      if (!differences.length) differences.push('formatting');
    }
    return { identical: master === existing, differences, wordDifferences };
  }

  function phraseOccurs(sentence, phrase) {
    const source = String(sentence || '').normalize('NFC').toLocaleLowerCase('fr');
    const target = String(phrase || '').normalize('NFC').toLocaleLowerCase('fr').trim();
    if (!target) return false;
    let start = 0;
    while ((start = source.indexOf(target, start)) !== -1) {
      const before = source[start - 1] || '';
      const after = source[start + target.length] || '';
      if (!/[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]/.test(before) && !/[A-Za-zÀ-ÖØ-öø-ÿŒœÆæ]/.test(after)) return true;
      start += target.length;
    }
    return false;
  }

  function buildPhraseWords(item, wordItems) {
    return splitFrenchTokens(item.french).map((word, wordIndex) => {
      const glossaryWord = wordItems.find((candidate) => {
        const parts = wordsIn(candidate.french);
        return parts.length && parts[parts.length - 1].toLocaleLowerCase('fr') === word.toLocaleLowerCase('fr');
      });
      return {
        id: item.id + '-word-' + String(wordIndex + 1).padStart(2, '0'),
        originalFrench: word,
        modernFrench: null,
        japanese: glossaryWord ? glossaryWord.ja || null : null,
        english: glossaryWord ? glossaryWord.en || null : null,
        japaneseExplanation: glossaryWord ? glossaryWord.jae || null : null,
        englishExplanation: glossaryWord ? glossaryWord.ene || null : null,
        sourceItemId: glossaryWord ? glossaryWord.id : null
      };
    });
  }

  function fromLegacy(story, items) {
    const legacyStory = Array.isArray(story) ? story : [];
    const legacyItems = Array.isArray(items) ? items : [];
    const wordItems = legacyItems.filter((item) => item && item.type === 'word');
    const phraseItems = legacyItems.filter((item) => item && item.type === 'phrase');
    const sentences = legacyStory.map((line, index) => {
      const originalFrench = line.fr || line.originalFrench || line.french || '';
      const phrases = phraseItems.filter((item) => phraseOccurs(originalFrench, item.french)).map((item) => ({
        id: item.id,
        originalFrench: item.french,
        modernFrench: item.modernFrench == null ? null : item.modernFrench,
        japanese: item.ja || null,
        english: item.en || null,
        japaneseExplanation: item.jae || null,
        englishExplanation: item.ene || null,
        sourceEdition: null,
        sourceReference: null,
        textVersion: 'legacy-migration-1',
        words: buildPhraseWords(item, wordItems)
      }));
      return {
        id: 'sample-book-chapter-1-sentence-' + String(index + 1).padStart(2, '0'),
        originalFrench,
        modernFrench: line.modernFrench == null ? null : line.modernFrench,
        japanese: line.ja || line.japanese || null,
        english: line.en || line.english || null,
        sourceEdition: null,
        sourceReference: null,
        textVersion: 'legacy-migration-1',
        phrases
      };
    });
    return {
      id: 'sample-book-chapter-1',
      title: 'A Small Encounter',
      sentences,
      studyItems: legacyItems.map((item) => ({
        ...item,
        originalFrench: item.french || '',
        modernFrench: item.modernFrench == null ? null : item.modernFrench,
        japanese: item.ja || null,
        english: item.en || null,
        stableId: item.id,
        ...(item.type === 'phrase' ? { words: buildPhraseWords(item, wordItems) } : {})
      }))
    };
  }

  async function loadBook(manifestUrl) {
    const absoluteManifestUrl = new URL(manifestUrl, document.baseURI).href;
    const response = await fetch(absoluteManifestUrl, { headers: { Accept: 'application/json' } });
    if (!response.ok) throw new Error('Could not load book metadata: ' + response.status);
    const manifest = await response.json();
    if (!manifest || !manifest.bookId || !manifest.title || !(manifest.edition || manifest.masterEdition)) {
      throw new Error('Book metadata is missing bookId, title, or edition information.');
    }

    const chapterRefs = Array.isArray(manifest.chapters) ? manifest.chapters : [];
    const chapters = await Promise.all(chapterRefs.map(async (ref) => {
      if (typeof ref === 'string') {
        const base = new URL('.', absoluteManifestUrl);
        ref = { url: new URL(ref, base).href };
      }
      const url = ref.url || ref.file;
      if (!url) throw new Error('Chapter reference is missing a file URL.');
      const chapterUrl = new URL(url, absoluteManifestUrl).href;
      const chapterResponse = await fetch(chapterUrl, { headers: { Accept: 'application/json' } });
      if (!chapterResponse.ok) throw new Error('Could not load chapter: ' + chapterResponse.status);
      const chapter = await chapterResponse.json();
      if (!chapter || !chapter.id || !Array.isArray(chapter.sentences)) {
        throw new Error('Chapter must contain an id and a sentences array.');
      }
      assertUniqueIds(chapter.sentences, 'sentence');
      for (const sentence of chapter.sentences) {
        if (typeof sentence.originalFrench !== 'string') {
          throw new Error('Sentence ' + sentence.id + ' is missing originalFrench.');
        }
        assertUniqueIds(sentence.phrases || [], 'phrase');
        for (const phrase of sentence.phrases || []) assertUniqueIds(phrase.words || [], 'word');
      }
      return chapter;
    }));

    assertUniqueIds(chapters, 'chapter');
    let frontMatter = manifest.frontMatter || null;
    if (typeof frontMatter === 'string') {
      const frontMatterUrl = new URL(frontMatter, absoluteManifestUrl).href;
      const frontMatterResponse = await fetch(frontMatterUrl, { headers: { Accept: 'application/json' } });
      if (!frontMatterResponse.ok) throw new Error('Could not load book front matter: ' + frontMatterResponse.status);
      frontMatter = await frontMatterResponse.json();
      assertUniqueIds([frontMatter], 'front matter');
    }

    const sentences = chapters.flatMap((chapter) => chapter.sentences || []);
    const phrases = sentences.flatMap((sentence) => sentence.phrases || []);
    const words = phrases.flatMap((phrase) => phrase.words || []);
    assertUniqueIds(sentences, 'sentence');
    assertUniqueIds(phrases, 'phrase');
    assertUniqueIds(words, 'word');
    return { ...manifest, frontMatter, chapters };
  }

  window.PETITE_CONTENT = Object.freeze({ loadBook, compareFrench, fromLegacy });

  // Keep the active sample arrays and progress IDs intact; add a normalized view beside them.
  const library = window.PETITE_BOOK_LIBRARY || (window.PETITE_BOOK_LIBRARY = {});
  if (Array.isArray(window.PETITE_STORY) && Array.isArray(window.PETITE_ITEMS)) {
    const sample = fromLegacy(window.PETITE_STORY, window.PETITE_ITEMS);
    sample.sentences.forEach((sentence, index) => Object.assign(window.PETITE_STORY[index], sentence));
    sample.studyItems.forEach((item, index) => Object.assign(window.PETITE_ITEMS[index], item));
    library['sample-book'] = {
      bookId: 'sample-book',
      title: sample.title,
      language: 'fr',
      chapters: [sample]
    };
  }

  // Load the edition catalog separately from the active sample story.
  const manifestUrl = new URL('book.json', document.currentScript.src).href;
  const bookReady = loadBook(manifestUrl).then((book) => {
    library[book.bookId] = book;
    window.dispatchEvent(new CustomEvent('petitecontentready', { detail: book }));
    return book;
  }).catch((error) => {
    window.PETITE_BOOK_LOAD_ERROR = error;
    console.warn('Petite Lecture book metadata could not be loaded.', error);
    window.dispatchEvent(new CustomEvent('petitecontenterror', { detail: error }));
    return null;
  });
  window.PETITE_BOOK_LIBRARY_READY = bookReady;

  // Original French stays the reading text. Modern French appears only when a field exists.
  document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
    const originalRender = window.render;
    const escapeHtml = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[char]));
    function enhanceReadingView() {
      if (window.PETITE_GET_READER_BOOK?.() !== 'sample-book') return;
      const sentences = document.querySelectorAll('.reading .sentence');
      const models = library['sample-book'] && library['sample-book'].chapters[0].sentences || [];
      sentences.forEach((element, index) => {
        const sentence = models[index];
        if (!sentence) return;
        element.dataset.sentenceId = sentence.id;
        if (!sentence.modernFrench || element.querySelector('.modernFrenchNote')) return;
        const originalLabel = document.createElement('small');
        originalLabel.className = 'originalFrenchLabel';
        originalLabel.textContent = document.documentElement.lang === 'ja' ? '本の中の原文' : 'Original French';
        element.insertBefore(originalLabel, element.firstChild);
        const note = document.createElement('div');
        note.className = 'modernFrenchNote';
        note.innerHTML = '<small>' + (document.documentElement.lang === 'ja' ? '💬 今ならこう言うことも多い' : '💬 Often said this way today') + '</small><div>' + escapeHtml(sentence.modernFrench) + '</div>';
        element.appendChild(note);
      });
    }
    if (typeof originalRender === 'function') {
      window.render = function () {
        const result = originalRender.apply(this, arguments);
        enhanceReadingView();
        return result;
      };
    }
    const originalDetail = window.detail;
    if (typeof originalDetail === 'function') {
      window.detail = function (id) {
        const html = originalDetail.apply(this, arguments);
        const item = (window.PETITE_ITEMS || []).find((candidate) => candidate.id === id);
        if (!item) return html;
        let additions = '';
        if (item.modernFrench) {
          const originalLabel = document.documentElement.lang === 'ja' ? '本の中の原文' : 'Original French';
          const strongTag = '<small class="originalFrenchLabel">' + originalLabel + '</small><strong>';
          const strongIndex = html.indexOf('<strong>');
          if (strongIndex !== -1) html = html.slice(0, strongIndex) + strongTag + html.slice(strongIndex + '<strong>'.length);
          additions += '<div class="modernFrenchNote"><small>' + (document.documentElement.lang === 'ja' ? '💬 今ならこう言うことも多い' : '💬 Often said this way today') + '</small><div>' + escapeHtml(item.modernFrench) + '</div></div>';
        }
        if (item.type === 'phrase' && Array.isArray(item.words) && item.words.length) {
          const label = document.documentElement.lang === 'ja' ? '表現の中の単語' : 'Words in this phrase';
          additions += '<div class="phraseWordBreakdown"><small>' + label + '</small><div>' + item.words.map((word, index) =>
            '<button class="phraseWordPart" type="button" data-phrase-id="' + escapeHtml(item.id) + '" data-word-index="' + index + '">' + escapeHtml(word.originalFrench) + '</button>'
          ).join('') + '</div><div id="phraseWordDetail" aria-live="polite"></div></div>';
        }
        if (!additions) return html;
        const closing = html.lastIndexOf('</div>');
        return closing < 0 ? html : html.slice(0, closing) + additions + html.slice(closing);
      };
    }
    window.showPhraseWord = function (phraseId, wordIndex) {
      const phrase = (window.PETITE_ITEMS || []).find((candidate) => candidate.id === phraseId);
      const word = phrase && phrase.words && phrase.words[wordIndex];
      const detail = document.getElementById('phraseWordDetail');
      if (!word || !detail) return;
      const language = document.documentElement.lang === 'ja' ? 'ja' : 'en';
      const meaning = word[language] || (language === 'ja' ? 'この単語の訳はまだありません。' : 'A translation for this word has not been added yet.');
      detail.textContent = word.originalFrench + ' — ' + meaning;
    };
    document.addEventListener('click', (event) => {
      const button = event.target.closest && event.target.closest('.phraseWordPart');
      if (button) window.showPhraseWord(button.dataset.phraseId, Number(button.dataset.wordIndex));
    });
    const style = document.createElement('style');
    style.textContent = '.originalFrenchLabel{display:block;color:#597966;font-size:.76rem;font-weight:700;letter-spacing:.04em;margin:.2rem 0}.modernFrenchNote{margin:.75rem 0;padding:.65rem .8rem;border-left:3px solid #b2c86a;background:#f5f6e9;border-radius:0 .6rem .6rem 0}.modernFrenchNote small,.phraseWordBreakdown small{display:block;color:#597966;font-weight:700;margin-bottom:.25rem}.phraseWordBreakdown{margin-top:.8rem;padding-top:.65rem;border-top:1px solid #e8e7dc}.phraseWordBreakdown>div{display:flex;flex-wrap:wrap;gap:.35rem;margin-top:.35rem}.phraseWordPart{border:1px solid #e5e4d9;background:#faf9f3;color:#254a3c;border-radius:999px;padding:.25rem .55rem;font:inherit}';
    document.head.appendChild(style);
    enhanceReadingView();
    }, 0);
  });
})();
