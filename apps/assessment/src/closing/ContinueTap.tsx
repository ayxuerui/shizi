import { COPY } from "../copy.js";
import { TapTarget } from "../components/TapTarget.js";

export interface ContinueTapProps {
  onContinue: () => void;
}

/**
 * The deliberate continue tap at the closing beat: the next activity
 * starts only when someone taps this — never on a timer — so a bout ends
 * as an acknowledged stopping point ("wrap up, then choose to continue")
 * rather than flowing onward unnoticed. Shared by all three activity
 * screens (BoutScreen, ExposureScreen, MemoryScreen) so every module
 * ends the same way.
 */
export function ContinueTap({ onContinue }: ContinueTapProps) {
  return (
    <TapTarget label={COPY.closing.continueTap} onActivate={onContinue}>
      <span style={{ fontSize: "1.5rem" }}>{COPY.closing.continueTap}</span>
    </TapTarget>
  );
}
