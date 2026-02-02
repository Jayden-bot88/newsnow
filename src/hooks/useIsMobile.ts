/**
 * Viewport-based mobile detection.
 *
 * `react-device-detect` relies on UA, which breaks when users resize desktop
 * browser/devtools. For UI layout we want responsive behavior.
 */
export function useIsMobile() {
  // This app intentionally uses a single mobile-first UI across all viewports.
  // Many components branch on `useIsMobile()`; keeping it viewport-based would
  // render mixed desktop/mobile layouts on wide screens.
  return true
}
