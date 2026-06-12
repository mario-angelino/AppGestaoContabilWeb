export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function fmtMoeda(v: number): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  return v < 0 ? `(${abs})` : abs
}

export function periodoLabel(p: { mes: number; ano: number }): string {
  return `${MESES[p.mes - 1]}/${p.ano}`
}

export interface SubgrupoVal {
  id: number
  sigla_subgrupo: string
  desc_subgrupo: string | null
}

export interface BpDreSubgrupoLink {
  id: number
  indice: number | null
  id_class_bp_dre: number
  id_class_subgrupo: number
  class_bp_dre: { id: number; desc_bp_dre: string } | null
  class_subgrupo: SubgrupoVal | null
}

export interface PlanoItem {
  conta: string
  reduzido: number
  id_class_bp_dre: number | null
  id_class_subgrupo: number | null
  class_bp_dre: { id: number; desc_bp_dre: string } | null
  class_subgrupo: { id: number; sigla_subgrupo: string; desc_subgrupo: string | null } | null
}

export interface GrupoVal {
  subgrupo: SubgrupoVal
  itens: { id: number; desc_bp_dre: string; saldo: number }[]
  subtotal: number
}

export interface CalcDFResult {
  gruposResultado: GrupoVal[]
  gruposBP: GrupoVal[]
  totalResultado: number
  totalAtivo: number
  totalPassivoEPL: number
}

export function isResultadoSg(sg: SubgrupoVal): boolean {
  return (
    sg.sigla_subgrupo.toUpperCase() === 'RESULTADO' ||
    (sg.desc_subgrupo ?? '').toUpperCase() === 'RESULTADO'
  )
}

export function isPLSg(sg: SubgrupoVal): boolean {
  const s = sg.sigla_subgrupo.toUpperCase()
  const d = (sg.desc_subgrupo ?? '').toLowerCase()
  return s === 'PL' || d.includes('patrimônio') || d.includes('patrimonio')
}

export function isAtivoSg(sg: SubgrupoVal): boolean {
  const d = (sg.desc_subgrupo ?? '').toLowerCase()
  const s = sg.sigla_subgrupo.toUpperCase()
  return d.includes('ativo') || s === 'AC' || s === 'ANC'
}

