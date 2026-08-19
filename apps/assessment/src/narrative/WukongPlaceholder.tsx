/**
 * PLACEHOLDER ART, flagged not silent: there is no 悟空/character
 * illustration anywhere in this repo yet (verified — zero image assets
 * committed anywhere). This inline shape exists so the narrative frame
 * has SOMETHING to look at now; it is the single file real art swaps
 * into later. `data-testid="wukong"` is the seam tests and a future
 * artist both key off of.
 */
export function WukongPlaceholder() {
  return (
    <svg
      data-testid="wukong"
      width="96"
      height="96"
      viewBox="0 0 96 96"
      role="img"
      aria-label="悟空"
    >
      <circle cx="48" cy="40" r="28" fill="var(--color-accent)" />
      <circle cx="38" cy="36" r="4" fill="var(--color-ink)" />
      <circle cx="58" cy="36" r="4" fill="var(--color-ink)" />
      <path d="M36 52 Q48 60 60 52" stroke="var(--color-ink)" strokeWidth="3" fill="none" strokeLinecap="round" />
    </svg>
  );
}
