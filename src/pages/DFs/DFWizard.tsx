import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FileText } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { type DFParams } from '../../lib/gerarDFpdf'

const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez']

interface Empresa {
  id: number
  abreviacao: string
  razao_social: string
}

interface Vigencia {
  id: number
  ano_vigencia: number
  empresa: { id: number; abreviacao: string; razao_social: string }
  plano_contas: { id: number; nome: string }
}

interface Balancete {
  id: number
  mes: number
  ano: number
}

interface DFWizardProps {
  title: string
  generating: boolean
  onGenerate: (params: DFParams) => Promise<void>
}

export default function DFWizard({ title, generating, onGenerate }: DFWizardProps) {
  const [empresaId, setEmpresaId] = useState<number | null>(null)
  const [vigenciaId, setVigenciaId] = useState<number | null>(null)
  const [periodo2Id, setPeriodo2Id] = useState<number | null>(null)
  const [periodo1Id, setPeriodo1Id] = useState<number | null>(null)
  const [somenteUm, setSomenteUm] = useState(false)

  const { data: empresas = [] } = useQuery<Empresa[]>({
    queryKey: ['df_empresas'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('empresa')
        .select('id, abreviacao, razao_social')
        .eq('fl_ativa', true)
        .order('abreviacao')
      if (error) throw error
      return data as Empresa[]
    },
  })

  const { data: vigencias = [] } = useQuery<Vigencia[]>({
    queryKey: ['df_vigencias', empresaId],
    enabled: empresaId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas_vigencia')
        .select('id, ano_vigencia, empresa(id, abreviacao, razao_social), plano_contas(id, nome)')
        .eq('empresa_id', empresaId!)
        .order('ano_vigencia', { ascending: false })
      if (error) throw error
      return data as unknown as Vigencia[]
    },
  })

  const { data: balancetes = [] } = useQuery<Balancete[]>({
    queryKey: ['df_balancetes', vigenciaId],
    enabled: vigenciaId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete')
        .select('id, mes, ano')
        .eq('vigencia_id', vigenciaId!)
        .order('ano')
        .order('mes')
      if (error) throw error
      return data as Balancete[]
    },
  })

  const bal2 = balancetes.find(b => b.id === periodo2Id)
  const bal1 = balancetes.find(b => b.id === periodo1Id)
  const vigencia = vigencias.find(v => v.id === vigenciaId)
  const empresa = empresas.find(e => e.id === empresaId)

  // periodo1 must be <= periodo2
  const balancetesPeriodo1 = bal2
    ? balancetes.filter(b => b.ano < bal2.ano || (b.ano === bal2.ano && b.mes <= bal2.mes))
    : balancetes

  const canGenerate = empresa != null && vigencia != null && bal2 != null && (somenteUm || bal1 != null)

  function handleEmpresaChange(id: number | null) {
    setEmpresaId(id)
    setVigenciaId(null)
    setPeriodo2Id(null)
    setPeriodo1Id(null)
  }

  function handleVigenciaChange(id: number | null) {
    setVigenciaId(id)
    setPeriodo2Id(null)
    setPeriodo1Id(null)
  }

  function handlePeriodo2Change(id: number | null) {
    setPeriodo2Id(id)
    setPeriodo1Id(null)
  }

  async function handleSubmit() {
    if (!empresa || !vigencia || !bal2) return

    const params: DFParams = {
      empresa: { id: empresa.id, abreviacao: empresa.abreviacao, razao_social: empresa.razao_social },
      vigencia: { id: vigencia.id, ano_vigencia: vigencia.ano_vigencia, plano_contas_id: vigencia.plano_contas.id },
      periodo2: { balanceteId: bal2.id, mes: bal2.mes, ano: bal2.ano },
      periodo1: somenteUm || !bal1 ? null : { balanceteId: bal1.id, mes: bal1.mes, ano: bal1.ano },
    }

    await onGenerate(params)
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Page header */}
      <div className="px-8 py-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <FileText size={22} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">{title}</h1>
            <p className="text-sm text-gray-500 mt-0.5">Selecione os parâmetros para gerar o documento PDF</p>
          </div>
        </div>
      </div>

      {/* Form */}
      <div className="flex-1 px-8 py-6">
        <div className="max-w-lg space-y-5">

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

          {/* Vigência */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Vigência</label>
            <select
              value={vigenciaId ?? ''}
              onChange={e => handleVigenciaChange(e.target.value === '' ? null : Number(e.target.value))}
              disabled={empresaId == null}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">Selecione…</option>
              {vigencias.map(v => (
                <option key={v.id} value={v.id}>{v.ano_vigencia} — {v.plano_contas.nome}</option>
              ))}
            </select>
          </div>

          {/* Período final */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">Período final</label>
            <select
              value={periodo2Id ?? ''}
              onChange={e => handlePeriodo2Change(e.target.value === '' ? null : Number(e.target.value))}
              disabled={vigenciaId == null}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
            >
              <option value="">Selecione…</option>
              {balancetes.map(b => (
                <option key={b.id} value={b.id}>{MESES[b.mes - 1]}/{b.ano}</option>
              ))}
            </select>
          </div>

          {/* Somente um período */}
          <label className="flex items-center gap-2.5 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={somenteUm}
              onChange={e => setSomenteUm(e.target.checked)}
              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Somente um período (omitir coluna do período inicial)</span>
          </label>

          {/* Período inicial */}
          {!somenteUm && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1.5">Período inicial</label>
              <select
                value={periodo1Id ?? ''}
                onChange={e => setPeriodo1Id(e.target.value === '' ? null : Number(e.target.value))}
                disabled={periodo2Id == null}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white disabled:bg-gray-100 disabled:text-gray-400"
              >
                <option value="">Selecione…</option>
                {balancetesPeriodo1.map(b => (
                  <option key={b.id} value={b.id}>{MESES[b.mes - 1]}/{b.ano}</option>
                ))}
              </select>
            </div>
          )}

          {/* Gerar */}
          <div className="pt-2">
            <button
              onClick={handleSubmit}
              disabled={!canGenerate || generating}
              className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {generating ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Gerando…
                </>
              ) : (
                <>
                  <FileText size={16} />
                  Gerar PDF
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
