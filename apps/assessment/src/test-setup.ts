import { afterEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";

// This project imports `afterEach`/`describe`/`it` explicitly from
// "vitest" rather than enabling vitest's globals — @testing-library/
// react's own auto-cleanup relies on detecting a global `afterEach`,
// which isn't present here, so it must be registered explicitly or
// component trees leak across tests within a file.
afterEach(() => {
  cleanup();
});

// jsdom doesn't implement HTMLMediaElement.play() at all — every code
// path here already tolerates that (playViaElement/audio-unlock.ts's
// own try/catch), but jsdom additionally logs a "not implemented" error
// to its virtual console regardless of whether the rejection is caught.
// Stubbed globally so that noise doesn't drown out real test failures.
vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue(undefined);
