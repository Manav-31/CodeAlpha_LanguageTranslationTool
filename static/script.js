(() => {
  const LANGUAGES = window.LANGUAGES;
  const STORAGE_KEY = "translator.languages";
  const OUTPUT_PLACEHOLDER = "Translation";
  // Speech-synthesis voice codes that differ from our language codes.
  const VOICE_CODES = { tl: "fil", no: "nb" };

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
  const toastEl = $("toast");

  let translatedText = "";
  let detectedSource = null;
  let isLoading = false;

  // ---------- Language selection ----------

  function restoreLanguages() {
    let saved = null;
    try {
      saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    } catch { /* storage unavailable */ }
    sourceSelect.value = saved?.source in LANGUAGES ? saved.source : "auto";
    targetSelect.value = saved?.target in LANGUAGES ? saved.target : "hi";
  }

  function saveLanguages() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ source: sourceSelect.value, target: targetSelect.value }));
    } catch { /* storage unavailable */ }
  }

  function languageName(code) {
    return LANGUAGES[code] || code;
  }

  // ---------- UI helpers ----------

  function setStatus(message) {
    status.textContent = message;
  }

  let toastTimer;
  function toast(message) {
    toastEl.textContent = message;
    toastEl.classList.add("is-visible");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("is-visible"), 2200);
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
  }

  function setLoading(loading) {
    isLoading = loading;
    translateBtn.disabled = loading;
    translateBtn.classList.toggle("is-loading", loading);
    translateBtn.querySelector(".btn-label").textContent = loading ? "Translating..." : "Translate";
    output.classList.toggle("is-loading", loading);
  }

  // ---------- Translation ----------

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
      const response = await fetch("/api/translate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, source, target }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || `Request failed (HTTP ${response.status}).`);
      }

      detectedSource = data.detected_source;
      showOutput(data.translated_text, {
        detected: source === "auto" ? detectedSource : null,
        provider: data.provider,
      });
    } catch (err) {
      setStatus(err instanceof TypeError
        ? "Could not reach the server. Make sure app.py is running."
        : err.message);
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

  // ---------- Events ----------

  translateBtn.addEventListener("click", translateText);
  swapBtn.addEventListener("click", swapLanguages);
  sourceSelect.addEventListener("change", onLanguageChange);
  targetSelect.addEventListener("change", onLanguageChange);

  input.addEventListener("input", () => {
    updateCharCount();
    setStatus("");
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

  restoreLanguages();
  updateCharCount();
})();
