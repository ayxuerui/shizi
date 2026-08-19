import { AudioUnlockGate } from "./audio/AudioUnlockGate.js";
import { BoutScreen } from "./bout/BoutScreen.js";

export function App() {
  return (
    <AudioUnlockGate>
      <BoutScreen />
    </AudioUnlockGate>
  );
}
