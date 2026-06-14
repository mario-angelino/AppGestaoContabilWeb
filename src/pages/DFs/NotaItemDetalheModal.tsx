import { useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { X } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function fmtBR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface DetalheRow {
  conta: string
  descricao: string
  saldo_atual: number
}

interface NotaItemDetalheModalProps {
  idClassNotaExplicativa: number
  idClassSubgrupo: number
  desc: string
  balanceteId: number
  planoContasId: number
  onClose: () => void
}

export default function NotaItemDetalheModal({
  idClassNotaExplicativa, idClassSubgrupo, desc, balanceteId, planoContasId, onClose,
}: NotaItemDetalheModalProps) {
  const { data: balItems = [], isLoading: loadingBal } = useQuery({
    queryKey: ['nota_detalhe_bal', balanceteId],
    queryFn: async () => {
      const PAGE = 1000
      const all: { conta: string; descricao: string; saldo_atual: number }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('balancete_itens')
          .select('conta, descricao, saldo_atual')
          .eq('balancete_id', balanceteId).range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...data)
        if (data.length < PAGE) break
      }
      return all
    },
  })

  const { data: planoItems = [], isLoading: loadingPlano } = useQuery({
    queryKey: ['nota_detalhe_plano', planoContasId, idClassNotaExplicativa, idClassSubgrupo],
    queryFn: async () => {
      const PAGE = 1000
      const all: { conta: string }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('plano_contas_itens')
          .select('conta')
          .eq('id_plano_contas', planoContasId)
          .eq('id_class_nota_explicativa', idClassNotaExplicativa)
          .eq('id_class_subgrupo', idClassSubgrupo)
          .range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...data)
        if (data.length < PAGE) break
      }
      return all
    },
  })

  const rows = useMemo((): DetalheRow[] => {
    const contas = new Set(planoItems.map(p => p.conta))
    return balItems
      .filter(b => contas.has(b.conta))
      .map(b => ({ conta: b.conta, descricao: b.descricao, saldo_atual: b.saldo_atual }))
      .sort((a, b) => a.conta.localeCompare(b.conta))
  }, [balItems, planoItems])

  const total = rows.reduce((acc, r) => acc + r.saldo_atual, 0)
  const loading = loadingBal || loadingPlano

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Detalhe — {desc}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} conta{rows.length !== 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X size={18} /></button>
        </div>

        <div className="flex-1 overflow-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-12">Nenhuma conta encontrada para esta classificação.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  {['Conta', 'Descrição', 'Saldo Atual'].map(h => (
                    <th key={h} className="text-left px-2 py-2 text-gray-500 font-semibold whitespace-nowrap border-b border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-mono text-gray-700 whitespace-nowrap">{r.conta}</td>
                    <td className="px-2 py-1.5 text-gray-700">{r.descricao}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-medium whitespace-nowrap ${r.saldo_atual < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtBR(r.saldo_atual)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={2} className="px-2 py-2 font-semibold text-gray-600 text-sm">Total ({rows.length} contas)</td>
                  <td className={`px-2 py-2 text-right font-mono font-bold text-sm whitespace-nowrap ${total < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtBR(total)}</td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button onClick={onClose} className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors">Fechar</button>
        </div>
      </div>
    </div>
  )
}
