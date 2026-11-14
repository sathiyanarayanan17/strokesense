import { clamp, round } from "../math";
import type { Finding, TestResult } from "./types";

/**
 * Speech analysis (the "S" in BE-FAST).
 *
 * The person repeats a fixed sentence (the Cincinnati Prehospital Stroke Scale
 * phrase). Three independent signals are combined:
 *  1. Word error rate between the transcript and the target sentence.
 *     Slurred speech (dysarthria) or wrong words (aphasia) raise it.
 *  2. Pause structure from on-device audio energy (no audio leaves the device
 *     for this part): long or frequent pauses inside the sentence.
 *  3. The bystander's own judgement. Humans stay in the loop: a "yes, it
 *     sounded wrong" always counts, whatever the machine measured.
 */

export const TARGET_SENTENCE = "You can't teach an old dog new tricks";

export const SPEECH_THRESHOLDS = {
  minVoicedMs: 400,
  werBorderline: 0.15,
  werAbnormal: 0.4,
  pauseMinMs: 300, // silence longer than this inside speech counts as a pause
  mergeGapMs: 150, // shorter gaps are treated as continuous speech
  pauseRatioBorderline: 0.45,
  minRms: 0.01,
  noiseMultiplier: 3,
};

export type BystanderAnswer = "yes" | "no" | "unsure";

export interface EnergySample {
  t: number; // ms
  rms: number; // 0..1
}

export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "") // can't -> cant
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

/** Word-level Levenshtein distance. */
export function wordEditDistance(a: string[], b: string[]): number {
  const prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diag = prev[0];
    prev[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = prev[j];
      prev[j] = Math.min(prev[j] + 1, prev[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = tmp;
    }
  }
  return prev[b.length];
}

export function wordErrorRate(target: string, transcript: string): number {
  const ref = normalizeWords(target);
  if (ref.length === 0) return 0;
  return wordEditDistance(ref, normalizeWords(transcript)) / ref.length;
}

export interface VoiceActivity {
  voicedMs: number;
  spanMs: number;
  pauseCount: number;
  longestPauseMs: number;
  pauseRatio: number;
}

/** Simple energy-based voice activity detection over evenly-ish spaced samples. */
export function detectVoiceActivity(samples: EnergySample[], noiseFloor: number): VoiceActivity {
  const S = SPEECH_THRESHOLDS;
  const threshold = Math.max(S.minRms, noiseFloor * S.noiseMultiplier);
  const segments: Array<[number, number]> = [];

  for (let i = 0; i < samples.length; i++) {
    if (samples[i].rms < threshold) continue;
    const t = samples[i].t;
    const last = segments[segments.length - 1];
    if (last && t - last[1] <= S.mergeGapMs) last[1] = t;
    else segments.push([t, t]);
  }

  if (segments.length === 0) {
    return { voicedMs: 0, spanMs: 0, pauseCount: 0, longestPauseMs: 0, pauseRatio: 0 };
  }

  let voicedMs = 0;
  let pauseCount = 0;
  let longestPauseMs = 0;
  let silentInside = 0;
  for (let i = 0; i < segments.length; i++) {
    voicedMs += segments[i][1] - segments[i][0];
    if (i > 0) {
      const gap = segments[i][0] - segments[i - 1][1];
      silentInside += gap;
      if (gap >= S.pauseMinMs) {
        pauseCount++;
        longestPauseMs = Math.max(longestPauseMs, gap);
      }
    }
  }
  const spanMs = segments[segments.length - 1][1] - segments[0][0];
  return {
    voicedMs,
    spanMs,
    pauseCount,
    longestPauseMs,
    pauseRatio: spanMs > 0 ? silentInside / spanMs : 0,
  };
}

export interface SpeechInput {
  transcript: string | null; // null = speech recognition unavailable
  energy: EnergySample[];
  noiseFloor: number;
  bystander?: BystanderAnswer;
  target?: string;
}

const SEVERITY: Record<Finding, number> = { inconclusive: 0, normal: 1, borderline: 2, abnormal: 3 };
const worse = (a: Finding, b: Finding): Finding => (SEVERITY[a] >= SEVERITY[b] ? a : b);

export function scoreSpeech(input: SpeechInput): TestResult {
  const S = SPEECH_THRESHOLDS;
  const target = input.target ?? TARGET_SENTENCE;
  const notes: string[] = [];
  const va = detectVoiceActivity(input.energy, input.noiseFloor);
  const hasTranscript = !!input.transcript && input.transcript.trim().length > 0;
  const wer = hasTranscript ? wordErrorRate(target, input.transcript!) : NaN;

  const metrics: Record<string, number> = {
    voicedMs: Math.round(va.voicedMs),
    pauseCount: va.pauseCount,
    longestPauseMs: Math.round(va.longestPauseMs),
    pauseRatio: round(va.pauseRatio),
  };
  if (hasTranscript) metrics.wordErrorRate = round(wer);

  // 1. Machine finding
  let machine: Finding = "inconclusive";
  const reasons: string[] = [];
  if (hasTranscript) {
    if (wer > S.werAbnormal) machine = "abnormal";
    else if (wer > S.werBorderline) machine = "borderline";
    else machine = "normal";
    if (machine !== "normal") reasons.push(`${Math.round(wer * 100)}% of the words did not match the sentence`);
  } else if (va.voicedMs < S.minVoicedMs) {
    notes.push("Little or no speech was picked up by the microphone.");
  } else if (input.transcript === null) {
    notes.push("Automatic transcription is not available in this browser.");
  } else {
    notes.push("Speech was heard but no words could be recognised.");
    machine = "borderline";
    reasons.push("speech was heard but no words could be recognised");
  }

  if (va.voicedMs >= S.minVoicedMs && va.pauseRatio >= S.pauseRatioBorderline) {
    machine = worse(machine, "borderline");
    reasons.push("there were long pauses inside the sentence");
  }

  // 2. Human-in-the-loop
  let finding = machine;
  if (input.bystander === "yes") {
    finding = "abnormal";
    reasons.unshift("the bystander reported that the speech sounded slurred or wrong");
  } else if (input.bystander === "no" && machine === "inconclusive") {
    finding = "normal";
  }

  const summary =
    finding === "normal"
      ? "The sentence was repeated clearly."
      : finding === "inconclusive"
        ? "We could not assess speech. If the person's speech seems slurred or confused, treat it as a warning sign."
        : `Possible speech problem: ${reasons.join("; ")}.`;

  return {
    test: "speech",
    finding,
    score: finding === "abnormal" ? Math.max(0.7, clamp(wer || 0)) : hasTranscript ? clamp(wer) : 0,
    summary,
    metrics,
    quality: { validSamples: input.energy.length, totalSamples: input.energy.length, notes },
  };
}
