import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import CrudTable, { type ColDef, type FieldDef } from '../../components/CrudTable'

interface PapelTrabalho {
  id: number
  sigla_papel: string
  desc_papel: string | null
}

const columns: ColDef<PapelTrabalho>[] = [
  { header: 'Sigla', render: (r) => <span className="font-medium">{r.sigla_papel}</span> },
  {
    header: 'Descrição',
    render: (r) => r.desc_papel ?? <span className="text-gray-400">—</span>
  }
]

const fields: FieldDef[] = [
  {
    name: 'sigla_papel',
    label: 'Sigla',
    type: 'text',
    required: true,
    placeholder: 'ex: PT-01'
  },
  {
    name: 'desc_papel',
    label: 'Descrição',
    type: 'text',
    placeholder: 'ex: Caixa e Bancos'
  }
]

export default function ClassPapelTrabalho(): JSX.Element {
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['class_papel_trabalho'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_papel_trabalho')
        .select('*')
        .order('sigla_papel')
      if (error) throw error
      return data as PapelTrabalho[]
    }
  })

  const add = useMutation({
    mutationFn: async (values: Record<string, string | number | boolean | null>) => {
      const { error } = await supabase.from('class_papel_trabalho').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_papel_trabalho'] })
  })

  const edit = useMutation({
    mutationFn: async ({
      id,
      values
    }: {
      id: number
      values: Record<string, string | number | boolean | null>
    }) => {
      const { error } = await supabase.from('class_papel_trabalho').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_papel_trabalho'] })
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('class_papel_trabalho').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_papel_trabalho'] })
  })

  return (
    <CrudTable
      title="Papel de Trabalho"
      columns={columns}
      data={data}
      loading={isLoading}
      fields={fields}
      onAdd={(v) => add.mutateAsync(v)}
      onEdit={(id, v) => edit.mutateAsync({ id: id as number, values: v })}
      onDelete={(id) => remove.mutateAsync(id as number)}
    />
  )
}
