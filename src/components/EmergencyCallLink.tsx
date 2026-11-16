"use client";

import { useEmergencyNumbers } from "@/lib/prefs";

/** "Emergency? Call 108" button using the number for the user's country. */
export function EmergencyCallLink({ className }: { className: string }) {
  const [primary] = useEmergencyNumbers();
  return (
    <a href={`tel:${primary}`} className={className}>
      Emergency? Call {primary}
    </a>
  );
}
