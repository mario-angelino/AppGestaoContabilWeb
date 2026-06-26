import { supabase } from './supabase'
import type { NotaVariavel } from './dfUtils'

export const TIPOS_ESPECIAIS = {
  investimento:         'Investimentos',
  imobilizado:          'Imobilizado',
  emprestimos:          'Empréstimos',
  patrimonio_liquido:   'Patrimônio Líquido',
  receita_operacional:  'Receita Operacional Líquida',
  resultado_financeiro: 'Resultado Financeiro',
  ebitda:               'EBITDA',
} as const

export type TipoNotaEspecial = keyof typeof TIPOS_ESPECIAIS
export type TipoNota = 'quadro' | 'texto' | TipoNotaEspecial

export interface NotaExplicativaBpDre {
  id: number
  id_class_bp_dre: number | null
  id_empresa: number
  ano: number
  mes: number
  tipo: TipoNota
  titulo: string | null
  numero_nota: number | null
  texto_antes: string | null
  texto_depois: string | null
  class_bp_dre: { id: number; desc_bp_dre: string } | null
}

export interface NotaExplicativaBpDreItem {
  id: number
  id_nota_explicativa_bp_dre: number
  id_class_nota_explicativa: number
  class_nota_explicativa: { id: number; desc_ne: string } | null
}

export interface ClassNotaExplicativaOpt {
  id: number
  desc_ne: string
}

export interface ClassBpDreOpt {
  id: number
  desc_bp_dre: string
}

export interface PeriodoOpt {
  ano: number
  mes: number
}

export interface EmpresaOpt {
  id: number
  abreviacao: string
  razao_social: string
}

const NOTA_SELECT = 'id, id_class_bp_dre, id_empresa, ano, mes, tipo, titulo, numero_nota, texto_antes, texto_depois, class_bp_dre(id, desc_bp_dre)'

/** Capas existentes para uma empresa + período (ano/mês de referência). */
export async function fetchNotasExplicativasBpDre(idEmpresa: number, ano: number, mes: number): Promise<NotaExplicativaBpDre[]> {
  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre')
    .select(NOTA_SELECT)
    .eq('id_empresa', idEmpresa)
    .eq('ano', ano)
    .eq('mes', mes)
    .order('numero_nota', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true })
  if (error) throw error
  return data as unknown as NotaExplicativaBpDre[]
}

/** Itens (class_nota_explicativa) vinculados a uma ou mais capas. */
export async function fetchNotaItens(idsNota: number[]): Promise<NotaExplicativaBpDreItem[]> {
  if (idsNota.length === 0) return []
  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre_itens')
    .select('id, id_nota_explicativa_bp_dre, id_class_nota_explicativa, class_nota_explicativa(id, desc_ne)')
    .in('id_nota_explicativa_bp_dre', idsNota)
  if (error) throw error
  return data as unknown as NotaExplicativaBpDreItem[]
}

/** Salva número, título (notas de texto), texto_antes e texto_depois de uma capa já existente. */
export async function saveNotaCampos(
  idNota: number,
  numeroNota: number | null,
  textoAntes: string,
  textoDepois: string,
  titulo?: string
): Promise<void> {
  const { error } = await supabase
    .from('nota_explicativa_bp_dre')
    .update({
      numero_nota: numeroNota,
      texto_antes: textoAntes,
      texto_depois: textoDepois,
      ...(titulo !== undefined ? { titulo } : {}),
      updated_at: new Date().toISOString(),
    })
    .eq('id', idNota)
  if (error) throw error
}

/**
 * Cria (ou retorna) a capa de quadro para um class_bp_dre + empresa + período.
 *
 * Não usa `.upsert(..., { onConflict })` porque o índice único correspondente
 * (`nota_explicativa_bp_dre_quadro_periodo_key`) é parcial (`where tipo = 'quadro'`),
 * e o Postgres não casa um `ON CONFLICT (colunas)` simples com índices únicos parciais —
 * o upsert falharia com "no unique or exclusion constraint matching the ON CONFLICT".
 */
export async function upsertNotaExplicativaBpDre(idClassBpDre: number, idEmpresa: number, ano: number, mes: number): Promise<NotaExplicativaBpDre> {
  const { data: existente, error: e1 } = await supabase
    .from('nota_explicativa_bp_dre')
    .select(NOTA_SELECT)
    .eq('id_class_bp_dre', idClassBpDre)
    .eq('id_empresa', idEmpresa)
    .eq('ano', ano)
    .eq('mes', mes)
    .eq('tipo', 'quadro')
    .maybeSingle()
  if (e1) throw e1
  if (existente) return existente as unknown as NotaExplicativaBpDre

  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre')
    .insert({ id_class_bp_dre: idClassBpDre, id_empresa: idEmpresa, ano, mes, tipo: 'quadro' })
    .select(NOTA_SELECT)
    .single()
  if (error) throw error
  return data as unknown as NotaExplicativaBpDre
}

