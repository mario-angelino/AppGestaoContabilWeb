import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import CrudTable, { type ColDef, type FieldDef } from '../../components/CrudTable'

interface Grupo {
  id: number
  desc_grupo: string
}

const columns: ColDef<Grupo>[] = [
  { header: 'Descrição', render: (r) => r.desc_grupo }
]

const fields: FieldDef[] = [
  {
    name: 'desc_grupo',
    label: 'Descrição',
    type: 'text',
    required: true,
    placeholder: 'ex: Ativo'
  }
]

export default function ClassGrupo(): JSX.Element {
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
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

  const add = useMutation({
    mutationFn: async (values: Record<string, string | number | boolean | null>) => {
      const { error } = await supabase.from('class_grupo').insert(values)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_grupo'] })
  })

  const edit = useMutation({
    mutationFn: async ({
      id,
      values
    }: {
      id: number
      values: Record<string, string | number | boolean | null>
    }) => {
      const { error } = await supabase.from('class_grupo').update(values).eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_grupo'] })
  })

  const remove = useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from('class_grupo').delete().eq('id', id)
      if (error) throw new Error(error.message)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['class_grupo'] })
  })

  return (
    <CrudTable
      title="Grupos de Classificação"
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
