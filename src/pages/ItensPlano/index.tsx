import { useState, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, ArrowLeft, Download, ChevronLeft, ChevronRight } from 'lucide-react'
import * as xlsx from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useActivePlan } from '../../contexts/ActivePlanContext'
import ImportExcel from './ImportExcel'
import ClassGrid from './ClassGrid'
import { downloadFile } from '../../lib/fileUtils'

// ── Types ──────────────────────────────────────────────────────────────────

export interface PlanItem {
  id: number
  id_plano_contas: number
  conta: string
  reduzido: number
  desc_conta: string
  fl_ativa: boolean
  id_class_subgrupo: number | null
  id_class_bp_dre: number | null
  id_class_nota_explicativa: number | null
  id_class_papel_trabalho: number | null
}

export interface ClassSubgrupo {
  id: number
  sigla_subgrupo: string
  desc_subgrupo: string | null
}

export interface ClassBpDre {
  id: number
  desc_bp_dre: string
}

export interface ClassNe {
  id: number
  desc_ne: string
}

export interface ClassPapel {
  id: number
  sigla_papel: string
  desc_papel: string | null
}

type PageSize = 50 | 500 | 1000

// ── Progress bar ───────────────────────────────────────────────────────────

function ProgressBar({ value, max }: { value: number; max: number }) {
  const pct = max === 0 ? 0 : Math.round((value / max) * 100)
  return (
    <div className="flex items-center gap-3 min-w-0">
      <div className="flex-1 bg-gray-200 rounded-full h-1.5 min-w-0">
        <div
          className="bg-blue-500 h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-xs text-gray-500 whitespace-nowrap flex-shrink-0">
        {value}/{max} classificada{max !== 1 ? 's' : ''} ({pct}%)
      </span>
    </div>
  )
}

// ── Pagination ─────────────────────────────────────────────────────────────

