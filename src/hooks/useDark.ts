import { useEffect, useMemo } from "react"
import { useMedia } from "react-use"

export declare type ColorScheme = "dark" | "light" | "auto"

// Toutiao-style UI is light by default.
const colorSchemeAtom = atomWithStorage("color-scheme", "light")

export function useDark() {
  const [colorScheme, setColorScheme] = useAtom(colorSchemeAtom)
  const prefersDarkMode = useMedia("(prefers-color-scheme: dark)")
  const isDark = useMemo(() => colorScheme === "auto" ? prefersDarkMode : colorScheme === "dark", [colorScheme, prefersDarkMode])

  // Apply on mount so initial render matches persisted preference.
  useEffect(() => {
    document.documentElement.classList.toggle("dark", isDark)
  }, [isDark])

  const setDark = (value: ColorScheme) => {
    setColorScheme(value)
  }

  const toggleDark = () => {
    setColorScheme(isDark ? "light" : "dark")
  }

  return { isDark, setDark, toggleDark }
}
