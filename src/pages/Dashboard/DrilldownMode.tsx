import { useState, useMemo } from 'react'
import {
  ComposedChart, Bar, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  BarChart, Cell, ReferenceLine
} from 'recharts'
import { MES_ABREV } from './useDashboard'
import type { RawBalancete, RawBalanceteItem, RawVigencia, PlanoItemCls } from './useDashboard'

interface DrilldownProps {
  bpDreId: number
  bpDreDesc: string
  bpDreByMonth: Map<number, Map<number, number>>
  balancetes: RawBalancete[]
  rawItems: RawBalanceteItem[]
  balanceteMap: Map<number, RawBalancete>
  vigenciaMap: Map<number, RawVigencia>
  planoItemMap: Map<string, PlanoItemCls>
  latestMes: number | null
}

function fmtBRL(v: number): string {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e9) return sign + (abs / 1e9).toFixed(1).replace('.', ',') + ' Bi'
  if (abs >= 1e6) return sign + (abs / 1e6).toFixed(1).replace('.', ',') + ' M'
  if (abs >= 1e3) return sign + (abs / 1e3).toFixed(1).replace('.', ',') + ' K'
  return v.toFixed(0)
}

function KpiCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <p className="text-xs text-gray-500 font-medium uppercase tracking-wide mb-1">{label}</p>
      <p className="text-xl font-semibold text-gray-900 tabular-nums">{value}</p>
      {sub && <p className="text-xs text-gray-400 mt-0.5">{sub}</p>}
    </div>
  )
}

