/** True when running in a real browser window (not Node, not a worker). */
export function isBrowser(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.document !== "undefined"
  );
}
