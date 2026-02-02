import type { ReactNode } from "react"
import { Component } from "react"

type FallbackRender = (args: {
  error: unknown
  reset: () => void
}) => ReactNode

function defaultMessage(error: unknown): string {
  if (error instanceof Error) return error.message || "Unknown error"
  if (typeof error === "string") return error
  return "Unknown error"
}

class ErrorBoundaryInner extends Component<
  {
    children: ReactNode
    resetKey?: string
    fallback?: FallbackRender
  },
  {
    error?: unknown
  }
> {
  state: { error?: unknown } = {}

  static getDerivedStateFromError(error: unknown) {
    return { error }
  }

  componentDidCatch(error: unknown) {
    // Best-effort logging. Avoid logging sensitive data.
    console.error("UI crashed", error)
  }

  componentDidUpdate(prevProps: Readonly<{ resetKey?: string }>) {
    if (this.state.error && prevProps.resetKey !== this.props.resetKey) {
      this.setState({ error: undefined })
    }
  }

  private reset = () => {
    this.setState({ error: undefined })
  }

  render() {
    if (this.state.error) {
      if (this.props.fallback) {
        return this.props.fallback({ error: this.state.error, reset: this.reset })
      }

      const msg = defaultMessage(this.state.error)
      return (
        <div className="min-h-[50vh] flex items-center justify-center px-4">
          <div className="w-full max-w-[520px] rounded-[12px] border border-[var(--tt-border)] bg-white p-4">
            <div className="text-[16px] font-extrabold color-[var(--tt-text)]">页面出错了</div>
            <div className="mt-2 text-[13px] leading-[18px] color-[var(--tt-subtext)] break-words">
              {msg}
            </div>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                className="h-9 px-4 rounded-full bg-neutral-100 text-[13px] color-[var(--tt-text)] active:bg-neutral-200"
                onClick={this.reset}
              >
                重试
              </button>
              <a
                href="/"
                className="h-9 px-4 rounded-full bg-[var(--tt-red)] text-white text-[13px] font-semibold flex items-center"
              >
                返回首页
              </a>
            </div>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

export function ErrorBoundary({
  children,
  resetKey,
  fallback,
}: {
  children: ReactNode
  resetKey?: string
  fallback?: FallbackRender
}) {
  return (
    <ErrorBoundaryInner resetKey={resetKey} fallback={fallback}>
      {children}
    </ErrorBoundaryInner>
  )
}
