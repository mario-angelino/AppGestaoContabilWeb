import { useState } from 'react'
import { FileBarChart, Search, Printer } from 'lucide-react'
import { calcularDF, type CalcDFResult } from '../../lib/dfUtils'
import { fetchBalanceteItens, fetchPlanoItens, fetchLinks, type DFParams } from '../../lib/dfData'
import DFFiltro from './DFFiltro'
import DemonstracaoView from './DemonstracaoView'
import ImprimirModal from './ImprimirModal'

interface Resultado {
  tipo: DFParams['tipo']
  params: DFParams
  dfFinal: CalcDFResult
  dfInicial?: CalcDFResult
}

export default function Demonstracoes() {
  const [params, setParams] = useState<DFParams | null>(null)
  const [resultado, setResultado] = useState<Resultado | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [showImprimir, setShowImprimir] = useState(false)

  const canBuscar = params != null

  async function handleBuscar() {
    if (!params) return
    setBuscando(true)
    try {
      if (params.tipo === 'DMPL' || params.tipo === 'DFC') {
        setResultado({ tipo: params.tipo, params, dfFinal: { gruposResultado: [], gruposBP: [], totalResultado: 0, totalAtivo: 0, totalPassivoEPL: 0 } })
        return
      }

      const links = await fetchLinks()

      const [bItemsFinal, planoItensFinal] = await Promise.all([
        fetchBalanceteItens(params.periodo2.balanceteId),
        fetchPlanoItens(params.periodo2.planoContasId),
      ])
      const dfFinal = calcularDF(bItemsFinal, planoItensFinal, links)

      let dfInicial: CalcDFResult | undefined
      if (params.periodo1) {
        const bItemsInicial = await fetchBalanceteItens(params.periodo1.balanceteId)
        const planoItensInicial = params.periodo1.planoContasId === params.periodo2.planoContasId
          ? planoItensFinal
          : await fetchPlanoItens(params.periodo1.planoContasId)
        dfInicial = calcularDF(bItemsInicial, planoItensInicial, links)
      }

      setResultado({ tipo: params.tipo, params, dfFinal, dfInicial })
    } finally {
      setBuscando(false)
    }
  }

  return (
    <div className="flex-1 flex flex-col">
      {/* Page header */}
      <div className="px-8 py-6 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <FileBarChart size={22} className="text-blue-600" />
          <div>
            <h1 className="text-lg font-semibold text-gray-900">Demonstrações</h1>
            <p className="text-sm text-gray-500 mt-0.5">Selecione empresa, período(s) e a demonstração desejada</p>
          </div>
        </div>
      </div>

      {/* Filtros */}
      <div className="px-8 py-6 border-b border-gray-200">
        <DFFiltro onChange={setParams} />

        <div className="flex items-center gap-3 mt-5">
          <button
            onClick={handleBuscar}
            disabled={!canBuscar || buscando}
            className="flex items-center gap-2 bg-blue-600 text-white px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {buscando ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Buscando…
              </>
            ) : (
              <>
                <Search size={16} />
                Buscar
              </>
            )}
          </button>

          <button
            onClick={() => setShowImprimir(true)}
            disabled={!resultado || resultado.tipo === 'DMPL' || resultado.tipo === 'DFC'}
            className="flex items-center gap-2 border border-gray-300 text-gray-700 px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Printer size={16} />
            Imprimir
          </button>
        </div>
      </div>

      {/* Resultado */}
      <div className="flex-1 px-8 py-6 overflow-y-auto">
        {!resultado && (
          <p className="text-sm text-gray-400 text-center py-20">
            Selecione os filtros e clique em "Buscar" para visualizar a demonstração.
          </p>
        )}
        {resultado && (
          <DemonstracaoView
            tipo={resultado.tipo}
            params={resultado.params}
            dfFinal={resultado.dfFinal}
            dfInicial={resultado.dfInicial}
          />
        )}
      </div>

      {showImprimir && resultado && resultado.tipo !== 'DMPL' && resultado.tipo !== 'DFC' && (
        <ImprimirModal
          params={resultado.params}
          dfFinal={resultado.dfFinal}
          dfInicial={resultado.dfInicial}
          tipoAtual={resultado.tipo}
          onClose={() => setShowImprimir(false)}
        />
      )}
    </div>
  )
}
