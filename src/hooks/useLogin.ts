import { atomWithStorage } from "jotai/utils"
import { useAtomValue } from "jotai"
import { useCallback } from "react"

import { myFetch } from "~/utils"

const userAtom = atomWithStorage<{
  name?: string
  avatar?: string
}>("user", {})

const jwtAtom = atomWithStorage("jwt", "")

const enableLoginAtom = atomWithStorage<{
  enable: boolean
  url?: string
  missing?: string[]
}>("login", {
  enable: true,
})

enableLoginAtom.onMount = (set: (value: { enable: boolean, url?: string, missing?: string[] }) => void) => {
  myFetch("/enable-login").then((r) => {
    const enable = Boolean(r?.enable)
    const url = typeof r?.url === "string" ? r.url : undefined
    const missing = Array.isArray(r?.missing) ? r.missing.filter((x: unknown): x is string => typeof x === "string") : undefined
    set({ enable, url, missing })
    if (!enable) {
      localStorage.removeItem("jwt")
      localStorage.removeItem("user")
    }
  }).catch((e) => {
    if (e.statusCode === 506) {
      set({ enable: false })
      localStorage.removeItem("jwt")
      localStorage.removeItem("user")
    }
  })
}

export function useLogin() {
  const userInfo = useAtomValue(userAtom)
  const jwt = useAtomValue(jwtAtom)
  const enableLogin = useAtomValue(enableLoginAtom)

  const login = useCallback(() => {
    if (!enableLogin.enable) return
    window.location.href = enableLogin.url || "/api/login"
  }, [enableLogin])

  const logout = useCallback(() => {
    window.localStorage.clear()
    window.location.reload()
  }, [])

  return {
    loggedIn: !!jwt,
    userInfo,
    enableLogin: !!enableLogin.enable,
    logout,
    login,
  }
}
