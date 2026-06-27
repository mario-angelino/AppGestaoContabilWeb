import { useState, useMemo } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Layers } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import CrudTable, { type ColDef, type FieldDef } from '../../components/CrudTable'

interface NotaExplicativa {
  id: number
  desc_ne: string
}

const columns: ColDef<NotaExplicativa>[] = [
  { header: 'Descrição', render: (r) => r.desc_ne }
]

const fields: FieldDef[] = [
  { name: 'desc_ne', label: 'Descrição', type: 'text', required: true, placeholder: 'ex: Caixa e Equivalentes' }
]

interface WrapperOperandoRaw {
  id: number
  id_class_nota_explicativa: number
  sinal: number
}

interface WrapperRaw {
  id: number
  descricao: string
  nota_wrapper_operando: WrapperOperandoRaw[]
}

interface OperandoLocal {
  refId: number
  sinal: 1 | -1
  label: string
}

interface WrapperModalState {
  open: boolean
  editId: number | null
  descricao: string
  operandos: OperandoLocal[]
  addRefId: string
  addSinal: '1' | '-1'
  saving: boolean
  error: string
}

const WRAPPER_MODAL_INIT: WrapperModalState = {
  open: false, editId: null, descricao: '', operandos: [],
  addRefId: '', addSinal: '1', saving: false, error: '',
}

