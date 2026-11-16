"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { isIos } from "@/lib/install";

interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const noopSubscribe = () => () => {};
const standalone = () => window.matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;

/** "Install app" button (Chrome/Edge/Android) or an Add-to-Home-Screen hint (iOS), so the offline app is ready in advance. */
export function InstallPrompt() {
  const [event, setEvent] = useState<InstallEvent | null>(null);
  const installed = useSyncExternalStore(noopSubscribe, standalone, () => true);
  const ios = useSyncExternalStore(noopSubscribe, () => isIos(navigator.userAgent), () => false);

  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvent(e as InstallEvent);
    };
    const onInstalled = () => setEvent(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  if (installed) return null;
  if (event) {
    return (
      <button
        type="button"
        onClick={async () => {
          await event.prompt();
          await event.userChoice;
          setEvent(null);
        }}
        className="rounded-full border border-slate-300 px-4 py-1.5 font-semibold text-slate-800 hover:bg-slate-50"
      >
        Install the app (works offline)
      </button>
    );
  }
  if (ios) return <span className="text-slate-600">To install: tap Share, then &ldquo;Add to Home Screen&rdquo;.</span>;
  return null;
}
