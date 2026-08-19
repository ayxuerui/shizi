import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import type { ProbeItem } from "@shizi/assessment-engine";
import { COPY } from "../copy.js";
import { ProbePanel } from "./ProbePanel.js";

function probe(): ProbeItem {
  return { character: "山", kind: "informative", options: ["山", "水"] };
}

describe("ProbePanel's 'listen again' gating (task 10.0 diagnostics: narration.ts's isAvailable() fix)", () => {
  const originalSynth = window.speechSynthesis;
  const originalUtterance = (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance;

  beforeEach(() => {
    // jsdom has neither speechSynthesis nor SpeechSynthesisUtterance —
    // stub the constructor too, since narration.ts's speak() (auto-called
    // on mount) constructs one whenever `synth` is truthy.
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = class {
      lang = "";
      voice = null;
      constructor(public text: string) {}
    };
  });

  afterEach(() => {
    Object.defineProperty(window, "speechSynthesis", { value: originalSynth, configurable: true, writable: true });
    (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance = originalUtterance;
  });

  it("does not render 'listen again' when no Chinese voice is available (e.g. jsdom, or a real device with none installed)", async () => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [{ lang: "en-US", name: "English" }],
        cancel: vi.fn(),
        speak: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    render(<ProbePanel probe={probe()} disabled={false} selected={null} cue={null} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: COPY.probe.listenAgain })).not.toBeInTheDocument();
    });
  });

  it("renders 'listen again' once a Chinese voice is found", async () => {
    Object.defineProperty(window, "speechSynthesis", {
      value: {
        getVoices: () => [{ lang: "zh-CN", name: "Ting-Ting" }],
        cancel: vi.fn(),
        speak: vi.fn(),
      },
      configurable: true,
      writable: true,
    });

    render(<ProbePanel probe={probe()} disabled={false} selected={null} cue={null} onSelect={vi.fn()} />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: COPY.probe.listenAgain })).toBeInTheDocument();
    });
  });
});
