import { useState } from 'react'
import { X, Printer } from 'lucide-react'
import { type DFParams } from '../../lib/dfData'
import { gerarNotasPdf, gerarNotasDocx, type NotaParaImpressao } from '../../lib/gerarNotasExport'

interface ImprimirNotasModalProps {
  params: DFParams
  notas: NotaParaImpressao[]
  onClose: () => void
}

export default function ImprimirNotasModal({ params, notas, onClose }: ImprimirNotasModalProps) {
  const [selecionados, setSelecionados] = useState<Set<number>>(new Set(notas.map(n => n.id)))
  const [formato, setFormato] = useState<'pdf' | 'docx'>('docx')
  const [emMilhares, setEmMilhares] = useState(true)
  const [gerando, setGerando] = useState(false)

  function toggle(id: number) {
    setSelecionados(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function handleImprimir() {
    setGerando(true)
    try {
      const escolhidas = notas
        .filter(n => selecionados.has(n.id))
        .sort((a, b) => (a.numeroNota ?? Infinity) - (b.numeroNota ?? Infinity))

      if (formato === 'pdf') await gerarNotasPdf(params, escolhidas, emMilhares)
      else await gerarNotasDocx(params, escolhidas, emMilhares)
      onClose()
    } finally {
      setGerando(false)
    }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
          <h3 className="font-semibold text-gray-800">Imprimir notas explicativas</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-4 space-y-5">
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Notas</p>
            <div className="space-y-2 max-h-64 overflow-y-auto">
              {notas.map(n => (
                <label key={n.id} className="flex items-center gap-2.5 text-sm text-gray-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selecionados.has(n.id)}
                    onChange={() => toggle(n.id)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  {n.numeroNota != null ? `Nº ${n.numeroNota} — ` : ''}{n.titulo}
                </label>
              ))}
              {notas.length === 0 && (
                <p className="text-sm text-gray-400">Nenhuma nota cadastrada para este período.</p>
              )}
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
