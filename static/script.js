(() => {
  const LANGUAGES = window.LANGUAGES;
  const STORAGE_KEY = "translator.languages";
  const CONVERSATION_KEY = "translator.conversation";
  const MODE_KEY = "translator.mode";
  const OUTPUT_PLACEHOLDER = "Translation";
  // Speech-synthesis voice codes that differ from our language codes.
  const VOICE_CODES = { tl: "fil", no: "nb" };
  // Speech-recognition locales, where the bare language code isn't enough.
  const RECOGNITION_LOCALES = {
    en: "en-US", hi: "hi-IN", bn: "bn-IN", ta: "ta-IN", te: "te-IN", mr: "mr-IN", gu: "gu-IN",
    kn: "kn-IN", ml: "ml-IN", pa: "pa-IN", ur: "ur-IN", ja: "ja-JP", ko: "ko-KR", fr: "fr-FR",
    de: "de-DE", es: "es-ES", it: "it-IT", pt: "pt-BR", ru: "ru-RU", ar: "ar-SA", tl: "fil-PH", no: "nb-NO",
  };
  const RECOGNITION_ERRORS = {
    "not-allowed": "Microphone access is blocked. Allow it from the icon in the address bar, then try again.",
    "service-not-allowed": "Microphone access is blocked. Allow it from the icon in the address bar, then try again.",
    "no-speech": "I didn't hear anything. Tap the button and try again.",
    "audio-capture": "No microphone was found.",
    "network": "Voice input needs an internet connection.",
    "language-not-supported": "This browser can't recognise speech in that language.",
  };
  const SPEAKER_ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M11 5 6 9H3v6h3l5 4V5zM15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13"/></svg>';
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

  const $ = (id) => document.getElementById(id);
  const sourceSelect = $("source-lang");
  const targetSelect = $("target-lang");
  const swapBtn = $("swap-btn");
  const input = $("input-text");
  const output = $("output-text");
  const charCount = $("char-count");
  const autoOption = sourceSelect.querySelector('option[value="auto"]');
  const providerLabel = $("provider");
  const status = $("status");
  const translateBtn = $("translate-btn");
  const checkBtn = $("check-btn");
  const checkPanel = $("check-panel");
  const toastEl = $("toast");

  let translatedText = "";
  let detectedSource = null;
  let isLoading = false;

  // ---------- Shared helpers ----------

  function loadJSON(key) {
    try {
      return JSON.parse(localStorage.getItem(key));
    } catch {
      return null; // storage unavailable
    }
  }

  function saveJSON(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch { /* storage unavailable */ }
  }

  async function postJSON(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
    return data;
  }

  function errorMessage(err) {
    return err instanceof TypeError ? "Could not reach the server. Make sure app.py is running." : err.message;
  }

  function languageName(code) {
    return LANGUAGES[code] || code;
  }

  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
  }

  // ---------- Text mode: language selection ----------

  function restoreLanguages() {
    const saved = loadJSON(STORAGE_KEY);
    sourceSelect.value = saved?.source in LANGUAGES ? saved.source : "auto";
    targetSelect.value = saved?.target in LANGUAGES ? saved.target : "hi";
  }

  function saveLanguages() {
    saveJSON(STORAGE_KEY, { source: sourceSelect.value, target: targetSelect.value });
  }

  // ---------- Text mode: UI helpers ----------

  function setStatus(message) {
    status.textContent = message;
  }

  function updateCharCount() {
    charCount.textContent = `${input.value.length} / ${input.maxLength}`;
  }

  function showOutput(text, { detected = null, provider = "" } = {}) {
    translatedText = text;
    output.textContent = text || OUTPUT_PLACEHOLDER;
    output.classList.toggle("is-empty", !text);
    // Show the detected language inside the source picker.
    autoOption.textContent = detected ? `${languageName(detected)} (detected)` : "Detect language";
    providerLabel.textContent = provider ? `via ${provider}` : "";
    checkBtn.hidden = !text;
    checkPanel.hidden = true;
  }

  function setLoading(loading) {
    isLoading = loading;
    translateBtn.disabled = loading;
    translateBtn.classList.toggle("is-loading", loading);
    translateBtn.querySelector(".btn-label").textContent = loading ? "Translating..." : "Translate";
    output.classList.toggle("is-loading", loading);
  }

  // ---------- Text mode: translation ----------

  async function translateText() {
    if (isLoading) return;
    const text = input.value.trim();
    const source = sourceSelect.value;
    const target = targetSelect.value;

    if (!text) {
      setStatus("Please enter some text to translate.");
      input.focus();
      return;
    }
    if (source === target) {
      setStatus("Source and target languages are the same.");
      return;
    }

    setStatus("");
    setLoading(true);
    try {
      const data = await postJSON("/api/translate", { text, source, target });
      detectedSource = data.detected_source;
      showOutput(data.translated_text, {
        detected: source === "auto" ? detectedSource : null,
        provider: data.provider,
      });
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  function swapLanguages() {
    let newTarget = sourceSelect.value;
    if (newTarget === "auto") {
      if (!(detectedSource in LANGUAGES)) {
        setStatus("Choose a source language first, or translate once so it can be detected.");
        return;
      }
      newTarget = detectedSource;
    }
    sourceSelect.value = targetSelect.value;
    targetSelect.value = newTarget;
    swapBtn.classList.toggle("is-flipped");
    saveLanguages();

    // Swap the texts too, so the translation becomes the new input.
    if (translatedText) {
      const previousInput = input.value;
      input.value = translatedText;
      updateCharCount();
      detectedSource = null;
      showOutput(previousInput);
    }
    setStatus("");
  }

  function onLanguageChange() {
    saveLanguages();
    setStatus("");
    // Re-translate straight away if there is already a translation on screen.
    if (translatedText && input.value.trim()) translateText();
  }

  // ---------- Text mode: back-translation check ----------

  async function checkTranslation() {
    const originalLang = sourceSelect.value === "auto" ? detectedSource : sourceSelect.value;
    if (!(originalLang in LANGUAGES)) {
      setStatus("Choose the source language to check this translation.");
      return;
    }
    const translationLang = targetSelect.value;

    checkBtn.disabled = true;
    checkBtn.textContent = "Checking...";
    setStatus("");
    try {
      const data = await postJSON("/api/back-translate", {
        original: input.value.trim(),
        translation: translatedText,
        original_lang: originalLang,
        translation_lang: translationLang,
      });
      const percent = Math.round(data.similarity * 100);
      const [label, level] = data.similarity >= 0.75 ? ["close match", "is-close"]
        : data.similarity >= 0.5 ? ["partial match", "is-partial"] : ["low match", "is-low"];
      $("check-langs").textContent = `${languageName(translationLang)} → ${languageName(originalLang)}`;
      $("check-score").textContent = `${percent}% ${label}`;
      $("check-score").className = `check-score ${level}`;
      $("check-text").textContent = data.back_translation;
      checkPanel.hidden = false;
    } catch (err) {
      setStatus(errorMessage(err));
    } finally {
      checkBtn.disabled = false;
      checkBtn.textContent = "Check translation";
    }
  }

  // ---------- Copy ----------

  async function copyText(text, button) {
    if (!text) {
      toast("Nothing to copy");
      return;
    }
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const helper = document.createElement("textarea");
      helper.value = text;
      document.body.appendChild(helper);
      helper.select();
      document.execCommand("copy");
      helper.remove();
    }
    button.classList.add("is-done");
    setTimeout(() => button.classList.remove("is-done"), 1500);
    toast("Copied to clipboard");
  }

  // ---------- Text to speech ----------

  const speech = window.speechSynthesis;
  let voices = [];
  let speakingButton = null;

  function loadVoices() {
    voices = speech.getVoices();
  }

  if (speech) {
    loadVoices();
    speech.addEventListener("voiceschanged", loadVoices);
  }

  function findVoice(code) {
    const wanted = (VOICE_CODES[code] || code).toLowerCase();
    const base = wanted.split("-")[0];
    const normalize = (voice) => voice.lang.toLowerCase().replace("_", "-");
    return voices.find((v) => normalize(v) === wanted)
      || voices.find((v) => normalize(v).split("-")[0] === base);
  }

  function speak(text, code, button) {
    if (!speech) {
      toast("Text-to-speech is not supported in this browser");
      return;
    }
    // A second click on the same button stops playback.
    if (speech.speaking) {
      speech.cancel();
      if (speakingButton === button) return;
    }
    if (!text) {
      toast("Nothing to read");
      return;
    }
    if (!code) {
      toast("Choose a source language, or translate first so it can be detected");
      return;
    }
    const voice = findVoice(code);
    if (!voice) {
      toast(`No ${languageName(code)} voice is installed on this device`);
      return;
    }

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.voice = voice;
    utterance.lang = voice.lang;
    utterance.onend = utterance.onerror = () => {
      button.classList.remove("is-active");
      if (speakingButton === button) speakingButton = null;
    };
    button.classList.add("is-active");
    speakingButton = button;
    speech.speak(utterance);
  }

  // ---------- Conversation mode ----------

  const conversationPanel = $("conversation-mode");
  const convLangA = $("conv-lang-a");
  const convLangB = $("conv-lang-b");
  const convLog = $("conv-log");
  const convStatus = $("conv-status");
  const autoSpeak = $("auto-speak");
  const mics = { a: $("mic-a"), b: $("mic-b") };
  let recognition = null;

  function fillLanguageSelect(select) {
    const byName = Object.entries(LANGUAGES).sort((x, y) => x[1].localeCompare(y[1]));
    select.replaceChildren(...byName.map(([code, name]) => new Option(name, code)));
  }

  function restoreConversation() {
    fillLanguageSelect(convLangA);
    fillLanguageSelect(convLangB);
    const saved = loadJSON(CONVERSATION_KEY);
    convLangA.value = saved?.a in LANGUAGES ? saved.a : "en";
    convLangB.value = saved?.b in LANGUAGES ? saved.b : "hi";
    updateMicLabels();
  }

  function onConversationLanguageChange() {
    saveJSON(CONVERSATION_KEY, { a: convLangA.value, b: convLangB.value });
    updateMicLabels();
  }

  function updateMicLabels() {
    mics.a.querySelector(".mic-label").textContent = `Speak ${languageName(convLangA.value)}`;
    mics.b.querySelector(".mic-label").textContent = `Speak ${languageName(convLangB.value)}`;
  }

  function setConvStatus(message, isError = false) {
    convStatus.textContent = message;
    convStatus.classList.toggle("is-error", isError);
  }

  function setMicsDisabled(disabled) {
    mics.a.disabled = disabled;
    mics.b.disabled = disabled;
  }

  // Listen to one person, then translate what they said for the other.
  function listen(side) {
    if (!Recognition) {
      setConvStatus("Voice input needs Chrome or Edge.", true);
      return;
    }
    if (recognition) {
      recognition.stop(); // a second tap finishes listening
      return;
    }
    if (convLangA.value === convLangB.value) {
      setConvStatus("Pick two different languages.", true);
      return;
    }
    const from = side === "a" ? convLangA.value : convLangB.value;
    const to = side === "a" ? convLangB.value : convLangA.value;
    let transcript = "";

    speech?.cancel();
    recognition = new Recognition();
    recognition.lang = RECOGNITION_LOCALES[from] || from;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      transcript = [...event.results].map((result) => result[0].transcript).join("");
      setConvStatus(`“${transcript}”`);
    };
    recognition.onerror = (event) => {
      if (event.error !== "aborted") {
        setConvStatus(RECOGNITION_ERRORS[event.error] || `Voice input failed (${event.error}).`, true);
      }
    };
    recognition.onend = () => {
      mics[side].classList.remove("is-listening");
      recognition = null;
      if (transcript.trim() && !conversationPanel.hidden) addTurn(side, transcript.trim(), from, to);
      else if (!convStatus.classList.contains("is-error")) setConvStatus("");
    };

    mics[side].classList.add("is-listening");
    setConvStatus(`Listening in ${languageName(from)}... tap again when you're done.`);
    recognition.start();
  }

  async function addTurn(side, text, from, to) {
    convLog.querySelector(".conv-empty")?.remove();
    const turn = document.createElement("div");
    turn.className = `turn turn-${side} is-pending`;
    turn.innerHTML = '<div class="turn-meta"></div><div class="turn-original" dir="auto"></div>'
      + '<div class="turn-translation" dir="auto">Translating...</div>'
      + `<button class="icon-btn" type="button" title="Play again" aria-label="Play translation again" hidden>${SPEAKER_ICON}</button>`;
    turn.querySelector(".turn-meta").textContent = `${languageName(from)} → ${languageName(to)}`;
    turn.querySelector(".turn-original").textContent = text;
    convLog.append(turn);
    convLog.scrollTop = convLog.scrollHeight;

    setMicsDisabled(true);
    setConvStatus("");
    try {
      const data = await postJSON("/api/translate", { text, source: from, target: to });
      const translation = data.translated_text;
      const replay = turn.querySelector("button");
      turn.querySelector(".turn-translation").textContent = translation;
      turn.classList.remove("is-pending");
      replay.hidden = false;
      replay.addEventListener("click", () => speak(translation, to, replay));
      if (autoSpeak.checked) speak(translation, to, replay);
    } catch (err) {
      turn.classList.replace("is-pending", "is-error");
      turn.querySelector(".turn-translation").textContent = errorMessage(err);
    } finally {
      setMicsDisabled(false);
      convLog.scrollTop = convLog.scrollHeight;
    }
  }

  function swapConversationLanguages() {
    [convLangA.value, convLangB.value] = [convLangB.value, convLangA.value];
    $("conv-swap").classList.toggle("is-flipped");
    onConversationLanguageChange();
  }

  // ---------- Modes ----------

  const tabs = document.querySelectorAll(".mode-tab");

  function setMode(mode) {
    for (const tab of tabs) tab.setAttribute("aria-selected", String(tab.dataset.mode === mode));
    $("text-mode").hidden = mode !== "text";
    conversationPanel.hidden = mode !== "conversation";
    recognition?.abort();
    speech?.cancel();
    saveJSON(MODE_KEY, mode);
  }

  // ---------- Events ----------

  translateBtn.addEventListener("click", translateText);
  swapBtn.addEventListener("click", swapLanguages);
  sourceSelect.addEventListener("change", onLanguageChange);
  targetSelect.addEventListener("change", onLanguageChange);
  checkBtn.addEventListener("click", checkTranslation);

  input.addEventListener("input", () => {
    updateCharCount();
    setStatus("");
    checkPanel.hidden = true;
    if (!input.value.trim()) {
      detectedSource = null;
      showOutput("");
    }
  });

  input.addEventListener("keydown", (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
      event.preventDefault();
      translateText();
    }
  });

  $("clear-btn").addEventListener("click", () => {
    input.value = "";
    detectedSource = null;
    updateCharCount();
    showOutput("");
    setStatus("");
    input.focus();
  });

  $("copy-input").addEventListener("click", (event) => copyText(input.value.trim(), event.currentTarget));
  $("copy-output").addEventListener("click", (event) => copyText(translatedText, event.currentTarget));

  $("speak-input").addEventListener("click", (event) => {
    const code = sourceSelect.value === "auto" ? detectedSource : sourceSelect.value;
    speak(input.value.trim(), code, event.currentTarget);
  });
  $("speak-output").addEventListener("click", (event) => {
    speak(translatedText, targetSelect.value, event.currentTarget);
  });

  for (const tab of tabs) tab.addEventListener("click", () => setMode(tab.dataset.mode));
  mics.a.addEventListener("click", () => listen("a"));
  mics.b.addEventListener("click", () => listen("b"));
  convLangA.addEventListener("change", onConversationLanguageChange);
  convLangB.addEventListener("change", onConversationLanguageChange);
  $("conv-swap").addEventListener("click", swapConversationLanguages);

  restoreLanguages();
  restoreConversation();
  updateCharCount();
  setMode(loadJSON(MODE_KEY) === "conversation" ? "conversation" : "text");
})();