function Pagination({
  page,
  total,
  pageSize,
  onPage,
  onPageSize,
}: {
  page: number
  total: number
  pageSize: PageSize
  onPage: (p: number) => void
  onPageSize: (s: PageSize) => void
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const from = Math.min((page - 1) * pageSize + 1, total)
  const to = Math.min(page * pageSize, total)

  return (
    <div className="flex items-center justify-between px-6 py-2.5 border-t border-gray-100 bg-white flex-shrink-0 text-sm">
      <div className="flex items-center gap-3 text-gray-600">
        <span className="text-xs text-gray-500">Registros por página:</span>
        <div className="flex items-center gap-1">
          {([50, 500, 1000] as PageSize[]).map((size) => (
            <button
              key={size}
              onClick={() => onPageSize(size)}
              className={`px-2.5 py-0.5 rounded text-xs font-medium transition-colors ${
                pageSize === size
                  ? 'bg-blue-100 text-blue-700'
                  : 'hover:bg-gray-100 text-gray-500'
              }`}
            >
              {size}
            </button>
          ))}
        </div>
        {total > 0 && (
          <span className="text-xs text-gray-400">
            {from}–{to} de {total}
          </span>
        )}
      </div>
      <div className="flex items-center gap-0.5">
        <button
          onClick={() => onPage(1)}
          disabled={page === 1}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
          title="Primeira página"
        >
          <ChevronLeft size={14} className="inline" />
          <ChevronLeft size={14} className="inline -ml-2" />
        </button>
        <button
          onClick={() => onPage(page - 1)}
          disabled={page === 1}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
          title="Página anterior"
        >
          <ChevronLeft size={14} />
        </button>
        <span className="px-3 py-0.5 text-xs text-gray-600 min-w-[4rem] text-center">
          {page} / {totalPages}
        </span>
        <button
          onClick={() => onPage(page + 1)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
          title="Próxima página"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={() => onPage(totalPages)}
          disabled={page >= totalPages}
          className="p-1 rounded hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed text-gray-600"
          title="Última página"
        >
          <ChevronRight size={14} className="inline" />
          <ChevronRight size={14} className="inline -ml-2" />
        </button>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function ItensPlano(): JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activePlan } = useActivePlan()
  const planId = Number(id)

  const [items, setItems] = useState<PlanItem[]>([])
  const savingCountRef = useRef<Map<number, number>>(new Map())
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())

  const [importOpen, setImportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [onlyActive, setOnlyActive] = useState(false)
  const [pageSize, setPageSize] = useState<PageSize>(50)
  const [page, setPage] = useState(1)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search), 300)
    return () => clearTimeout(t)
  }, [search])

  // Reset to page 1 when filters or page size change
  useEffect(() => {
    setPage(1)
  }, [debouncedSearch, onlyPending, onlyActive, pageSize])

  // ── Fetch paginated items (server-side) ──────────────────────────────────
  const { data: pagedData, isLoading: loadingItems } = useQuery({
    queryKey: ['plano_contas_itens', planId, page, pageSize, debouncedSearch, onlyPending, onlyActive],
    queryFn: async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = supabase
        .from('plano_contas_itens')
        .select('*', { count: 'exact' })
        .eq('id_plano_contas', planId)
        .order('conta')

      if (onlyActive) q = q.eq('fl_ativa', true)
      if (onlyPending)
        q = q.or(
          'id_class_subgrupo.is.null,id_class_bp_dre.is.null,id_class_nota_explicativa.is.null,id_class_papel_trabalho.is.null',
        )
      if (debouncedSearch.trim()) {
        const s = debouncedSearch.trim()
        const num = Number(s)
        if (!isNaN(num) && s !== '')
          q = q.or(`conta.ilike.%${s}%,desc_conta.ilike.%${s}%,reduzido.eq.${num}`)
        else
          q = q.or(`conta.ilike.%${s}%,desc_conta.ilike.%${s}%`)
      }

      const from = (page - 1) * pageSize
      q = q.range(from, from + pageSize - 1)

      const { data, error, count } = await q
      if (error) throw error
      return { items: data as PlanItem[], total: count ?? 0 }
    },
    enabled: !!planId,
  })

  useEffect(() => {
    if (pagedData?.items) setItems(pagedData.items)
  }, [pagedData])

  // ── Stats for progress bar (always over full plan, ignores filters) ───────
  const { data: stats } = useQuery({
    queryKey: ['plano_contas_itens_stats', planId],
    queryFn: async () => {
      const [{ count: total }, { count: classified }] = await Promise.all([
        supabase
          .from('plano_contas_itens')
          .select('*', { count: 'exact', head: true })
          .eq('id_plano_contas', planId),
        supabase
          .from('plano_contas_itens')
          .select('*', { count: 'exact', head: true })
          .eq('id_plano_contas', planId)
          .not('id_class_subgrupo', 'is', null)
          .not('id_class_bp_dre', 'is', null)
          .not('id_class_nota_explicativa', 'is', null)
          .not('id_class_papel_trabalho', 'is', null),
      ])
      return { total: total ?? 0, classified: classified ?? 0 }
    },
    enabled: !!planId,
  })

  // ── Fetch lookup tables ──────────────────────────────────────────────────
  const { data: subgrupos = [] } = useQuery({
    queryKey: ['class_subgrupo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_subgrupo')
        .select('id, sigla_subgrupo, desc_subgrupo')
        .order('sigla_subgrupo')
      if (error) throw error
      return data as ClassSubgrupo[]
    },
  })

  const { data: bpDreOptions = [] } = useQuery({
    queryKey: ['class_bp_dre'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_bp_dre')
        .select('id, desc_bp_dre')
        .order('desc_bp_dre')
      if (error) throw error
      return data as ClassBpDre[]
    },
  })

  const { data: neOptions = [] } = useQuery({
    queryKey: ['class_nota_explicativa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_nota_explicativa')
        .select('id, desc_ne')
        .order('desc_ne')
      if (error) throw error
      return data as ClassNe[]
    },
  })

  const { data: papelOptions = [] } = useQuery({
    queryKey: ['class_papel_trabalho'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_papel_trabalho')
        .select('id, sigla_papel, desc_papel')
        .order('sigla_papel')
      if (error) throw error
      return data as ClassPapel[]
    },
  })

  // ── Auto-save ────────────────────────────────────────────────────────────
  const handleUpdate = async (rowId: number, field: string, value: number | null) => {
    // Optimistic update on current page
    setItems((prev) =>
      prev.map((item) => (item.id === rowId ? { ...item, [field]: value } : item))
    )

    savingCountRef.current.set(rowId, (savingCountRef.current.get(rowId) ?? 0) + 1)
    setSavingIds((prev) => new Set([...prev, rowId]))

    try {
      const { error } = await supabase
        .from('plano_contas_itens')
        .update({ [field]: value })
        .eq('id', rowId)
      if (error) {
        console.error('Erro ao salvar linha:', error)
      } else {
        queryClient.invalidateQueries({ queryKey: ['plano_contas_itens_stats', planId] })
      }
    } finally {
      const remaining = (savingCountRef.current.get(rowId) ?? 1) - 1
      if (remaining <= 0) {
        savingCountRef.current.delete(rowId)
        setSavingIds((prev) => {
          const next = new Set(prev)
          next.delete(rowId)
          return next
        })
      } else {
        savingCountRef.current.set(rowId, remaining)
      }
    }
  }

  const handleImportClose = (imported: boolean) => {
    setImportOpen(false)
    if (imported) {
      queryClient.invalidateQueries({ queryKey: ['plano_contas_itens', planId] })
      queryClient.invalidateQueries({ queryKey: ['plano_contas_itens_stats', planId] })
    }
  }

  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (!activePlan) return
    setExporting(true)
    try {
      // Export always fetches all items regardless of current pagination/filters
      const BATCH = 1000
      const allItems: PlanItem[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('plano_contas_itens')
          .select('*')
          .eq('id_plano_contas', planId)
          .order('conta')
          .range(from, from + BATCH - 1)
        if (error) throw error
        if (data) allItems.push(...(data as PlanItem[]))
        if (!data || data.length < BATCH) break
        from += BATCH
      }

      if (allItems.length === 0) return

      const subgrupoMap = new Map(subgrupos.map((s) => [s.id, s.desc_subgrupo ?? s.sigla_subgrupo]))
      const bpDreMap = new Map(bpDreOptions.map((b) => [b.id, b.desc_bp_dre]))
      const neMap = new Map(neOptions.map((n) => [n.id, n.desc_ne]))
      const papelMap = new Map(papelOptions.map((p) => [p.id, p.desc_papel ?? p.sigla_papel]))

      const rows = allItems.map((r) => ({
        tam: r.conta.length,
        conta: r.conta,
        reduzido: r.reduzido,
        desc_conta: r.desc_conta,
        id_class_subgrupo: r.id_class_subgrupo ?? '',
        desc_class_subgrupo: r.id_class_subgrupo ? (subgrupoMap.get(r.id_class_subgrupo) ?? '') : '',
        id_class_bp_dre: r.id_class_bp_dre ?? '',
        desc_class_bp_dre: r.id_class_bp_dre ? (bpDreMap.get(r.id_class_bp_dre) ?? '') : '',
        id_class_nota_explicativa: r.id_class_nota_explicativa ?? '',
        desc_class_nota_explicativa: r.id_class_nota_explicativa ? (neMap.get(r.id_class_nota_explicativa) ?? '') : '',
        id_class_papel_trabalho: r.id_class_papel_trabalho ?? '',
        desc_class_papel_trabalho: r.id_class_papel_trabalho ? (papelMap.get(r.id_class_papel_trabalho) ?? '') : '',
      }))

      const ws = xlsx.utils.json_to_sheet(rows)
      const wb = xlsx.utils.book_new()
      xlsx.utils.book_append_sheet(wb, ws, 'Plano de Contas')

      const buffer = xlsx.write(wb, { type: 'array', bookType: 'xlsx' }) as Uint8Array
      const idPadded = String(activePlan.id).padStart(2, '0')
      const defaultName = `ID${idPadded} - ${activePlan.nome}.xlsx`

      downloadFile(defaultName, buffer)
    } finally {
      setExporting(false)
    }
  }

  const totalCount = pagedData?.total ?? 0
  const filtersActive = debouncedSearch || onlyPending || onlyActive

  return (
    <div className="flex flex-col h-full">

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="flex-shrink-0 px-6 py-4 bg-white border-b border-gray-100">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <button
              onClick={() => navigate('/planos')}
              className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-600 mb-1 transition-colors"
            >
              <ArrowLeft size={11} />
              Planos de Contas
            </button>
            <h2 className="text-lg font-bold text-gray-800 truncate">
              {activePlan?.nome ?? `Plano #${id}`}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={handleExport}
              disabled={exporting || (stats?.total ?? 0) === 0}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors disabled:opacity-40"
            >
              <Download size={14} />
              {exporting ? 'Exportando...' : 'Exportar Excel'}
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 border border-gray-300 text-gray-700 px-3 py-1.5 rounded-lg text-sm hover:bg-gray-50 transition-colors"
            >
              <Upload size={14} />
              Importar Excel
            </button>
          </div>
        </div>

        {/* Progress bar */}
        {stats && stats.total > 0 && (
          <div className="mt-3">
            <ProgressBar value={stats.classified} max={stats.total} />
          </div>
        )}

        {/* Filters */}
        <div className="flex items-center gap-4 mt-3 flex-wrap">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conta, reduzido ou descrição..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-72"
          />
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyPending}
              onChange={(e) => setOnlyPending(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Somente pendentes
          </label>
          <label className="flex items-center gap-1.5 text-sm text-gray-600 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={onlyActive}
              onChange={(e) => setOnlyActive(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            Somente ativas
          </label>
          {filtersActive && (
            <span className="text-xs text-gray-400">
              {totalCount} resultado{totalCount !== 1 ? 's' : ''}
            </span>
          )}
        </div>
      </div>

      {/* ── Grid ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-hidden bg-white">
        {loadingItems ? (
          <div className="flex items-center justify-center h-full">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-gray-400">
            {filtersActive ? (
              <p className="text-sm">Nenhuma conta encontrada para os filtros aplicados.</p>
            ) : (
              <>
                <p className="text-sm">Nenhuma conta encontrada neste plano.</p>
                <button
                  onClick={() => setImportOpen(true)}
                  className="flex items-center gap-1.5 text-blue-600 text-sm hover:underline"
                >
                  <Upload size={14} />
                  Importar via Excel
                </button>
              </>
            )}
          </div>
        ) : (
          <ClassGrid
            rows={items}
            savingIds={savingIds}
            subgrupos={subgrupos}
            bpDreOptions={bpDreOptions}
            neOptions={neOptions}
            papelOptions={papelOptions}
            onUpdate={handleUpdate}
          />
        )}
      </div>

      {/* ── Pagination ─────────────────────────────────────────────────── */}
      {totalCount > 0 && (
        <Pagination
          page={page}
          total={totalCount}
          pageSize={pageSize}
          onPage={setPage}
          onPageSize={(s) => { setPageSize(s); setPage(1) }}
        />
      )}

      <ImportExcel open={importOpen} onClose={handleImportClose} />
    </div>
  )
}
