import { useMemo } from 'react'
import {
  useReactTable,
  getCoreRowModel,
  flexRender,
  type ColumnDef
} from '@tanstack/react-table'
import { Loader2, CheckCircle, AlertCircle } from 'lucide-react'
import type { PlanItem, ClassSubgrupo, ClassBpDre, ClassNe, ClassPapel } from './index'

interface Props {
  rows: PlanItem[]
  savingIds: Set<number>
  subgrupos: ClassSubgrupo[]
  bpDreOptions: ClassBpDre[]
  neOptions: ClassNe[]
  papelOptions: ClassPapel[]
  onUpdate: (rowId: number, field: string, value: number | null) => void
}

export function isClassified(item: PlanItem): boolean {
  return (
    item.id_class_subgrupo !== null &&
    item.id_class_bp_dre !== null &&
    item.id_class_nota_explicativa !== null &&
    item.id_class_papel_trabalho !== null
  )
}

function ClassDropdown({
  value,
  options,
  onChange,
  saving,
}: {
  value: number | null
  options: { value: number; label: string }[]
  onChange: (value: number | null) => void
  saving: boolean
}) {
  return (
    <div className="relative">
      <select
        value={value ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
        className={`w-full text-xs border rounded px-2 py-1 pr-6 focus:outline-none focus:ring-1 focus:ring-blue-400 bg-white appearance-none ${
          saving ? 'border-blue-300 text-gray-400' : 'border-gray-200 hover:border-gray-400 text-gray-700'
        }`}
      >
        <option value="">—</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {saving ? (
        <Loader2
          size={10}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 animate-spin text-blue-400 pointer-events-none"
        />
      ) : (
        <span className="absolute right-1.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none text-[10px]">
          ▾
        </span>
      )}
    </div>
  )
}

export default function ClassGrid({
  rows,
  savingIds,
  subgrupos,
  bpDreOptions,
  neOptions,
  papelOptions,
  onUpdate,
}: Props) {
  const subgrupoOpts = useMemo(
    () => subgrupos.map((s) => ({ value: s.id, label: s.sigla_subgrupo })),
    [subgrupos]
  )
  const bpDreOpts = useMemo(
    () => bpDreOptions.map((b) => ({ value: b.id, label: b.desc_bp_dre })),
    [bpDreOptions]
  )
  const neOpts = useMemo(
    () => neOptions.map((n) => ({ value: n.id, label: n.desc_ne })),
    [neOptions]
  )
  const papelOpts = useMemo(
    () => papelOptions.map((p) => ({ value: p.id, label: `${p.sigla_papel}${p.desc_papel ? ' — ' + p.desc_papel : ''}` })),
    [papelOptions]
  )

  const columns = useMemo<ColumnDef<PlanItem>[]>(
    () => [
      {
        id: 'status',
        size: 36,
        header: '',
        cell: ({ row }) =>
          isClassified(row.original) ? (
            <CheckCircle size={14} className="text-green-500 mx-auto" />
          ) : (
            <AlertCircle size={14} className="text-amber-400 mx-auto" />
          ),
      },
      {
        accessorKey: 'conta',
        header: 'Conta',
        size: 110,
        cell: ({ getValue }) => (
          <span className="font-mono text-xs">{getValue<string>()}</span>
        ),
      },
      {
        accessorKey: 'reduzido',
        header: 'Red.',
        size: 64,
        cell: ({ getValue }) => (
          <span className="text-xs text-gray-500">{getValue<number>()}</span>
        ),
      },
      {
        accessorKey: 'desc_conta',
        header: 'Descrição',
        size: 260,
        cell: ({ getValue }) => (
          <span
            className="block truncate text-xs"
            title={getValue<string>()}
            style={{ maxWidth: 260 }}
          >
            {getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'fl_ativa',
        header: 'Ativa',
        size: 52,
        cell: ({ getValue }) =>
          getValue<boolean>() ? (
            <span className="text-xs bg-green-100 text-green-700 px-1.5 py-0.5 rounded">
              Sim
            </span>
          ) : (
            <span className="text-xs bg-gray-100 text-gray-400 px-1.5 py-0.5 rounded">
              Não
            </span>
          ),
      },
      {
        id: 'id_class_subgrupo',
        header: 'Subgrupo',
        size: 150,
        cell: ({ row }) => (
          <ClassDropdown
            value={row.original.id_class_subgrupo}
            options={subgrupoOpts}
            onChange={(v) => onUpdate(row.original.id, 'id_class_subgrupo', v)}
            saving={savingIds.has(row.original.id)}
          />
        ),
      },
      {
        id: 'id_class_bp_dre',
        header: 'BP/DRE',
        size: 160,
        cell: ({ row }) => (
          <ClassDropdown
            value={row.original.id_class_bp_dre}
            options={bpDreOpts}
            onChange={(v) => onUpdate(row.original.id, 'id_class_bp_dre', v)}
            saving={savingIds.has(row.original.id)}
          />
        ),
      },
      {
        id: 'id_class_nota_explicativa',
        header: 'Nota Explic.',
        size: 170,
        cell: ({ row }) => (
          <ClassDropdown
            value={row.original.id_class_nota_explicativa}
            options={neOpts}
            onChange={(v) => onUpdate(row.original.id, 'id_class_nota_explicativa', v)}
            saving={savingIds.has(row.original.id)}
          />
        ),
      },
      {
        id: 'id_class_papel_trabalho',
        header: 'Papel Trab.',
        size: 180,
        cell: ({ row }) => (
          <ClassDropdown
            value={row.original.id_class_papel_trabalho}
            options={papelOpts}
            onChange={(v) => onUpdate(row.original.id, 'id_class_papel_trabalho', v)}
            saving={savingIds.has(row.original.id)}
          />
        ),
      },
    ],
    [subgrupoOpts, bpDreOpts, neOpts, papelOpts, savingIds, onUpdate]
  )

  const table = useReactTable({
    data: rows,
    columns,
    getCoreRowModel: getCoreRowModel(),
  })

  if (rows.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-sm text-gray-400">
        Nenhuma conta corresponde aos filtros.
      </div>
    )
  }

  return (
    <div className="h-full overflow-auto">
      <table className="w-full text-sm border-collapse" style={{ minWidth: 1080 }}>
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((hg) => (
            <tr key={hg.id} className="bg-gray-50 border-b border-gray-200">
              {hg.headers.map((header) => (
                <th
                  key={header.id}
                  style={{ width: header.column.getSize() }}
                  className="px-3 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap"
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody className="bg-white divide-y divide-gray-50">
          {table.getRowModel().rows.map((row) => {
            const classified = isClassified(row.original)
            return (
              <tr
                key={row.id}
                className={`transition-colors hover:bg-blue-50/50 ${
                  classified ? '' : 'bg-amber-50/20'
                }`}
              >
                {row.getVisibleCells().map((cell) => (
                  <td
                    key={cell.id}
                    style={{ width: cell.column.getSize() }}
                    className="px-3 py-1.5 align-middle"
                  >
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
