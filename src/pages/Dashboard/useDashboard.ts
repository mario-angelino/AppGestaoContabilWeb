import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'

export const MES_ABREV = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez']

export interface Empresa { id: number; abreviacao: string; razao_social: string }
export interface BpDreOption { id: number; desc_bp_dre: string }

export interface RawVigencia { id: number; empresa_id: number; plano_contas_id: number; ano_vigencia: number }
export interface RawBalancete { id: number; vigencia_id: number; mes: number; ano: number; dt_importacao: string | null; user_importacao: string | null }
export interface RawPlanoItem {
  id_plano_contas: number; reduzido: number
  id_class_bp_dre: number | null; id_class_subgrupo: number | null
  class_subgrupo: { sigla_subgrupo: string } | null
}
export interface RawBalanceteItem { balancete_id: number; reduzido: number; conta: string; descricao: string; saldo_anterior: number; val_debito: number; val_credito: number; saldo_atual: number }
export interface PlanoItemCls { sgId: number | null; bpDreId: number; sigla: string }

export interface MonthData {
  mes: number; mesAbrev: string
  AC: number; ANC: number; PC: number; PNC: number; PL: number; RESULTADO: number
}

export interface ImportStatus {
  mes: number; mesAbrev: string; imported: boolean
  dt_importacao: string | null; user_importacao: string | null
}

interface BpDreLink {
  id_class_bp_dre: number
  id_class_subgrupo: number
  class_subgrupo: { sigla_subgrupo: string; desc_subgrupo: string | null } | null
}

export function useEmpresasAcessiveis() {
  return useQuery({
    queryKey: ['dash_empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa').select('id, abreviacao, razao_social').order('abreviacao')
      if (error) throw error
      return data as Empresa[]
    }
  })
}

export function useBpDreList() {
  return useQuery({
    queryKey: ['class_bp_dre_list'],
    queryFn: async () => {
      const { data, error } = await supabase.from('class_bp_dre').select('id, desc_bp_dre').order('desc_bp_dre')
      if (error) throw error
      return data as BpDreOption[]
    }
  })
}

export function useAvailableYears(empresaIds: number[]) {
  return useQuery({
    queryKey: ['dash_anos', empresaIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas_vigencia').select('ano_vigencia').in('empresa_id', empresaIds)
      if (error) throw error
      const anos = [...new Set((data as { ano_vigencia: number }[]).map(r => r.ano_vigencia))].sort((a, b) => b - a)
      return anos
    },
    enabled: empresaIds.length > 0
  })
}

