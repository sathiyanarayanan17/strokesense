"use client";

import { useReducer } from "react";
import { mergeResults } from "@/lib/scoring/reported";
import { inconclusive, type TestId, type TestResult } from "@/lib/scoring/types";
import { stopSpeaking } from "@/lib/voice";
import { ArmTest } from "./ArmTest";
import { BalanceTest } from "./BalanceTest";
import { CameraProvider } from "./camera";
import { EyesTest } from "./EyesTest";
import { FaceTest } from "./FaceTest";
import { OnsetStep } from "./OnsetStep";
import { Results } from "./Results";
import { SpeechTest } from "./SpeechTest";
import { SymptomStep } from "./SymptomStep";

type MeasuredTest = "balance" | "eyes" | "face" | "arm" | "speech";
type Step = "onset" | "symptoms" | MeasuredTest | "results";
const ORDER: Step[] = ["onset", "symptoms", "balance", "eyes", "face", "arm", "speech", "results"];
const LABELS: Record<Step, string> = {
  onset: "Time",
  symptoms: "Questions",
  balance: "Balance",
  eyes: "Eyes",
  face: "Face",
  arm: "Arms",
  speech: "Speech",
  results: "Result",
};
const MEASURED: readonly Step[] = ["balance", "eyes", "face", "arm", "speech"];
const CAMERA: readonly Step[] = ["balance", "eyes", "face", "arm"];

interface State {
  step: Step;
  lastKnownWell: string | null;
  results: TestResult[];
  completedAt: number | null;
}

type Action =
  | { type: "onset"; lastKnownWell: string | null }
  | { type: "result"; results: TestResult[]; at: number }
  | { type: "restart" };

const initial: State = { step: "onset", lastKnownWell: null, results: [], completedAt: null };

function next(step: Step): Step {
  return ORDER[Math.min(ORDER.indexOf(step) + 1, ORDER.length - 1)];
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "onset":
      return { ...state, lastKnownWell: action.lastKnownWell, step: "symptoms" };
    case "result": {
      // Balance and Eyes have two parts (bystander answer + camera): merge them, worst finding wins.
      const results = [...state.results];
      for (const r of action.results) {
        const i = results.findIndex((x) => x.test === r.test);
        if (i < 0) results.push(r);
        else results[i] = mergeResults(results[i], r);
      }
      const step = next(state.step);
      return { ...state, results, step, completedAt: step === "results" ? action.at : state.completedAt };
    }
    case "restart":
      return initial;
  }
}

export function ExamFlow() {
  const [state, dispatch] = useReducer(reducer, initial);
  const record = (...results: TestResult[]) => {
    stopSpeaking();
    dispatch({ type: "result", results, at: Date.now() });
  };
  const skip = (test: TestId) => record(inconclusive(test, "This check was skipped.", ["Skipped by the user."]));
  const isTest = MEASURED.includes(state.step);
  const cameraActive = CAMERA.includes(state.step);

  return (
    <CameraProvider active={cameraActive}>
    <div className="space-y-8">
      <Stepper current={state.step} />

      {state.step === "onset" && <OnsetStep onDone={(lastKnownWell) => dispatch({ type: "onset", lastKnownWell })} />}
      {state.step === "symptoms" && <SymptomStep onDone={(results) => record(...results)} />}
      {state.step === "balance" && <BalanceTest key="balance" onComplete={record} />}
      {state.step === "eyes" && <EyesTest key="eyes" onComplete={record} />}
      {state.step === "face" && <FaceTest key="face" onComplete={record} />}
      {state.step === "arm" && <ArmTest key="arm" onComplete={record} />}
      {state.step === "speech" && <SpeechTest key="speech" onComplete={record} />}
      {state.step === "results" && (
        <Results
          results={state.results}
          lastKnownWell={state.lastKnownWell}
          completedAt={state.completedAt ?? 0}
          onRestart={() => dispatch({ type: "restart" })}
        />
      )}

      {isTest && (
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => skip(state.step as TestId)}
            className="text-sm font-medium text-slate-500 underline underline-offset-4 hover:text-slate-800"
          >
            Can&apos;t do this check? Skip it
          </button>
        </div>
      )}
    </div>
    </CameraProvider>
  );
}

function Stepper({ current }: { current: Step }) {
  const idx = ORDER.indexOf(current);
  return (
    <nav aria-label="Progress">
      <ol className="flex items-center gap-2">
        {ORDER.map((s, i) => (
          <li key={s} className="flex flex-1 flex-col items-center gap-1">
            <span
              className={`h-1.5 w-full rounded-full ${i <= idx ? "bg-rose-600" : "bg-slate-200"}`}
              aria-hidden
            />
            <span
              className={`text-xs font-medium ${i === idx ? "text-rose-700" : "text-slate-500"}`}
              aria-current={i === idx ? "step" : undefined}
            >
              {LABELS[s]}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}
