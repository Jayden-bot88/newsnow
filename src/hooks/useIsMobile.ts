import { useMedia } from "react-use"

/**
 * Viewport-based mobile detection.
 *
 * `react-device-detect` relies on UA, which breaks when users resize desktop
 * browser/devtools. For UI layout we want responsive behavior.
 */
export function useIsMobile() {
  return useMedia("(max-width: 768px)")
}
