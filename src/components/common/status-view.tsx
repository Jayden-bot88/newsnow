import type { ReactNode } from "react"
import $ from "clsx"

type Tone = "neutral" | "info" | "warning" | "error"

function toneClasses(tone: Tone) {
  if (tone === "error") return "border-red-100 bg-red-50 text-red-700"
  if (tone === "warning") return "border-amber-100 bg-amber-50 text-amber-700"
  if (tone === "info") return "border-blue-100 bg-blue-50 text-blue-700"
  return "border-[var(--tt-border)] bg-white text-[var(--tt-subtext)]"
}

export function StatusView({
  title,
  desc,
  tone = "neutral",
  action,
  className,
}: {
  title: string
  desc?: string
  tone?: Tone
  action?: ReactNode
  className?: string
}) {
  return (
    <div className={$(
      "px-[var(--tt-gap)] py-10",
      className,
    )}
    >
      <div className={$(
        "rounded-[12px] border p-4",
        toneClasses(tone),
      )}
      >
        <div className="text-[14px] font-semibold">
          {title}
        </div>
        {!!desc && (
          <div className="mt-1 text-[13px] leading-[18px] op-90">
            {desc}
          </div>
        )}
        {!!action && (
          <div className="mt-3">
            {action}
          </div>
        )}
      </div>
    </div>
  )
}
