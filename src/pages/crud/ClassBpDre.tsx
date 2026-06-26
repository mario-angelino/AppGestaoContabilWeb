import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Calculator } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Subgrupo {
  id: number
  sigla_subgrupo: string
  desc_subgrupo: string | null
}

interface VinculoRaw {
  id: number
  indice: number | null
  id_class_subgrupo: number
  class_subgrupo: Subgrupo
}

interface BpDre {
  id: number
  desc_bp_dre: string
  class_bp_dre_subgrupo: VinculoRaw[]
}

interface VinculoLocal {
  id_class_subgrupo: number
  indice: string
  subgrupo: Subgrupo
}

interface CampoOperandoRaw {
  id: number
  id_class_bp_dre: number | null
  id_campo_calculado_ref: number | null
  sinal: number
}

interface CampoRaw {
  id: number
  nome: string
  tipo_df: string
  fl_indentado: boolean
  df_campo_calculado_operando: CampoOperandoRaw[]
}

interface OperandoLocal {
  tipo: 'bp' | 'campo'
  refId: number
  sinal: 1 | -1
  label: string
}

interface CampoModalState {
  open: boolean
  editId: number | null
  nome: string
  tipoDf: 'DRE' | 'BP'
  flIndentado: boolean
  operandos: OperandoLocal[]
  addTipo: 'bp' | 'campo'
  addRefId: string
  addSinal: '1' | '-1'
  saving: boolean
  error: string
}

const CAMPO_MODAL_INIT: CampoModalState = {
  open: false, editId: null, nome: '', tipoDf: 'DRE', flIndentado: false, operandos: [],
  addTipo: 'bp', addRefId: '', addSinal: '1', saving: false, error: '',
}

interface ModalState {
  open: boolean
  editId: number | null
  desc: string
  vinculos: VinculoLocal[]
  addSgId: string
  addIndice: string
  saving: boolean
  error: string
}

const MODAL_INIT: ModalState = {
  open: false,
  editId: null,
  desc: '',
  vinculos: [],
  addSgId: '',
  addIndice: '',
  saving: false,
  error: '',
}

