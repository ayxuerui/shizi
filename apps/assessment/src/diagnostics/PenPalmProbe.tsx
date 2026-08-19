import { useEffect, useRef, useState } from "react";
import { pointerGate, type PointerDecisionRecord } from "../input/pointer-gate.js";
import { summarizeDecisions } from "./capabilities/pointer.js";
import { DIAGNOSTICS_FONT_FAMILY } from "./theme.js";

interface Dot {
  id: string;
  x: number;
  y: number;
  color: string;
}

function colorFor(record: PointerDecisionRecord): string {
  if (record.pointerType === "pen") return "#2f6b4f"; // pen: always accepted
  if (record.phase !== "decide") return "#9a9186";
  return record.accepted ? "#2f6b4f" : "#4a5a7a"; // accepted touch vs. rejected-while-pen-active
}

/**
 * Task 10.0 item (c): a live scratch pad for two-handed play. Subscribes
 * to the SAME app-wide `pointerGate` every real `TapTarget` uses (via
 * `PointerGate.subscribe`), so the dots shown here are the actual
 * decisions the game is making, not a simulation. Uses raw pointer
 * handlers, not `TapTarget`/`useTap` — this must OBSERVE what the gate
 * decides, not be filtered by it.
 *
 * No `<canvas>`, deliberately: this app has none anywhere (see
 * `styles/global.css`'s header on why), and the pencil-input P0 spike's
 * worst bug was exactly a raw-canvas resize issue. Positioned dots in a
 * plain div are enough to show pen-vs-rejected-touch during a real test.
 *
 * Whether this actually holds up with a real Pencil on a real iPad is a
 * human judgment — this component only makes the gate's decisions
 * visible, it cannot itself confirm palm rejection "works."
 */
export function PenPalmProbe() {
  const [dots, setDots] = useState<Dot[]>([]);
  const recordsRef = useRef<PointerDecisionRecord[]>([]);
  const [summary, setSummary] = useState(summarizeDecisions([]));
  const lastDecisionRef = useRef<PointerDecisionRecord | null>(null);

  useEffect(() => {
    return pointerGate.subscribe((record) => {
      recordsRef.current = [...recordsRef.current, record];
      setSummary(summarizeDecisions(recordsRef.current));
      if (record.phase === "decide") lastDecisionRef.current = record;
    });
  }, []);

  function handlePointer(event: React.PointerEvent<HTMLDivElement>): void {
    const like = { pointerId: event.pointerId, pointerType: event.pointerType };
    if (event.type === "pointerdown") pointerGate.onPointerDown(like);
    if (event.type === "pointerup") pointerGate.onPointerUp(like);
    if (event.type === "pointercancel") pointerGate.onPointerCancel(like);
    pointerGate.shouldAccept(like); // triggers the "decide" emit the subscription above reads

    const decision = lastDecisionRef.current;
    if (!decision) return;
    const rect = event.currentTarget.getBoundingClientRect();
    setDots((prev) => [
      ...prev.slice(-40),
      {
        id: `${event.pointerId}-${decision.at}-${prev.length}`,
        x: event.clientX - rect.left,
        y: event.clientY - rect.top,
        color: colorFor(decision),
      },
    ]);
  }

  return (
    <div style={{ fontFamily: DIAGNOSTICS_FONT_FAMILY }}>
      <p>
        pen events: {summary.penEvents} · touch accepted: {summary.touchAccepted} · touch rejected (palm):{" "}
        {summary.touchRejectedWhilePenActive}
      </p>
      <div
        onPointerDown={handlePointer}
        onPointerUp={handlePointer}
        onPointerCancel={handlePointer}
        style={{
          position: "relative",
          width: "100%",
          height: "240px",
          background: "#f0ece4",
          border: "1px solid #cfc6b8",
          touchAction: "none",
        }}
        aria-label="pen and palm test surface"
        role="img"
      >
        {dots.map((dot) => (
          <div
            key={dot.id}
            style={{
              position: "absolute",
              left: dot.x - 6,
              top: dot.y - 6,
              width: 12,
              height: 12,
              borderRadius: "50%",
              background: dot.color,
            }}
          />
        ))}
      </div>
    </div>
  );
}
