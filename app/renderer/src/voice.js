// Sesli komut (konuşma -> metin) ve sesli yanıt (metin -> konuşma).
let recognition = null;
let active = false;

export function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export function isListening() {
  return active;
}

export function startListening({ onResult, onEnd, onError } = {}) {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR || active) return false;
  recognition = new SR();
  recognition.lang = 'tr-TR';
  recognition.interimResults = false;
  recognition.maxAlternatives = 1;
  active = true;

  recognition.onresult = (event) => {
    const text = event.results[0][0].transcript;
    onResult?.(text);
  };
  recognition.onerror = (event) => onError?.(event.error);
  recognition.onend = () => {
    active = false;
    onEnd?.();
  };
  recognition.start();
  return true;
}

export function stopListening() {
  try {
    recognition?.stop();
  } catch {
    /* yok sayılır */
  }
}

export function ttsSupported() {
  return !!window.speechSynthesis;
}

export function speak(text) {
  if (!window.speechSynthesis) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = 'tr-TR';
  utterance.rate = 1.05;
  const voice = window.speechSynthesis
    .getVoices()
    .find((v) => (v.lang || '').toLowerCase().startsWith('tr'));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
}

export function stopSpeaking() {
  window.speechSynthesis?.cancel();
}
