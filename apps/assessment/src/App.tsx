import { PACKAGE_NAME as characterDataPkg } from "@shizi/character-data";
import { PACKAGE_NAME as curriculumPkg } from "@shizi/curriculum";
import { PACKAGE_NAME as learnerStatePkg } from "@shizi/learner-state";
import { PACKAGE_NAME as validatorPkg } from "@shizi/validator";

// Placeholder screen. The real assessment UI (frontier-search probing,
// narrative framing, guess detection, difficulty calibration, touch/stylus
// input handling) is built out in tasks.md Section 8. This component exists
// to prove the app can resolve and render with every workspace package
// wired in before any real game logic is written.
export function App() {
  const workspacePackages = [
    characterDataPkg,
    curriculumPkg,
    learnerStatePkg,
    validatorPkg,
  ];

  return (
    <main>
      <h1>识字</h1>
      <p>Scaffolding in place. Workspace packages linked:</p>
      <ul>
        {workspacePackages.map((pkg) => (
          <li key={pkg}>{pkg}</li>
        ))}
      </ul>
    </main>
  );
}
