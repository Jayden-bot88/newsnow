import type { BaseEventPayload, ElementDragType } from "@atlaskit/pragmatic-drag-and-drop/dist/types/internal-types"
import type { ColumnID } from "@shared/types"
import { metadata } from "@shared/metadata"
import { createFileRoute } from "@tanstack/react-router"
import $ from "clsx"
import { useCallback, useMemo, useRef, useState } from "react"
import { useAtom } from "jotai"

import { DndContext } from "~/components/common/dnd"
import { useSortable } from "~/components/common/dnd/useSortable"
import { enabledColumnsAtom } from "~/atoms"

export const Route = createFileRoute("/channels")({
  component: ChannelsPage,
})

const LONG_PRESS_MS = 350

function ChannelsPage() {
  const nav = Route.useNavigate()
  const [enabled, setEnabled] = useAtom(enabledColumnsAtom)
  const [editing, setEditing] = useState(false)

  const allColumns = useMemo(() => {
    return Object.keys(metadata) as ColumnID[]
  }, [])

  const enabledUnique = useMemo(() => {
    const seen = new Set<ColumnID>()
    const list = enabled
      .filter(k => Object.prototype.hasOwnProperty.call(metadata, k))
      .filter((k) => {
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })

    if (!list.includes("hottest")) list.unshift("hottest")
    // Toutiao-like: keep 推荐 first.
    if (list[0] !== "hottest") {
      const idx = list.indexOf("hottest")
      if (idx >= 0) {
        const next = [...list]
        next.splice(idx, 1)
        next.unshift("hottest")
        return next
      }
    }

    return list
  }, [enabled])

  const available = useMemo(() => {
    const set = new Set(enabledUnique)
    return allColumns
      .filter(k => !set.has(k))
      .sort((a, b) => metadata[a].name.localeCompare(metadata[b].name, "zh-Hans-CN"))
  }, [allColumns, enabledUnique])

  const setEnabledSafe = useCallback((next: ColumnID[]) => {
    // Persist a minimal, de-duped list; navbar also guards.
    const seen = new Set<ColumnID>()
    const cleaned = next
      .filter(k => Object.prototype.hasOwnProperty.call(metadata, k))
      .filter((k) => {
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
    setEnabled(cleaned)
  }, [setEnabled])

  const addColumn = useCallback((id: ColumnID) => {
    if (enabledUnique.includes(id)) return
    setEnabledSafe([...enabledUnique, id])
  }, [enabledUnique, setEnabledSafe])

  const removeColumn = useCallback((id: ColumnID) => {
    if (id === "hottest") return
    setEnabledSafe(enabledUnique.filter(k => k !== id))
  }, [enabledUnique, setEnabledSafe])

  const onDropTargetChange = useCallback(({ location, source }: BaseEventPayload<ElementDragType>) => {
    if (!editing) return
    const target = location.current.dropTargets[0]
    if (!target?.data || !source?.data) return
    const fromId = source.data.id as ColumnID
    const toId = target.data.id as ColumnID
    if (fromId === "hottest") return
    if (toId === "hottest") return

    const fromIndex = enabledUnique.indexOf(fromId)
    const toIndex = enabledUnique.indexOf(toId)
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return

    const next = [...enabledUnique]
    const [moved] = next.splice(fromIndex, 1)
    next.splice(toIndex, 0, moved)
    setEnabledSafe(next)
  }, [editing, enabledUnique, setEnabledSafe])

  const goColumn = useCallback((id: ColumnID) => {
    nav({
      to: id === "hottest" ? "/" : "/c/$column",
      params: id === "hottest" ? undefined : { column: id },
    })
  }, [nav])

  return (
    <div className="bg-[var(--tt-bg)] min-h-[100vh]">
      <div className="sticky top-0 z-10 bg-white border-b border-[var(--tt-border)]">
        <div className="px-3 pt-[calc(env(safe-area-inset-top,0px)+4px)]">
          <div className="h-11 flex items-center gap-3">
            <button
              type="button"
              className="i-ph:caret-left-bold text-[18px] text-neutral-800/80 btn"
              aria-label="Back"
              onClick={() => nav({ to: "/" })}
            />
            <div className="flex-1 text-center text-[16px] font-semibold color-[var(--tt-text)]">
              频道管理
            </div>
            <button
              type="button"
              className="text-[14px] font-semibold color-[var(--tt-red)] btn"
              onClick={() => setEditing(v => !v)}
            >
              {editing ? "完成" : "编辑"}
            </button>
          </div>
        </div>
      </div>

      <div className="px-[var(--tt-gap)] pt-3 pb-6">
        <div className="text-[12px] color-neutral-500">
          {editing
            ? "拖动排序；点「-」移除（推荐不可移除）"
            : "点击频道可直接进入；长按频道可进入编辑"}
        </div>

        <DndContext onDropTargetChange={onDropTargetChange}>
          <section className="mt-2 bg-white rounded-[10px] px-[var(--tt-gap)] py-3">
            <div className="text-[14px] font-semibold color-[var(--tt-text)]">我的频道</div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              {enabledUnique.map(id => (
                <ChannelChip
                  key={id}
                  id={id}
                  editing={editing}
                  onRequestEdit={() => setEditing(true)}
                  onRemove={() => removeColumn(id)}
                  onGo={() => goColumn(id)}
                />
              ))}
            </div>
          </section>
        </DndContext>

        <section className="mt-3 bg-white rounded-[10px] px-[var(--tt-gap)] py-3">
          <div className="text-[14px] font-semibold color-[var(--tt-text)]">更多频道</div>
          <div className="mt-3 grid grid-cols-4 gap-2">
            {available.map(id => (
              <button
                key={id}
                type="button"
                className={$([
                  "h-9 rounded-[10px] bg-[var(--tt-search)]",
                  "text-[13px] color-[var(--tt-text)]",
                  "flex items-center justify-center gap-1",
                  "active:bg-neutral-200 transition-colors",
                ])}
                onClick={() => addColumn(id)}
              >
                <span className="i-ph:plus-bold text-[12px] color-neutral-700/70" />
                <span className="truncate">{displayColumnName(id)}</span>
              </button>
            ))}
          </div>

          <div className="mt-3">
            <button
              type="button"
              className="h-9 px-5 rounded-full bg-white border border-[var(--tt-border)] text-[13px] color-[var(--tt-text)] active:bg-neutral-100"
              onClick={() => setEnabledSafe(["focus", "hottest", "china", "tech", "finance", "world", "realtime"] as ColumnID[])}
            >
              重置默认频道
            </button>
          </div>
        </section>
      </div>
    </div>
  )
}

function ChannelChip({
  id,
  editing,
  onRequestEdit,
  onRemove,
  onGo,
}: {
  id: ColumnID
  editing: boolean
  onRequestEdit: () => void
  onRemove: () => void
  onGo: () => void
}) {
  const {
    setHandleRef,
    setNodeRef,
    isDragging,
  } = useSortable({ id })

  const setButtonRef = useCallback((el: HTMLButtonElement | null) => {
    setNodeRef(el)
  }, [setNodeRef])

  const required = id === "hottest"
  const name = displayColumnName(id)

  const pressTimerRef = useRef<number | null>(null)
  const longPressTriggeredRef = useRef(false)

  const clearPressTimer = useCallback(() => {
    if (pressTimerRef.current) {
      window.clearTimeout(pressTimerRef.current)
      pressTimerRef.current = null
    }
  }, [])

  const onPointerDown = useCallback(() => {
    if (editing || required) return
    longPressTriggeredRef.current = false
    clearPressTimer()
    pressTimerRef.current = window.setTimeout(() => {
      longPressTriggeredRef.current = true
      onRequestEdit()
    }, LONG_PRESS_MS)
  }, [clearPressTimer, editing, onRequestEdit, required])

  const onPointerUp = useCallback(() => {
    clearPressTimer()
  }, [clearPressTimer])

  const onPointerCancel = useCallback(() => {
    clearPressTimer()
  }, [clearPressTimer])

  return (
    <button
      ref={setButtonRef}
      type="button"
      className={$([
        "relative h-9 rounded-[10px]",
        "border border-[var(--tt-border)] bg-white",
        "text-[13px] color-[var(--tt-text)]",
        "flex items-center justify-center",
        "active:bg-neutral-50 transition-colors",
        isDragging && "op-60",
      ])}
      onPointerDown={onPointerDown}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onClick={() => {
        // If we just triggered long-press, ignore the click that follows.
        if (longPressTriggeredRef.current) return
        if (editing) {
          if (!required) onRemove()
          return
        }
        onGo()
      }}
    >
      <span className={$([
        "truncate px-2",
        editing && !required && "pr-6",
      ])}
      >
        {name}
      </span>

      {editing && !required && (
        <span
          ref={setHandleRef}
          className="absolute right-1 top-1/2 -translate-y-1/2 i-ph:dots-six-vertical-duotone text-[16px] color-neutral-800/70"
          aria-hidden="true"
        />
      )}

      {editing && !required && (
        <span className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-[var(--tt-red)] text-white text-[12px] flex items-center justify-center">
          <span className="i-ph:minus-bold text-[10px]" />
        </span>
      )}
    </button>
  )
}

function displayColumnName(id: ColumnID) {
  if (id === "hottest") return "推荐"
  return metadata[id].name
}
