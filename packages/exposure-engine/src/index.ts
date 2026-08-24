export const PACKAGE_NAME = "@shizi/exposure-engine";

export type {
  ExposureItem,
  ExposureSessionConfig,
  NextExposureItemResult,
  RecordExposureCompletionInput,
  RecordExposureCompletionResult,
  SessionDeps,
} from "./types.js";
export { DEFAULT_EXPOSURE_SESSION_CONFIG, EXPOSURE_ARMS } from "./types.js";

export type { CreateExposureSessionOptions } from "./session.js";
export { ExposureSession } from "./session.js";
