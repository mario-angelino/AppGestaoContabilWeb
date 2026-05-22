import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, FolderOpen, Pencil, Trash2, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useActivePlan, type PlanoContas } from '../../contexts/ActivePlanContext'

interface FormState {
  nome: string
  descricao: string
}

const emptyForm: FormState = { nome: '', descricao: '' }

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR')
}

export default function PlanoContas(): JSX.Element {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { activePlan, setActivePlan } = useActivePlan()

  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editing, setEditing] = useState<PlanoContas | null>(null)
  const [form, setForm] = useState<FormState>(emptyForm)
  const [formError, setFormError] = useState('')
  const [deleteTarget, setDeleteTarget] = useState<PlanoContas | null>(null)

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const { data: planos = [], isLoading } = useQuery({
    queryKey: ['plano_contas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas')
        .select('*')
        .order('dt_criacao', { ascending: false })
      if (error) throw error
      return data as PlanoContas[]
    }
  })

  // ── Insert ─────────────────────────────────────────────────────────────────
  const insertMutation = useMutation({
    mutationFn: async (values: FormState) => {
      const { error } = await supabase.from('plano_contas').insert({
        nome: values.nome.trim(),
        descricao: values.descricao.trim() || null
      })
      if (error) throw error
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['plano_contas'] })
      closeModal()
    },
    onError: (err: Error) => setFormError(err.message)
  })

  // ── Update ─────────────────────────────────────────────────────────────────
  const updateMutation = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: FormState }) => {
      const { error } = await supabase
        .from('plano_contas')
        .update({ nome: values.nome.trim(), descricao: values.descricao.trim() || null })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, { id, values }) => {
      queryClient.invalidateQueries({ queryKey: ['plano_contas'] })
      if (activePlan?.id === id) {
        setActivePlan({ ...activePlan, nome: values.nome.trim(), descricao: values.descricao.trim() || null })
      }
      closeModal()
    },
    onError: (err: Error) => setFormError(err.message)
  })

  // ── Delete ─────────────────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('plano_contas').delete().eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['plano_contas'] })
      if (activePlan?.id === id) setActivePlan(null)
      setDeleteTarget(null)
    }
  })

  // ── Handlers ───────────────────────────────────────────────────────────────
  const openAdd = () => {
    setForm(emptyForm)
    setFormError('')
    setModal('add')
  }

  const openEdit = (plano: PlanoContas) => {
    setEditing(plano)
    setForm({ nome: plano.nome, descricao: plano.descricao ?? '' })
    setFormError('')
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setEditing(null)
    setFormError('')
  }

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault()
    if (!form.nome.trim()) return
    if (modal === 'add') {
      insertMutation.mutate(form)
    } else if (modal === 'edit' && editing) {
      updateMutation.mutate({ id: editing.id, values: form })
    }
  }

  const handleAbrir = (plano: PlanoContas) => {
    setActivePlan(plano)
    navigate(`/planos/${plano.id}/itens`)
  }

  const saving = insertMutation.isPending || updateMutation.isPending

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Planos de Contas</h2>
          <p className="text-sm text-gray-500 mt-0.5">{planos.length} plano{planos.length !== 1 ? 's' : ''} cadastrado{planos.length !== 1 ? 's' : ''}</p>
        </div>
        <button
          onClick={openAdd}
          className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Novo Plano
        </button>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : planos.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Nenhum plano cadastrado. Clique em "Novo Plano" para começar.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Nome</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-32">Criado em</th>
                <th className="w-32 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {planos.map((plano, i) => {
                const isActive = activePlan?.id === plano.id
                return (
                  <tr
                    key={plano.id}
                    className={`${isActive ? 'bg-blue-50' : 'hover:bg-gray-50'} ${i < planos.length - 1 ? 'border-b border-gray-100' : ''}`}
                  >
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <span className={`font-medium ${isActive ? 'text-blue-700' : 'text-gray-800'}`}>
                          {plano.nome}
                        </span>
                        {isActive && (
                          <span className="text-xs bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded font-medium">
                            ativo
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{plano.descricao ?? '—'}</td>
                    <td className="px-4 py-3 text-gray-500">{formatDate(plano.dt_criacao)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleAbrir(plano)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Abrir plano"
                        >
                          <FolderOpen size={14} />
                          Abrir
                        </button>
                        <button
                          onClick={() => openEdit(plano)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          title="Editar"
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          onClick={() => setDeleteTarget(plano)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="Excluir"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800">
                {modal === 'add' ? 'Novo Plano de Contas' : 'Editar Plano de Contas'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nome <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={form.nome}
                  onChange={(e) => setForm((f) => ({ ...f, nome: e.target.value }))}
                  placeholder="Ex: Plano de Contas 2025"
                  required
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Descrição
                </label>
                <textarea
                  value={form.descricao}
                  onChange={(e) => setForm((f) => ({ ...f, descricao: e.target.value }))}
                  placeholder="Descrição opcional"
                  rows={3}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                />
              </div>

              {formError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{formError}</p>
              )}

              <div className="flex gap-3 pt-1">
                <button
                  type="button"
                  onClick={closeModal}
                  className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex-1 bg-blue-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-blue-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Salvando...' : 'Salvar'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-500 mb-1">
              Deseja excluir o plano <span className="font-medium text-gray-700">"{deleteTarget.nome}"</span>?
            </p>
            <p className="text-xs text-red-500 mb-6">Todos os itens do plano serão removidos. Esta ação não pode ser desfeita.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteTarget(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
