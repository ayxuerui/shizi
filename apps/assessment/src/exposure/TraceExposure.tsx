import { useEffect, useMemo, useRef } from "react";
import HanziWriter from "hanzi-writer";
import type { CandidatePool } from "@shizi/character-data";
import { createSpeechSynthesisPromptVoice } from "../audio/narration.js";

export interface TraceExposureProps {
  character: string;
  pool: CandidatePool;
  onComplete: () => void;
}

const WRITER_SIZE = 260;

/**
 * The `expose-trace` arm (`add-tracing-modality-arm` exposure spec):
 * guided stroke-order tracing via `hanzi-writer`'s `quiz()` mode, fed
 * directly from `character-data`'s own stroke data (Make Me a Hanzi
 * coordinates — no `hanzi-writer-data` dependency, per design.md's
 * decision). `showOutline: true` keeps the template visible for the
 * WHOLE interaction (spec: "Guided tracing only" — "the stroke-order
 * template SHALL remain visible for every stroke"), and
 * `markStrokeCorrectAfterMisses` guarantees a stroke she can't land
 * eventually just advances rather than blocking forever — completion
 * must be reachable regardless of tracing accuracy, per the spec's "No
 * grading or failure state" requirement. `showHintAfterMisses: false` /
 * `highlightOnComplete: false` suppress every on-character correctness
 * cue a 4-year-old would otherwise see.
 */
export function TraceExposure({ character, pool, onComplete }: TraceExposureProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const promptVoice = useMemo(() => createSpeechSynthesisPromptVoice(), []);
  // Always-latest callback ref: the effect below only re-runs when
  // `character`/`pool` change, but `writer.quiz`'s `onComplete` closure is
  // created once per effect run — without this indirection it could call
  // a stale `onComplete` from a prior render if the parent ever passes a
  // new function reference without `character` also changing.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  useEffect(() => {
    void promptVoice.primeVoices().then(() => promptVoice.speak(character));
  }, [character, promptVoice]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return undefined;

    const attributes = pool.get(character);
    const strokeData = attributes?.strokeData;
    if (!strokeData) {
      // No stroke data for this character (shouldn't happen for a usable,
      // curriculum-selected candidate — see character-data's exclusion.ts)
      // — complete immediately rather than present an interaction with
      // nothing to trace.
      onCompleteRef.current();
      return undefined;
    }

    let cancelled = false;
    const writer = HanziWriter.create(container, character, {
      width: WRITER_SIZE,
      height: WRITER_SIZE,
      padding: 12,
      showOutline: true,
      charDataLoader: () => ({ strokes: strokeData.strokes, medians: strokeData.medians }),
      showHintAfterMisses: false,
      highlightOnComplete: false,
      markStrokeCorrectAfterMisses: 3,
    });

    writer.animateCharacter({
      onComplete: () => {
        if (cancelled) return;
        writer.quiz({
          onComplete: () => {
            if (!cancelled) onCompleteRef.current();
          },
        });
      },
    });

    return () => {
      cancelled = true;
    };
  }, [character, pool]);

  return (
    <div
      ref={containerRef}
      data-testid="trace-target"
      style={{ width: WRITER_SIZE, height: WRITER_SIZE, touchAction: "none" }}
    />
  );
}
