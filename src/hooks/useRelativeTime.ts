import { useMount } from "react-use"
import { relativeTime } from "@shared/utils"
import { atom, useAtomValue } from "jotai"
import { useEffect, useState } from "react"

/**
 * changed every minute
 */
const timerAtom = atom(0)

timerAtom.onMount = (set: (value: number) => void) => {
  const timer = setInterval(() => {
    set(Date.now())
  }, 60 * 1000)
  return () => clearInterval(timer)
}

function useVisibility() {
  const [visible, setVisible] = useState(true)
  useMount(() => {
    const handleVisibilityChange = () => {
      setVisible(document.visibilityState === "visible")
    }
    document.addEventListener("visibilitychange", handleVisibilityChange)
    return () => {
      document.removeEventListener("visibilitychange", handleVisibilityChange)
    }
  })
  return visible
}

export function useRelativeTime(timestamp: string | number) {
  const [time, setTime] = useState<string>()
  const timer = useAtomValue(timerAtom)
  const visible = useVisibility()

  useEffect(() => {
    if (visible) {
      const t = relativeTime(timestamp)
      if (t) {
        setTime(t)
      }
    }
  }, [timestamp, timer, visible])

  return time
}
