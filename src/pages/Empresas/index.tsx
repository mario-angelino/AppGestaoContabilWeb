import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import CrudTable, { type ColDef, type FieldDef } from '../../components/CrudTable'

interface Empresa {
  id: number
  abreviacao: string
  razao_social: string
  cnpj: string | null
  fl_controladora: boolean
  fl_controlada: boolean
  fl_ativa: boolean
  fl_consolida_ebisa: boolean
}

function BoolBadge({ value, trueLabel = 'Sim', falseLabel = 'Não' }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return value ? (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">
      {trueLabel}
    </span>
  ) : (
    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-gray-100 text-gray-400">
      {falseLabel}
    </span>
  )
}

export default function Empresas(): JSX.Element {
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['empresa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa')
        .select('id, abreviacao, razao_social, cnpj, fl_controladora, fl_controlada, fl_ativa, fl_consolida_ebisa')
        .order('abreviacao')
      if (error) throw error
      return data as Empresa[]
    }
  })

  const columns: ColDef<Empresa>[] = [
    {
      header: 'ID',
      render: (r) => <span className="font-mono text-xs text-gray-500">{r.id}</span>
    },
    {
      header: 'Abreviação',
      render: (r) => <span className="font-semibold text-gray-800">{r.abreviacao}</span>
    },
    {
      header: 'Razão Social',
      render: (r) => r.razao_social
    },
    {
      header: 'CNPJ',
      render: (r) =>
        r.cnpj ? (
          <span className="font-mono text-xs">{r.cnpj}</span>
        ) : (
          <span className="text-gray-400">—</span>
        )
    },
    {
      header: 'Controladora',
      render: (r) => <BoolBadge value={r.fl_controladora} />
    },
    {
      header: 'Controlada',
      render: (r) => <BoolBadge value={r.fl_controlada} />
    },
    {
      header: 'Consolida EBISA',
      render: (r) => <BoolBadge value={r.fl_consolida_ebisa} />
    },
    {
      header: 'Ativa',
      render: (r) => <BoolBadge value={r.fl_ativa} />
    }
  ]

  const fields: FieldDef[] = [
    {
      name: 'id',
      label: 'ID (ERP)',
      type: 'number',
      required: true,
      placeholder: 'ex: 101',
      addOnly: true
    },
    {
      name: 'abreviacao',
      label: 'Abreviação',
      type: 'text',
      required: true,
      placeholder: 'ex: ALFA'
    },
    {
      name: 'razao_social',
      label: 'Razão Social',
      type: 'text',
      required: true,
      placeholder: 'ex: Alfa Indústria Ltda'
    },
    {
      name: 'cnpj',
      label: 'CNPJ',
      type: 'text',
      placeholder: 'ex: 00.000.000/0001-00'
    },
    { name: 'fl_controladora',    label: 'Controladora',    type: 'checkbox' },
    { name: 'fl_controlada',      label: 'Controlada',      type: 'checkbox' },
    { name: 'fl_consolida_ebisa', label: 'Consolida EBISA', type: 'checkbox' },
    { name: 'fl_ativa',           label: 'Ativa',           type: 'checkbox' }
  ]

  const add = useMutation({
    mutationFn: async (values: Record<string, string | number | boolean | null>) => {
      const { error } = await supabase.from('empresa').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa'] })
  })

  const edit = useMutation({
    mutationFn: async ({ id, values }: { id: number; values: Record<string, string | number | boolean | null> }) => {
      const { error } = await supabase.from('empresa').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa'] })
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('empresa').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['empresa'] })
  })

  return (
    <CrudTable
      title="Empresas"
      columns={columns}
      data={data}
      loading={isLoading}
      fields={fields}
      onAdd={(v) => add.mutateAsync(v)}
      onEdit={(id, v) => edit.mutateAsync({ id, values: v })}
      onDelete={(id) => remove.mutateAsync(id)}
    />
  )
}
