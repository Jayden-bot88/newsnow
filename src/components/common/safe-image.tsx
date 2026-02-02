import type { CSSProperties, ImgHTMLAttributes } from "react"
import { useState } from "react"

type SafeImageProps = Omit<ImgHTMLAttributes<HTMLImageElement>, "onError"> & {
  fallbackClassName?: string
  fallbackStyle?: CSSProperties
  onError?: ImgHTMLAttributes<HTMLImageElement>["onError"]
}

function mergeClassName(...classes: Array<string | undefined>) {
  return classes.filter(Boolean).join(" ")
}

export function SafeImage({
  src,
  className,
  style,
  fallbackClassName,
  fallbackStyle,
  onError,
  alt = "",
  ...rest
}: SafeImageProps) {
  const [failed, setFailed] = useState(false)

  if (!src || failed) {
    return (
      <span
        aria-hidden="true"
        className={mergeClassName(className, "bg-[var(--tt-search)]", fallbackClassName)}
        style={{
          ...style,
          ...fallbackStyle,
        }}
      />
    )
  }

  return (
    <img
      {...rest}
      src={src}
      alt={alt}
      className={className}
      style={style}
      onError={(event) => {
        setFailed(true)
        onError?.(event)
      }}
    />
  )
}