export default function ClassBpDre(): JSX.Element {
  const qc = useQueryClient()
  const [modal, setModal] = useState<ModalState>(MODAL_INIT)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [showCampos, setShowCampos] = useState(false)
  const [campoModal, setCampoModal] = useState<CampoModalState>(CAMPO_MODAL_INIT)
  const [deleteCampoId, setDeleteCampoId] = useState<number | null>(null)
  const [deletingCampo, setDeletingCampo] = useState(false)

  const { data: subgrupos = [] } = useQuery({
    queryKey: ['class_subgrupo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_subgrupo')
        .select('id, sigla_subgrupo, desc_subgrupo')
        .order('sigla_subgrupo')
      if (error) throw error
      return data as Subgrupo[]
    }
  })

  const { data: bpDreList = [], isLoading } = useQuery({
    queryKey: ['class_bp_dre'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_bp_dre')
        .select('id, desc_bp_dre, class_bp_dre_subgrupo(id, indice, id_class_subgrupo, class_subgrupo(id, sigla_subgrupo, desc_subgrupo))')
        .order('desc_bp_dre')
      if (error) throw error
      return data as unknown as BpDre[]
    }
  })

  const openAdd = () => setModal({ ...MODAL_INIT, open: true })

  const openEdit = (bp: BpDre) =>
    setModal({
      ...MODAL_INIT,
      open: true,
      editId: bp.id,
      desc: bp.desc_bp_dre,
      vinculos: [...bp.class_bp_dre_subgrupo]
        .sort((a, b) => (a.indice ?? 9999) - (b.indice ?? 9999))
        .map((v) => ({
          id_class_subgrupo: v.id_class_subgrupo,
          indice: v.indice != null ? String(v.indice) : '',
          subgrupo: v.class_subgrupo,
        })),
    })

  const closeModal = () => setModal(MODAL_INIT)

  const addVinculo = () => {
    if (!modal.addSgId) return
    const sgId = Number(modal.addSgId)
    if (modal.vinculos.some((v) => v.id_class_subgrupo === sgId)) return
    const sg = subgrupos.find((s) => s.id === sgId)
    if (!sg) return
    setModal((m) => ({
      ...m,
      vinculos: [...m.vinculos, { id_class_subgrupo: sgId, indice: m.addIndice, subgrupo: sg }],
      addSgId: '',
      addIndice: '',
    }))
  }

  const removeVinculo = (sgId: number) =>
    setModal((m) => ({ ...m, vinculos: m.vinculos.filter((v) => v.id_class_subgrupo !== sgId) }))

  const handleSave = async () => {
    if (!modal.desc.trim()) {
      setModal((m) => ({ ...m, error: 'Descrição é obrigatória.' }))
      return
    }
    setModal((m) => ({ ...m, saving: true, error: '' }))
    try {
      let bpId = modal.editId

      if (bpId) {
        const { error } = await supabase
          .from('class_bp_dre')
          .update({ desc_bp_dre: modal.desc.trim() })
          .eq('id', bpId)
        if (error) throw new Error(error.message)
        // replace all vinculos
        const { error: delErr } = await supabase
          .from('class_bp_dre_subgrupo')
          .delete()
          .eq('id_class_bp_dre', bpId)
        if (delErr) throw new Error(delErr.message)
      } else {
        const { data, error } = await supabase
          .from('class_bp_dre')
          .insert({ desc_bp_dre: modal.desc.trim() })
          .select('id')
          .single()
        if (error) throw new Error(error.message)
        bpId = data.id
      }

      if (modal.vinculos.length > 0) {
        const rows = modal.vinculos.map((v) => ({
          id_class_bp_dre: bpId,
          id_class_subgrupo: v.id_class_subgrupo,
          indice: v.indice !== '' ? Number(v.indice) : null,
        }))
        const { error } = await supabase.from('class_bp_dre_subgrupo').insert(rows)
        if (error) throw new Error(error.message)
      }

      qc.invalidateQueries({ queryKey: ['class_bp_dre'] })
      closeModal()
    } catch (err) {
      setModal((m) => ({
        ...m,
        saving: false,
        error: err instanceof Error ? err.message : 'Erro ao salvar.',
      }))
    }
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('class_bp_dre').delete().eq('id', deleteId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['class_bp_dre'] })
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  const availableSubgrupos = useMemo(
    () => subgrupos.filter((s) => !modal.vinculos.some((v) => v.id_class_subgrupo === s.id)),
    [subgrupos, modal.vinculos]
  )

  // ── Campos Calculados ─────────────────────────────────────────────────────

  const { data: camposList = [] } = useQuery({
    queryKey: ['df_campo_calculado'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('df_campo_calculado')
        .select('id, nome, tipo_df, fl_indentado, df_campo_calculado_operando!id_campo_calculado(id, id_class_bp_dre, id_campo_calculado_ref, sinal)')
        .order('nome')
      if (error) throw error
      return data as unknown as CampoRaw[]
    }
  })

  const openAddCampo = () => setCampoModal({ ...CAMPO_MODAL_INIT, open: true })

  const openEditCampo = (c: CampoRaw) => {
    const ops: OperandoLocal[] = c.df_campo_calculado_operando.map(op => {
      if (op.id_class_bp_dre != null) {
        const bp = bpDreList.find(b => b.id === op.id_class_bp_dre)
        return { tipo: 'bp' as const, refId: op.id_class_bp_dre, sinal: op.sinal as 1 | -1, label: bp?.desc_bp_dre ?? String(op.id_class_bp_dre) }
      }
      const ref = camposList.find(x => x.id === op.id_campo_calculado_ref)
      return { tipo: 'campo' as const, refId: op.id_campo_calculado_ref!, sinal: op.sinal as 1 | -1, label: ref?.nome ?? String(op.id_campo_calculado_ref) }
    })
    setCampoModal({ ...CAMPO_MODAL_INIT, open: true, editId: c.id, nome: c.nome, tipoDf: c.tipo_df as 'DRE' | 'BP', flIndentado: c.fl_indentado, operandos: ops })
  }

  const closeCampoModal = () => setCampoModal(CAMPO_MODAL_INIT)

  const addOperando = () => {
    if (!campoModal.addRefId) return
    const refId = Number(campoModal.addRefId)
    if (campoModal.operandos.some(op => op.tipo === campoModal.addTipo && op.refId === refId)) return
    let label = ''
    if (campoModal.addTipo === 'bp') {
      label = bpDreList.find(b => b.id === refId)?.desc_bp_dre ?? String(refId)
    } else {
      label = camposList.find(c => c.id === refId)?.nome ?? String(refId)
    }
    const op: OperandoLocal = { tipo: campoModal.addTipo, refId, sinal: Number(campoModal.addSinal) as 1 | -1, label }
    setCampoModal(m => ({ ...m, operandos: [...m.operandos, op], addRefId: '', addSinal: '1' }))
  }

  const removeOperando = (i: number) =>
    setCampoModal(m => ({ ...m, operandos: m.operandos.filter((_, idx) => idx !== i) }))

  const handleSaveCampo = async () => {
    if (!campoModal.nome.trim()) {
      setCampoModal(m => ({ ...m, error: 'Nome é obrigatório.' }))
      return
    }
    setCampoModal(m => ({ ...m, saving: true, error: '' }))
    try {
      let campoId = campoModal.editId
      if (campoId) {
        const { error } = await supabase.from('df_campo_calculado').update({ nome: campoModal.nome.trim(), tipo_df: campoModal.tipoDf, fl_indentado: campoModal.flIndentado }).eq('id', campoId)
        if (error) throw new Error(error.message)
        const { error: delErr } = await supabase.from('df_campo_calculado_operando').delete().eq('id_campo_calculado', campoId)
        if (delErr) throw new Error(delErr.message)
      } else {
        const { data, error } = await supabase.from('df_campo_calculado').insert({ nome: campoModal.nome.trim(), tipo_df: campoModal.tipoDf, fl_indentado: campoModal.flIndentado }).select('id').single()
        if (error) throw new Error(error.message)
        campoId = data.id
      }
      if (campoModal.operandos.length > 0) {
        const rows = campoModal.operandos.map(op => ({
          id_campo_calculado: campoId,
          id_class_bp_dre: op.tipo === 'bp' ? op.refId : null,
          id_campo_calculado_ref: op.tipo === 'campo' ? op.refId : null,
          sinal: op.sinal,
        }))
        const { error } = await supabase.from('df_campo_calculado_operando').insert(rows)
        if (error) throw new Error(error.message)
      }
      qc.invalidateQueries({ queryKey: ['df_campo_calculado'] })
      closeCampoModal()
    } catch (err) {
      setCampoModal(m => ({ ...m, saving: false, error: err instanceof Error ? err.message : 'Erro ao salvar.' }))
    }
  }

  const handleDeleteCampo = async () => {
    if (!deleteCampoId) return
    setDeletingCampo(true)
    try {
      const { error } = await supabase.from('df_campo_calculado').delete().eq('id', deleteCampoId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['df_campo_calculado'] })
      setDeleteCampoId(null)
    } finally {
      setDeletingCampo(false)
    }
  }

  const availableBpOps = useMemo(
    () => bpDreList.filter(b => !campoModal.operandos.some(op => op.tipo === 'bp' && op.refId === b.id)),
    [bpDreList, campoModal.operandos]
  )

  const availableCampoOps = useMemo(
    () => camposList.filter(c => c.id !== campoModal.editId && !campoModal.operandos.some(op => op.tipo === 'campo' && op.refId === c.id)),
    [camposList, campoModal.operandos, campoModal.editId]
  )

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">BP / DRE</h2>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCampos(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${showCampos ? 'bg-purple-50 border-purple-300 text-purple-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <Calculator size={15} />
            Campos Calculados
          </button>
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={15} />
            Novo
          </button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Descrição
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Subgrupos
                </th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {bpDreList.length === 0 ? (
                <tr>
                  <td colSpan={3} className="text-center py-12 text-gray-400 text-sm">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              ) : (
                bpDreList.map((bp, i) => (
                  <tr
                    key={bp.id}
                    className={`hover:bg-gray-50 ${i < bpDreList.length - 1 ? 'border-b border-gray-50' : ''}`}
                  >
                    <td className="px-4 py-3 text-gray-800">{bp.desc_bp_dre}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {bp.class_bp_dre_subgrupo.length === 0 ? (
                          <span className="text-gray-300 text-xs">—</span>
                        ) : (
                          [...bp.class_bp_dre_subgrupo]
                            .sort((a, b) => (a.indice ?? 9999) - (b.indice ?? 9999))
                            .map((v) => (
                              <span
                                key={v.id}
                                className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600"
                                title={v.indice != null ? `Índice: ${v.indice}` : undefined}
                              >
                                {v.class_subgrupo.sigla_subgrupo}
                              </span>
                            ))
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => openEdit(bp)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteId(bp.id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Seção Campos Calculados */}
      {showCampos && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-purple-800 flex items-center gap-2">
              <Calculator size={16} />
              Campos Calculados
            </h3>
            <button
              onClick={openAddCampo}
              className="flex items-center gap-2 bg-purple-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors"
            >
              <Plus size={13} />
              Novo campo
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Tipo</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Fórmula</th>
                  <th className="w-20 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {camposList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-10 text-gray-400 text-sm">
                      Nenhum campo calculado cadastrado.
                    </td>
                  </tr>
                ) : (
                  camposList.map((c, i) => (
                    <tr key={c.id} className={`hover:bg-gray-50 ${i < camposList.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-800 font-medium">
                        <span>{c.nome}</span>
                        {c.fl_indentado && (
                          <span className="ml-2 inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium bg-purple-50 text-purple-600" title="Indentado na demonstração">
                            ⇥ recuado
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${c.tipo_df === 'DRE' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>
                          {c.tipo_df}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {c.df_campo_calculado_operando.map((op, idx) => {
                          const sinal = idx === 0 ? '' : op.sinal === 1 ? ' + ' : ' − '
                          const label = op.id_class_bp_dre != null
                            ? (bpDreList.find(b => b.id === op.id_class_bp_dre)?.desc_bp_dre ?? `#${op.id_class_bp_dre}`)
                            : `[${camposList.find(x => x.id === op.id_campo_calculado_ref)?.nome ?? `#${op.id_campo_calculado_ref}`}]`
                          return <span key={op.id}>{sinal}{label}</span>
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditCampo(c)} className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Editar">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteCampoId(c.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal Campo Calculado */}
      {campoModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-800">
                {campoModal.editId ? 'Editar Campo Calculado' : 'Novo Campo Calculado'}
              </h3>
              <button onClick={closeCampoModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div className="flex gap-3">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Nome <span className="text-red-500">*</span></label>
                  <input
                    type="text"
                    value={campoModal.nome}
                    onChange={e => setCampoModal(m => ({ ...m, nome: e.target.value }))}
                    placeholder="ex: Lucro Bruto"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  />
                </div>
                <div className="w-28">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Tipo</label>
                  <select
                    value={campoModal.tipoDf}
                    onChange={e => setCampoModal(m => ({ ...m, tipoDf: e.target.value as 'DRE' | 'BP' }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="DRE">DRE</option>
                    <option value="BP">BP</option>
                  </select>
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={campoModal.flIndentado}
                  onChange={e => setCampoModal(m => ({ ...m, flIndentado: e.target.checked }))}
                  className="rounded border-gray-300 text-purple-600 focus:ring-purple-500"
                />
                Indentado na demonstração
                <span className="text-xs text-gray-400">(recua este campo e seus operandos)</span>
              </label>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Operandos da fórmula</p>
                {campoModal.operandos.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">Nenhum operando adicionado.</p>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {campoModal.operandos.map((op, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                        <span className={`text-xs font-bold w-5 ${op.sinal === 1 ? 'text-green-600' : 'text-red-600'}`}>
                          {op.sinal === 1 ? '+' : '−'}
                        </span>
                        <span className={`flex-1 text-sm ${op.tipo === 'campo' ? 'text-purple-700 italic' : 'text-gray-700'}`}>
                          {op.tipo === 'campo' ? `[${op.label}]` : op.label}
                        </span>
                        <button onClick={() => removeOperando(i)} className="text-gray-300 hover:text-red-500 ml-1"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="border-t border-gray-100 pt-3 space-y-2">
                  <div className="flex gap-2">
                    <div className="w-24">
                      <label className="block text-xs text-gray-500 mb-1">Sinal</label>
                      <select
                        value={campoModal.addSinal}
                        onChange={e => setCampoModal(m => ({ ...m, addSinal: e.target.value as '1' | '-1' }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="1">+ (soma)</option>
                        <option value="-1">− (subtrai)</option>
                      </select>
                    </div>
                    <div className="w-32">
                      <label className="block text-xs text-gray-500 mb-1">Tipo</label>
                      <select
                        value={campoModal.addTipo}
                        onChange={e => setCampoModal(m => ({ ...m, addTipo: e.target.value as 'bp' | 'campo', addRefId: '' }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="bp">Classificação</option>
                        <option value="campo">Campo calc.</option>
                      </select>
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-gray-500 mb-1">Referência</label>
                      <select
                        value={campoModal.addRefId}
                        onChange={e => setCampoModal(m => ({ ...m, addRefId: e.target.value }))}
                        className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-500"
                      >
                        <option value="">— selecione —</option>
                        {campoModal.addTipo === 'bp'
                          ? availableBpOps.map(b => <option key={b.id} value={b.id}>{b.desc_bp_dre}</option>)
                          : availableCampoOps.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)
                        }
                      </select>
                    </div>
                  </div>
                  <button
                    onClick={addOperando}
                    disabled={!campoModal.addRefId}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-200 transition-colors disabled:opacity-40"
                  >
                    <Plus size={13} />
                    Adicionar operando
                  </button>
                </div>
              </div>

              {campoModal.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{campoModal.error}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end flex-shrink-0">
              <button onClick={closeCampoModal} className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">
                Cancelar
              </button>
              <button onClick={handleSaveCampo} disabled={campoModal.saving} className="bg-purple-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-purple-700 disabled:opacity-50 transition-colors">
                {campoModal.saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação exclusão campo calculado */}
      {deleteCampoId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-500 mb-6">O campo calculado e todos os seus operandos serão removidos.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteCampoId(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleDeleteCampo} disabled={deletingCampo} className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deletingCampo ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal add/edit */}
      {modal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-800">
                {modal.editId ? 'Editar BP / DRE' : 'Novo BP / DRE'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              {/* Descrição */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={modal.desc}
                  onChange={(e) => setModal((m) => ({ ...m, desc: e.target.value }))}
                  placeholder="ex: Ativo Circulante"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Vínculos com subgrupos */}
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Subgrupos vinculados</p>

                {modal.vinculos.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">Nenhum subgrupo vinculado.</p>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {modal.vinculos.map((v) => (
                      <div
                        key={v.id_class_subgrupo}
                        className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2"
                      >
                        <span className="flex-1 text-sm text-gray-700">
                          <span className="font-medium">{v.subgrupo.sigla_subgrupo}</span>
                          {v.subgrupo.desc_subgrupo && (
                            <span className="text-gray-400"> — {v.subgrupo.desc_subgrupo}</span>
                          )}
                        </span>
                        <span className="text-xs text-gray-400 w-24 text-right">
                          {v.indice !== '' ? `Índice: ${v.indice}` : 'sem índice'}
                        </span>
                        <button
                          onClick={() => removeVinculo(v.id_class_subgrupo)}
                          className="text-gray-300 hover:text-red-500 transition-colors ml-1"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* Adicionar vínculo */}
                <div className="flex gap-2 items-end border-t border-gray-100 pt-3">
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Subgrupo</label>
                    <select
                      value={modal.addSgId}
                      onChange={(e) => setModal((m) => ({ ...m, addSgId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <option value="">— selecione —</option>
                      {availableSubgrupos.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.sigla_subgrupo}
                          {s.desc_subgrupo ? ` — ${s.desc_subgrupo}` : ''}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="w-24">
                    <label className="block text-xs text-gray-500 mb-1">Índice</label>
                    <input
                      type="number"
                      value={modal.addIndice}
                      onChange={(e) => setModal((m) => ({ ...m, addIndice: e.target.value }))}
                      placeholder="ex: 10"
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    onClick={addVinculo}
                    disabled={!modal.addSgId}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-200 transition-colors disabled:opacity-40"
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </div>
              </div>

              {modal.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                  {modal.error}
                </p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end flex-shrink-0">
              <button
                onClick={closeModal}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={modal.saving}
                className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
              >
                {modal.saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação de exclusão */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-500 mb-6">
              O registro e todos os vínculos com subgrupos serão removidos. Esta ação não pode ser
              desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
