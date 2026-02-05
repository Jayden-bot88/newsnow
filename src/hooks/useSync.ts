import type { PrimitiveMetadata } from "@shared/types"
import { useAtom } from "jotai"
import { useRef } from "react"
import { useDebounce, useMount } from "react-use"
import { useLogin } from "./useLogin"
import { useToast } from "./useToast"
import { preprocessMetadata, primitiveMetadataAtom } from "~/atoms/primitiveMetadataAtom"
import { myFetch, readJwt } from "~/utils"

async function uploadMetadata(metadata: PrimitiveMetadata) {
  const jwt = readJwt()
  if (!jwt) return
  await myFetch("/me/sync", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
    body: {
      data: metadata.data,
      updatedTime: metadata.updatedTime,
    },
  })
}

async function downloadMetadata(): Promise<PrimitiveMetadata | undefined> {
  const jwt = readJwt()
  if (!jwt) return
  const { data, updatedTime } = await myFetch("/me/sync", {
    headers: {
      Authorization: `Bearer ${jwt}`,
    },
  }) as PrimitiveMetadata
  // 不用同步 action 字段
  if (data) {
    return {
      action: "sync",
      data,
      updatedTime,
    }
  }
}

export function useSync() {
  const [primitiveMetadata, setPrimitiveMetadata] = useAtom(primitiveMetadataAtom)
  const { logout, login } = useLogin()
  const toaster = useToast()
  const warnedRef = useRef(false)

  useDebounce(async () => {
    const fn = async () => {
      try {
        await uploadMetadata(primitiveMetadata)
      } catch (e: any) {
        const code = e?.statusCode
        if (code === 506) return

        if (!warnedRef.current) {
          warnedRef.current = true
          toaster(
            code === 401
              ? "身份校验失败，无法同步，请重新登录"
              : "同步失败，请稍后重试",
            {
              type: code === 401 ? "error" : "warning",
              action: code === 401
                ? {
                    label: "登录",
                    onClick: login,
                  }
                : undefined,
            },
          )
        }

        if (code === 401) logout()
      }
    }

    if (primitiveMetadata.action === "manual") {
      fn()
    }
  }, 10000, [primitiveMetadata])
  useMount(() => {
    const fn = async () => {
      try {
        const metadata = await downloadMetadata()
        if (metadata) {
          setPrimitiveMetadata(preprocessMetadata(metadata))
        }
      } catch (e: any) {
        const code = e?.statusCode
        if (code === 506) return

        if (!warnedRef.current) {
          warnedRef.current = true
          toaster(
            code === 401
              ? "身份校验失败，无法同步，请重新登录"
              : "同步失败，请稍后重试",
            {
              type: code === 401 ? "error" : "warning",
              action: code === 401
                ? {
                    label: "登录",
                    onClick: login,
                  }
                : undefined,
            },
          )
        }

        if (code === 401) logout()
      }
    }
    fn()
  })
}
