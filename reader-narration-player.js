/* Continuous Reader narration. Kept separate from sentence and vocabulary audio. */
(() => {
  'use strict';

  const STORAGE_KEY = 'petite-lecture:reader-audio-position-v1';
  const RATES = [0.75, 1, 1.25, 1.5];
  const PACK = 'sANWqF1bCMzR6eyZbCGw--eleven_v4--fr';
  const ASSETS = Object.freeze(Object.fromEntries(Array.from({ length: 27 }, (_, index) => {
    const chapter = String(index + 1).padStart(2, '0');
    return [`le-petit-prince:chapter_${chapter}`, `chapter-${chapter}`];
  })));
  let session = null;

  const keyFor = (bookId, chapterId) => `${bookId}:${chapterId}`;
  const assetFor = (bookId, chapterId) => {
    const chapterDirectory = ASSETS[keyFor(bookId, chapterId)];
    if (!chapterDirectory) return null;
    const directory = `./books/le-petit-prince/audio/reader-narration/pause-extended/packs/${PACK}/${chapterDirectory}/`;
    return {
      metadataUrl: new URL('metadata.json', new URL(directory, document.baseURI)).href,
      audioUrl: new URL(`${chapterDirectory}.mp3`, new URL(directory, document.baseURI)).href
    };
  };
  const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
  const clamp = (value, duration) => Math.max(0, Math.min(finite(value), Math.max(0, finite(duration))));
  const formatTime = (value) => {
    const seconds = Math.floor(Math.max(0, finite(value)));
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
  };
  const safeRate = (rate) => RATES.includes(Number(rate)) ? Number(rate) : 1;

  function readPositions() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      return saved?.version === 1 && saved.positions && typeof saved.positions === 'object'
        ? saved.positions : {};
    } catch (_) { return {}; }
  }

  function savePosition(bookId, chapterId, positionSeconds, playbackRate = 1) {
    try {
      const positions = readPositions();
      positions[keyFor(bookId, chapterId)] = {
        positionSeconds: Math.max(0, finite(positionSeconds)), playbackRate: safeRate(playbackRate)
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, positions }));
    } catch (_) { /* Private browsing can refuse storage; playback still works. */ }
  }

  function labels() {
    return window.PETITE_UI[document.documentElement.lang === 'en' ? 'en' : 'ja'];
  }

  function html(book, chapter) {
    if (!assetFor(book?.bookId, chapter?.id)) return '';
    const t = labels();
    return `<section class="readerNarration" aria-label="${t.readerNarrationTitle}">
      <div class="readerNarrationHeading"><strong>🎧 ${t.readerNarrationTitle}</strong><span class="readerNarrationTime">00:00 / --:--</span></div>
      <input class="readerNarrationSeek" type="range" min="0" max="1000" value="0" aria-label="${t.readerNarrationSeek}" disabled>
      <div class="readerNarrationControls">
        <button type="button" class="readerNarrationBack" aria-label="${t.readerNarrationBack}" title="${t.readerNarrationBack}" disabled>↶10</button>
        <button type="button" class="readerNarrationPlay" aria-label="${t.readerNarrationPlay}" title="${t.readerNarrationPlay}" disabled>▶</button>
        <button type="button" class="readerNarrationForward" aria-label="${t.readerNarrationForward}" title="${t.readerNarrationForward}" disabled>10↷</button>
        <label>${t.readerNarrationRate}<select class="readerNarrationRate" aria-label="${t.readerNarrationRate}">
          ${RATES.map((rate) => `<option value="${rate}">${rate === 1 ? '1.0' : rate}×</option>`).join('')}
        </select></label>
      </div><span class="readerNarrationStatus" role="status" aria-live="polite"></span>
    </section>`;
  }

  function durationOf(active) {
    const actual = active.audio?.duration;
    return Number.isFinite(actual) && actual > 0 ? actual : active.metadata.outputDurationSeconds;
  }

  function update(active) {
    if (active !== session) return;
    const t = labels();
    const duration = durationOf(active);
    const time = clamp(active.mediaReady && active.pendingSeek === null ? active.audio.currentTime : active.position, duration);
    active.time.textContent = `${formatTime(time)} / ${formatTime(Math.ceil(duration))}`;
    if (!active.scrubbing) active.seek.value = String(duration > 0 ? Math.round(time / duration * 1000) : 0);
    active.play.textContent = active.audio && !active.audio.paused ? '❚❚' : '▶';
    const action = active.audio && !active.audio.paused ? t.readerNarrationPause : t.readerNarrationPlay;
    active.play.setAttribute('aria-label', action);
    active.play.title = action;
  }

  function persist(active) {
    if (!active?.metadata) return;
    const duration = durationOf(active);
    // A newly created Audio element reports 0 before its saved position is restored.
    const time = clamp(active.mediaReady && active.pendingSeek === null ? active.audio.currentTime : active.position, duration);
    active.position = time;
    savePosition(active.bookId, active.chapterId, time, active.rate);
    active.lastSaved = time;
  }

  function pauseForOtherAudio() {
    if (!session?.audio) return;
    session.audio.pause();
    persist(session);
    update(session);
  }

  function unmount() {
    if (!session) return;
    const old = session;
    session = null;
    if (old.audio) old.audio.pause();
    persist(old);
    if (old.audio) { old.audio.removeAttribute('src'); old.audio.load(); }
  }

  function fail(active) {
    if (active !== session) return;
    persist(active);
    if (active.audio) active.audio.pause();
    active.audio = null;
    active.play.disabled = false;
    active.play.textContent = '↻';
    active.play.setAttribute('aria-label', labels().readerNarrationRetry);
    active.play.title = labels().readerNarrationRetry;
    active.status.textContent = labels().readerNarrationError;
  }

  function makeAudio(active) {
    const audio = new Audio(active.asset.audioUrl);
    audio.preload = 'metadata';
    audio.playbackRate = active.rate;
    active.audio = audio;
    active.mediaReady = false;
    active.ready = new Promise((resolve, reject) => {
      const finishRestore = () => {
        if (active !== session || active.audio !== audio) return;
        active.pendingSeek = null;
        active.mediaReady = true;
        update(active);
        resolve();
      };
      audio.addEventListener('loadedmetadata', () => {
        if (active !== session || active.audio !== audio) return;
        const duration = durationOf(active);
        const position = active.position > 0 && active.position < duration - 2 ? active.position : 0;
        try {
          active.position = position;
          if (position > 0) {
            active.pendingSeek = position;
            audio.currentTime = position;
          } else finishRestore();
        } catch (error) { reject(error); }
      }, { once: true });
      audio.addEventListener('seeked', () => {
        if (active !== session || active.audio !== audio) return;
        if (!active.mediaReady) { finishRestore(); return; }
        active.pendingSeek = null;
        active.position = audio.currentTime;
        persist(active);
        update(active);
      });
      audio.addEventListener('error', () => reject(new Error('Narration audio unavailable')), { once: true });
    });
    audio.addEventListener('timeupdate', () => {
      if (active !== session || active.audio !== audio) return;
      if (!active.mediaReady || active.scrubbing || active.pendingSeek !== null) return;
      update(active);
      if (Math.abs(audio.currentTime - active.lastSaved) >= 5) persist(active);
    });
    audio.addEventListener('pause', () => { if (active === session && active.mediaReady) { persist(active); update(active); } });
    audio.addEventListener('ended', () => {
      if (active !== session) return;
      active.position = 0;
      audio.currentTime = 0;
      persist(active);
      update(active);
    });
    audio.addEventListener('error', () => { if (active === session && active.audio === audio) fail(active); });
    return audio;
  }

  function seekTo(active, seconds, saveNow = true) {
    const time = clamp(seconds, durationOf(active));
    active.position = time;
    if (active.mediaReady) {
      active.pendingSeek = time;
      active.audio.currentTime = time;
    }
    if (saveNow && !active.mediaReady) persist(active);
    update(active);
  }

  async function play(active) {
    if (active !== session) return;
    if (active.audio && !active.audio.paused) { active.audio.pause(); return; }
    window.PETITE_STOP_READER_SPEECH?.();
    active.status.textContent = '';
    const audio = active.audio || makeAudio(active);
    try {
      await active.ready;
      if (active !== session || active.audio !== audio) return;
      await audio.play();
      if (active === session && active.audio === audio) update(active);
    } catch (_) { if (active === session && active.audio === audio) fail(active); }
  }

  async function mount(reader) {
    const root = reader?.querySelector('.readerNarration');
    if (!root) { unmount(); return; }
    if (session?.root === root) return;
    unmount();
    const bookId = reader.dataset.bookId;
    const chapterId = reader.dataset.chapterId;
    const asset = assetFor(bookId, chapterId);
    if (!asset) return;
    const saved = readPositions()[keyFor(bookId, chapterId)] || {};
    const active = { root, bookId, chapterId, asset, audio: null,
      position: Math.max(0, finite(saved.positionSeconds)), rate: safeRate(saved.playbackRate),
      lastSaved: 0, metadata: null, mediaReady: false, ready: null, pendingSeek: null, scrubbing: false,
      time: root.querySelector('.readerNarrationTime'), seek: root.querySelector('.readerNarrationSeek'),
      play: root.querySelector('.readerNarrationPlay'), back: root.querySelector('.readerNarrationBack'),
      forward: root.querySelector('.readerNarrationForward'),
      rateSelect: root.querySelector('.readerNarrationRate'),
      status: root.querySelector('.readerNarrationStatus') };
    session = active;
    active.rateSelect.value = String(active.rate);
    active.play.addEventListener('click', () => {
      if (active.metadata) void play(active);
      else void loadMetadata(active);
    });
    active.back.addEventListener('click', () => seekTo(active, (active.mediaReady ? active.audio.currentTime : active.position) - 10));
    active.forward.addEventListener('click', () => seekTo(active, (active.mediaReady ? active.audio.currentTime : active.position) + 10));
    active.seek.addEventListener('input', () => {
      active.scrubbing = true;
      active.position = clamp(Number(active.seek.value) / 1000 * durationOf(active), durationOf(active));
      active.time.textContent = `${formatTime(active.position)} / ${formatTime(Math.ceil(durationOf(active)))}`;
    });
    active.seek.addEventListener('change', () => {
      active.scrubbing = false;
      seekTo(active, Number(active.seek.value) / 1000 * durationOf(active));
    });
    active.rateSelect.addEventListener('change', () => {
      active.rate = safeRate(active.rateSelect.value);
      if (active.audio) active.audio.playbackRate = active.rate;
      persist(active);
    });
    void loadMetadata(active);
  }

  async function loadMetadata(active) {
    if (active !== session) return;
    active.play.disabled = true;
    active.status.textContent = '';
    try {
      const response = await fetch(active.asset.metadataUrl, { cache: 'no-store' });
      if (!response.ok) throw new Error('Narration metadata unavailable');
      const metadata = await response.json();
      if (active !== session) return;
      if (metadata.bookId !== active.bookId || metadata.chapterId !== active.chapterId.replace('_', '-')
        || metadata.styleId !== 'v4-b-comfort' || !Number.isFinite(metadata.outputDurationSeconds)
        || metadata.outputDurationSeconds <= 0 || metadata.processingVersion !== 1
        || (metadata.productionProfile && metadata.productionProfile !== PACK)
        || metadata.voiceId !== 'sANWqF1bCMzR6eyZbCGw' || metadata.modelId !== 'eleven_v4'
        || metadata.languageCode !== 'fr' || metadata.stability !== 0.4
        || !/^[0-9a-f]{64}$/.test(metadata.outputAudioChecksum)) {
        throw new Error('Narration metadata invalid');
      }
      active.metadata = metadata;
      active.asset.audioUrl += `?sha256=${metadata.outputAudioChecksum}`;
      if (active.position >= metadata.outputDurationSeconds - 2) active.position = 0;
      active.play.disabled = false;
      active.seek.disabled = false;
      active.back.disabled = false;
      active.forward.disabled = false;
      update(active);
    } catch (_) { fail(active); }
  }

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') persist(session);
  });
  window.addEventListener('pagehide', () => persist(session));
  window.PETITE_READER_NARRATION = Object.freeze({
    assetFor, html, mount, unmount, pauseForOtherAudio,
    storageKey: STORAGE_KEY, clamp, formatTime, safeRate, readPositions, savePosition
  });
})();
