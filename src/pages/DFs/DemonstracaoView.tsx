import { AlertTriangle, CheckCircle } from 'lucide-react'
import { fmtMoeda, isPLSg, periodoLabel, type CalcDFResult } from '../../lib/dfUtils'
import { type DFParams } from '../../lib/dfData'

interface DemonstracaoViewProps {
  tipo: 'DRE' | 'BP' | 'DMPL' | 'DFC'
  params: DFParams
  dfFinal: CalcDFResult
  dfInicial?: CalcDFResult
}

export default function DemonstracaoView({ tipo, params, dfFinal, dfInicial }: DemonstracaoViewProps) {
  if (tipo === 'DMPL' || tipo === 'DFC') {
    return (
      <div className="flex-1 flex items-center justify-center py-20">
        <p className="text-sm text-gray-400">
          {tipo === 'DMPL' ? 'DMPL' : 'DFC'} — Em desenvolvimento, disponível em breve.
        </p>
      </div>
    )
  }

  const hasDual = !!dfInicial
  const labelFinal = periodoLabel(params.periodo2)
  const labelInicial = params.periodo1 ? periodoLabel(params.periodo1) : ''

  if (tipo === 'DRE') {
    return (
      <div className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2">
          DRE — Demonstração do Resultado do Exercício
        </h4>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100">
              <th className="text-left py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Descrição</th>
              {hasDual && <th className="text-right py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{labelInicial}</th>}
              <th className="text-right py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">{labelFinal}</th>
            </tr>
          </thead>
          <tbody>
            {dfFinal.gruposResultado.flatMap(g => g.itens).map(item => {
              const saldoInicial = hasDual
                ? dfInicial!.gruposResultado.flatMap(g => g.itens).find(i => i.id === item.id)?.saldo ?? 0
                : 0
              return (
                <tr key={item.id} className="border-b border-gray-50">
                  <td className="py-1.5 text-gray-700">{item.desc_bp_dre}</td>
                  {hasDual && <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoeda(saldoInicial)}</td>}
                  <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoeda(item.saldo)}</td>
                </tr>
              )
            })}
            {dfFinal.gruposResultado.length === 0 && (
              <tr>
                <td colSpan={hasDual ? 3 : 2} className="py-3 text-center text-xs text-gray-400">
                  Nenhuma conta classificada no subgrupo RESULTADO.
                </td>
              </tr>
            )}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-blue-200 bg-blue-50">
              <td className="py-2 font-bold text-blue-800 text-sm">RESULTADO</td>
              {hasDual && (
                <td className="py-2 text-right font-bold font-mono text-blue-800 text-sm">
                  {fmtMoeda(dfInicial!.totalResultado)}
                </td>
              )}
              <td className="py-2 text-right font-bold font-mono text-blue-800 text-sm">
                {fmtMoeda(dfFinal.totalResultado)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    )
  }

  // BP
  const equilibrado = Math.abs(dfFinal.totalAtivo - dfFinal.totalPassivoEPL) < 0.01

  return (
    <div className="space-y-6">
      <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
        Balanço Patrimonial
      </h4>
      <div className="space-y-4">
        {dfFinal.gruposBP.map(g => {
          const gInicial = hasDual ? dfInicial!.gruposBP.find(x => x.subgrupo.id === g.subgrupo.id) : undefined
          const subtotalFinal = isPLSg(g.subgrupo) ? g.subtotal + dfFinal.totalResultado : g.subtotal
          const subtotalInicial = gInicial
            ? (isPLSg(g.subgrupo) ? gInicial.subtotal + dfInicial!.totalResultado : gInicial.subtotal)
            : 0

          return (
            <div key={g.subgrupo.id}>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                {g.subgrupo.sigla_subgrupo}
                {g.subgrupo.desc_subgrupo ? ` — ${g.subgrupo.desc_subgrupo}` : ''}
              </p>
              <table className="w-full text-sm">
                {hasDual && (
                  <thead>
                    <tr>
                      <th></th>
                      <th className="text-right py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">{labelInicial}</th>
                      <th className="text-right py-1 text-xs font-semibold text-gray-400 uppercase tracking-wide">{labelFinal}</th>
                    </tr>
                  </thead>
                )}
                <tbody>
                  {g.itens.map(item => {
                    const saldoInicial = hasDual
                      ? gInicial?.itens.find(i => i.id === item.id)?.saldo ?? 0
                      : 0
                    return (
                      <tr key={item.id} className="border-b border-gray-50">
                        <td className="py-1.5 text-gray-700 pl-3">{item.desc_bp_dre}</td>
                        {hasDual && <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoeda(saldoInicial)}</td>}
                        <td className="py-1.5 text-right font-mono text-gray-700">{fmtMoeda(item.saldo)}</td>
                      </tr>
                    )
                  })}
                  {isPLSg(g.subgrupo) && (
                    <tr className="border-b border-dashed border-blue-200 bg-blue-50/40">
                      <td className="py-1.5 pl-3 text-blue-700 italic text-sm">Resultado do Período</td>
                      {hasDual && <td className="py-1.5 text-right font-mono text-blue-700 italic">{fmtMoeda(dfInicial!.totalResultado)}</td>}
                      <td className="py-1.5 text-right font-mono text-blue-700 italic">{fmtMoeda(dfFinal.totalResultado)}</td>
                    </tr>
                  )}
                </tbody>
                <tfoot>
                  <tr className="border-t border-gray-200 bg-gray-50">
                    <td className="py-1.5 pl-3 text-xs font-semibold text-gray-500">
                      Subtotal {g.subgrupo.sigla_subgrupo}
                    </td>
                    {hasDual && (
                      <td className="py-1.5 text-right font-mono font-semibold text-gray-700 text-sm">
                        {fmtMoeda(subtotalInicial)}
                      </td>
                    )}
                    <td className="py-1.5 text-right font-mono font-semibold text-gray-700 text-sm">
                      {fmtMoeda(subtotalFinal)}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )
        })}
      </div>

      {/* Verificação */}
      <div className={`rounded-xl p-4 ${equilibrado ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
        <div className="flex items-start gap-3">
          {equilibrado
            ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          }
          <div className="flex-1">
            <p className={`font-semibold text-sm ${equilibrado ? 'text-green-800' : 'text-amber-800'}`}>
              {equilibrado ? 'Balanço equilibrado' : 'Balanço desequilibrado'}
            </p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
              <div>
                <span className="text-gray-500">Total Ativo</span>
                <p className="font-mono font-semibold text-gray-800">{fmtMoeda(dfFinal.totalAtivo)}</p>
              </div>
              <div>
                <span className="text-gray-500">Total Passivo + PL</span>
                <p className="font-mono font-semibold text-gray-800">{fmtMoeda(dfFinal.totalPassivoEPL)}</p>
              </div>
            </div>
            {!equilibrado && (
              <p className="mt-2 text-xs text-amber-700">
                Diferença: <span className="font-mono font-semibold">{fmtMoeda(Math.abs(dfFinal.totalAtivo - dfFinal.totalPassivoEPL))}</span>
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
