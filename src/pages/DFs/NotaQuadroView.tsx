import { useState } from 'react'
import { fmtMoeda, isAtivoSg, periodoLabel, type NotaQuadro } from '../../lib/dfUtils'
import { type DFParams } from '../../lib/dfData'
import NotaItemDetalheModal from './NotaItemDetalheModal'

interface NotaQuadroViewProps {
  quadro: NotaQuadro
  params: DFParams
}

interface Detalhe {
  idClassNotaExplicativa: number
  idClassSubgrupo: number
  desc: string
  balanceteId: number
  planoContasId: number
}

const CELL_H = 'h-[0.6cm]'
const SPACER_W = 'w-4'

export default function NotaQuadroView({ quadro, params }: NotaQuadroViewProps) {
  const [detalhe, setDetalhe] = useState<Detalhe | null>(null)
  const hasDual = !!params.periodo1
  const labelFinal = periodoLabel(params.periodo2)
  const labelInicial = params.periodo1 ? periodoLabel(params.periodo1) : ''

  return (
    <div>
      <table className="w-full text-sm">
        {hasDual && (
          <thead>
            <tr>
              <th></th>
              <th className={`text-right text-xs font-semibold text-gray-400 uppercase tracking-wide border-b-2 border-gray-300 pb-1 ${CELL_H}`}>
                {labelInicial}
              </th>
              <th className={SPACER_W}></th>
              <th className={`text-right text-xs font-semibold text-gray-400 uppercase tracking-wide border-b-2 border-gray-300 pb-1 ${CELL_H}`}>
                {labelFinal}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          {quadro.linhas.map(linha => (
            <tr key={linha.idClassNotaExplicativa} className="border-b border-gray-50">
              <td className={`py-1.5 text-gray-700 pl-3 ${CELL_H}`}>{linha.desc_ne}</td>
              {hasDual && (
                <>
                  <td className={`py-1.5 text-right font-mono ${CELL_H}`}>
                    {params.periodo1 ? (
                      <button
                        className="text-gray-700 hover:text-blue-700 hover:underline"
                        onClick={() => setDetalhe({
                          idClassNotaExplicativa: linha.idClassNotaExplicativa,
                          idClassSubgrupo: quadro.subgrupo.id,
                          desc: linha.desc_ne,
                          balanceteId: params.periodo1!.balanceteId,
                          planoContasId: params.periodo1!.planoContasId,
                        })}
                      >
                        {fmtMoeda(linha.saldoInicial ?? 0)}
                      </button>
                    ) : fmtMoeda(linha.saldoInicial ?? 0)}
                  </td>
                  <td className={SPACER_W}></td>
                </>
              )}
              <td className={`py-1.5 text-right font-mono ${CELL_H}`}>
                <button
                  className="text-gray-700 hover:text-blue-700 hover:underline"
                  onClick={() => setDetalhe({
                    idClassNotaExplicativa: linha.idClassNotaExplicativa,
                    idClassSubgrupo: quadro.subgrupo.id,
                    desc: linha.desc_ne,
                    balanceteId: params.periodo2.balanceteId,
                    planoContasId: params.periodo2.planoContasId,
                  })}
                >
                  {fmtMoeda(linha.saldoFinal)}
                </button>
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-gray-200 bg-gray-50">
            <td className={`py-1.5 pl-3 text-xs font-semibold text-gray-500 ${CELL_H}`}>
              Subtotal {quadro.subgrupo.sigla_subgrupo}
            </td>
            {hasDual && (
              <>
                <td className={`py-1.5 text-right font-mono font-semibold text-gray-700 text-sm ${CELL_H}`}>
                  {fmtMoeda(quadro.subtotalInicial ?? 0)}
                </td>
                <td className={SPACER_W}></td>
              </>
            )}
            <td className={`py-1.5 text-right font-mono font-semibold text-gray-700 text-sm ${CELL_H}`}>
              {fmtMoeda(quadro.subtotalFinal)}
            </td>
          </tr>
        </tfoot>
      </table>

      {detalhe && (
        <NotaItemDetalheModal
          idClassNotaExplicativa={detalhe.idClassNotaExplicativa}
          idClassSubgrupo={detalhe.idClassSubgrupo}
          desc={detalhe.desc}
          balanceteId={detalhe.balanceteId}
          planoContasId={detalhe.planoContasId}
          onClose={() => setDetalhe(null)}
        />
      )}
    </div>
  )
}

interface ResumoAtivoPassivoProps {
  quadros: NotaQuadro[]
  params: DFParams
}

export function ResumoAtivoPassivo({ quadros, params }: ResumoAtivoPassivoProps) {
  const hasDual = !!params.periodo1
  const labelFinal = periodoLabel(params.periodo2)
  const labelInicial = params.periodo1 ? periodoLabel(params.periodo1) : ''

  let ativoFinal = 0, ativoInicial = 0, passivoFinal = 0, passivoInicial = 0
  for (const q of quadros) {
    if (isAtivoSg(q.subgrupo)) {
      ativoFinal += q.subtotalFinal
      ativoInicial += q.subtotalInicial ?? 0
    } else {
      passivoFinal += q.subtotalFinal
      passivoInicial += q.subtotalInicial ?? 0
    }
  }

  const temAtivo = ativoFinal !== 0 || ativoInicial !== 0
  const temPassivo = passivoFinal !== 0 || passivoInicial !== 0
  if (!temAtivo || !temPassivo) return null

  return (
    <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
      <table className="w-full text-sm">
        {hasDual && (
          <thead>
            <tr>
              <th></th>
              <th className={`text-right text-xs font-semibold text-gray-400 uppercase tracking-wide border-b-2 border-gray-300 pb-1 ${CELL_H}`}>
                {labelInicial}
              </th>
              <th className={SPACER_W}></th>
              <th className={`text-right text-xs font-semibold text-gray-400 uppercase tracking-wide border-b-2 border-gray-300 pb-1 ${CELL_H}`}>
                {labelFinal}
              </th>
            </tr>
          </thead>
        )}
        <tbody>
          <tr>
            <td className={`py-1 font-semibold text-gray-600 ${CELL_H}`}>ATIVO</td>
            {hasDual && (
              <>
                <td className={`py-1 text-right font-mono font-semibold text-gray-700 ${CELL_H}`}>{fmtMoeda(ativoInicial)}</td>
                <td className={SPACER_W}></td>
              </>
            )}
            <td className={`py-1 text-right font-mono font-semibold text-gray-700 ${CELL_H}`}>{fmtMoeda(ativoFinal)}</td>
          </tr>
          <tr>
            <td className={`py-1 font-semibold text-gray-600 ${CELL_H}`}>PASSIVO</td>
            {hasDual && (
              <>
                <td className={`py-1 text-right font-mono font-semibold text-gray-700 ${CELL_H}`}>{fmtMoeda(passivoInicial)}</td>
                <td className={SPACER_W}></td>
              </>
            )}
            <td className={`py-1 text-right font-mono font-semibold text-gray-700 ${CELL_H}`}>{fmtMoeda(passivoFinal)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
