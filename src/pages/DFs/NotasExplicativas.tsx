import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { StickyNote, Search, Save, Plus, Pencil, X, Copy, Building2, Trash2, Printer } from 'lucide-react'
import { computeNotaQuadros, MESES, type PlanoItem, type BpDreSubgrupoLink } from '../../lib/dfUtils'
import { fetchBalanceteItens, fetchPlanoItens, fetchLinks, type DFParams, type BalanceteItem } from '../../lib/dfData'
import {
  fetchNotasExplicativasBpDre, fetchNotaItens, fetchClassNotasExplicativas, fetchClassBpDres,
  saveNotaCampos, upsertNotaExplicativaBpDre, criarNotaTexto, criarNotaEspecial, setNotaItens,
  fetchPeriodosDisponiveis, clonarNotaParaPeriodo, fetchEmpresasAtivas, excluirNotaExplicativaBpDre,
  TIPOS_ESPECIAIS,
  type TipoNotaEspecial,
  type NotaExplicativaBpDre, type NotaExplicativaBpDreItem, type ClassNotaExplicativaOpt, type ClassBpDreOpt,
} from '../../lib/notasExplicativasData'
import { type NotaParaImpressao } from '../../lib/gerarNotasExport'
import NotaFiltro from './NotaFiltro'
import NotaQuadroView, { ResumoAtivoPassivo } from './NotaQuadroView'
import ImprimirNotasModal from './ImprimirNotasModal'
import RichTextEditor from '../../components/RichTextEditor'

interface Resultado {
  params: DFParams
  planoItensFinal: PlanoItem[]
  bItemsFinal: BalanceteItem[]
  planoItensInicial?: PlanoItem[]
  bItemsInicial?: BalanceteItem[]
}

export default function NotasExplicativas() {
  const [params, setParams] = useState<DFParams | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [buscando, setBuscando] = useState(false)
  const empresaIdRef = useRef<number | null>(null)

  const canBuscar = params != null

  function handleParamsChange(p: DFParams | null) {
    const novaEmpresaId = p?.empresa.id ?? null
    if (novaEmpresaId !== empresaIdRef.current) {
      setResultado(null)
    }
    empresaIdRef.current = novaEmpresaId
    setParams(p)
  }

  async function handleBuscar() {
    if (!params) return
    setBuscando(true)
    try {
      const [bItemsFinal, planoItensFinal] = await Promise.all([
        fetchBalanceteItens(params.periodo2.balanceteId),
        fetchPlanoItens(params.periodo2.planoContasId),
      ])

      let bItemsInicial: BalanceteItem[] | undefined
      let planoItensInicial: PlanoItem[] | undefined
      if (params.periodo1) {
        bItemsInicial = await fetchBalanceteItens(params.periodo1.balanceteId)
        planoItensInicial = params.periodo1.planoContasId === params.periodo2.planoContasId
          ? planoItensFinal
          : await fetchPlanoItens(params.periodo1.planoContasId)
      }

      setResultado({ params, planoItensFinal, bItemsFinal, planoItensInicial, bItemsInicial })
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Page header */}
      <div className="px-8 py-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <StickyNote size={22} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Notas Explicativas</h1>
            <p className="text-sm text-gray-500 mt-0.5">Selecione empresa e período(s) para visualizar e editar as notas</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-8 py-6 border-b border-gray-200">
        <NotaFiltro onChange={handleParamsChange} />

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleBuscar}
            disabled={!canBuscar || buscando}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {buscando ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Buscando…
              </>
            ) : (
              <>
                <Search size={16} />
                Buscar
              </>
            )}
          </button>
        </div>
      </div>

      {/* Resultado */}
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        {!resultado && (
          <p className="text-sm text-gray-400 text-center py-20">
            Selecione os filtros e clique em "Buscar" para visualizar as notas explicativas.
          </p>
        )}
        {resultado && <NotasContent resultado={resultado} />}
      </div>
    </div>
  )
}

