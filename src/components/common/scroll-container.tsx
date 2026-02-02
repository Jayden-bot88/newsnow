import { createContext, useContext } from "react"

export const ScrollContainerContext = createContext<HTMLElement | null>(null)

export function useScrollContainerEl() {
  return useContext(ScrollContainerContext)
}