export default function DrilldownMode({
  bpDreId, bpDreDesc, bpDreByMonth, balancetes, rawItems,
  balanceteMap, vigenciaMap, planoItemMap, latestMes
}: DrilldownProps) {
  const importedMeses = useMemo(
    () => [...new Set(balancetes.map(b => b.mes))].sort((a, b) => a - b),
    [balancetes]
  )
  const [selectedMes, setSelectedMes] = useState<number | null>(null)
  const activeMes = selectedMes ?? latestMes

  const evolutionData = useMemo(() => {
    let runningSum = 0
    return importedMeses.map((mes, idx) => {
      const saldo = bpDreByMonth.get(mes)?.get(bpDreId) ?? 0
      const prevSaldo = idx > 0 ? (bpDreByMonth.get(importedMeses[idx - 1])?.get(bpDreId) ?? 0) : 0
      runningSum += saldo
      return { mesAbrev: MES_ABREV[mes - 1], mes, saldo, variacao: saldo - prevSaldo, media: parseFloat((runningSum / (idx + 1)).toFixed(2)) }
    })
  }, [importedMeses, bpDreByMonth, bpDreId])

  const latestSaldo = latestMes ? (bpDreByMonth.get(latestMes)?.get(bpDreId) ?? 0) : 0
  const prevMes = importedMeses[importedMeses.length - 2]
  const prevSaldo = prevMes ? (bpDreByMonth.get(prevMes)?.get(bpDreId) ?? 0) : 0
  const variacaoAbs = latestSaldo - prevSaldo
  const variacaoPerc = prevSaldo !== 0 ? ((variacaoAbs / Math.abs(prevSaldo)) * 100).toFixed(1) : null

  const maxEntry = evolutionData.length > 0 ? evolutionData.reduce((a, b) => Math.abs(a.saldo) > Math.abs(b.saldo) ? a : b) : null
  const minEntry = evolutionData.length > 0 ? evolutionData.reduce((a, b) => Math.abs(a.saldo) < Math.abs(b.saldo) ? a : b) : null

  const filteredItems = useMemo(() => {
    if (!activeMes) return []
    return rawItems.filter(item => {
      const bal = balanceteMap.get(item.balancete_id)
      if (!bal || bal.mes !== activeMes) return false
      const vig = vigenciaMap.get(bal.vigencia_id)
      if (!vig) return false
      const cls = planoItemMap.get(`${vig.plano_contas_id}|${item.reduzido}`)
      return cls?.bpDreId === bpDreId
    })
  }, [rawItems, balanceteMap, vigenciaMap, planoItemMap, bpDreId, activeMes])

  const composicao = useMemo(() => {
    const map = new Map<number, { descricao: string; saldo: number }>()
    for (const item of filteredItems) {
      const e = map.get(item.reduzido)
      if (e) e.saldo += item.saldo_atual
      else map.set(item.reduzido, { descricao: item.descricao, saldo: item.saldo_atual })
    }
    return [...map.entries()]
      .map(([reduzido, { descricao, saldo }]) => ({ reduzido, descricao: `${reduzido} – ${descricao}`, saldo: Math.abs(saldo), saldoReal: saldo }))
      .sort((a, b) => b.saldo - a.saldo)
      .slice(0, 10)
  }, [filteredItems])

  const detailRows = useMemo(() => {
    const map = new Map<number, { conta: string; descricao: string; saldo_anterior: number; val_debito: number; val_credito: number; saldo_atual: number }>()
    for (const item of filteredItems) {
      const e = map.get(item.reduzido)
      if (e) {
        e.saldo_anterior += item.saldo_anterior
        e.val_debito += item.val_debito
        e.val_credito += item.val_credito
        e.saldo_atual += item.saldo_atual
      } else {
        map.set(item.reduzido, { conta: item.conta, descricao: item.descricao, saldo_anterior: item.saldo_anterior, val_debito: item.val_debito, val_credito: item.val_credito, saldo_atual: item.saldo_atual })
      }
    }
    return [...map.entries()].map(([reduzido, v]) => ({ reduzido, ...v })).sort((a, b) => a.conta.localeCompare(b.conta))
  }, [filteredItems])

  return (
    <div className="flex flex-col gap-5">
      {/* Title */}
      <div className="flex items-center gap-2">
        <h2 className="text-base font-semibold text-gray-800">Drill-down:</h2>
        <span className="text-base text-blue-600 font-medium">{bpDreDesc}</span>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Saldo Atual" value={fmtBRL(latestSaldo)} sub={latestMes ? MES_ABREV[latestMes - 1] : undefined} />
        <KpiCard
          label="Var. Mês Anterior"
          value={`${variacaoAbs >= 0 ? '+' : ''}${fmtBRL(variacaoAbs)}`}
          sub={variacaoPerc != null ? `${variacaoAbs >= 0 ? '+' : ''}${variacaoPerc}%` : 'sem mês anterior'}
        />
        <KpiCard label="Maior Saldo no Ano" value={maxEntry ? fmtBRL(maxEntry.saldo) : '-'} sub={maxEntry?.mesAbrev} />
        <KpiCard label="Menor Saldo no Ano" value={minEntry ? fmtBRL(minEntry.saldo) : '-'} sub={minEntry?.mesAbrev} />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Evolução Mensal */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolução Mensal do Saldo</h3>
          <ResponsiveContainer width="100%" height={250}>
            <ComposedChart data={evolutionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mesAbrev" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={64} />
              <Tooltip formatter={(v: unknown, name: unknown) => [fmtBRL(v as number), (name as string) === 'saldo' ? 'Saldo' : 'Média']} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="saldo" name="saldo" fill="#2563eb" radius={[3, 3, 0, 0]} opacity={0.85} />
              <Line dataKey="media" name="media" stroke="#f59e0b" strokeWidth={2} dot={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>

        {/* Variação Mês a Mês */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Variação Mês a Mês</h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={evolutionData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mesAbrev" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={64} />
              <Tooltip formatter={(v: unknown) => [fmtBRL(v as number), 'Variação']} />
              <ReferenceLine y={0} stroke="#94a3b8" />
              <Bar dataKey="variacao" name="Variação" radius={[3, 3, 0, 0]}>
                {evolutionData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.variacao >= 0 ? '#22c55e' : '#ef4444'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Composição por Conta */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">
            Top 10 Contas — {activeMes ? MES_ABREV[activeMes - 1] : ''}
          </h3>
          {composicao.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Sem contas classificadas</p>
          ) : (
            <ResponsiveContainer width="100%" height={250}>
              <BarChart layout="vertical" data={composicao} margin={{ top: 0, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" horizontal={false} />
                <XAxis type="number" tickFormatter={fmtCompact} tick={{ fontSize: 10 }} />
                <YAxis type="category" dataKey="descricao" tick={{ fontSize: 9 }} width={130} />
                <Tooltip formatter={(v: unknown) => [fmtBRL(v as number), 'Saldo']} />
                <Bar dataKey="saldo" fill="#2563eb" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Tabela Detalhada */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-700">Detalhe por Conta</h3>
            <select
              value={activeMes ?? ''}
              onChange={e => setSelectedMes(e.target.value ? parseInt(e.target.value) : null)}
              className="text-xs border border-gray-300 rounded-lg px-2 py-1"
            >
              {importedMeses.map(m => (
                <option key={m} value={m}>{MES_ABREV[m - 1]}</option>
              ))}
            </select>
          </div>
          <div className="overflow-auto flex-1 max-h-[220px]">
            {detailRows.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-8">Sem contas</p>
            ) : (
              <table className="w-full text-xs">
                <thead className="sticky top-0 bg-gray-50">
                  <tr>
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap">Conta</th>
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium">Descrição</th>
                    <th className="text-right px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap">Saldo Ant.</th>
                    <th className="text-right px-2 py-1.5 text-gray-500 font-medium">Saldo Atual</th>
                  </tr>
                </thead>
                <tbody>
                  {detailRows.map(row => (
                    <tr key={row.reduzido} className="border-t border-gray-100 hover:bg-gray-50">
                      <td className="px-2 py-1.5 font-mono text-gray-600 whitespace-nowrap">{row.conta}</td>
                      <td className="px-2 py-1.5 text-gray-700 max-w-[120px] truncate">{row.descricao}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-gray-500">{fmtCompact(row.saldo_anterior)}</td>
                      <td className={`px-2 py-1.5 text-right tabular-nums font-medium ${row.saldo_atual < 0 ? 'text-red-600' : 'text-gray-800'}`}>
                        {fmtCompact(row.saldo_atual)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
