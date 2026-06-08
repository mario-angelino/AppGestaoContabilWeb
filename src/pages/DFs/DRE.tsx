import { useState } from 'react'
import { supabase } from '../../lib/supabase'
import { calcularDF, type PlanoItem, type BpDreSubgrupoLink } from '../../lib/dfUtils'
import { gerarDRE, type DFParams } from '../../lib/gerarDFpdf'
import DFWizard from './DFWizard'

async function fetchBalanceteItens(balanceteId: number): Promise<{ conta: string; saldo_atual: number }[]> {
  const PAGE = 1000
  const all: { conta: string; saldo_atual: number }[] = []
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from('balancete_itens')
      .select('conta, saldo_atual')
      .eq('balancete_id', balanceteId)
      .range(from, from + PAGE - 1)
    if (error) throw error
    all.push(...(data as { conta: string; saldo_atual: number }[]))
    if (data.length < PAGE) break
  }
  return all
}

async function fetchPlanoItens(planoContasId: number): Promise<PlanoItem[]> {
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

async function fetchLinks(): Promise<BpDreSubgrupoLink[]> {
  const { data, error } = await supabase
    .from('class_bp_dre_subgrupo')
    .select('id, indice, id_class_bp_dre, id_class_subgrupo, class_bp_dre(id, desc_bp_dre), class_subgrupo(id, sigla_subgrupo, desc_subgrupo)')
    .order('indice', { ascending: true, nullsFirst: false })
  if (error) throw error
  return data as unknown as BpDreSubgrupoLink[]
}

export default function DRE() {
  const [generating, setGenerating] = useState(false)

  const handleGenerate = async (params: DFParams) => {
    setGenerating(true)
    try {
      const [bItems2, planoItens, links] = await Promise.all([
        fetchBalanceteItens(params.periodo2.balanceteId),
        fetchPlanoItens(params.vigencia.plano_contas_id),
        fetchLinks(),
      ])

      const df1 = calcularDF(bItems2, planoItens, links)

      if (params.periodo1) {
        const bItems1 = await fetchBalanceteItens(params.periodo1.balanceteId)
        const df2 = calcularDF(bItems1, planoItens, links)
        // df2 is the earlier period, df1 is the later — swap so periodo1 appears first
        await gerarDRE(params, df2, df1)
      } else {
        await gerarDRE(params, df1)
      }
    } finally {
      setGenerating(false)
    }
  }

  return <DFWizard title="DRE — Demonstração do Resultado do Exercício" generating={generating} onGenerate={handleGenerate} />
}
