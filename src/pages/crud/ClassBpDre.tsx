import { useState, useMemo } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X } from 'lucide-react'
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

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">BP / DRE</h2>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={15} />
          Novo
        </button>
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
