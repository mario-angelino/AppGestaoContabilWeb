import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { supabase } from '../../lib/supabase'
import { MESES } from '../../lib/dfUtils'
import { type DFParams, type PeriodoDF, type TipoDF } from '../../lib/dfData'

interface Empresa {
  id: number
  abreviacao: string
  razao_social: string
  nome_logo: string | null
}

interface BalanceteRow {
  id: number
  mes: number
  ano: number
  vigencia_id: number
  plano_contas_vigencia: { id: number; ano_vigencia: number; plano_contas_id: number; empresa_id: number }
}

const TIPOS: { value: TipoDF; label: string; disabled?: boolean }[] = [
  { value: 'DRE', label: 'DRE' },
  { value: 'BP', label: 'Balanço Patrimonial' },
  { value: 'DMPL', label: 'DMPL (em breve)', disabled: true },
  { value: 'DFC', label: 'DFC (em breve)', disabled: true },
]

interface DFFiltroProps {
  onChange: (params: DFParams | null) => void
}

export default function DFFiltro({ onChange }: DFFiltroProps) {
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [periodo2Id, setPeriodo2Id] = useState<number | null>(null)
  const [periodo1Id, setPeriodo1Id] = useState<number | null>(null)
  const [somenteUm, setSomenteUm] = useState(false)
  const [tipo, setTipo] = useState<TipoDF>('DRE')

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['df_empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa')
        .select('id, abreviacao, razao_social, nome_logo')
        .eq('fl_ativa', true)
        .order('abreviacao')
      if (error) throw error
      return data as Empresa[]
    },
  })

  const { data: balancetes = [] } = useQuery<BalanceteRow[]>({
    queryKey: ['df_balancetes', empresaId],
    enabled: empresaId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete')
        .select('id, mes, ano, vigencia_id, plano_contas_vigencia!inner(id, ano_vigencia, plano_contas_id, empresa_id)')
        .eq('plano_contas_vigencia.empresa_id', empresaId!)
        .order('ano')
        .order('mes')
      if (error) throw error
      return data as unknown as BalanceteRow[]
    },
  })

  const empresa = empresas.find(e => e.id === empresaId)
  const bal2 = balancetes.find(b => b.id === periodo2Id)
  const bal1 = balancetes.find(b => b.id === periodo1Id)

  // periodo1 must be <= periodo2
  const balancetesPeriodo1 = bal2
    ? balancetes.filter(b => b.ano < bal2.ano || (b.ano === bal2.ano && b.mes <= bal2.mes))
    : balancetes

  function toPeriodo(b: BalanceteRow): PeriodoDF {
    return {
      balanceteId: b.id,
      mes: b.mes,
      ano: b.ano,
      vigenciaId: b.plano_contas_vigencia.id,
      planoContasId: b.plano_contas_vigencia.plano_contas_id,
      anoVigencia: b.plano_contas_vigencia.ano_vigencia,
    }
  }

  useEffect(() => {
    if (!empresa || !bal2 || (!somenteUm && !bal1)) {
      onChange(null)
      return
    }
    const params: DFParams = {
      empresa: { id: empresa.id, abreviacao: empresa.abreviacao, razao_social: empresa.razao_social, nome_logo: empresa.nome_logo },
      tipo,
      periodo2: toPeriodo(bal2),
      periodo1: somenteUm || !bal1 ? null : toPeriodo(bal1),
    }
    onChange(params)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresa, bal2, bal1, somenteUm, tipo])

  function handleEmpresaChange(id: number | null) {
    setEmpresaId(id)
    setPeriodo2Id(null)
    setPeriodo1Id(null)
  }

  function handlePeriodo2Change(id: number | null) {
    setPeriodo2Id(id)
    setPeriodo1Id(null)
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 items-start">
      {/* Empresa */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Empresa</label>
        <select
          value={empresaId ?? ''}
          onChange={e => handleEmpresaChange(e.target.value === '' ? null : Number(e.target.value))}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">Selecione…</option>
          {empresas.map(e => (
            <option key={e.id} value={e.id}>{e.abreviacao} — {e.razao_social}</option>
          ))}
        </select>
      </div>

      {/* Período final */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Período final</label>
        <select
          value={periodo2Id ?? ''}
          onChange={e => handlePeriodo2Change(e.target.value === '' ? null : Number(e.target.value))}
          disabled={empresaId == null}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">Selecione…</option>
          {balancetes.map(b => (
            <option key={b.id} value={b.id}>{MESES[b.mes - 1]}/{b.ano}</option>
          ))}
        </select>
      </div>

      {/* Período inicial */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Período inicial</label>
        <select
          value={periodo1Id ?? ''}
          onChange={e => setPeriodo1Id(e.target.value === '' ? null : Number(e.target.value))}
          disabled={somenteUm || periodo2Id == null}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
        >
          <option value="">Selecione…</option>
          {balancetesPeriodo1.map(b => (
            <option key={b.id} value={b.id}>{MESES[b.mes - 1]}/{b.ano}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={somenteUm}
            onChange={e => setSomenteUm(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <span className="text-xs text-gray-600">Somente um período</span>
        </label>
      </div>

      {/* Demonstração */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1.5">Demonstração</label>
        <select
          value={tipo}
          onChange={e => setTipo(e.target.value as TipoDF)}
          className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          {TIPOS.map(t => (
            <option key={t.value} value={t.value} disabled={t.disabled}>{t.label}</option>
          ))}
        </select>
      </div>
    </div>
  )
}