// Mirrors the logic in ValidacaoModal:
// DRE accounts are identified via class_bp_dre_subgrupo N:N (bp_dre linked to RESULTADO subgrupo),
// NOT via plano_contas_itens.id_class_subgrupo (which is null for most DRE accounts).
export function useDashboardData(ano: number, empresaIds: number[]) {
  const enabled = empresaIds.length > 0 && ano > 0

  // Fetch class_bp_dre_subgrupo once — static lookup table that classifies
  // each bp_dre position as RESULTADO, PL, or a balance-sheet subgrupo
  const { data: bpDreLinks = [], isLoading: lLinks } = useQuery({
    queryKey: ['dash_bp_dre_links'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_bp_dre_subgrupo')
        .select('id_class_bp_dre, id_class_subgrupo, class_subgrupo(sigla_subgrupo, desc_subgrupo)')
      if (error) throw error
      return data as unknown as BpDreLink[]
    }
  })

  const { data: vigencias = [], isLoading: l1 } = useQuery({
    queryKey: ['dash_vig', ano, empresaIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas_vigencia').select('id, empresa_id, plano_contas_id, ano_vigencia')
        .in('empresa_id', empresaIds).eq('ano_vigencia', ano)
      if (error) throw error
      return data as RawVigencia[]
    },
    enabled
  })

  const vigenciaIds = vigencias.map(v => v.id)
  const planoIds = [...new Set(vigencias.map(v => v.plano_contas_id))]

  const { data: balancetes = [], isLoading: l2 } = useQuery({
    queryKey: ['dash_bal', vigenciaIds],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete').select('id, vigencia_id, mes, ano, dt_importacao, user_importacao')
        .in('vigencia_id', vigenciaIds).order('mes')
      if (error) throw error
      return data as RawBalancete[]
    },
    enabled: vigenciaIds.length > 0
  })

  const balanceteIds = balancetes.map(b => b.id)

  // Filter by id_class_bp_dre (not subgrupo) — same as ValidacaoModal.
  // This includes DRE accounts that have id_class_subgrupo = null.
  const { data: planoItems = [], isLoading: l3 } = useQuery({
    queryKey: ['dash_plano', planoIds],
    queryFn: async () => {
      const PAGE = 1000
      const all: RawPlanoItem[] = []
      for (const pid of planoIds) {
        for (let from = 0; ; from += PAGE) {
          const { data, error } = await supabase
            .from('plano_contas_itens')
            .select('id_plano_contas, reduzido, id_class_bp_dre, id_class_subgrupo, class_subgrupo(sigla_subgrupo)')
            .eq('id_plano_contas', pid)
            .not('id_class_bp_dre', 'is', null)
            .range(from, from + PAGE - 1)
          if (error) throw error
          all.push(...(data as unknown as RawPlanoItem[]))
          if (data.length < PAGE) break
        }
      }
      return all
    },
    enabled: planoIds.length > 0
  })

  const { data: rawItems = [], isLoading: l4 } = useQuery({
    queryKey: ['dash_items', balanceteIds],
    queryFn: async () => {
      const PAGE = 1000
      const all: RawBalanceteItem[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('balancete_itens')
          .select('balancete_id, reduzido, conta, descricao, saldo_anterior, val_debito, val_credito, saldo_atual')
          .in('balancete_id', balanceteIds).range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...(data as RawBalanceteItem[]))
        if (data.length < PAGE) break
      }
      return all
    },
    enabled: balanceteIds.length > 0
  })

  const computed = useMemo(() => {
    // ── Build dreSet / plSet from class_bp_dre_subgrupo (same as ValidacaoModal) ──
    const dreSet = new Set<number>()
    const plSet  = new Set<number>()
    for (const link of bpDreLinks) {
      if (!link.class_subgrupo) continue
      const sigla = link.class_subgrupo.sigla_subgrupo.toUpperCase()
      const desc  = (link.class_subgrupo.desc_subgrupo ?? '').toLowerCase()
      if (sigla === 'RESULTADO' || desc === 'resultado') {
        dreSet.add(link.id_class_bp_dre)
      } else if (sigla === 'PL' || desc.includes('patrimônio') || desc.includes('patrimonio')) {
        plSet.add(link.id_class_bp_dre)
      }
    }

    // ── Build planoItemMap: `${plano_contas_id}|${reduzido}` → { sgId, bpDreId } ──
    const balanceteMap = new Map<number, RawBalancete>(balancetes.map(b => [b.id, b]))
    const vigenciaMap  = new Map<number, RawVigencia>(vigencias.map(v => [v.id, v]))
    const planoItemMap = new Map<string, PlanoItemCls>()
    for (const pi of planoItems) {
      if (pi.id_class_bp_dre === null) continue
      planoItemMap.set(`${pi.id_plano_contas}|${pi.reduzido}`, {
        sgId:    pi.id_class_subgrupo,
        bpDreId: pi.id_class_bp_dre,
        sigla:   (pi.class_subgrupo?.sigla_subgrupo ?? '').toUpperCase()
      })
    }

    // ── Aggregate balancete items by month ─────────────────────────────────────
    // Classification priority (mirrors ValidacaoModal):
    //   1. bpDreId ∈ dreSet → RESULTADO (DRE accounts)
    //   2. bpDreId ∈ plSet  → PL
    //   3. otherwise        → use sgId to classify as AC/ANC/PC/PNC
    type MesAgg = { AC: number; ANC: number; PC: number; PNC: number; PL: number; RESULTADO: number }
    const mesAggMap    = new Map<number, MesAgg>()
    const bpDreByMonth = new Map<number, Map<number, number>>()

    for (const item of rawItems) {
      const bal = balanceteMap.get(item.balancete_id)
      if (!bal) continue
      const vig = vigenciaMap.get(bal.vigencia_id)
      if (!vig) continue
      const cls = planoItemMap.get(`${vig.plano_contas_id}|${item.reduzido}`)
      if (!cls) continue
      const mes = bal.mes

      if (!mesAggMap.has(mes)) mesAggMap.set(mes, { AC: 0, ANC: 0, PC: 0, PNC: 0, PL: 0, RESULTADO: 0 })
      const agg = mesAggMap.get(mes)!

      if (dreSet.has(cls.bpDreId)) {
        agg.RESULTADO += item.saldo_atual
      } else if (plSet.has(cls.bpDreId)) {
        agg.PL += item.saldo_atual
      } else if (cls.sgId !== null) {
        switch (cls.sigla) {
          case 'AC':  agg.AC  += item.saldo_atual; break
          case 'ANC': agg.ANC += item.saldo_atual; break
          case 'PC':  agg.PC  += item.saldo_atual; break
          case 'PNC': agg.PNC += item.saldo_atual; break
        }
      }

      // bpDre drill-down aggregation
      if (!bpDreByMonth.has(mes)) bpDreByMonth.set(mes, new Map())
      const m = bpDreByMonth.get(mes)!
      m.set(cls.bpDreId, (m.get(cls.bpDreId) ?? 0) + item.saldo_atual)
    }

    const importedMeses = [...new Set(balancetes.map(b => b.mes))].sort((a, b) => a - b)
    const monthData: MonthData[] = importedMeses.map(mes => ({
      mes, mesAbrev: MES_ABREV[mes - 1],
      ...(mesAggMap.get(mes) ?? { AC: 0, ANC: 0, PC: 0, PNC: 0, PL: 0, RESULTADO: 0 })
    }))

    const balanceteByMes = new Map<number, RawBalancete>()
    for (const b of balancetes) { if (!balanceteByMes.has(b.mes)) balanceteByMes.set(b.mes, b) }

    const importStatus: ImportStatus[] = Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const bal = balanceteByMes.get(mes)
      return { mes, mesAbrev: MES_ABREV[i], imported: !!bal, dt_importacao: bal?.dt_importacao ?? null, user_importacao: bal?.user_importacao ?? null }
    })

    const latestMes = importedMeses[importedMeses.length - 1] ?? null
    const latestAgg = (latestMes ? mesAggMap.get(latestMes) : null) ?? { AC: 0, ANC: 0, PC: 0, PNC: 0, PL: 0, RESULTADO: 0 }

    return {
      monthData, importStatus, latestMes,
      totalAtivo:   latestAgg.AC + latestAgg.ANC,
      totalPassivo: latestAgg.PC + latestAgg.PNC,
      pl:           latestAgg.PL,
      resultado:    latestAgg.RESULTADO,
      bpDreByMonth,
      balanceteMap, vigenciaMap, planoItemMap,
      rawItems
    }
  }, [vigencias, balancetes, planoItems, rawItems, bpDreLinks])

  const isLoading = enabled
    ? (lLinks || l1 || (vigenciaIds.length > 0 && (l2 || l3)) || (balanceteIds.length > 0 && l4))
    : false

  return { ...computed, balancetes, vigencias, isLoading, hasData: computed.monthData.length > 0 }
}
