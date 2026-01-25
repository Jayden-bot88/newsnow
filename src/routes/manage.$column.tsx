import { createFileRoute, redirect } from "@tanstack/react-router"
import { Column } from "~/components/column"

export const Route = createFileRoute("/manage/$column")({
  component: ManageComponent,
  params: {
    parse: (params) => {
      const column = fixedColumnIds.find(x => x === params.column.toLowerCase())
      if (!column) throw new Error(`"${params.column}" is not a valid column.`)
      return {
        column,
      }
    },
    stringify: params => params,
  },
  onError: (error) => {
    if (error?.routerCode === "PARSE_PARAMS") {
      throw redirect({ to: "/" })
    }
  },
})

function ManageComponent() {
  const { column } = Route.useParams()
  return (
    <div className="bg-white">
      <div className="px-3 py-2 text-[12px] color-neutral-500 border-b border-neutral-100">
        管理来源（拖拽排序）
      </div>
      <Column id={column} variant="manage" />
    </div>
  )
}