function NotasContent({ resultado }: { resultado: Resultado }) {
  const { params, planoItensFinal, bItemsFinal, planoItensInicial, bItemsInicial } = resultado
  const idEmpresa = params.empresa.id
  const ano = params.periodo2.ano
  const mes = params.periodo2.mes
  const queryClient = useQueryClient()

  const { data: notas = [], isLoading: loadingNotas } = useQuery({
    queryKey: ['notas_explicativas', idEmpresa, ano, mes],
    queryFn: () => fetchNotasExplicativasBpDre(idEmpresa, ano, mes),
  })

  const idsNota = notas.map(n => n.id)
  const { data: itens = [] } = useQuery({
    queryKey: ['notas_explicativas_itens', idsNota],
    queryFn: () => fetchNotaItens(idsNota),
    enabled: idsNota.length > 0,
  })

  const { data: classNotas = [] } = useQuery({
    queryKey: ['class_notas_explicativas'],
    queryFn: fetchClassNotasExplicativas,
  })

  const { data: classBpDres = [] } = useQuery({
    queryKey: ['class_bp_dres'],
    queryFn: fetchClassBpDres,
  })

  const { data: links = [] } = useQuery({
    queryKey: ['class_bp_dre_subgrupo_links'],
    queryFn: fetchLinks,
  })

  const [novaCapaId, setNovaCapaId] = useState<number | ''>('')
  const [criando, setCriando] = useState(false)
  const [mostrarCriarQuadro, setMostrarCriarQuadro] = useState(false)

  const [tituloTexto, setTituloTexto] = useState('')
  const [criandoTexto, setCriandoTexto] = useState(false)
  const [mostrarCriarTexto, setMostrarCriarTexto] = useState(false)

  const [mostrarCriarEspecial, setMostrarCriarEspecial] = useState(false)
  const [tipoEspecial, setTipoEspecial] = useState<TipoNotaEspecial | ''>('')
  const [criandoEspecial, setCriandoEspecial] = useState(false)

  const [editandoId, setEditandoId] = useState<number | null>(null)
  const [imprimindo, setImprimindo] = useState(false)

  const bpDresDisponiveis = classBpDres.filter(c => !notas.some(n => n.id_class_bp_dre === c.id))
  const tiposEspeciaisDisponiveis = (Object.entries(TIPOS_ESPECIAIS) as [TipoNotaEspecial, string][])
    .filter(([tipo]) => !notas.some(n => n.tipo === tipo))

  const itensPorNota = new Map<number, number[]>()
  for (const item of itens) {
    if (!itensPorNota.has(item.id_nota_explicativa_bp_dre)) itensPorNota.set(item.id_nota_explicativa_bp_dre, [])
    itensPorNota.get(item.id_nota_explicativa_bp_dre)!.push(item.id_class_nota_explicativa)
  }

  const notasParaImpressao: NotaParaImpressao[] = notas.map(nota => {
    const allowedSubgrupoIds = new Set(
      links.filter(l => l.id_class_bp_dre === nota.id_class_bp_dre).map(l => l.id_class_subgrupo)
    )
    const quadros = nota.tipo === 'quadro'
      ? computeNotaQuadros(itensPorNota.get(nota.id) ?? [], planoItensFinal, bItemsFinal, planoItensInicial, bItemsInicial, allowedSubgrupoIds)
      : []
    return {
      id: nota.id,
      numeroNota: nota.numero_nota,
      titulo: nota.tipo === 'quadro' ? (nota.class_bp_dre?.desc_bp_dre ?? `Nota #${nota.id}`) : (nota.titulo ?? `Nota #${nota.id}`),
      tipo: nota.tipo,
      textoAntes: nota.texto_antes ?? '',
      textoDepois: nota.texto_depois ?? '',
      quadros,
    }
  })

  async function handleCriarCapa() {
    if (!novaCapaId) return
    setCriando(true)
    try {
      const nova = await upsertNotaExplicativaBpDre(Number(novaCapaId), idEmpresa, ano, mes)
      setNovaCapaId('')
      setMostrarCriarQuadro(false)
      await queryClient.invalidateQueries({ queryKey: ['notas_explicativas', idEmpresa, ano, mes] })
      setEditandoId(nova.id)
    } finally {
      setCriando(false)
    }
  }

  async function handleCriarTexto() {
    if (!tituloTexto.trim()) return
    setCriandoTexto(true)
    try {
      const nova = await criarNotaTexto(idEmpresa, ano, mes, tituloTexto.trim())
      setTituloTexto('')
      setMostrarCriarTexto(false)
      await queryClient.invalidateQueries({ queryKey: ['notas_explicativas', idEmpresa, ano, mes] })
      setEditandoId(nova.id)
    } finally {
      setCriandoTexto(false)
    }
  }

  async function handleCriarEspecial() {
    if (!tipoEspecial) return
    setCriandoEspecial(true)
    try {
      const nova = await criarNotaEspecial(tipoEspecial, idEmpresa, ano, mes)
      setTipoEspecial('')
      setMostrarCriarEspecial(false)
      await queryClient.invalidateQueries({ queryKey: ['notas_explicativas', idEmpresa, ano, mes] })
      setEditandoId(nova.id)
    } finally {
      setCriandoEspecial(false)
    }
  }

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['notas_explicativas'] })
    queryClient.invalidateQueries({ queryKey: ['notas_explicativas_itens'] })
  }

  if (loadingNotas) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    )
  }

  const notaEditando = notas.find(n => n.id === editandoId)

  return (
    <div className="space-y-6">
      {/* Ações */}
      {notas.length > 0 && (
        <div className="flex justify-end">
          <button
            onClick={() => setImprimindo(true)}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm font-medium hover:bg-gray-50 transition-colors"
          >
            <Printer size={16} />
            Imprimir
          </button>
        </div>
      )}

      {/* Listagem das notas existentes */}
      <div className="border border-gray-200 rounded-2xl divide-y divide-gray-100">
        {notas.map(nota => (
          <div key={nota.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="text-xs font-mono text-gray-400 w-10 shrink-0">
              {nota.numero_nota != null ? `Nº ${nota.numero_nota}` : '—'}
            </span>
            <span className="flex-1 text-sm text-gray-900">
              {nota.tipo === 'quadro' ? (nota.class_bp_dre?.desc_bp_dre ?? `Nota #${nota.id}`) : (nota.titulo ?? `Nota #${nota.id}`)}
            </span>
            <button
              onClick={() => setEditandoId(nota.id)}
              className="flex items-center gap-1.5 text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors"
            >
              <Pencil size={14} />
              Editar
            </button>
            <CopiarNotaButton nota={nota} idEmpresa={idEmpresa} onDone={invalidate} />
            <CopiarParaEmpresaButton nota={nota} idEmpresaAtual={idEmpresa} onDone={invalidate} />
            <ExcluirNotaButton
              nota={nota}
              onDone={() => {
                if (editandoId === nota.id) setEditandoId(null)
                invalidate()
              }}
            />
          </div>
        ))}

        {notas.length === 0 && (
          <p className="text-sm text-gray-400 text-center py-8">
            Nenhuma nota explicativa cadastrada para {params.empresa.abreviacao} em {MESES[mes - 1]}/{ano}.
          </p>
        )}
      </div>

      {/* Adicionar nova capa */}
      <div className="flex flex-wrap gap-3">
        {bpDresDisponiveis.length > 0 && (
          mostrarCriarQuadro ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-4 flex items-center gap-3 flex-1 min-w-[280px]">
              <select
                value={novaCapaId}
                onChange={e => setNovaCapaId(e.target.value === '' ? '' : Number(e.target.value))}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecione um item de BP/DRE para criar nota…</option>
                {bpDresDisponiveis.map(c => (
                  <option key={c.id} value={c.id}>{c.desc_bp_dre}</option>
                ))}
              </select>
              <button
                onClick={handleCriarCapa}
                disabled={!novaCapaId || criando}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={16} />
                Adicionar
              </button>
              <button
                onClick={() => { setMostrarCriarQuadro(false); setNovaCapaId('') }}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMostrarCriarQuadro(true)}
              className="flex items-center gap-2 border border-dashed border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <Plus size={16} />
              Nota com quadro
            </button>
          )
        )}

        {mostrarCriarTexto ? (
          <div className="border border-dashed border-gray-300 rounded-xl p-4 flex items-center gap-3 flex-1 min-w-[280px]">
            <input
              type="text"
              value={tituloTexto}
              onChange={e => setTituloTexto(e.target.value)}
              placeholder="Título da nota…"
              className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              onClick={handleCriarTexto}
              disabled={!tituloTexto.trim() || criandoTexto}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <Plus size={16} />
              Adicionar
            </button>
            <button
              onClick={() => { setMostrarCriarTexto(false); setTituloTexto('') }}
              className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            onClick={() => setMostrarCriarTexto(true)}
            className="flex items-center gap-2 border border-dashed border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors"
          >
            <Plus size={16} />
            Nota de texto
          </button>
        )}

        {tiposEspeciaisDisponiveis.length > 0 && (
          mostrarCriarEspecial ? (
            <div className="border border-dashed border-gray-300 rounded-xl p-4 flex items-center gap-3 flex-1 min-w-[280px]">
              <select
                value={tipoEspecial}
                onChange={e => setTipoEspecial(e.target.value as TipoNotaEspecial | '')}
                className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              >
                <option value="">Selecione o tipo de nota…</option>
                {tiposEspeciaisDisponiveis.map(([tipo, label]) => (
                  <option key={tipo} value={tipo}>{label}</option>
                ))}
              </select>
              <button
                onClick={handleCriarEspecial}
                disabled={!tipoEspecial || criandoEspecial}
                className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Plus size={16} />
                Adicionar
              </button>
              <button
                onClick={() => { setMostrarCriarEspecial(false); setTipoEspecial('') }}
                className="text-sm text-gray-500 hover:text-gray-700 px-2 py-2"
              >
                Cancelar
              </button>
            </div>
          ) : (
            <button
              onClick={() => setMostrarCriarEspecial(true)}
              className="flex items-center gap-2 border border-dashed border-gray-300 text-gray-600 px-4 py-2.5 rounded-xl text-sm font-medium hover:bg-gray-50 hover:border-gray-400 transition-colors"
            >
              <Plus size={16} />
              Nota especial
            </button>
          )
        )}
      </div>

      {/* Edição da nota selecionada */}
      {notaEditando && (
        <NotaCard
          key={notaEditando.id}
          nota={notaEditando}
          itensVinculados={itens.filter(i => i.id_nota_explicativa_bp_dre === notaEditando.id)}
          classNotas={classNotas}
          links={links}
          planoItensFinal={planoItensFinal}
          bItemsFinal={bItemsFinal}
          planoItensInicial={planoItensInicial}
          bItemsInicial={bItemsInicial}
          params={params}
          onSaved={invalidate}
          onClose={() => setEditandoId(null)}
        />
      )}

      {imprimindo && (
        <ImprimirNotasModal
          params={params}
          notas={notasParaImpressao}
          onClose={() => setImprimindo(false)}
        />
      )}
    </div>
  )
}

