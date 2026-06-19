import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import { type CalcDFResult } from '../../lib/dfUtils'
import { type DFParams, type TipoDF } from '../../lib/dfData'
import { gerarDRE, gerarBP } from '../../lib/gerarDFpdf'
import { gerarDREdocx, gerarBPdocx } from '../../lib/gerarDFdocx'

interface ImprimirModalProps {
  params: DFParams
  dfFinal: CalcDFResult
  dfInicial?: CalcDFResult
  tipoAtual: TipoDF
  onClose: () => void
}

const TIPOS_DISPONIVEIS: { value: TipoDF; label: string; disabled?: boolean }[] = [
  { value: 'DRE', label: 'DRE — Demonstração do Resultado do Exercício' },
  { value: 'BP', label: 'Balanço Patrimonial' },
  { value: 'DMPL', label: 'DMPL (em breve)', disabled: true },
  { value: 'DFC', label: 'DFC (em breve)', disabled: true },
]

export default function ImprimirModal({ params, dfFinal, dfInicial, tipoAtual, onClose }: ImprimirModalProps) {
  const [selecionados, setSelecionados] = useState<Set<TipoDF>>(
    new Set(tipoAtual === 'DRE' || tipoAtual === 'BP' ? [tipoAtual] : [])
  )
  const [formato, setFormato] = useState<'pdf' | 'docx'>('pdf')
  const [emMilhares, setEmMilhares] = useState(false)
  const [gerando, setGerando] = useState(false)

  function toggle(tipo: TipoDF) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(tipo)) next.delete(tipo)
      else next.add(tipo)
      return next
    })
  }

  async function handleImprimir() {
    setGerando(true)
    try {
      const df1 = dfInicial ?? dfFinal
      const df2 = dfInicial ? dfFinal : undefined

      if (selecionados.has('DRE')) {
        if (formato === 'pdf') await gerarDRE(params, df1, df2, emMilhares)
        else await gerarDREdocx(params, df1, df2, emMilhares)
      }
      if (selecionados.has('BP')) {
        if (formato === 'pdf') await gerarBP(params, df1, df2, emMilhares)
        else await gerarBPdocx(params, df1, df2, emMilhares)
      }
      onClose()
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Imprimir demonstrações</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Demonstrações</p>
            <div className="space-y-2">
              {TIPOS_DISPONIVEIS.map(t => (
                <label key={t.value} className={`flex items-center gap-2.5 text-sm ${t.disabled ? 'text-gray-400' : 'text-gray-700 cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    checked={selecionados.has(t.value)}
                    disabled={t.disabled}
                    onChange={() => toggle(t.value)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 disabled:opacity-50"
                  />
                  {t.label}
                </label>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Formato</p>
            <div className="flex flex-wrap items-center gap-4">
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="formato" checked={formato === 'pdf'} onChange={() => setFormato('pdf')} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                PDF
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
                <input type="radio" name="formato" checked={formato === 'docx'} onChange={() => setFormato('docx')} className="w-4 h-4 text-blue-600 focus:ring-blue-500" />
                Word (.docx)
              </label>
              <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={emMilhares}
                  onChange={e => setEmMilhares(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                Valores em R$ mil
              </label>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end gap-3">
          <button onClick={onClose} className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">
            Cancelar
          </button>
          <button
            onClick={handleImprimir}
            disabled={selecionados.size === 0 || gerando}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {gerando ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Gerando…
              </>
            ) : (
              <>
                <Printer size={16} />
                Imprimir
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
