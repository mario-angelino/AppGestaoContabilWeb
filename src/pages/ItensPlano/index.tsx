import { useState, useMemo, useEffect, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, ArrowLeft, Download } from 'lucide-react'
import * as xlsx from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useActivePlan } from '../../contexts/ActivePlanContext'
import ImportExcel from './ImportExcel'
import ClassGrid, { isClassified } from './ClassGrid'
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

// ── Page ───────────────────────────────────────────────────────────────────

export default function ItensPlano(): JSX.Element {
  const { id } = useParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activePlan } = useActivePlan()
  const planId = Number(id)

  const [items, setItems] = useState<PlanItem[]>([])
  // Track concurrent saves per row: rowId → pending count
  const savingCountRef = useRef<Map<number, number>>(new Map())
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set())

  const [importOpen, setImportOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [onlyPending, setOnlyPending] = useState(false)
  const [onlyActive, setOnlyActive] = useState(false)

  // ── Fetch items ──────────────────────────────────────────────────────────
  const { data: fetchedItems, isLoading: loadingItems } = useQuery({
    queryKey: ['plano_contas_itens', planId],
    queryFn: async () => {
      const PAGE = 1000
      const all: PlanItem[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('plano_contas_itens')
          .select('*')
          .eq('id_plano_contas', planId)
          .order('conta')
          .range(from, from + PAGE - 1)
        if (error) throw error
        if (data) all.push(...(data as PlanItem[]))
        if (!data || data.length < PAGE) break
        from += PAGE
      }
      return all
    },
    enabled: !!planId,
  })

  useEffect(() => {
    if (fetchedItems) setItems(fetchedItems)
  }, [fetchedItems])

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

  // ── Apply filters ────────────────────────────────────────────────────────
  const filteredItems = useMemo(() => {
    let result = items
    if (onlyActive) result = result.filter((r) => r.fl_ativa)
    if (onlyPending) result = result.filter((r) => !isClassified(r))
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(
        (r) =>
          r.conta.toLowerCase().includes(q) ||
          String(r.reduzido).includes(q) ||
          r.desc_conta.toLowerCase().includes(q)
      )
    }
    return result
  }, [items, onlyActive, onlyPending, search])

  const classifiedCount = useMemo(() => items.filter(isClassified).length, [items])

  // ── Auto-save ────────────────────────────────────────────────────────────
  const handleUpdate = async (rowId: number, field: string, value: number | null) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((item) => (item.id === rowId ? { ...item, [field]: value } : item))
    )

    // Track concurrent saves for same row
    savingCountRef.current.set(rowId, (savingCountRef.current.get(rowId) ?? 0) + 1)
    setSavingIds((prev) => new Set([...prev, rowId]))

    try {
      const { error } = await supabase
        .from('plano_contas_itens')
        .update({ [field]: value })
        .eq('id', rowId)
      if (error) console.error('Erro ao salvar linha:', error)
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
    }
  }

  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    if (!activePlan || items.length === 0) return
    setExporting(true)
    try {
      const subgrupoMap = new Map(subgrupos.map((s) => [s.id, s.desc_subgrupo ?? s.sigla_subgrupo]))
      const bpDreMap = new Map(bpDreOptions.map((b) => [b.id, b.desc_bp_dre]))
      const neMap = new Map(neOptions.map((n) => [n.id, n.desc_ne]))
      const papelMap = new Map(papelOptions.map((p) => [p.id, p.desc_papel ?? p.sigla_papel]))

      const rows = items.map((r) => ({
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

  const filtersActive = search || onlyPending || onlyActive

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
              disabled={exporting || items.length === 0}
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
        {items.length > 0 && (
          <div className="mt-3">
            <ProgressBar value={classifiedCount} max={items.length} />
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
              {filteredItems.length} resultado{filteredItems.length !== 1 ? 's' : ''}
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
            <p className="text-sm">Nenhuma conta encontrada neste plano.</p>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-1.5 text-blue-600 text-sm hover:underline"
            >
              <Upload size={14} />
              Importar via Excel
            </button>
          </div>
        ) : (
          <ClassGrid
            rows={filteredItems}
            savingIds={savingIds}
            subgrupos={subgrupos}
            bpDreOptions={bpDreOptions}
            neOptions={neOptions}
            papelOptions={papelOptions}
            onUpdate={handleUpdate}
          />
        )}
      </div>

      <ImportExcel open={importOpen} onClose={handleImportClose} />
    </div>
  )
}
