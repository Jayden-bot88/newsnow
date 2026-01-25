import { useRegisterSW } from "virtual:pwa-register/react"
import { useMount } from "react-use"
import { useToast } from "./useToast"

export function usePWA() {
  const toaster = useToast()
  const isLocalhost = typeof window !== "undefined"
    && (location.hostname === "localhost" || location.hostname === "127.0.0.1")

  const LOCALHOST_SW_CLEARED_KEY = "pwa-localhost-sw-cleared"

  // Avoid service worker caching in local production preview.
  // It makes iterating/debugging confusing because old JS/CSS can be served from SW cache.
  const { updateServiceWorker, needRefresh: [needRefresh] } = useRegisterSW({
    immediate: !isLocalhost,
    onRegisteredSW: isLocalhost
      ? (_swUrl, registration) => {
          void (async () => {
            try {
              await registration?.unregister()
            } catch {
              // ignore
            }
            try {
              if ("serviceWorker" in navigator) {
                const regs = await navigator.serviceWorker.getRegistrations()
                await Promise.all(regs.map(r => r.unregister()))
              }
              if ("caches" in window) {
                const keys = await caches.keys()
                await Promise.all(keys.map(k => caches.delete(k)))
              }
            } catch {
              // ignore
            }
          })()
        }
      : undefined,
  })

  useMount(async () => {
    if (isLocalhost) {
      try {
        const hadController = !!navigator.serviceWorker?.controller

        const regs = "serviceWorker" in navigator
          ? await navigator.serviceWorker.getRegistrations()
          : []

        const cacheKeys = "caches" in window ? await caches.keys() : []

        const shouldReload = (hadController || regs.length > 0 || cacheKeys.length > 0)
          && !sessionStorage.getItem(LOCALHOST_SW_CLEARED_KEY)

        if ("serviceWorker" in navigator) {
          await Promise.all(regs.map(r => r.unregister()))
        }
        if ("caches" in window) {
          await Promise.all(cacheKeys.map(k => caches.delete(k)))
        }

        if (shouldReload) {
          sessionStorage.setItem(LOCALHOST_SW_CLEARED_KEY, "1")
          location.reload()
        }
      } catch {
        // ignore
      }
      return
    }

    const update = () => {
      updateServiceWorker().then(() => localStorage.setItem("updated", "1"))
    }
    await delay(1000)
    if (localStorage.getItem("updated")) {
      localStorage.removeItem("updated")
      toaster("更新成功，赶快体验吧", {
        action: {
          label: "查看更新",
          onClick: () => {
            window.open(`${Homepage}/releases/tag/v${Version}`)
          },
        },
      })
    } else if (needRefresh) {
      if (!navigator) return

      if ("connection" in navigator && !navigator.onLine) return

      const resp = await myFetch("/latest")

      if (resp.v && resp.v !== Version) {
        toaster("有更新，5 秒后自动更新", {
          action: {
            label: "立刻更新",
            onClick: update,
          },
          onDismiss: update,
        })
      }
    }
  })
}