export default function ClassNotaExplicativa(): JSX.Element {
  const qc = useQueryClient()
  const [showWrappers, setShowWrappers] = useState(false)
  const [wrapperModal, setWrapperModal] = useState<WrapperModalState>(WRAPPER_MODAL_INIT)
  const [deleteWrapperId, setDeleteWrapperId] = useState<number | null>(null)
  const [deletingWrapper, setDeletingWrapper] = useState(false)

  const { data = [], isLoading } = useQuery({
    queryKey: ['class_nota_explicativa'],
    queryFn: async () => {
      const { data, error } = await supabase.from('class_nota_explicativa').select('*').order('desc_ne')
      if (error) throw error
      return data as NotaExplicativa[]
    }
  })

  const { data: wrappersList = [] } = useQuery({
    queryKey: ['nota_wrapper'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('nota_wrapper')
        .select('id, descricao, nota_wrapper_operando(id, id_class_nota_explicativa, sinal)')
        .order('descricao')
      if (error) throw error
      return data as unknown as WrapperRaw[]
    }
  })

  const add = useMutation({
    mutationFn: async (values: Record<string, string | number | boolean | null>) => {
      const { error } = await supabase.from('class_nota_explicativa').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_nota_explicativa'] })
  })

  const edit = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Record<string, string | number | boolean | null> }) => {
      const { error } = await supabase.from('class_nota_explicativa').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_nota_explicativa'] })
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('class_nota_explicativa').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_nota_explicativa'] })
  })

  // ── Wrappers ───────────────────────────────────────────────────────────────

  const openAddWrapper = () => setWrapperModal({ ...WRAPPER_MODAL_INIT, open: true })

  const openEditWrapper = (v: WrapperRaw) => {
    const ops: OperandoLocal[] = v.nota_wrapper_operando.map(op => ({
      refId: op.id_class_nota_explicativa,
      sinal: op.sinal as 1 | -1,
      label: data.find(ne => ne.id === op.id_class_nota_explicativa)?.desc_ne ?? String(op.id_class_nota_explicativa),
    }))
    setWrapperModal({ ...WRAPPER_MODAL_INIT, open: true, editId: v.id, descricao: v.descricao, operandos: ops })
  }

  const closeWrapperModal = () => setWrapperModal(WRAPPER_MODAL_INIT)

  const addOperando = () => {
    if (!wrapperModal.addRefId) return
    const refId = Number(wrapperModal.addRefId)
    if (wrapperModal.operandos.some(op => op.refId === refId)) return
    const label = data.find(ne => ne.id === refId)?.desc_ne ?? String(refId)
    setWrapperModal(m => ({ ...m, operandos: [...m.operandos, { refId, sinal: Number(m.addSinal) as 1 | -1, label }], addRefId: '', addSinal: '1' }))
  }

  const removeOperando = (i: number) =>
    setWrapperModal(m => ({ ...m, operandos: m.operandos.filter((_, idx) => idx !== i) }))

  const handleSaveWrapper = async () => {
    if (!wrapperModal.descricao.trim()) {
      setWrapperModal(m => ({ ...m, error: 'Descrição é obrigatória.' }))
      return
    }
    setWrapperModal(m => ({ ...m, saving: true, error: '' }))
    try {
      let varId = wrapperModal.editId
      if (varId) {
        const { error } = await supabase.from('nota_wrapper').update({ descricao: wrapperModal.descricao.trim() }).eq('id', varId)
        if (error) throw new Error(error.message)
        const { error: delErr } = await supabase.from('nota_wrapper_operando').delete().eq('id_nota_wrapper', varId)
        if (delErr) throw new Error(delErr.message)
      } else {
        const { data: ins, error } = await supabase.from('nota_wrapper').insert({ descricao: wrapperModal.descricao.trim() }).select('id').single()
        if (error) throw new Error(error.message)
        varId = ins.id
      }
      if (wrapperModal.operandos.length > 0) {
        const rows = wrapperModal.operandos.map(op => ({ id_nota_wrapper: varId, id_class_nota_explicativa: op.refId, sinal: op.sinal }))
        const { error } = await supabase.from('nota_wrapper_operando').insert(rows)
        if (error) throw new Error(error.message)
      }
      qc.invalidateQueries({ queryKey: ['nota_wrapper'] })
      closeWrapperModal()
    } catch (err) {
      setWrapperModal(m => ({ ...m, saving: false, error: err instanceof Error ? err.message : 'Erro ao salvar.' }))
    }
  }

  const handleDeleteWrapper = async () => {
    if (!deleteWrapperId) return
    setDeletingWrapper(true)
    try {
      const { error } = await supabase.from('nota_wrapper').delete().eq('id', deleteWrapperId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['nota_wrapper'] })
      setDeleteWrapperId(null)
    } finally {
      setDeletingWrapper(false)
    }
  }

  const availableNeOps = useMemo(
    () => data.filter(ne => !wrapperModal.operandos.some(op => op.refId === ne.id)),
    [data, wrapperModal.operandos]
  )

  return (
    <div>
      <CrudTable
        title="Notas Explicativas"
        columns={columns}
        data={data}
        loading={isLoading}
        fields={fields}
        onAdd={(v) => add.mutateAsync(v)}
        onEdit={(id, v) => edit.mutateAsync({ id: id as number, values: v })}
        onDelete={(id) => remove.mutateAsync(id as number)}
        extraHeaderAction={
          <button
            onClick={() => setShowWrappers(v => !v)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors border ${showWrappers ? 'bg-indigo-50 border-indigo-300 text-indigo-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'}`}
          >
            <Layers size={15} />
            Wrappers
          </button>
        }
      />

      {/* Seção Wrappers */}
      {showWrappers && (
        <div className="mt-8">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-indigo-800 flex items-center gap-2">
              <Layers size={16} />
              Wrappers
            </h3>
            <button
              onClick={openAddWrapper}
              className="flex items-center gap-2 bg-indigo-600 text-white px-3 py-1.5 rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
            >
              <Plus size={13} />
              Novo wrapper
            </button>
          </div>

          <div className="bg-white rounded-xl shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Operandos</th>
                  <th className="w-20 px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {wrappersList.length === 0 ? (
                  <tr>
                    <td colSpan={3} className="text-center py-10 text-gray-400 text-sm">Nenhum wrapper cadastrado.</td>
                  </tr>
                ) : (
                  wrappersList.map((v, i) => (
                    <tr key={v.id} className={`hover:bg-gray-50 ${i < wrappersList.length - 1 ? 'border-b border-gray-50' : ''}`}>
                      <td className="px-4 py-3 text-gray-800 font-medium">{v.descricao}</td>
                      <td className="px-4 py-3 text-gray-500 text-xs">
                        {v.nota_wrapper_operando.map((op, idx) => {
                          const sinal = idx === 0 ? '' : op.sinal === 1 ? ' + ' : ' − '
                          const label = data.find(ne => ne.id === op.id_class_nota_explicativa)?.desc_ne ?? `#${op.id_class_nota_explicativa}`
                          return <span key={op.id}>{sinal}{label}</span>
                        })}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 justify-end">
                          <button onClick={() => openEditWrapper(v)} className="p-1.5 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors" title="Editar">
                            <Pencil size={14} />
                          </button>
                          <button onClick={() => setDeleteWrapperId(v.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors" title="Excluir">
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

      {/* Modal Wrapper */}
      {wrapperModal.open && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
              <h3 className="font-semibold text-gray-800">
                {wrapperModal.editId ? 'Editar Wrapper' : 'Novo Wrapper'}
              </h3>
              <button onClick={closeWrapperModal} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Descrição <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={wrapperModal.descricao}
                  onChange={e => setWrapperModal(m => ({ ...m, descricao: e.target.value }))}
                  placeholder="ex: Disponibilidades"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Notas Explicativas incluídas</p>
                {wrapperModal.operandos.length === 0 ? (
                  <p className="text-xs text-gray-400 mb-3">Nenhuma nota adicionada.</p>
                ) : (
                  <div className="space-y-1.5 mb-3">
                    {wrapperModal.operandos.map((op, i) => (
                      <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg px-3 py-2">
                        <span className={`text-xs font-bold w-5 ${op.sinal === 1 ? 'text-green-600' : 'text-red-600'}`}>
                          {op.sinal === 1 ? '+' : '−'}
                        </span>
                        <span className="flex-1 text-sm text-gray-700">{op.label}</span>
                        <button onClick={() => removeOperando(i)} className="text-gray-300 hover:text-red-500 ml-1"><X size={13} /></button>
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex gap-2 items-end border-t border-gray-100 pt-3">
                  <div className="w-24">
                    <label className="block text-xs text-gray-500 mb-1">Sinal</label>
                    <select
                      value={wrapperModal.addSinal}
                      onChange={e => setWrapperModal(m => ({ ...m, addSinal: e.target.value as '1' | '-1' }))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="1">+ (soma)</option>
                      <option value="-1">− (subtrai)</option>
                    </select>
                  </div>
                  <div className="flex-1">
                    <label className="block text-xs text-gray-500 mb-1">Nota Explicativa</label>
                    <select
                      value={wrapperModal.addRefId}
                      onChange={e => setWrapperModal(m => ({ ...m, addRefId: e.target.value }))}
                      className="w-full border border-gray-300 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      <option value="">— selecione —</option>
                      {availableNeOps.map(ne => <option key={ne.id} value={ne.id}>{ne.desc_ne}</option>)}
                    </select>
                  </div>
                  <button
                    onClick={addOperando}
                    disabled={!wrapperModal.addRefId}
                    className="flex items-center gap-1.5 bg-gray-100 text-gray-700 rounded-lg px-3 py-1.5 text-sm hover:bg-gray-200 transition-colors disabled:opacity-40"
                  >
                    <Plus size={13} />
                    Add
                  </button>
                </div>
              </div>

              {wrapperModal.error && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{wrapperModal.error}</p>
              )}
            </div>

            <div className="px-6 py-4 border-t border-gray-100 flex gap-3 justify-end flex-shrink-0">
              <button onClick={closeWrapperModal} className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleSaveWrapper} disabled={wrapperModal.saving} className="bg-indigo-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors">
                {wrapperModal.saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirmação exclusão wrapper */}
      {deleteWrapperId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-500 mb-6">O wrapper e todos os seus operandos serão removidos.</p>
            <div className="flex gap-3">
              <button onClick={() => setDeleteWrapperId(null)} className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">Cancelar</button>
              <button onClick={handleDeleteWrapper} disabled={deletingWrapper} className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors">
                {deletingWrapper ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
