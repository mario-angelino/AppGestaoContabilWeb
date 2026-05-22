import { useState, type FormEvent } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, X, Building2 } from 'lucide-react'
import { supabase } from '../../lib/supabase'

interface Empresa {
  id: number
  abreviacao: string
  razao_social: string
}

interface PlanoContas {
  id: number
  nome: string
}

interface Vigencia {
  id: number
  empresa_id: number
  plano_contas_id: number
  ano_vigencia: number
  plano_contas: PlanoContas
}

export default function Vigencias(): JSX.Element {
  const qc = useQueryClient()

  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [modalMode, setModalMode] = useState<'new' | 'edit' | null>(null)
  const [editingId, setEditingId] = useState<number | null>(null)
  const [ano, setAno] = useState(String(new Date().getFullYear()))
  const [planoId, setPlanoId] = useState('')
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Queries ────────────────────────────────────────────────────────────────

  const { data: empresas = [] } = useQuery({
    queryKey: ['empresa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa')
        .select('id, abreviacao, razao_social')
        .order('abreviacao')
      if (error) throw error
      return data as Empresa[]
    }
  })

  const { data: vigencias = [], isLoading } = useQuery({
    queryKey: ['plano_contas_vigencia', empresaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas_vigencia')
        .select('id, empresa_id, plano_contas_id, ano_vigencia, plano_contas(id, nome)')
        .eq('empresa_id', empresaId!)
        .order('ano_vigencia', { ascending: false })
      if (error) throw error
      return data as unknown as Vigencia[]
    },
    enabled: !!empresaId
  })

  const { data: planos = [] } = useQuery({
    queryKey: ['plano_contas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas')
        .select('id, nome')
        .order('nome')
      if (error) throw error
      return data as PlanoContas[]
    }
  })

  // ── Helpers ────────────────────────────────────────────────────────────────

  const selectedEmpresa = empresas.find((e) => e.id === empresaId)
  const editingVigencia = vigencias.find((v) => v.id === editingId)

  const openNew = () => {
    setAno(String(new Date().getFullYear()))
    setPlanoId('')
    setFormError('')
    setModalMode('new')
  }

  const openEdit = (v: Vigencia) => {
    setEditingId(v.id)
    setPlanoId(String(v.plano_contas_id))
    setFormError('')
    setModalMode('edit')
  }

  const closeModal = () => {
    setModalMode(null)
    setEditingId(null)
    setFormError('')
  }

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError('')

    const anoNum = Number(ano)
    if (!anoNum || anoNum < 2000 || anoNum > 2099) {
      setFormError('Informe um ano válido entre 2000 e 2099.')
      return
    }
    if (!planoId) {
      setFormError('Selecione um plano de contas.')
      return
    }

    setSaving(true)
    try {
      if (modalMode === 'new') {
        // Verifica duplicata antes de tentar inserir
        const duplicata = vigencias.some((v) => v.ano_vigencia === anoNum)
        if (duplicata) {
          setFormError(`Já existe uma vigência para o ano ${anoNum} nesta empresa.`)
          return
        }

        const { error } = await supabase.from('plano_contas_vigencia').insert({
          empresa_id: empresaId,
          plano_contas_id: Number(planoId),
          ano_vigencia: anoNum
        })
        if (error) throw new Error(error.message)
      } else if (modalMode === 'edit' && editingId) {
        const { error } = await supabase
          .from('plano_contas_vigencia')
          .update({ plano_contas_id: Number(planoId) })
          .eq('id', editingId)
        if (error) throw new Error(error.message)
      }

      qc.invalidateQueries({ queryKey: ['plano_contas_vigencia', empresaId] })
      closeModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  // ── Delete ─────────────────────────────────────────────────────────────────

  const handleDelete = async () => {
    if (deleteId === null) return
    setDeleting(true)
    try {
      const { error } = await supabase
        .from('plano_contas_vigencia')
        .delete()
        .eq('id', deleteId)
      if (error) throw new Error(error.message)
      qc.invalidateQueries({ queryKey: ['plano_contas_vigencia', empresaId] })
      setDeleteId(null)
    } catch (err) {
      console.error(err)
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Vigências</h2>
        {empresaId && (
          <button
            onClick={openNew}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Nova Vigência
          </button>
        )}
      </div>

      {/* Filtro de empresa */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Empresa</label>
        <select
          value={empresaId ?? ''}
          onChange={(e) => setEmpresaId(e.target.value ? Number(e.target.value) : null)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-96"
        >
          <option value="">— Selecione uma empresa —</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.abreviacao} — {e.razao_social}
            </option>
          ))}
        </select>
      </div>

      {/* Conteúdo principal */}
      {!empresaId ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-300 gap-3">
          <Building2 size={40} />
          <p className="text-sm text-gray-400">Selecione uma empresa para ver as vigências.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : vigencias.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Nenhuma vigência cadastrada para esta empresa.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide w-28">
                  Ano
                </th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Plano de Contas
                </th>
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {vigencias.map((v, i) => (
                <tr
                  key={v.id}
                  className={`hover:bg-gray-50 ${i < vigencias.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-800">{v.ano_vigencia}</span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{v.plano_contas.nome}</td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => openEdit(v)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar plano vinculado"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(v.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir vigência"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal nova / editar vigência */}
      {modalMode && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800">
                {modalMode === 'new' ? 'Nova Vigência' : 'Editar Vigência'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            {/* Contexto somente leitura */}
            <div className="mb-4 p-3 bg-gray-50 rounded-lg text-xs text-gray-500 space-y-1">
              <p>
                <span className="font-medium text-gray-700">Empresa: </span>
                {selectedEmpresa?.abreviacao} — {selectedEmpresa?.razao_social}
              </p>
              {modalMode === 'edit' && editingVigencia && (
                <p>
                  <span className="font-medium text-gray-700">Ano: </span>
                  {editingVigencia.ano_vigencia}
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {modalMode === 'new' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Ano <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="number"
                    value={ano}
                    onChange={(e) => setAno(e.target.value)}
                    min={2000}
                    max={2099}
                    required
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Plano de Contas <span className="text-red-500">*</span>
                </label>
                <select
                  value={planoId}
                  onChange={(e) => setPlanoId(e.target.value)}
                  required
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">— Selecione —</option>
                  {planos.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.nome}
                    </option>
                  ))}
                </select>
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

      {/* Confirmação de exclusão */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-500 mb-6">Esta ação não pode ser desfeita.</p>
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