/** Exclui uma capa (e seus itens vinculados, via cascade) por id. */
export async function excluirNotaExplicativaBpDre(idNota: number): Promise<void> {
  const { error } = await supabase
    .from('nota_explicativa_bp_dre')
    .delete()
    .eq('id', idNota)
  if (error) throw error
}

/** Cria uma capa de texto livre (sem class_bp_dre) para empresa + período. */
export async function criarNotaTexto(idEmpresa: number, ano: number, mes: number, titulo: string): Promise<NotaExplicativaBpDre> {
  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre')
    .insert({ id_empresa: idEmpresa, ano, mes, tipo: 'texto', titulo })
    .select(NOTA_SELECT)
    .single()
  if (error) throw error
  return data as unknown as NotaExplicativaBpDre
}

/** Substitui o conjunto de itens (class_nota_explicativa) vinculados a uma capa. */
export async function setNotaItens(idNota: number, idsClassNotaExplicativa: number[]): Promise<void> {
  const { error: delError } = await supabase
    .from('nota_explicativa_bp_dre_itens')
    .delete()
    .eq('id_nota_explicativa_bp_dre', idNota)
  if (delError) throw delError

  if (idsClassNotaExplicativa.length === 0) return

  const rows = idsClassNotaExplicativa.map(idClassNotaExplicativa => ({
    id_nota_explicativa_bp_dre: idNota,
    id_class_nota_explicativa: idClassNotaExplicativa,
  }))
  const { error: insError } = await supabase
    .from('nota_explicativa_bp_dre_itens')
    .insert(rows)
  if (insError) throw insError
}

/** Lista todos os class_nota_explicativa (para o checklist de vínculo). */
export async function fetchClassNotasExplicativas(): Promise<ClassNotaExplicativaOpt[]> {
  const { data, error } = await supabase
    .from('class_nota_explicativa')
    .select('id, desc_ne')
    .order('desc_ne')
  if (error) throw error
  return data as ClassNotaExplicativaOpt[]
}

/** Lista todos os class_bp_dre (para criação de novas capas de quadro). */
export async function fetchClassBpDres(): Promise<ClassBpDreOpt[]> {
  const { data, error } = await supabase
    .from('class_bp_dre')
    .select('id, desc_bp_dre')
    .order('desc_bp_dre')
  if (error) throw error
  return data as ClassBpDreOpt[]
}

