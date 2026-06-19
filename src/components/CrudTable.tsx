import { useState, type FormEvent } from 'react'
import { Plus, Pencil, Trash2, X } from 'lucide-react'

export interface FieldDef {
  name: string
  label: string
  type: 'text' | 'number' | 'select' | 'checkbox'
  required?: boolean
  placeholder?: string
  options?: { value: number | string; label: string }[]
  addOnly?: boolean  // exibe apenas no modal de criação, não na edição
}

export interface ColDef<T> {
  header: string
  render: (row: T) => React.ReactNode
}

interface Props<T extends { id: number }> {
  title: string
  columns: ColDef<T>[]
  data: T[]
  loading: boolean
  fields: FieldDef[]
  onAdd: (values: Record<string, string | number | boolean | null>) => Promise<void>
  onEdit: (id: number, values: Record<string, string | number | boolean | null>) => Promise<void>
  onDelete: (id: number) => Promise<void>
  extraActions?: (row: T) => React.ReactNode
  extraHeaderAction?: React.ReactNode
}

type FormValues = Record<string, string | number | boolean>

function emptyValues(fields: FieldDef[]): FormValues {
  return Object.fromEntries(fields.map((f) => [f.name, f.type === 'checkbox' ? false : '']))
}

function rowValues<T extends Record<string, unknown>>(row: T, fields: FieldDef[]): FormValues {
  return Object.fromEntries(
    fields.map((f) => {
      const v = row[f.name]
      if (f.type === 'checkbox') return [f.name, v === true]
      return [f.name, (v ?? '') as string | number]
    })
  )
}

function cleanValues(
  values: FormValues,
  fields: FieldDef[],
  mode: 'add' | 'edit'
): Record<string, string | number | boolean | null> {
  return Object.fromEntries(
    fields
      .filter((f) => !(f.addOnly && mode === 'edit'))
      .map((f) => {
        const v = values[f.name]
        if (f.type === 'checkbox') return [f.name, v === true]
        if (f.type === 'number') {
          const n = Number(v)
          return [f.name, v === '' || v === undefined || isNaN(n) ? null : n]
        }
        return [f.name, v === '' || v === undefined ? null : v]
      })
  )
}

export default function CrudTable<T extends { id: number }>({
  title,
  columns,
  data,
  loading,
  fields,
  onAdd,
  onEdit,
  onDelete,
  extraActions,
  extraHeaderAction,
}: Props<T>): JSX.Element {
  const [modal, setModal] = useState<'add' | 'edit' | null>(null)
  const [editingRow, setEditingRow] = useState<T | null>(null)
  const [values, setValues] = useState<FormValues>({})
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  const openAdd = () => {
    setValues(emptyValues(fields))
    setFormError('')
    setModal('add')
  }

  const openEdit = (row: T) => {
    setEditingRow(row)
    setValues(rowValues(row as Record<string, unknown>, fields))
    setFormError('')
    setModal('edit')
  }

  const closeModal = () => {
    setModal(null)
    setEditingRow(null)
    setFormError('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setFormError('')
    try {
      const cleaned = cleanValues(values, fields, modal!)
      if (modal === 'add') {
        await onAdd(cleaned)
      } else if (modal === 'edit' && editingRow) {
        await onEdit(editingRow.id, cleaned)
      }
      closeModal()
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Erro ao salvar.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (deleteId === null) return
    setDeleting(true)
    try {
      await onDelete(deleteId)
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  const setValue = (name: string, value: string | number | boolean) =>
    setValues((v) => ({ ...v, [name]: value }))

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">{title}</h2>
        <div className="flex items-center gap-2">
          {extraHeaderAction}
          <button
            onClick={openAdd}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Plus size={16} />
            Novo
          </button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : data.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">Nenhum registro cadastrado.</div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {columns.map((col, i) => (
                  <th
                    key={i}
                    className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide"
                  >
                    {col.header}
                  </th>
                ))}
                <th className="w-20 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((row, i) => (
                <tr
                  key={row.id}
                  className={`hover:bg-gray-50 ${i < data.length - 1 ? 'border-b border-gray-50' : ''}`}
                >
                  {columns.map((col, j) => (
                    <td key={j} className="px-4 py-3 text-gray-700">
                      {col.render(row)}
                    </td>
                  ))}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      {extraActions?.(row)}
                      <button
                        onClick={() => openEdit(row)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Editar"
                      >
                        <Pencil size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(row.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
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

      {/* Add / Edit modal */}
      {modal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold text-gray-800">
                {modal === 'add' ? 'Novo registro' : 'Editar registro'}
              </h3>
              <button onClick={closeModal} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              {fields.filter((f) => !(f.addOnly && modal === 'edit')).map((field) =>
                field.type === 'checkbox' ? (
                  <label key={field.name} className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={values[field.name] === true}
                      onChange={(e) => setValue(field.name, e.target.checked)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span className="text-sm font-medium text-gray-700">{field.label}</span>
                  </label>
                ) : (
                  <div key={field.name}>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.type === 'select' ? (
                      <select
                        value={(values[field.name] ?? '') as string | number}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        required={field.required}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      >
                        <option value="">— Selecione —</option>
                        {field.options?.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <input
                        type={field.type === 'number' ? 'number' : 'text'}
                        value={(values[field.name] ?? '') as string | number}
                        onChange={(e) => setValue(field.name, e.target.value)}
                        placeholder={field.placeholder}
                        required={field.required}
                        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    )}
                  </div>
                )
              )}

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