export function calcularDF(
  bItems: { conta: string; saldo_atual: number }[],
  planoItens: PlanoItem[],
  links: BpDreSubgrupoLink[]
): CalcDFResult {
  // ── Passo 1: classificar itens do N:N em três categorias ──────────────
  const dreSet = new Set<number>()
  const plSet = new Set<number>()

  type Entry = { bpId: number; desc: string; indice: number | null }
  const dreEntriesMap = new Map<number, Entry>()
  const plEntriesMap = new Map<number, Entry>()
  let plSubgrupo: SubgrupoVal | null = null
  const indiceMapBP = new Map<string, number | null>()

  for (const link of links) {
    if (!link.class_bp_dre || !link.class_subgrupo) continue
    if (isResultadoSg(link.class_subgrupo)) {
      dreSet.add(link.id_class_bp_dre)
      if (!dreEntriesMap.has(link.id_class_bp_dre))
        dreEntriesMap.set(link.id_class_bp_dre, { bpId: link.id_class_bp_dre, desc: link.class_bp_dre.desc_bp_dre, indice: link.indice })
    } else if (isPLSg(link.class_subgrupo)) {
      plSet.add(link.id_class_bp_dre)
      plSubgrupo = link.class_subgrupo
      if (!plEntriesMap.has(link.id_class_bp_dre))
        plEntriesMap.set(link.id_class_bp_dre, { bpId: link.id_class_bp_dre, desc: link.class_bp_dre.desc_bp_dre, indice: link.indice })
    } else {
      indiceMapBP.set(`${link.id_class_subgrupo}|${link.id_class_bp_dre}`, link.indice)
    }
  }

  // ── Passo 2: mapear conta → { bpId, sgId } ───────────────────────────
  type ItemClass = { bpId: number; sgId: number | null }
  const itemClassMap = new Map<string, ItemClass>()
  for (const pi of planoItens) {
    if (!pi.id_class_bp_dre) continue
    itemClassMap.set(pi.conta, { bpId: pi.id_class_bp_dre, sgId: pi.id_class_subgrupo })
  }

  // ── Passo 3: acumular saldos ──────────────────────────────────────────
  const saldoDRE = new Map<number, number>()
  const saldoPL = new Map<number, number>()
  const saldoBP = new Map<string, number>()

  for (const item of bItems) {
    const cls = itemClassMap.get(item.conta)
    if (!cls) continue
    if (dreSet.has(cls.bpId)) {
      saldoDRE.set(cls.bpId, (saldoDRE.get(cls.bpId) ?? 0) + item.saldo_atual)
    } else if (plSet.has(cls.bpId)) {
      saldoPL.set(cls.bpId, (saldoPL.get(cls.bpId) ?? 0) + item.saldo_atual)
    } else if (cls.sgId !== null) {
      const key = `${cls.sgId}|${cls.bpId}`
      saldoBP.set(key, (saldoBP.get(key) ?? 0) + item.saldo_atual)
    }
  }

  // ── Passo 4: seção RESULTADO ──────────────────────────────────────────
  const sortEntries = (a: Entry, b: Entry) => {
    if (a.indice != null && b.indice != null) return a.indice - b.indice
    if (a.indice != null) return -1
    if (b.indice != null) return 1
    return a.desc.localeCompare(b.desc)
  }
  const dreItems = Array.from(dreEntriesMap.values()).sort(sortEntries)
  const gruposResultado: GrupoVal[] = dreItems.length > 0 ? [{
    subgrupo: { id: -1, sigla_subgrupo: 'RESULTADO', desc_subgrupo: null },
    itens: dreItems.map(d => ({ id: d.bpId, desc_bp_dre: d.desc, saldo: saldoDRE.get(d.bpId) ?? 0 })),
    subtotal: dreItems.reduce((acc, d) => acc + (saldoDRE.get(d.bpId) ?? 0), 0),
  }] : []

  // ── Passo 5: seção PL ─────────────────────────────────────────────────
  const plItems = Array.from(plEntriesMap.values()).sort(sortEntries)
  const grupoPL: GrupoVal | null = plSubgrupo && plItems.length > 0 ? {
    subgrupo: plSubgrupo,
    itens: plItems.map(p => ({ id: p.bpId, desc_bp_dre: p.desc, saldo: saldoPL.get(p.bpId) ?? 0 })),
    subtotal: plItems.reduce((acc, p) => acc + (saldoPL.get(p.bpId) ?? 0), 0),
  } : null

  // ── Passo 6: seção AC/ANC/PC/PNC ─────────────────────────────────────
  type BpDreRow = { id: number; desc_bp_dre: string; saldo: number; indice: number | null }
  const grupoMapBP = new Map<number, { subgrupo: SubgrupoVal; itensMap: Map<number, BpDreRow>; subtotal: number }>()

  for (const pi of planoItens) {
    if (!pi.id_class_bp_dre || !pi.id_class_subgrupo || !pi.class_bp_dre || !pi.class_subgrupo) continue
    if (dreSet.has(pi.id_class_bp_dre) || plSet.has(pi.id_class_bp_dre)) continue

    const compositeKey = `${pi.id_class_subgrupo}|${pi.id_class_bp_dre}`
    if (!grupoMapBP.has(pi.id_class_subgrupo))
      grupoMapBP.set(pi.id_class_subgrupo, { subgrupo: pi.class_subgrupo, itensMap: new Map(), subtotal: 0 })
    const g = grupoMapBP.get(pi.id_class_subgrupo)!
    if (!g.itensMap.has(pi.id_class_bp_dre)) {
      const saldo = saldoBP.get(compositeKey) ?? 0
      g.itensMap.set(pi.id_class_bp_dre, { id: pi.id_class_bp_dre, desc_bp_dre: pi.class_bp_dre.desc_bp_dre, saldo, indice: indiceMapBP.get(compositeKey) ?? null })
      g.subtotal += saldo
    }
  }

  const gruposBP: GrupoVal[] = []
  for (const g of grupoMapBP.values()) {
    const sorted = Array.from(g.itensMap.values()).sort((a, b) => {
      if (a.indice != null && b.indice != null) return a.indice - b.indice
      if (a.indice != null) return -1
      if (b.indice != null) return 1
      return a.desc_bp_dre.localeCompare(b.desc_bp_dre)
    })
    gruposBP.push({ subgrupo: g.subgrupo, itens: sorted.map(({ id, desc_bp_dre, saldo }) => ({ id, desc_bp_dre, saldo })), subtotal: g.subtotal })
  }
  gruposBP.sort((a, b) => a.subgrupo.sigla_subgrupo.localeCompare(b.subgrupo.sigla_subgrupo))
  if (grupoPL) gruposBP.push(grupoPL)

  // ── Totais ────────────────────────────────────────────────────────────
  const totalResultado = gruposResultado[0]?.subtotal ?? 0
  let totalAtivo = 0
  let totalPassivoEPL = 0
  for (const g of gruposBP) {
    if (isAtivoSg(g.subgrupo)) totalAtivo += g.subtotal
    else totalPassivoEPL += g.subtotal
  }
  totalPassivoEPL += totalResultado

  return { gruposResultado, gruposBP, totalResultado, totalAtivo, totalPassivoEPL }
}