/** Lista os períodos (ano/mês) com balancete importado para uma empresa — usado para "copiar para outro período". */
export async function fetchPeriodosDisponiveis(idEmpresa: number): Promise<PeriodoOpt[]> {
  const { data, error } = await supabase
    .from('balancete')
    .select('mes, ano, plano_contas_vigencia!inner(empresa_id)')
    .eq('plano_contas_vigencia.empresa_id', idEmpresa)
    .order('ano', { ascending: false })
    .order('mes', { ascending: false })
  if (error) throw error

  const seen = new Set<string>()
  const out: PeriodoOpt[] = []
  for (const r of data as unknown as { mes: number; ano: number }[]) {
    const key = `${r.ano}-${r.mes}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ ano: r.ano, mes: r.mes })
  }
  return out
}

export type ClonarNotaResultado = { ok: true; novaId: number } | { ok: false; reason: 'conflict' }

/** Lista as empresas ativas (para "copiar para outra empresa"). */
export async function fetchEmpresasAtivas(): Promise<EmpresaOpt[]> {
  const { data, error } = await supabase
    .from('empresa')
    .select('id, abreviacao, razao_social')
    .eq('fl_ativa', true)
    .order('abreviacao')
  if (error) throw error
  return data as EmpresaOpt[]
}

/**
 * Clona uma capa (com texto e itens vinculados) para outro período (ano/mês) e,
 * opcionalmente, outra empresa (`idEmpresaDestino`; padrão: mesma empresa da origem).
 * Para notas do tipo `quadro`, retorna `{ ok: false, reason: 'conflict' }` se já
 * existir uma capa do mesmo `class_bp_dre` no destino.
 */
/** Cria uma nota de tipo especial (investimento, imobilizado, etc.) para empresa + período. */
export async function criarNotaEspecial(tipo: TipoNotaEspecial, idEmpresa: number, ano: number, mes: number): Promise<NotaExplicativaBpDre> {
  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre')
    .insert({ id_empresa: idEmpresa, ano, mes, tipo, titulo: TIPOS_ESPECIAIS[tipo] })
    .select(NOTA_SELECT)
    .single()
  if (error) throw error
  return data as unknown as NotaExplicativaBpDre
}

export async function clonarNotaParaPeriodo(idNota: number, anoDestino: number, mesDestino: number, idEmpresaDestino?: number): Promise<ClonarNotaResultado> {
  const { data: origem, error: e1 } = await supabase
    .from('nota_explicativa_bp_dre')
    .select('id_class_bp_dre, id_empresa, tipo, titulo, numero_nota, texto_antes, texto_depois')
    .eq('id', idNota)
    .single()
  if (e1) throw e1

  const idEmpresa = idEmpresaDestino ?? origem.id_empresa

  if (origem.tipo === 'quadro') {
    const { data: existente, error: e2 } = await supabase
      .from('nota_explicativa_bp_dre')
      .select('id')
      .eq('id_class_bp_dre', origem.id_class_bp_dre as number)
      .eq('id_empresa', idEmpresa)
      .eq('ano', anoDestino)
      .eq('mes', mesDestino)
      .maybeSingle()
    if (e2) throw e2
    if (existente) return { ok: false, reason: 'conflict' }
  }

  const { data: nova, error: e3 } = await supabase
    .from('nota_explicativa_bp_dre')
    .insert({
      id_class_bp_dre: origem.id_class_bp_dre,
      id_empresa: idEmpresa,
      ano: anoDestino,
      mes: mesDestino,
      tipo: origem.tipo,
      titulo: origem.titulo,
      numero_nota: origem.numero_nota,
      texto_antes: origem.texto_antes,
      texto_depois: origem.texto_depois,
    })
    .select('id')
    .single()
  if (e3) throw e3

  const { data: itens, error: e4 } = await supabase
    .from('nota_explicativa_bp_dre_itens')
    .select('id_class_nota_explicativa')
    .eq('id_nota_explicativa_bp_dre', idNota)
  if (e4) throw e4

  if (itens.length > 0) {
    const rows = itens.map(i => ({
      id_nota_explicativa_bp_dre: nova.id,
      id_class_nota_explicativa: i.id_class_nota_explicativa,
    }))
    const { error: e5 } = await supabase.from('nota_explicativa_bp_dre_itens').insert(rows)
    if (e5) throw e5
  }

  return { ok: true, novaId: nova.id }
}

// ── Variáveis de notas explicativas ────────────────────────────────────────

interface NotaVariavelRaw {
  id: number
  descricao: string
  nota_variavel_operando: { id_class_nota_explicativa: number; sinal: number }[]
}

/** Lista todas as variáveis com seus operandos. */
export async function fetchNotaVariaveis(): Promise<NotaVariavel[]> {
  const { data, error } = await supabase
    .from('nota_variavel')
    .select('id, descricao, nota_variavel_operando(id_class_nota_explicativa, sinal)')
    .order('descricao')
  if (error) throw error
  const raw = data as unknown as NotaVariavelRaw[]
  return raw.map(v => ({
    id: v.id,
    descricao: v.descricao,
    operandos: (v.nota_variavel_operando ?? []).map(op => ({
      idClassNotaExplicativa: op.id_class_nota_explicativa,
      sinal: op.sinal as 1 | -1,
    })),
  }))
}

/** IDs de variáveis selecionadas em uma capa de nota. */
export async function fetchVariaveisSelecionadas(idNota: number): Promise<number[]> {
  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre_variaveis')
    .select('id_nota_variavel')
    .eq('id_nota_explicativa_bp_dre', idNota)
  if (error) throw error
  return (data as { id_nota_variavel: number }[]).map(r => r.id_nota_variavel)
}

/** Variáveis selecionadas para múltiplas capas de uma vez (usado na montagem de impressão). */
export async function fetchVariaveisSelecionadasBatch(
  idsNota: number[]
): Promise<{ id_nota_explicativa_bp_dre: number; id_nota_variavel: number }[]> {
  if (idsNota.length === 0) return []
  const { data, error } = await supabase
    .from('nota_explicativa_bp_dre_variaveis')
    .select('id_nota_explicativa_bp_dre, id_nota_variavel')
    .in('id_nota_explicativa_bp_dre', idsNota)
  if (error) throw error
  return data as { id_nota_explicativa_bp_dre: number; id_nota_variavel: number }[]
}

/** Substitui as variáveis selecionadas em uma capa de nota. */
export async function setVariaveisSelecionadas(idNota: number, idsNotaVariavel: number[]): Promise<void> {
  const { error: delErr } = await supabase
    .from('nota_explicativa_bp_dre_variaveis')
    .delete()
    .eq('id_nota_explicativa_bp_dre', idNota)
  if (delErr) throw delErr
  if (idsNotaVariavel.length === 0) return
  const rows = idsNotaVariavel.map(id => ({ id_nota_explicativa_bp_dre: idNota, id_nota_variavel: id }))
  const { error: insErr } = await supabase.from('nota_explicativa_bp_dre_variaveis').insert(rows)
  if (insErr) throw insErr
}
