// Let learners choose from the French voices already installed on their device.
(() => {
  if (!('speechSynthesis' in window)) return;

  const synth = window.speechSynthesis;
  const originalGo = window.go;
  if (originalGo) window.go = (...args) => {
    window.scrollTo(0, 0);
    return originalGo(...args);
  };
  const storageKey = 'petite-lecture-french-voice';
  let selectedVoice = localStorage.getItem(storageKey) || '';
  let attachedControls = null;
  const originalSpeak = synth.speak.bind(synth);
  const voiceKey = voice => voice.voiceURI || `${voice.name}|${voice.lang}`;
  const frenchVoices = () => synth.getVoices().filter(voice => /^fr(?:[-_]|$)/i.test(voice.lang));

  synth.speak = utterance => {
    if (/^fr(?:[-_]|$)/i.test(utterance.lang)) {
      const voice = frenchVoices().find(item => voiceKey(item) === selectedVoice);
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang;
      }
    }
    return originalSpeak(utterance);
  };

  function addVoicePicker(force = false) {
    const controls = document.querySelector('.controls');
    if (!controls) {
      attachedControls = null;
      return;
    }

    let picker = document.getElementById('frenchVoiceSelect');
    if (!force && controls === attachedControls && picker) return;
    attachedControls = controls;
    const voices = frenchVoices();
    if (!picker) {
      picker = document.createElement('select');
      picker.id = 'frenchVoiceSelect';
      picker.className = 'smallbtn';
      picker.setAttribute('aria-label', document.documentElement.lang === 'ja' ? 'フランス語の声' : 'French voice');
      const speedPicker = controls.querySelector('select');
      controls.insertBefore(picker, speedPicker || null);
    }

    picker.replaceChildren();
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = voices.length
      ? (document.documentElement.lang === 'ja' ? '端末の標準音声' : 'Device default voice')
      : (document.documentElement.lang === 'ja' ? '音声を追加してください' : 'Add a French voice');
    picker.append(defaultOption);

    voices.forEach(voice => {
      const option = document.createElement('option');
      option.value = voiceKey(voice);
      option.textContent = `${voice.name} (${voice.lang})`;
      picker.append(option);
    });

    if (!voices.some(voice => voiceKey(voice) === selectedVoice)) selectedVoice = '';
    picker.value = selectedVoice;
    picker.onchange = () => {
      selectedVoice = picker.value;
      if (selectedVoice) localStorage.setItem(storageKey, selectedVoice);
      else localStorage.removeItem(storageKey);
    };
    picker.disabled = voices.length === 0;
  }

  new MutationObserver(() => addVoicePicker()).observe(document.getElementById('app'), { childList: true, subtree: true });
  synth.addEventListener('voiceschanged', () => addVoicePicker(true));
  addVoicePicker();
})();