function CopiarNotaButton({ nota, idEmpresa, onDone }: { nota: NotaExplicativaBpDre; idEmpresa: number; onDone: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [periodoSel, setPeriodoSel] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data: periodos = [] } = useQuery({
    queryKey: ['periodos_disponiveis', idEmpresa],
    queryFn: () => fetchPeriodosDisponiveis(idEmpresa),
    enabled: aberto,
  })

  async function handleCopiar() {
    if (!periodoSel) return
    const [anoStr, mesStr] = periodoSel.split('-')
    setCopiando(true)
    setErro(null)
    try {
      const res = await clonarNotaParaPeriodo(nota.id, Number(anoStr), Number(mesStr))
      if (!res.ok) {
        setErro('Já existe uma nota para este item no período selecionado.')
        return
      }
      setAberto(false)
      setPeriodoSel('')
      onDone()
    } finally {
      setCopiando(false)
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Copy size={14} />
        Copiar
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={periodoSel}
        onChange={e => { setPeriodoSel(e.target.value); setErro(null) }}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="">Período destino…</option>
        {periodos.map(p => (
          <option key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>{MESES[p.mes - 1]}/{p.ano}</option>
        ))}
      </select>
      <button
        onClick={handleCopiar}
        disabled={!periodoSel || copiando}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
      >
        OK
      </button>
      <button
        onClick={() => { setAberto(false); setErro(null); setPeriodoSel('') }}
        className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1"
      >
        Cancelar
      </button>
      {erro && <span className="text-xs text-red-600 w-full">{erro}</span>}
    </div>
  )
}

function CopiarParaEmpresaButton({ nota, idEmpresaAtual, onDone }: { nota: NotaExplicativaBpDre; idEmpresaAtual: number; onDone: () => void }) {
  const [aberto, setAberto] = useState(false)
  const [empresaSel, setEmpresaSel] = useState<number | ''>('')
  const [periodoSel, setPeriodoSel] = useState('')
  const [copiando, setCopiando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresas_ativas'],
    queryFn: fetchEmpresasAtivas,
    enabled: aberto,
  })

  const { data: periodos = [] } = useQuery({
    queryKey: ['periodos_disponiveis', empresaSel],
    queryFn: () => fetchPeriodosDisponiveis(Number(empresaSel)),
    enabled: aberto && empresaSel !== '',
  })

  const empresasDisponiveis = empresas.filter(e => e.id !== idEmpresaAtual)

  async function handleCopiar() {
    if (!empresaSel || !periodoSel) return
    const [anoStr, mesStr] = periodoSel.split('-')
    setCopiando(true)
    setErro(null)
    try {
      const res = await clonarNotaParaPeriodo(nota.id, Number(anoStr), Number(mesStr), Number(empresaSel))
      if (!res.ok) {
        setErro('Já existe uma nota para este item no período/empresa selecionado.')
        return
      }
      setAberto(false)
      setEmpresaSel('')
      setPeriodoSel('')
      onDone()
    } finally {
      setCopiando(false)
    }
  }

  if (!aberto) {
    return (
      <button
        onClick={() => setAberto(true)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 font-medium px-2 py-1 rounded-lg hover:bg-gray-100 transition-colors"
      >
        <Building2 size={14} />
        Copiar para empresa
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <select
        value={empresaSel}
        onChange={e => { setEmpresaSel(e.target.value === '' ? '' : Number(e.target.value)); setPeriodoSel(''); setErro(null) }}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
      >
        <option value="">Empresa destino…</option>
        {empresasDisponiveis.map(e => (
          <option key={e.id} value={e.id}>{e.abreviacao} — {e.razao_social}</option>
        ))}
      </select>
      <select
        value={periodoSel}
        onChange={e => { setPeriodoSel(e.target.value); setErro(null) }}
        disabled={empresaSel === ''}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
      >
        <option value="">Período destino…</option>
        {periodos.map(p => (
          <option key={`${p.ano}-${p.mes}`} value={`${p.ano}-${p.mes}`}>{MESES[p.mes - 1]}/{p.ano}</option>
        ))}
      </select>
      <button
        onClick={handleCopiar}
        disabled={!empresaSel || !periodoSel || copiando}
        className="text-sm text-blue-600 hover:text-blue-800 font-medium px-2 py-1 rounded-lg hover:bg-blue-50 disabled:opacity-50 transition-colors"
      >
        OK
      </button>
      <button
        onClick={() => { setAberto(false); setErro(null); setEmpresaSel(''); setPeriodoSel('') }}
        className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1"
      >
        Cancelar
      </button>
      {erro && <span className="text-xs text-red-600 w-full">{erro}</span>}
    </div>
  )
}

function ExcluirNotaButton({ nota, onDone }: { nota: NotaExplicativaBpDre; onDone: () => void }) {
  const [confirmando, setConfirmando] = useState(false)
  const [excluindo, setExcluindo] = useState(false)

  async function handleExcluir() {
    setExcluindo(true)
    try {
      await excluirNotaExplicativaBpDre(nota.id)
      onDone()
    } finally {
      setExcluindo(false)
      setConfirmando(false)
    }
  }

  if (!confirmando) {
    return (
      <button
        onClick={() => setConfirmando(true)}
        className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-red-600 font-medium px-2 py-1 rounded-lg hover:bg-red-50 transition-colors"
      >
        <Trash2 size={14} />
        Excluir
      </button>
    )
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-gray-600">Excluir esta nota?</span>
      <button
        onClick={handleExcluir}
        disabled={excluindo}
        className="text-sm text-red-600 hover:text-red-800 font-medium px-2 py-1 rounded-lg hover:bg-red-50 disabled:opacity-50 transition-colors"
      >
        Confirmar
      </button>
      <button
        onClick={() => setConfirmando(false)}
        className="text-sm text-gray-500 hover:text-gray-700 px-2 py-1"
      >
        Cancelar
      </button>
    </div>
  )
}

interface NotaCardProps {
  nota: NotaExplicativaBpDre
  itensVinculados: NotaExplicativaBpDreItem[]
  classNotas: ClassNotaExplicativaOpt[]
  links: BpDreSubgrupoLink[]
  planoItensFinal: PlanoItem[]
  bItemsFinal: BalanceteItem[]
  planoItensInicial?: PlanoItem[]
  bItemsInicial?: BalanceteItem[]
  params: DFParams
  onSaved: () => void
  onClose: () => void
}

function NotaCard({
  nota, itensVinculados, classNotas, links, planoItensFinal, bItemsFinal, planoItensInicial, bItemsInicial, params, onSaved, onClose,
}: NotaCardProps) {
  const isTexto = nota.tipo === 'texto'
  const isQuadro = nota.tipo === 'quadro'
  const isEspecial = !isTexto && !isQuadro
  const [selecionados, setSelecionados] = useState<Set<number>>(
    () => new Set(itensVinculados.map(i => i.id_class_nota_explicativa))
  )
  const [numeroNota, setNumeroNota] = useState<string>(nota.numero_nota?.toString() ?? '')
  const [titulo, setTitulo] = useState(nota.titulo ?? '')
  const [textoAntes, setTextoAntes] = useState(nota.texto_antes ?? '')
  const [textoDepois, setTextoDepois] = useState(nota.texto_depois ?? '')
  const [salvando, setSalvando] = useState(false)
  const [dirty, setDirty] = useState(false)

  function toggleItem(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setDirty(true)
  }

  async function handleSalvar() {
    setSalvando(true)
    try {
      const numero = numeroNota.trim() === '' ? null : Number(numeroNota)
      const promises: Promise<unknown>[] = [
        saveNotaCampos(nota.id, numero, textoAntes, textoDepois, isTexto ? titulo : undefined),
      ]
      if (!isTexto) {
        promises.push(setNotaItens(nota.id, Array.from(selecionados)))
      }
      await Promise.all(promises)
      setDirty(false)
      onSaved()
    } finally {
      setSalvando(false)
    }
  }

  const allowedSubgrupoIds = new Set(
    links.filter(l => l.id_class_bp_dre === nota.id_class_bp_dre).map(l => l.id_class_subgrupo)
  )

  const quadros = isQuadro ? computeNotaQuadros(
    Array.from(selecionados),
    planoItensFinal,
    bItemsFinal,
    planoItensInicial,
    bItemsInicial,
    allowedSubgrupoIds,
  ) : []

  return (
    <div className="border border-gray-200 rounded-2xl p-6 space-y-4">
      <div className="flex items-center gap-3">
        {isTexto ? (
          <input
            type="text"
            value={titulo}
            onChange={e => { setTitulo(e.target.value); setDirty(true) }}
            placeholder="Título da nota"
            className="flex-1 text-base font-semibold text-gray-900 border border-gray-300 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        ) : isEspecial ? (
          <h3 className="text-base font-semibold text-gray-900 flex-1">
            {TIPOS_ESPECIAIS[nota.tipo as TipoNotaEspecial]}
          </h3>
        ) : (
          <h3 className="text-base font-semibold text-gray-900 flex-1">
            {nota.class_bp_dre?.desc_bp_dre ?? `Nota #${nota.id}`}
          </h3>
        )}
        <label className="flex items-center gap-2 text-sm text-gray-600">
          Nota nº
          <input
            type="number"
            value={numeroNota}
            onChange={e => { setNumeroNota(e.target.value); setDirty(true) }}
            placeholder="—"
            className="w-20 border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </label>
        <button
          onClick={onClose}
          className="text-gray-400 hover:text-gray-600 p-1 rounded-lg hover:bg-gray-100 transition-colors"
          title="Fechar"
        >
          <X size={18} />
        </button>
      </div>

      {isEspecial ? (
        <>
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            Layout específico deste tipo de nota ainda não implementado. Use os campos de texto abaixo para inserir o conteúdo temporariamente.
          </div>
          <RichTextField label="Texto da nota" value={textoAntes} onChange={v => { setTextoAntes(v); setDirty(true) }} />
          <RichTextField label="Texto complementar" value={textoDepois} onChange={v => { setTextoDepois(v); setDirty(true) }} />
        </>
      ) : isTexto ? (
        <RichTextField label="Texto da nota" value={textoAntes} onChange={v => { setTextoAntes(v); setDirty(true) }} />
      ) : (
        <>
          {/* Checklist de itens vinculados */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Itens vinculados</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-3">
              {classNotas.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-sm cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={selecionados.has(c.id)}
                    onChange={() => toggleItem(c.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-gray-700">{c.desc_ne}</span>
                </label>
              ))}
              {classNotas.length === 0 && (
                <p className="text-xs text-gray-400 col-span-full">Nenhum item de nota explicativa cadastrado.</p>
              )}
            </div>
          </div>

          {/* Texto antes */}
          <RichTextField label="Texto antes do quadro" value={textoAntes} onChange={v => { setTextoAntes(v); setDirty(true) }} />

          {/* Quadros */}
          {quadros.length > 0 ? (
            <div className="space-y-4">
              {quadros.map(q => (
                <NotaQuadroView key={q.subgrupo.id} quadro={q} params={params} />
              ))}
              <ResumoAtivoPassivo quadros={quadros} params={params} />
            </div>
          ) : (
            <p className="text-sm text-gray-400 text-center py-4 border border-dashed border-gray-200 rounded-lg">
              Nenhum quadro com saldo para os itens vinculados no período selecionado.
            </p>
          )}

          {/* Texto depois */}
          <RichTextField label="Texto depois do quadro" value={textoDepois} onChange={v => { setTextoDepois(v); setDirty(true) }} />
        </>
      )}

      <div className="flex justify-end">
        <button
          onClick={handleSalvar}
          disabled={!dirty || salvando}
          className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {salvando ? (
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <Save size={16} />
          )}
          Salvar
        </button>
      </div>
    </div>
  )
}

function RichTextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">{label}</p>
      <RichTextEditor value={value} onChange={onChange} placeholder="Digite o texto…" />
    </div>
  )
}
