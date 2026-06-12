import { supabase } from './supabase'
import { type PlanoItem, type BpDreSubgrupoLink } from './dfUtils'

export type TipoDF = 'DRE' | 'BP' | 'DMPL' | 'DFC'

export interface PeriodoDF {
  balanceteId: number
  mes: number
  ano: number
  vigenciaId: number
  planoContasId: number
  anoVigencia: number
}

export interface DFParams {
  empresa: { id: number; abreviacao: string; razao_social: string }
  tipo: TipoDF
  periodo2: PeriodoDF
  periodo1: PeriodoDF | null
}

export interface BalanceteItem {
  conta: string
  saldo_atual: number
}

export async function fetchBalanceteItens(balanceteId: number): Promise<BalanceteItem[]> {
  const PAGE = 1000
  const all: BalanceteItem[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('balancete_itens')
      .select('conta, saldo_atual')
      .eq('balancete_id', balanceteId)
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as BalanceteItem[]))
    if (data.length < PAGE) break
  }
  return all
}

export async function fetchPlanoItens(planoContasId: number): Promise<PlanoItem[]> {
  const PAGE = 1000
  const all: PlanoItem[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('plano_contas_itens')
      .select('conta, reduzido, id_class_bp_dre, id_class_subgrupo, class_bp_dre(id, desc_bp_dre), class_subgrupo(id, sigla_subgrupo, desc_subgrupo)')
      .eq('id_plano_contas', planoContasId)
      .not('id_class_bp_dre', 'is', null)
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as unknown as PlanoItem[]))
    if (data.length < PAGE) break
  }
  return all
}

export async function fetchLinks(): Promise<BpDreSubgrupoLink[]> {
  const { data, error } = await supabase
    .from('class_bp_dre_subgrupo')
    .select('id, indice, id_class_bp_dre, id_class_subgrupo, class_bp_dre(id, desc_bp_dre), class_subgrupo(id, sigla_subgrupo, desc_subgrupo)')
    .order('indice', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data as unknown as BpDreSubgrupoLink[]
}
