import { createFileRoute } from "@tanstack/react-router"
import { sources } from "@shared/sources"
import type { SourceID } from "@shared/types"

import { clearDismissedAtom, disabledSourcesAtom, dismissedSetAtom } from "~/atoms"
import { useToast } from "~/hooks/useToast"

type SourceHealthStatus = "ok" | "empty" | "fail" | "unknown"

interface SourceHealthEntry {
  id: SourceID
  status: SourceHealthStatus
  count?: number
  httpStatus?: number
  message?: string
  checkedAt: number
}

interface SourceHealthState {
  checkedAt: number
  byId: Partial<Record<SourceID, SourceHealthEntry>>
}

const HEALTH_KEY = "tt-source-health"
const OPEN_GROUPS_KEY = "tt-settings-open-groups"

function loadHealthState(): SourceHealthState | undefined {
  const raw = localStorage.getItem(HEALTH_KEY)
  if (!raw) return undefined
  try {
    const parsed = JSON.parse(raw) as SourceHealthState
    if (!parsed || typeof parsed !== "object") return undefined
    if (typeof parsed.checkedAt !== "number") return undefined
    if (!parsed.byId || typeof parsed.byId !== "object") return undefined
    return parsed
  } catch {
    return undefined
  }
}

function saveHealthState(next: SourceHealthState) {
  localStorage.setItem(HEALTH_KEY, JSON.stringify(next))
}

function loadOpenGroups(): string[] {
  const raw = localStorage.getItem(OPEN_GROUPS_KEY)
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(x => typeof x === "string")
  } catch {
    return []
  }
}

function saveOpenGroups(next: string[]) {
  localStorage.setItem(OPEN_GROUPS_KEY, JSON.stringify(next))
}

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
})

