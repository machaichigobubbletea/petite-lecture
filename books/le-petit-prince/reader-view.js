/* Minimal reader adapter for structured Le Petit Prince chapter data. */
(function () {
  'use strict';

  const POSITION_KEY = 'petite-lecture:reading-positions-v1';
  function savedPositions() {
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || 'null');
      return saved?.version === 1 && saved.positions && typeof saved.positions === 'object'
        && !Array.isArray(saved.positions) ? saved.positions : {};
    } catch (_) { return {}; }
  }
  function positionKey(bookId, chapterId) { return bookId + ':' + chapterId; }
  function saveSentence(bookId, chapterId, sentenceId) {
    if (bookId !== 'le-petit-prince' || !/^chapter_\d+$/.test(chapterId)
      || typeof sentenceId !== 'string' || !sentenceId.startsWith(chapterId + '_sentence_')) return;
    try {
      localStorage.setItem(POSITION_KEY, JSON.stringify({ version: 1, positions: {
        ...savedPositions(), [positionKey(bookId, chapterId)]: sentenceId
      } }));
    } catch (_) {}
  }
  function saveVisible(reader, viewportHeight) {
    const bookId = reader?.dataset.bookId;
    const chapterId = reader?.dataset.chapterId;
    if (bookId !== 'le-petit-prince' || !chapterId) return;
    const sentences = [...reader.querySelectorAll('[data-sentence-id]')];
    if (!sentences.length) return;
    const middle = viewportHeight * 0.45;
    const nearest = sentences.reduce((best, sentence) => {
      const rect = sentence.getBoundingClientRect();
      const distance = Math.abs((rect.top + rect.height / 2) - middle);
      return distance < best.distance ? { sentence, distance } : best;
    }, { sentence: null, distance: Infinity }).sentence;
    if (nearest) saveSentence(bookId, chapterId, nearest.dataset.sentenceId);
  }
  function restorePosition(reader) {
    const bookId = reader?.dataset.bookId;
    const chapterId = reader?.dataset.chapterId;
    if (bookId !== 'le-petit-prince' || !chapterId) return false;
    const sentenceId = savedPositions()[positionKey(bookId, chapterId)];
    const target = [...reader.querySelectorAll('[data-sentence-id]')]
      .find((sentence) => sentence.dataset.sentenceId === sentenceId);
    if (!target) return false;
    target.scrollIntoView({ block: 'start' });
    return true;
  }
  // The old global paragraph-index key is intentionally ignored: it has no chapter identity.
  window.PETITE_READER_POSITION = Object.freeze({ saveSentence, saveVisible, restorePosition });

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[character]));
  }

  function chapterOptions(book) {
    const options = [];
    if (book.frontMatter) {
      const front = book.frontMatter;
      options.push('<option value="' + escapeHtml(front.id) + '" ' + (readerChapter === front.id ? 'selected' : '') + '>' + escapeHtml(front.title || 'Dédicace') + '</option>');
    }
    (book.chapters || []).forEach((chapter) => {
      options.push('<option value="' + escapeHtml(chapter.id) + '" ' + (readerChapter === chapter.id ? 'selected' : '') + '>Chapitre ' + String(chapter.number).padStart(2, '0') + '</option>');
    });
    return options.join('');
  }

  function chapterNavigation(book, section) {
    const chapters = book.chapters || [];
    const index = chapters.findIndex((chapter) => chapter.id === section?.id);
    const labels = window.PETITE_UI[state.lang === 'en' ? 'en' : 'ja'];
    const previousDisabled = index <= 0;
    const nextDisabled = index === chapters.length - 1 || !chapters.length;
    return '<nav class="readerChapterNav" aria-label="' + escapeHtml(labels.readerChapterNavigation) + '">' +
      '<button type="button" onclick="stepReaderChapter(-1)"' + (previousDisabled ? ' disabled' : '') + '>← ' + escapeHtml(labels.readerPreviousChapter) + '</button>' +
      '<button type="button" onclick="stepReaderChapter(1)"' + (nextDisabled ? ' disabled' : '') + '>' + escapeHtml(labels.readerNextChapter) + ' →</button></nav>';
  }

  function sectionHtml(section) {
    if (Array.isArray(section.sentences)) {
      const byId = new Map(section.sentences.map((sentence) => [sentence.id, sentence]));
      return (section.paragraphs || []).map((paragraph) => {
        const sentences = paragraph.sentenceIds.map((id) => byId.get(id)).filter(Boolean);
        const originalText = sentences.map((sentence) => sentence.originalFrench).join(' ');
        return '<div class="sentence" data-source-paragraph-id="' + escapeHtml(paragraph.id) + '" data-sentence-ids="' + escapeHtml(paragraph.sentenceIds.join(' ')) + '" data-speech-text="' + escapeHtml(originalText) + '"><p class="sourceParagraphText" lang="fr">' + sentences.map((sentence) => '<span role="button" tabindex="0" data-sentence-id="' + escapeHtml(sentence.id) + '">' + escapeHtml(sentence.originalFrench) + '</span>').join(' ') + '</p></div>';
      }).join('');
    }
    return (section.paragraphs || []).map((text, index) => {
      const paragraph = typeof text === 'string' ? text : text.originalFrench || '';
      return '<div class="sentence" data-source-paragraph-id="dedication-paragraph-' + (index + 1) + '" data-speech-text="' + escapeHtml(paragraph) + '"><p class="sourceParagraphText" lang="fr">' + escapeHtml(paragraph) + '</p></div>';
    }).join('');
  }

  function fullBookRead() {
    const book = window.PETITE_BOOK_LIBRARY && window.PETITE_BOOK_LIBRARY['le-petit-prince'];
    if (!book) {
      if (window.PETITE_BOOK_LOAD_ERROR) {
        return '<main><div class="pageTitle"><h1>Le Petit Prince</h1><p>' + (state.lang === 'ja' ? '本文データを読み込めませんでした。ページを再読み込みしてください。' : 'Could not load the book data. Please reload the page.') + '</p></div></main>';
      }
      return '<main><div class="pageTitle"><h1>Le Petit Prince</h1><p>' + (state.lang === 'ja' ? '本文を読み込み中です…' : 'Loading the book text…') + '</p></div></main>';
    }
    let section = (book.chapters || []).find((chapter) => chapter.id === readerChapter);
    if (book.frontMatter && book.frontMatter.id === readerChapter) section = book.frontMatter;
    if (!section) {
      section = book.chapters[0];
      readerChapter = section ? section.id : '';
      state.readerChapter = readerChapter;
      save();
    }
    const title = book.title || 'Le Petit Prince';
    const sectionHeading = section && section.number
      ? 'CHAPITRE ' + String(section.number).padStart(2, '0') + ' · ' + escapeHtml(section.title)
      : escapeHtml(section && section.title || 'Dédicace');
    const sectionText = section ? sectionHtml(section) : '';
    const bookLabel = state.lang === 'ja' ? '本' : 'Book';
    const chapterLabel = state.lang === 'ja' ? '章' : 'Chapter';
    return '<main><div class="pageTitle"><h1>' + escapeHtml(title) + '</h1><p>Antoine de Saint-Exupéry · ' + escapeHtml(book.source.sourceName) + ' · 27 chapters</p></div>' +
      '<section class="reading pgaBookContent" data-book-id="' + escapeHtml(book.bookId) + '" data-chapter-id="' + escapeHtml(section && section.id || '') + '"><div class="eyebrow">' + sectionHeading + '</div><h2 class="storytitle">' + (section.number ? 'Chapitre ' + String(section.number).padStart(2, '0') : escapeHtml(section.title)) + '</h2>' +
      '<div class="controls"><label class="bookSelectorLabel">' + bookLabel + ' <select class="smallbtn" data-reader-book onchange="selectReaderBook(this.value)"><option value="sample-book" ' + (readerBook === 'sample-book' ? 'selected' : '') + '>A Small Encounter</option><option value="le-petit-prince" ' + (readerBook === 'le-petit-prince' ? 'selected' : '') + '>Le Petit Prince</option></select></label>' +
      '<label class="bookSelectorLabel">' + chapterLabel + ' <select class="smallbtn" data-reader-chapter onchange="selectReaderChapter(this.value)">' + chapterOptions(book) + '</select></label>' +
      '<select class="smallbtn" aria-label="Reading speed" onchange="setReaderSpeed(this.value)"><option value="1">🔊 1×</option><option value="0.75">0.75×</option><option value="1.25">1.25×</option></select></div>' +
      chapterNavigation(book, section) + (window.PETITE_READER_NARRATION?.html(book, section) || '') + '<div class="pgaChapterText">' + sectionText + '</div>' + chapterNavigation(book, section) + '</section></main>';
  }

  window.PETITE_FULL_BOOK_READER = fullBookRead;
  window.PETITE_GET_READER_BOOK = () => readerBook;
  window.selectReaderBook = (bookId) => {
    if (readerBook === 'le-petit-prince') window.PETITE_SAVE_READER_POSITION?.();
    readerBook = bookId === 'le-petit-prince' ? 'le-petit-prince' : 'sample-book';
    state.readerBook = readerBook;
    if (readerBook === 'le-petit-prince') state.readerOpened = true;
    state.readerChapter = readerChapter;
    save();
    render();
  };
  window.selectReaderChapter = (chapterId, rerender = true) => {
    const book = window.PETITE_BOOK_LIBRARY?.['le-petit-prince'];
    const exists = (book?.chapters || []).some((chapter) => chapter.id === chapterId)
      || book?.frontMatter?.id === chapterId;
    if (!exists || chapterId === readerChapter) return;
    window.PETITE_SAVE_READER_POSITION?.();
    readerChapter = chapterId;
    state.readerChapter = chapterId;
    state.readerOpened = true;
    save();
    if (rerender) render();
  };
  window.stepReaderChapter = (direction) => {
    const chapters = window.PETITE_BOOK_LIBRARY?.['le-petit-prince']?.chapters || [];
    const index = chapters.findIndex((chapter) => chapter.id === readerChapter);
    const target = chapters[index + direction];
    if ((direction === -1 || direction === 1) && target) window.selectReaderChapter(target.id);
  };
  window.setReaderSpeed = (value) => { speed = Number(value) || 1; };
  window.readCurrentBookSection = () => {
    const book = window.PETITE_BOOK_LIBRARY && window.PETITE_BOOK_LIBRARY['le-petit-prince'];
    if (!book) return;
    const section = book.chapters.find((chapter) => chapter.id === readerChapter)
      || (book.frontMatter && book.frontMatter.id === readerChapter ? book.frontMatter : null);
    const text = section && section.sentences
      ? section.sentences.map((sentence) => sentence.originalFrench).join(' ')
      : section && section.paragraphs ? section.paragraphs.join(' ') : '';
    if (text && typeof window.speak === 'function') window.speak(text);
  };
  window.addEventListener('petitecontentready', () => {
    if (page === 'read' && readerBook === 'le-petit-prince') render();
  });
  window.addEventListener('petitecontenterror', () => {
    if (page === 'read' && readerBook === 'le-petit-prince') render();
  });
})();
