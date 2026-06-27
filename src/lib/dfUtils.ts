export const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

export function fmtMoeda(v: number, decimals = 2): string {
  const abs = Math.abs(v).toLocaleString('pt-BR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })
  return v < 0 ? `(${abs})` : abs
}

export function periodoLabel(p: { mes: number; ano: number }): string {
  const ultimoDia = new Date(p.ano, p.mes, 0).getDate()
  return `${String(ultimoDia).padStart(2, '0')}/${String(p.mes).padStart(2, '0')}/${p.ano}`
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
  id_class_nota_explicativa: number | null
  class_bp_dre: { id: number; desc_bp_dre: string } | null
  class_subgrupo: { id: number; sigla_subgrupo: string; desc_subgrupo: string | null } | null
  class_nota_explicativa: { id: number; desc_ne: string } | null
}

export interface CampoCalculadoOperando {
  idClassBpDre: number | null
  idCampoCalculadoRef: number | null
  sinal: 1 | -1
}

export interface CampoCalculado {
  id: number
  nome: string
  tipoDf: 'DRE' | 'BP'
  flIndentado: boolean
  operandos: CampoCalculadoOperando[]
}

export interface NotaWrapperOperando {
  idClassNotaExplicativa: number
  sinal: 1 | -1
}

export interface NotaWrapper {
  id: number
  descricao: string
  operandos: NotaWrapperOperando[]
}

export interface GrupoVal {
  subgrupo: SubgrupoVal
  itens: { id: number; desc_bp_dre: string; saldo: number; isCalculada?: boolean; isIndentado?: boolean }[]
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

type DFItemMapped = { id: number; desc_bp_dre: string; saldo: number; isCalculada?: boolean; isIndentado?: boolean }

function injetarCamposCalculados(
  items: DFItemMapped[],
  campos: CampoCalculado[],
  saldoBase: Map<number, number>
): DFItemMapped[] {
  if (campos.length === 0) return items
  const result = [...items]
  const saldoCampo = new Map<number, number>()
  const resolved = new Set<number>()

  let iter = 0
  while (resolved.size < campos.length && iter <= campos.length) {
    iter++
    for (const campo of campos) {
      if (resolved.has(campo.id)) continue
      const allDepsResolved = campo.operandos.every(op =>
        op.idCampoCalculadoRef == null || resolved.has(op.idCampoCalculadoRef)
      )
      if (!allDepsResolved) continue

      let saldo = 0
      for (const op of campo.operandos) {
        if (op.idClassBpDre != null) {
          saldo += (saldoBase.get(op.idClassBpDre) ?? 0) * op.sinal
        } else if (op.idCampoCalculadoRef != null) {
          saldo += (saldoCampo.get(op.idCampoCalculadoRef) ?? 0) * op.sinal
        }
      }
      saldoCampo.set(campo.id, saldo)

      // posição: após o último item que seja operando deste campo
      let insertAfter = result.length - 1
      for (let i = 0; i < result.length; i++) {
        const item = result[i]
        if (!item.isCalculada && campo.operandos.some(op => op.idClassBpDre === item.id)) {
          insertAfter = i
        }
        if (item.isCalculada) {
          // id negativo: -(campoId)
          const campoId = -item.id
          if (campo.operandos.some(op => op.idCampoCalculadoRef === campoId)) {
            insertAfter = i
          }
        }
      }

      result.splice(insertAfter + 1, 0, { id: -(campo.id), desc_bp_dre: campo.nome, saldo, isCalculada: true })
      resolved.add(campo.id)
    }
  }

  // Mark items that belong to indented calculated fields
  const indentedCampoIds = new Set<number>()
  const indentedBpDreIds = new Set<number>()
  for (const campo of campos) {
    if (!campo.flIndentado) continue
    indentedCampoIds.add(campo.id)
    for (const op of campo.operandos) {
      if (op.idClassBpDre != null) indentedBpDreIds.add(op.idClassBpDre)
    }
  }
  if (indentedCampoIds.size === 0) return result

  return result.map(item => {
    if (item.isCalculada && indentedCampoIds.has(-item.id)) return { ...item, isIndentado: true }
    if (!item.isCalculada && indentedBpDreIds.has(item.id)) return { ...item, isIndentado: true }
    return item
  })
}

export function calcularDF(
  bItems: { conta: string; saldo_atual: number }[],
  planoItens: PlanoItem[],
  links: BpDreSubgrupoLink[],
  camposCalculados: CampoCalculado[] = []
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
  const dreItemsBase = dreItems.map(d => ({ id: d.bpId, desc_bp_dre: d.desc, saldo: saldoDRE.get(d.bpId) ?? 0 }))
  const camposDRE = camposCalculados.filter(c => c.tipoDf === 'DRE')
  const dreItemsWithCalc = injetarCamposCalculados(dreItemsBase, camposDRE, saldoDRE)
  // subtotal exclui linhas calculadas para não duplicar valores no totalResultado
  const gruposResultado: GrupoVal[] = dreItemsWithCalc.length > 0 ? [{
    subgrupo: { id: -1, sigla_subgrupo: 'RESULTADO', desc_subgrupo: null },
    itens: dreItemsWithCalc,
    subtotal: dreItemsWithCalc.filter(i => !i.isCalculada).reduce((acc, d) => acc + d.saldo, 0),
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

// ── Notas explicativas ──────────────────────────────────────────────────────

export interface NotaQuadroLinha {
  idClassNotaExplicativa?: number  // undefined para linhas de wrapper
  idNotaWrapper?: number           // definido para linhas de wrapper
  isWrapper?: boolean
  desc_ne: string
  saldoFinal: number
  saldoInicial?: number
}

export interface NotaQuadro {
  subgrupo: SubgrupoVal
  linhas: NotaQuadroLinha[]
  subtotalFinal: number
  subtotalInicial?: number
}

function somarPorSubgrupoNota(
  classNotaExplicativaIds: Set<number>,
  planoItens: PlanoItem[],
  bItems: { conta: string; saldo_atual: number }[],
  allowedBpDreId?: number
): Map<string, number> {
  const bMap = new Map(bItems.map(b => [b.conta, b.saldo_atual]))
  const saldoMap = new Map<string, number>()
  for (const pi of planoItens) {
    if (pi.id_class_nota_explicativa == null || !classNotaExplicativaIds.has(pi.id_class_nota_explicativa)) continue
    if (pi.id_class_subgrupo == null) continue
    if (allowedBpDreId != null && pi.id_class_bp_dre !== allowedBpDreId) continue
    const key = `${pi.id_class_subgrupo}|${pi.id_class_nota_explicativa}`
    saldoMap.set(key, (saldoMap.get(key) ?? 0) + (bMap.get(pi.conta) ?? 0))
  }
  return saldoMap
}

/**
 * Monta os quadros de uma nota explicativa: 1 quadro por subgrupo (AC/ANC/PC/PNC/...)
 * em que algum item vinculado tenha saldo no período final ou inicial. Cada linha do
 * quadro corresponde a um item de `class_nota_explicativa` vinculado à nota.
 *
 * `allowedSubgrupoIds`, quando informado, restringe os quadros aos subgrupos
 * vinculados ao `class_bp_dre` da nota (via `class_bp_dre_subgrupo`) — necessário
 * porque um mesmo `class_nota_explicativa` pode aparecer em subgrupos de mais de
 * um item de BP/DRE.
 */
export function computeNotaQuadros(
  classNotaExplicativaIds: number[],
  planoItensFinal: PlanoItem[],
  bItemsFinal: { conta: string; saldo_atual: number }[],
  planoItensInicial?: PlanoItem[],
  bItemsInicial?: { conta: string; saldo_atual: number }[],
  allowedSubgrupoIds?: Set<number>,
  wrappers?: NotaWrapper[],
  allowedBpDreId?: number
): NotaQuadro[] {
  const idsSet = new Set(classNotaExplicativaIds)
  const saldoFinalMap = somarPorSubgrupoNota(idsSet, planoItensFinal, bItemsFinal, allowedBpDreId)
  const hasInicial = !!(planoItensInicial && bItemsInicial)
  const saldoInicialMap = hasInicial
    ? somarPorSubgrupoNota(idsSet, planoItensInicial!, bItemsInicial!, allowedBpDreId)
    : new Map<string, number>()

  // pares (subgrupo, nota) que existem estruturalmente no plano de contas (qualquer período)
  const sgInfo = new Map<number, SubgrupoVal>()
  const neInfo = new Map<number, string>()
  const pairsBySg = new Map<number, Set<number>>()

  for (const pi of [...planoItensFinal, ...(planoItensInicial ?? [])]) {
    if (pi.id_class_nota_explicativa == null || !idsSet.has(pi.id_class_nota_explicativa)) continue
    if (pi.id_class_subgrupo == null || !pi.class_subgrupo) continue
    if (allowedSubgrupoIds && !allowedSubgrupoIds.has(pi.id_class_subgrupo)) continue
    if (allowedBpDreId != null && pi.id_class_bp_dre !== allowedBpDreId) continue
    sgInfo.set(pi.id_class_subgrupo, pi.class_subgrupo)
    if (pi.class_nota_explicativa) neInfo.set(pi.id_class_nota_explicativa, pi.class_nota_explicativa.desc_ne)
    if (!pairsBySg.has(pi.id_class_subgrupo)) pairsBySg.set(pi.id_class_subgrupo, new Set())
    pairsBySg.get(pi.id_class_subgrupo)!.add(pi.id_class_nota_explicativa)
  }

  const quadros: NotaQuadro[] = []
  for (const [sgId, neIds] of pairsBySg) {
    const linhas: NotaQuadroLinha[] = Array.from(neIds).map(neId => ({
      idClassNotaExplicativa: neId,
      desc_ne: neInfo.get(neId) ?? '',
      saldoFinal: saldoFinalMap.get(`${sgId}|${neId}`) ?? 0,
      saldoInicial: hasInicial ? (saldoInicialMap.get(`${sgId}|${neId}`) ?? 0) : undefined,
    }))
    const subtotalFinal = linhas.reduce((acc, l) => acc + l.saldoFinal, 0)
    const subtotalInicial = hasInicial ? linhas.reduce((acc, l) => acc + (l.saldoInicial ?? 0), 0) : undefined
    const temSaldo = subtotalFinal !== 0 || (subtotalInicial ?? 0) !== 0
    if (!temSaldo) continue
    quadros.push({ subgrupo: sgInfo.get(sgId)!, linhas, subtotalFinal, subtotalInicial })
  }

  // ── Wrappers ───────────────────────────────────────────────────────────
  if (wrappers && wrappers.length > 0) {
    const allWrapperNeIds = new Set(wrappers.flatMap(v => v.operandos.map(op => op.idClassNotaExplicativa)))
    const saldoFinalV = somarPorSubgrupoNota(allWrapperNeIds, planoItensFinal, bItemsFinal, allowedBpDreId)
    const saldoInicialV = hasInicial
      ? somarPorSubgrupoNota(allWrapperNeIds, planoItensInicial!, bItemsInicial!, allowedBpDreId)
      : new Map<string, number>()

    // subgrupos relevantes para os wrappers
    const sgInfoWrapper = new Map<number, SubgrupoVal>()
    for (const pi of [...planoItensFinal, ...(planoItensInicial ?? [])]) {
      if (pi.id_class_nota_explicativa == null || !allWrapperNeIds.has(pi.id_class_nota_explicativa)) continue
      if (pi.id_class_subgrupo == null || !pi.class_subgrupo) continue
      if (allowedSubgrupoIds && !allowedSubgrupoIds.has(pi.id_class_subgrupo)) continue
      if (allowedBpDreId != null && pi.id_class_bp_dre !== allowedBpDreId) continue
      sgInfoWrapper.set(pi.id_class_subgrupo, pi.class_subgrupo)
    }

    for (const v of wrappers) {
      for (const [sgId, sg] of sgInfoWrapper) {
        let sf = 0
        let si = 0
        for (const op of v.operandos) {
          const k = `${sgId}|${op.idClassNotaExplicativa}`
          sf += (saldoFinalV.get(k) ?? 0) * op.sinal
          si += hasInicial ? (saldoInicialV.get(k) ?? 0) * op.sinal : 0
        }
        if (sf === 0 && si === 0) continue

        let quadro = quadros.find(q => q.subgrupo.id === sgId)
        if (!quadro) {
          quadro = { subgrupo: sg, linhas: [], subtotalFinal: 0, subtotalInicial: hasInicial ? 0 : undefined }
          quadros.push(quadro)
        }
        quadro.linhas.push({
          idNotaWrapper: v.id,
          isWrapper: true,
          desc_ne: v.descricao,
          saldoFinal: sf,
          ...(hasInicial ? { saldoInicial: si } : {}),
        })
        quadro.subtotalFinal += sf
        if (hasInicial && quadro.subtotalInicial != null) quadro.subtotalInicial += si
      }
    }
  }

  quadros.sort((a, b) => a.subgrupo.sigla_subgrupo.localeCompare(b.subgrupo.sigla_subgrupo))
  return quadros
}
