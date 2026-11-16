"use client";

import { useEffect, useState } from "react";

/** Current time in ms, refreshed on an interval. Starts at `initial` so the first render is pure. */
export function useNow(initial: number, everyMs = 15_000): number {
  const [now, setNow] = useState(initial);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), everyMs);
    return () => clearInterval(id);
  }, [everyMs]);
  return now;
}
