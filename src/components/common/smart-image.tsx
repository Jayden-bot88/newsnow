import type { CSSProperties, ImgHTMLAttributes } from "react"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { SafeImage } from "~/components/common/safe-image"

type SmartImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "onError"> & {
  fallbackClassName?: string
  fallbackStyle?: CSSProperties
  onError?: ImgHTMLAttributes<HTMLImageElement>["onError"]
  smartCrop?: boolean
}

export function SmartImage({ smartCrop = true, onLoad, style, ...rest }: SmartImageProps) {
  const imgRef = useRef<HTMLImageElement | null>(null)
  const [objectPosition, setObjectPosition] = useState("50% 50%")
  const [objectFit, setObjectFit] = useState<CSSProperties["objectFit"]>("cover")
  const [ready, setReady] = useState(false)

  const updateCrop = useCallback(async () => {
    if (!smartCrop) return
    const img = imgRef.current
    if (!img) return
    if (!img.naturalWidth || !img.naturalHeight) return

    const width = img.clientWidth || Number(img.getAttribute("width")) || 0
    const height = img.clientHeight || Number(img.getAttribute("height")) || 0
    if (!width || !height) return

    const imageRatio = img.naturalWidth / img.naturalHeight
    const boxRatio = width / height
    const diff = Math.abs(imageRatio - boxRatio) / Math.max(0.01, boxRatio)

    if (diff >= 0.2) {
      setObjectFit("contain")
      setObjectPosition("50% 50%")
    } else {
      setObjectFit("cover")
      setObjectPosition("50% 38%")
    }
  }, [smartCrop])

  useEffect(() => {
    if (!ready) return
    void updateCrop()
  }, [ready, updateCrop])

  useEffect(() => {
    if (!ready) return
    const onResize = () => {
      void updateCrop()
    }
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [ready, updateCrop])

  const mergedStyle = useMemo(() => {
    const bg = objectFit === "contain"
      ? (style?.backgroundColor ?? "transparent")
      : style?.backgroundColor
    return {
      ...style,
      backgroundColor: bg,
      objectFit,
      objectPosition,
    } as CSSProperties
  }, [objectFit, objectPosition, style])

  return (
    <SafeImage
      {...rest}
      ref={imgRef}
      style={mergedStyle}
      onLoad={(event) => {
        setReady(true)
        onLoad?.(event)
      }}
    />
  )
}
