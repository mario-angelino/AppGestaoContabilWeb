import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LayoutList, X } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import CrudTable, { type ColDef, type FieldDef } from '../../components/CrudTable'

interface Grupo {
  id: number
  desc_grupo: string
}

interface Subgrupo {
  id: number
  id_class_grupo: number | null
  sigla_subgrupo: string
  desc_subgrupo: string | null
  class_grupo: Grupo | null
}

interface BpDreLink {
  id: number
  indice: number | null
  id_class_bp_dre: number
  class_bp_dre: { id: number; desc_bp_dre: string } | null
}

// ── Modal de detalhes: lista class_bp_dre do subgrupo com edição de índice ──

function DetalhesModal({
  subgrupo,
  onClose,
}: {
  subgrupo: Subgrupo
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [indiceEdits, setIndiceEdits] = useState<Record<number, string>>({})
  const [saving, setSaving] = useState<number | null>(null)

  const { data: links = [], isLoading } = useQuery({
    queryKey: ['bp_dre_subgrupo_detalhes', subgrupo.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_bp_dre_subgrupo')
        .select('id, indice, id_class_bp_dre, class_bp_dre(id, desc_bp_dre)')
        .eq('id_class_subgrupo', subgrupo.id)
        .order('indice', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as unknown as BpDreLink[]
    }
  })

  const getIndice = (link: BpDreLink): string =>
    indiceEdits[link.id] !== undefined
      ? indiceEdits[link.id]
      : link.indice != null ? String(link.indice) : ''

  const handleBlur = async (link: BpDreLink) => {
    const val = getIndice(link)
    const original = link.indice != null ? String(link.indice) : ''
    if (val === original) return // sem mudança
    const numVal = val !== '' ? Number(val) : null
    setSaving(link.id)
    try {
      const { error } = await supabase
        .from('class_bp_dre_subgrupo')
        .update({ indice: numVal })
        .eq('id', link.id)
      if (error) throw error
      setIndiceEdits((m) => { const n = { ...m }; delete n[link.id]; return n })
      qc.invalidateQueries({ queryKey: ['bp_dre_subgrupo_detalhes', subgrupo.id] })
      qc.invalidateQueries({ queryKey: ['class_bp_dre'] })
      qc.invalidateQueries({ queryKey: ['class_bp_dre_subgrupo_val'] })
    } finally {
      setSaving(null)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">
              {subgrupo.sigla_subgrupo}
              {subgrupo.desc_subgrupo ? ` — ${subgrupo.desc_subgrupo}` : ''}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">BP/DRE vinculados — edite o índice e clique fora para salvar</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-7 w-7 border-b-2 border-blue-600" />
            </div>
          ) : links.length === 0 ? (
            <p className="text-center py-12 text-sm text-gray-400">
              Nenhum BP/DRE vinculado a este subgrupo.
            </p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-100 z-10">
                <tr>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Descrição BP/DRE
                  </th>
                  <th className="w-32 px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide text-center">
                    Índice
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {links.map((link) => (
                  <tr key={link.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 text-gray-700">
                      {link.class_bp_dre?.desc_bp_dre ?? '—'}
                    </td>
                    <td className="px-4 py-2.5 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <input
                          type="number"
                          value={getIndice(link)}
                          onChange={(e) =>
                            setIndiceEdits((m) => ({ ...m, [link.id]: e.target.value }))
                          }
                          onBlur={() => handleBlur(link)}
                          placeholder="—"
                          className="w-20 border border-gray-200 rounded-lg px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        {saving === link.id && (
                          <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-blue-500 flex-shrink-0" />
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Página principal ─────────────────────────────────────────────────────────

export default function ClassSubgrupo(): JSX.Element {
  const qc = useQueryClient()
  const [detailsSubgrupo, setDetailsSubgrupo] = useState<Subgrupo | null>(null)

  const { data: grupos = [] } = useQuery({
    queryKey: ['class_grupo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_grupo')
        .select('id, desc_grupo')
        .order('desc_grupo')
      if (error) throw error
      return data as Grupo[]
    }
  })

  const { data = [], isLoading } = useQuery({
    queryKey: ['class_subgrupo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_subgrupo')
        .select('*, class_grupo(id, desc_grupo)')
        .order('sigla_subgrupo')
      if (error) throw error
      return data as Subgrupo[]
    }
  })

  const columns: ColDef<Subgrupo>[] = [
    { header: 'Sigla', render: (r) => <span className="font-medium">{r.sigla_subgrupo}</span> },
    { header: 'Descrição', render: (r) => r.desc_subgrupo ?? <span className="text-gray-400">—</span> },
    {
      header: 'Grupo',
      render: (r) =>
        r.class_grupo ? (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-600">
            {r.class_grupo.desc_grupo}
          </span>
        ) : (
          <span className="text-gray-400">—</span>
        )
    }
  ]

  const fields: FieldDef[] = [
    {
      name: 'sigla_subgrupo',
      label: 'Sigla',
      type: 'text',
      required: true,
      placeholder: 'ex: AC'
    },
    {
      name: 'desc_subgrupo',
      label: 'Descrição',
      type: 'text',
      placeholder: 'ex: Ativo Circulante'
    },
    {
      name: 'id_class_grupo',
      label: 'Grupo',
      type: 'select',
      options: grupos.map((g) => ({ value: g.id, label: g.desc_grupo }))
    }
  ]

  const add = useMutation({
    mutationFn: async (values: Record<string, string | number | boolean | null>) => {
      const payload = {
        ...values,
        id_class_grupo: values.id_class_grupo ? Number(values.id_class_grupo) : null
      }
      const { error } = await supabase.from('class_subgrupo').insert(payload)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_subgrupo'] })
  })

  const edit = useMutation({
    mutationFn: async ({
      id,
      values
    }: {
      id: number
      values: Record<string, string | number | boolean | null>
    }) => {
      const payload = {
        ...values,
        id_class_grupo: values.id_class_grupo ? Number(values.id_class_grupo) : null
      }
      const { error } = await supabase.from('class_subgrupo').update(payload).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_subgrupo'] })
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('class_subgrupo').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_subgrupo'] })
  })

  return (
    <>
      <CrudTable
        title="Subgrupos de Classificação"
        columns={columns}
        data={data}
        loading={isLoading}
        fields={fields}
        onAdd={(v) => add.mutateAsync(v)}
        onEdit={(id, v) => edit.mutateAsync({ id: id as number, values: v })}
        onDelete={(id) => remove.mutateAsync(id as number)}
        extraActions={(row) => (
          <button
            onClick={() => setDetailsSubgrupo(row)}
            className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
            title="Ver BP/DRE vinculados"
          >
            <LayoutList size={14} />
          </button>
        )}
      />

      {detailsSubgrupo && (
        <DetalhesModal
          subgrupo={detailsSubgrupo}
          onClose={() => setDetailsSubgrupo(null)}
        />
      )}
    </>
  )
}
