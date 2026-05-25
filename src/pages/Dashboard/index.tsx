import { useSearchParams } from 'react-router-dom'
import { useMemo } from 'react'
import { LayoutDashboard, Loader2 } from 'lucide-react'
import {
  useEmpresasAcessiveis,
  useBpDreList,
  useAvailableYears,
  useDashboardData
} from './useDashboard'
import OverviewMode from './OverviewMode'
import DrilldownMode from './DrilldownMode'

export default function Dashboard(): JSX.Element {
  const [params, setParams] = useSearchParams()
  const { data: empresas = [], isLoading: loadingEmpresas } = useEmpresasAcessiveis()
  const { data: bpDreList = [] } = useBpDreList()

  const allEmpresaIds = empresas.map(e => e.id)
  const { data: anos = [] } = useAvailableYears(allEmpresaIds)
  const currentYear = new Date().getFullYear()

  // Resolve filters from URL
  const anoParam = parseInt(params.get('ano') ?? '0')
  const ano = anoParam || anos[0] || currentYear

  const empresasParam = params.get('empresas')
  const selectedEmpresaIds = empresasParam
    ? empresasParam.split(',').map(Number).filter(Boolean)
    : []
  const empresaIds = selectedEmpresaIds.length > 0 ? selectedEmpresaIds : allEmpresaIds

  const bpDreIdParam = params.get('bpDreId')
  const bpDreId = bpDreIdParam ? parseInt(bpDreIdParam) : null
  const selectedBpDre = bpDreId != null ? bpDreList.find(b => b.id === bpDreId) : null

  function setAno(v: number) {
    const next = new URLSearchParams(params)
    next.set('ano', String(v))
    setParams(next, { replace: true })
  }

  function toggleEmpresa(id: number) {
    const next = new URLSearchParams(params)
    const current = selectedEmpresaIds.includes(id)
      ? selectedEmpresaIds.filter(x => x !== id)
      : [...selectedEmpresaIds, id]
    if (current.length === 0 || current.length === allEmpresaIds.length) next.delete('empresas')
    else next.set('empresas', current.join(','))
    setParams(next, { replace: true })
  }

  function clearEmpresas() {
    const next = new URLSearchParams(params)
    next.delete('empresas')
    setParams(next, { replace: true })
  }

  function setBpDre(id: number | null) {
    const next = new URLSearchParams(params)
    if (id == null) next.delete('bpDreId')
    else next.set('bpDreId', String(id))
    setParams(next, { replace: true })
  }

  const data = useDashboardData(ano, empresaIds)

  const selectedEmpresas = useMemo(
    () => empresas.filter(e => empresaIds.includes(e.id)),
    [empresas, empresaIds]
  )

  const perEmpresaImportStatus = useMemo(() => {
    const vigMap = new Map(data.vigencias.map(v => [v.id, v]))
    const result = new Map<number, Set<number>>()
    for (const bal of data.balancetes) {
      const vig = vigMap.get(bal.vigencia_id)
      if (!vig) continue
      if (!result.has(vig.empresa_id)) result.set(vig.empresa_id, new Set())
      result.get(vig.empresa_id)!.add(bal.mes)
    }
    return result
  }, [data.balancetes, data.vigencias])

  if (loadingEmpresas) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500">
        <Loader2 className="animate-spin mr-2" size={20} /> Carregando...
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-gray-200 bg-white">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <LayoutDashboard size={20} className="text-blue-600" />
            <h1 className="text-lg font-semibold text-gray-900">Dashboard</h1>
          </div>
          {data.latestMes && (
            <span className="text-xs text-gray-500">
              Ref.: {['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'][data.latestMes - 1]}/{ano}
            </span>
          )}
        </div>

        {/* Filter row */}
        <div className="flex flex-wrap items-center gap-4">
          {/* Ano */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Ano</span>
            <select
              value={ano}
              onChange={e => setAno(parseInt(e.target.value))}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {anos.length === 0 && <option value={currentYear}>{currentYear}</option>}
              {anos.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>

          {/* Empresas */}
          {empresas.length > 1 && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500 font-medium">Empresa</span>
              <button
                onClick={clearEmpresas}
                className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                  selectedEmpresaIds.length === 0
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                Todas
              </button>
              {empresas.map(e => (
                <button
                  key={e.id}
                  onClick={() => toggleEmpresa(e.id)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
                    selectedEmpresaIds.includes(e.id)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {e.abreviacao}
                </button>
              ))}
            </div>
          )}

          {/* BP/DRE Drill-down */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-gray-500 font-medium">Classificação</span>
            <select
              value={bpDreId ?? ''}
              onChange={e => setBpDre(e.target.value ? parseInt(e.target.value) : null)}
              className="text-sm border border-gray-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Visão Geral</option>
              {bpDreList.map(b => (
                <option key={b.id} value={b.id}>{b.desc_bp_dre}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto bg-gray-50 p-6">
        {data.isLoading ? (
          <div className="flex items-center justify-center h-48 text-gray-500">
            <Loader2 className="animate-spin mr-2" size={20} /> Carregando dados...
          </div>
        ) : !data.hasData ? (
          <div className="flex flex-col items-center justify-center h-48 text-gray-400">
            <LayoutDashboard size={48} className="mb-3 text-gray-300" />
            <p className="text-sm font-medium">Nenhum balancete importado para {ano}</p>
            <p className="text-xs mt-1">Importe balancetes na página Balancetes para visualizar o dashboard.</p>
          </div>
        ) : bpDreId != null ? (
          <DrilldownMode
            bpDreId={bpDreId}
            bpDreDesc={selectedBpDre?.desc_bp_dre ?? 'Classificação'}
            bpDreByMonth={data.bpDreByMonth}
            balancetes={data.balancetes}
            rawItems={data.rawItems}
            balanceteMap={data.balanceteMap}
            vigenciaMap={data.vigenciaMap}
            planoItemMap={data.planoItemMap}
            latestMes={data.latestMes}
          />
        ) : (
          <OverviewMode
            data={data}
            selectedEmpresas={selectedEmpresas}
            perEmpresaImportStatus={perEmpresaImportStatus}
          />
        )}
      </div>
    </div>
  )
}
