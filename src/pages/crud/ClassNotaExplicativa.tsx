import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
  {
    name: 'desc_ne',
    label: 'Descrição',
    type: 'text',
    required: true,
    placeholder: 'ex: Caixa e Equivalentes'
  }
]

export default function ClassNotaExplicativa(): JSX.Element {
  const qc = useQueryClient()

  const { data = [], isLoading } = useQuery({
    queryKey: ['class_nota_explicativa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_nota_explicativa')
        .select('*')
        .order('desc_ne')
      if (error) throw error
      return data as NotaExplicativa[]
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
    mutationFn: async ({
      id,
      values
    }: {
      id: number
      values: Record<string, string | number | boolean | null>
    }) => {
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

  return (
    <CrudTable
      title="Notas Explicativas"
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
