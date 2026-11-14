"use client";

/**
 * Spoken instructions, so a panicking bystander doesn't need to read the screen.
 * `onEnd` fires once when speech finishes, or after a fallback timeout because
 * some browsers never emit `end` (or have no voices installed).
 */
export function speak(text: string, onEnd?: () => void, fallbackMs = 5000) {
  let fired = false;
  const done = () => {
    if (fired) return;
    fired = true;
    onEnd?.();
  };

  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    if (onEnd) setTimeout(done, 0);
    return;
  }
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  if (onEnd) {
    u.onend = done;
    u.onerror = done;
    setTimeout(done, fallbackMs);
  }
  window.speechSynthesis.speak(u);
}

export function stopSpeaking() {
  if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
}