function SettingsPage() {
  const [disabled, setDisabled] = useAtom(disabledSourcesAtom)
  const disabledSet = useMemo(() => new Set(disabled), [disabled])
  const dismissed = useAtomValue(dismissedSetAtom)
  const clearDismissed = useSetAtom(clearDismissedAtom)
  const toast = useToast()

  const [health, setHealth] = useState<SourceHealthState | undefined>(() => loadHealthState())
  const [checking, setChecking] = useState(false)
  const [openGroups, setOpenGroups] = useState<string[]>(() => loadOpenGroups())
  const openSet = useMemo(() => new Set(openGroups), [openGroups])

  const [showHealthDetail, setShowHealthDetail] = useState(false)

  const all = useMemo(() => {
    return (Object.keys(sources) as SourceID[])
      .filter(id => sources[id])
      .sort((a, b) => {
        const an = sources[a].name
        const bn = sources[b].name
        return an.localeCompare(bn, "zh-Hans-CN")
      })
  }, [])

  const enabled = useMemo(() => all.filter(id => !disabledSet.has(id)), [all, disabledSet])
  const enabledSummary = useMemo(() => `${enabled.length} / ${all.length}`, [all.length, enabled.length])

  const getHealth = useCallback((id: SourceID): SourceHealthEntry | undefined => {
    return health?.byId?.[id]
  }, [health])

  const score = useCallback((id: SourceID) => {
    const s = getHealth(id)?.status || "unknown"
    if (s === "fail") return 0
    if (s === "empty") return 1
    if (s === "ok") return 2
    return 3
  }, [getHealth])

  const groupScore = useCallback((ids: SourceID[]) => {
    const enabledIds = ids.filter(id => !disabledSet.has(id))
    if (!enabledIds.length) return 3
    return enabledIds.reduce((acc, id) => Math.min(acc, score(id)), 3)
  }, [disabledSet, score])

  const groups = useMemo(() => {
    const map = new Map<string, SourceID[]>()
    for (const id of all) {
      const name = sources[id].name
      const arr = map.get(name)
      if (arr) arr.push(id)
      else map.set(name, [id])
    }
    const list = Array.from(map.entries())
      .map(([name, ids]) => {
        const sorted = [...ids].sort((a, b) => {
          const sa = score(a)
          const sb = score(b)
          if (sa !== sb) return sa - sb
          const ad = sources[a].desc || ""
          const bd = sources[b].desc || ""
          const cd = ad.localeCompare(bd, "zh-Hans-CN")
          if (cd !== 0) return cd
          return a.localeCompare(b)
        })
        return { name, ids: sorted }
      })
      .sort((a, b) => {
        const sa = groupScore(a.ids)
        const sb = groupScore(b.ids)
        if (sa !== sb) return sa - sb
        return a.name.localeCompare(b.name, "zh-Hans-CN")
      })
    return list
  }, [all, groupScore, score])

  const problematicGroups = useMemo(() => {
    return groups.filter((g) => {
      const enabledIds = g.ids.filter(id => !disabledSet.has(id))
      if (!enabledIds.length) return false
      return enabledIds.some((id) => {
        const s = getHealth(id)?.status
        return s === "fail" || s === "empty"
      })
    })
  }, [disabledSet, getHealth, groups])

  const healthyGroups = useMemo(() => {
    const bad = new Set(problematicGroups.map(g => g.name))
    return groups.filter(g => !bad.has(g.name))
  }, [groups, problematicGroups])

  const groupCounts = useCallback((ids: SourceID[]) => {
    const enabledIds = ids.filter(id => !disabledSet.has(id))
    const disabledIds = ids.filter(id => disabledSet.has(id))
    const healthCounts = {
      ok: 0,
      empty: 0,
      fail: 0,
      unknown: 0,
    }
    for (const id of enabledIds) {
      const s = getHealth(id)?.status || "unknown"
      healthCounts[s] += 1
    }
    return {
      enabled: enabledIds.length,
      disabled: disabledIds.length,
      total: ids.length,
      healthCounts,
    }
  }, [disabledSet, getHealth])

  const healthSummary = useMemo(() => {
    const enabledIds = enabled
    const idsByStatus: Record<SourceHealthStatus, SourceID[]> = {
      ok: [],
      empty: [],
      fail: [],
      unknown: [],
    }
    for (const id of enabledIds) {
      const s = getHealth(id)?.status || "unknown"
      idsByStatus[s].push(id)
    }
    return {
      enabledTotal: enabledIds.length,
      idsByStatus,
    }
  }, [enabled, getHealth])

  const healthActions = useMemo(() => {
    const enabledIds = enabled
    const bad = enabledIds.filter((id) => {
      const s = getHealth(id)?.status
      return s === "fail" || s === "empty"
    })
    const ok = enabledIds.filter(id => getHealth(id)?.status === "ok")
    return { bad, ok }
  }, [enabled, getHealth])

  const toggleGroupOpen = useCallback((name: string) => {
    setOpenGroups((prev) => {
      const s = new Set(prev)
      if (s.has(name)) s.delete(name)
      else s.add(name)
      const next = Array.from(s)
      saveOpenGroups(next)
      return next
    })
  }, [])

  const setGroupEnabled = useCallback((ids: SourceID[], on: boolean) => {
    setDisabled((prev: SourceID[]) => {
      const s = new Set(prev)
      for (const id of ids) {
        if (on) s.delete(id)
        else s.add(id)
      }
      return Array.from(s)
    })
  }, [setDisabled])

  const renderBadge = useCallback((id: SourceID) => {
    const h = getHealth(id)
    const s = h?.status || "unknown"
    if (s === "unknown") return null
    const label = s === "ok"
      ? `OK ${h?.count ?? 0}`
      : s === "empty"
        ? "EMPTY"
        : `FAIL${h?.httpStatus ? ` ${h.httpStatus}` : ""}`
    const cls = s === "ok"
      ? "bg-green-50 text-green-700"
      : s === "empty"
        ? "bg-amber-50 text-amber-700"
        : "bg-red-50 text-red-700"
    return (
      <span className={$(["shrink-0 px-2 h-7 rounded-full text-[11px] flex items-center", cls])}>
        {label}
      </span>
    )
  }, [getHealth])

  const renderHealthMessage = useCallback((id: SourceID) => {
    const h = getHealth(id)
    if (!h) return null
    if (h.status === "fail") {
      const msg = h.message || "请求失败"
      const full = `${h.httpStatus ? `${h.httpStatus} ` : ""}${msg}`
      return (
        <div className="mt-0.5 text-[11px] color-red-600/80 truncate" title={full}>
          {full}
        </div>
      )
    }
    if (h.status === "empty") {
      return (
        <div className="mt-0.5 text-[11px] color-amber-700/80 truncate" title="返回空数据">
          返回空数据
        </div>
      )
    }
    return null
  }, [getHealth])

  const runHealthCheck = useCallback(async () => {
    if (checking) return
    setChecking(true)
    try {
      const next = await myFetch("/source-health", {
        method: "POST",
        timeout: 180_000,
        body: {
          sources: enabled,
        },
      }) as SourceHealthState
      saveHealthState(next)
      setHealth(next)
      setShowHealthDetail(true)
    } finally {
      setChecking(false)
    }
  }, [checking, enabled])

  const disableIds = useCallback((ids: SourceID[]) => {
    if (!ids.length) return
    setDisabled((prev: SourceID[]) => {
      const s = new Set(prev)
      ids.forEach(id => s.add(id))
      return Array.from(s)
    })
  }, [setDisabled])

  const enableOnly = useCallback((ids: SourceID[]) => {
    setDisabled(all.filter(id => !ids.includes(id)))
  }, [all, setDisabled])

  const copyHealth = useCallback(() => {
    const payload = {
      checkedAt: health?.checkedAt,
      fail: healthActions.bad.map((id) => {
        const h = getHealth(id)
        return {
          id,
          status: h?.status || "unknown",
          httpStatus: h?.httpStatus,
          message: h?.message,
        }
      }),
      ok: healthActions.ok,
    }
    const text = JSON.stringify(payload, null, 2)
    navigator.clipboard.writeText(text).catch(() => {
      // best-effort
    })
  }, [getHealth, health, healthActions])

  const setOne = useCallback((id: SourceID, on: boolean) => {
    setDisabled((prev: SourceID[]) => {
      const s = new Set(prev)
      if (on) s.delete(id)
      else s.add(id)
      return Array.from(s)
    })
  }, [setDisabled])

  return (
    <div className="bg-white">
      <div className="px-3 py-2 text-[12px] color-neutral-500 border-b border-neutral-100">
        API 频道设置（启用/禁用来源）
      </div>

      <div className="px-3 py-3 flex items-center gap-2">
        <div className="text-[13px] color-neutral-600">
          已隐藏
          {" "}
          {dismissed.size}
          {" "}
          条
        </div>
        <button
          type="button"
          className="ml-auto px-3 h-8 rounded-full bg-neutral-100 text-[12px]"
          onClick={() => {
            clearDismissed()
            toast("已恢复隐藏内容")
          }}
          disabled={dismissed.size === 0}
        >
          清空隐藏
        </button>
      </div>

      <div className="px-3 py-3 flex items-center gap-2">
        <button
          type="button"
          className="px-3 h-9 rounded-full bg-neutral-100 text-[13px]"
          onClick={() => setDisabled([])}
        >
          全部启用
        </button>
        <button
          type="button"
          className="px-3 h-9 rounded-full bg-neutral-100 text-[13px]"
          onClick={() => setDisabled(all)}
        >
          全部停用
        </button>
        <div className="ml-auto text-[12px] color-neutral-500">
          启用
          <span className="ml-1">
            {enabledSummary}
          </span>
        </div>
      </div>

      <div className="px-3 pb-3 flex items-center gap-2">
        <button
          type="button"
          className={$([
            "px-3 h-9 rounded-full text-[13px]",
            checking ? "bg-neutral-200 text-neutral-600" : "bg-neutral-100",
          ])}
          onClick={runHealthCheck}
          disabled={checking}
        >
          {checking ? "检查中..." : "检查所有来源"}
        </button>
        {health?.checkedAt && !checking && (
          <div className="text-[12px] color-neutral-500">
            上次检查
            <span className="ml-1">
              {new Date(health.checkedAt).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      {health?.checkedAt && !checking && (
        <div className="px-3 pb-3">
          <div className="flex items-center gap-2 text-[12px]">
            <span className="px-2 h-7 rounded-full flex items-center bg-green-50 text-green-700">
              OK
              {" "}
              {healthSummary.idsByStatus.ok.length}
            </span>
            <span className="px-2 h-7 rounded-full flex items-center bg-amber-50 text-amber-700">
              EMPTY
              {" "}
              {healthSummary.idsByStatus.empty.length}
            </span>
            <span className="px-2 h-7 rounded-full flex items-center bg-red-50 text-red-700">
              FAIL
              {" "}
              {healthSummary.idsByStatus.fail.length}
            </span>
            {healthSummary.idsByStatus.fail.length + healthSummary.idsByStatus.empty.length > 0 && (
              <button
                type="button"
                className="ml-auto px-3 h-8 rounded-full bg-neutral-100 text-[12px]"
                onClick={() => setShowHealthDetail(v => !v)}
              >
                {showHealthDetail ? "收起结果" : "查看结果"}
              </button>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="px-3 h-8 rounded-full bg-neutral-900 text-white text-[12px]"
              onClick={() => disableIds(healthActions.bad)}
              disabled={healthActions.bad.length === 0}
            >
              一键停用异常
            </button>
            <button
              type="button"
              className="px-3 h-8 rounded-full bg-neutral-100 text-[12px]"
              onClick={() => enableOnly(healthActions.ok)}
              disabled={healthActions.ok.length === 0}
            >
              仅启用正常
            </button>
            <button
              type="button"
              className="px-3 h-8 rounded-full bg-neutral-100 text-[12px]"
              onClick={copyHealth}
            >
              复制诊断
            </button>
          </div>

          {showHealthDetail && (healthSummary.idsByStatus.fail.length + healthSummary.idsByStatus.empty.length > 0) && (
            <div className="mt-2 rounded-[10px] border border-neutral-100 bg-white overflow-hidden">
              {healthSummary.idsByStatus.fail.length > 0 && (
                <div className="px-3 py-2 text-[12px] color-red-700 bg-red-50">不可用（FAIL）</div>
              )}
              {healthSummary.idsByStatus.fail.map((id) => {
                const h = getHealth(id)
                const label = sources[id]?.desc || id
                const msg = h?.message || "请求失败"
                const full = `${h?.httpStatus ? `${h.httpStatus} ` : ""}${msg}`
                return (
                  <div key={id} className="px-3 py-2 border-b border-neutral-100 last:border-b-0">
                    <div className="text-[13px] color-neutral-900 truncate">{label}</div>
                    <div className="text-[11px] color-neutral-400 truncate">{id}</div>
                    <div className="mt-0.5 text-[11px] color-red-700/80 truncate" title={full}>{full}</div>
                  </div>
                )
              })}

              {healthSummary.idsByStatus.empty.length > 0 && (
                <div className="px-3 py-2 text-[12px] color-amber-700 bg-amber-50">无数据（EMPTY）</div>
              )}
              {healthSummary.idsByStatus.empty.map((id) => {
                const label = sources[id]?.desc || id
                return (
                  <div key={id} className="px-3 py-2 border-b border-neutral-100 last:border-b-0">
                    <div className="text-[13px] color-neutral-900 truncate">{label}</div>
                    <div className="text-[11px] color-neutral-400 truncate">{id}</div>
                    <div className="mt-0.5 text-[11px] color-amber-700/80 truncate">返回空数据</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      <div className="px-3">
        <div className="text-[12px] color-neutral-500">来源分组</div>

        {problematicGroups.length > 0 && (
          <>
            <div className="mt-2 text-[12px] color-red-600">异常/空数据（建议优先处理）</div>
            <div className="mt-2 bg-white rounded-[10px] overflow-hidden border border-neutral-100">
              {problematicGroups.map((g) => {
                const counts = groupCounts(g.ids)
                const enabledGroupSummary = `${counts.enabled} / ${counts.total}`
                const opened = openSet.has(g.name)
                return (
                  <div key={g.name} className="border-b border-neutral-100 last:border-b-0">
                    <button
                      type="button"
                      className="w-full px-3 py-3 flex items-center gap-3 text-left"
                      onClick={() => toggleGroupOpen(g.name)}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-[14px] font-bold color-neutral-900 truncate">{g.name}</div>
                        <div className="text-[12px] color-neutral-500">
                          启用
                          <span className="ml-1">
                            {enabledGroupSummary}
                          </span>
                        </div>
                      </div>
                      {counts.healthCounts.fail > 0 && (
                        <span className="shrink-0 px-2 h-7 rounded-full text-[11px] flex items-center bg-red-50 text-red-700">
                          {`FAIL ${counts.healthCounts.fail}`}
                        </span>
                      )}
                      {counts.healthCounts.empty > 0 && (
                        <span className="shrink-0 px-2 h-7 rounded-full text-[11px] flex items-center bg-amber-50 text-amber-700">
                          {`EMPTY ${counts.healthCounts.empty}`}
                        </span>
                      )}
                      {counts.enabled > 0 && (
                        <button
                          type="button"
                          className="shrink-0 px-3 h-8 rounded-full bg-neutral-900 text-white text-[12px]"
                          onClick={(e) => {
                            e.stopPropagation()
                            setGroupEnabled(g.ids, false)
                          }}
                        >
                          全停
                        </button>
                      )}
                      {counts.disabled > 0 && (
                        <button
                          type="button"
                          className="shrink-0 px-3 h-8 rounded-full bg-neutral-100 text-[12px]"
                          onClick={(e) => {
                            e.stopPropagation()
                            setGroupEnabled(g.ids, true)
                          }}
                        >
                          全启
                        </button>
                      )}
                      <span className={$(["shrink-0 i-ph:caret-down-bold text-[14px]", opened ? "rotate-180" : ""])} />
                    </button>
                    {opened && (
                      <ul className="px-3 pb-2">
                        {g.ids.map((id) => {
                          const isDisabled = disabledSet.has(id)
                          return (
                            <li key={id} className="py-2 flex items-center gap-3">
                              <div className="min-w-0 flex-1">
                                <div className={$([
                                  "text-[13px] truncate",
                                  isDisabled ? "color-neutral-400" : "color-neutral-900",
                                ])}
                                >
                                  {sources[id].desc || id}
                                </div>
                                <div className="text-[11px] color-neutral-400 truncate">{id}</div>
                                {renderHealthMessage(id)}
                              </div>
                              {renderBadge(id)}
                              <button
                                type="button"
                                className={$([
                                  "shrink-0 px-3 h-8 rounded-full text-[12px]",
                                  isDisabled ? "bg-neutral-100" : "bg-neutral-900 text-white",
                                ])}
                                onClick={() => setOne(id, isDisabled)}
                              >
                                {isDisabled ? "启用" : "停用"}
                              </button>
                            </li>
                          )
                        })}
                      </ul>
                    )}
                  </div>
                )
              })}
            </div>
          </>
        )}

        <div className="mt-4 text-[12px] color-neutral-500">正常</div>
        <div className="mt-2 bg-white rounded-[10px] overflow-hidden border border-neutral-100">
          {healthyGroups.map((g) => {
            const counts = groupCounts(g.ids)
            const enabledGroupSummary = `${counts.enabled} / ${counts.total}`
            const opened = openSet.has(g.name)
            return (
              <div key={g.name} className="border-b border-neutral-100 last:border-b-0">
                <button
                  type="button"
                  className="w-full px-3 py-3 flex items-center gap-3 text-left"
                  onClick={() => toggleGroupOpen(g.name)}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-[14px] font-bold color-neutral-900 truncate">{g.name}</div>
                    <div className="text-[12px] color-neutral-500">
                      启用
                      <span className="ml-1">
                        {enabledGroupSummary}
                      </span>
                    </div>
                  </div>
                  {counts.healthCounts.ok > 0 && (
                    <span className="shrink-0 px-2 h-7 rounded-full text-[11px] flex items-center bg-green-50 text-green-700">
                      {`OK ${counts.healthCounts.ok}`}
                    </span>
                  )}
                  {counts.enabled > 0 && (
                    <button
                      type="button"
                      className="shrink-0 px-3 h-8 rounded-full bg-neutral-900 text-white text-[12px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        setGroupEnabled(g.ids, false)
                      }}
                    >
                      全停
                    </button>
                  )}
                  {counts.disabled > 0 && (
                    <button
                      type="button"
                      className="shrink-0 px-3 h-8 rounded-full bg-neutral-100 text-[12px]"
                      onClick={(e) => {
                        e.stopPropagation()
                        setGroupEnabled(g.ids, true)
                      }}
                    >
                      全启
                    </button>
                  )}
                  <span className={$(["shrink-0 i-ph:caret-down-bold text-[14px]", opened ? "rotate-180" : ""])} />
                </button>
                {opened && (
                  <ul className="px-3 pb-2">
                    {g.ids.map((id) => {
                      const isDisabled = disabledSet.has(id)
                      return (
                        <li key={id} className="py-2 flex items-center gap-3">
                          <div className="min-w-0 flex-1">
                            <div className={$([
                              "text-[13px] truncate",
                              isDisabled ? "color-neutral-400" : "color-neutral-900",
                            ])}
                            >
                              {sources[id].desc || id}
                            </div>
                            <div className="text-[11px] color-neutral-400 truncate">{id}</div>
                            {renderHealthMessage(id)}
                          </div>
                          {renderBadge(id)}
                          <button
                            type="button"
                            className={$([
                              "shrink-0 px-3 h-8 rounded-full text-[12px]",
                              isDisabled ? "bg-neutral-100" : "bg-neutral-900 text-white",
                            ])}
                            onClick={() => setOne(id, isDisabled)}
                          >
                            {isDisabled ? "启用" : "停用"}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </div>
            )
          })}
        </div>

        <div className="mt-6 pb-6" />
      </div>
    </div>
  )
}
