import {
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer,
  AreaChart, Area, LineChart, Line, ReferenceLine, CartesianGrid
} from 'recharts'
import { TrendingUp, TrendingDown, Building2, BarChart2, CheckCircle, Circle } from 'lucide-react'
import type { MonthData, ImportStatus, Empresa } from './useDashboard'
import { MES_ABREV } from './useDashboard'

interface OverviewData {
  monthData: MonthData[]
  importStatus: ImportStatus[]
  latestMes: number | null
  totalAtivo: number
  totalPassivo: number
  pl: number
  resultado: number
  hasData: boolean
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

function KpiCard({ label, value, icon, positive }: { label: string; value: number; icon: React.ReactNode; positive?: boolean }) {
  const isNeg = value < 0
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between text-gray-500 text-xs font-medium uppercase tracking-wide">
        <span>{label}</span>
        <span className="text-gray-400">{icon}</span>
      </div>
      <p className={`text-xl font-semibold tabular-nums ${isNeg ? 'text-red-600' : positive === false ? 'text-red-600' : 'text-gray-900'}`}>
        {fmtBRL(value)}
      </p>
    </div>
  )
}

const TOOLTIP_FORMATTER = (value: unknown, name: unknown) => [fmtBRL(value as number), name as string]

interface OverviewProps {
  data: OverviewData
  selectedEmpresas: Empresa[]
  perEmpresaImportStatus: Map<number, Set<number>>
}

export default function OverviewMode({ data, selectedEmpresas, perEmpresaImportStatus }: OverviewProps) {
  const { monthData, importStatus, totalAtivo, totalPassivo, pl, resultado } = data

  const liquidezData = monthData.map(d => ({
    mesAbrev: d.mesAbrev,
    liquidez: d.PC > 0 ? parseFloat((d.AC / d.PC).toFixed(2)) : null,
    AC: d.AC,
    PC: d.PC,
  }))

  return (
    <div className="flex flex-col gap-5">
      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <KpiCard label="Total do Ativo" value={totalAtivo} icon={<Building2 size={16} />} />
        <KpiCard label="Total do Passivo" value={totalPassivo} icon={<Building2 size={16} />} positive={false} />
        <KpiCard label="Patrimônio Líquido" value={pl + resultado} icon={<BarChart2 size={16} />} />
        <KpiCard
          label="Resultado do Período"
          value={resultado}
          icon={resultado >= 0 ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
        />
      </div>

      {/* Charts row 1 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Estrutura do Balanço */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Estrutura do Balanço Patrimonial</h3>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mesAbrev" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={64} />
              <Tooltip formatter={TOOLTIP_FORMATTER} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="AC" name="Ativo Circ." stackId="ativo" fill="#2563eb" />
              <Bar dataKey="ANC" name="Ativo N. Circ." stackId="ativo" fill="#93c5fd" radius={[3, 3, 0, 0]} />
              <Bar dataKey="PC" name="Pass. Circ." stackId="passivo" fill="#dc2626" />
              <Bar dataKey="PNC" name="Pass. N. Circ." stackId="passivo" fill="#fca5a5" />
              <Bar dataKey="PL" name="Patr. Líquido" stackId="passivo" fill="#16a34a" />
              <Bar dataKey="RESULTADO" name="Resultado" stackId="passivo" fill="#86efac" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Evolução do Resultado */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-3">Evolução do Resultado (DRE)</h3>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="gradRes" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#22c55e" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mesAbrev" tick={{ fontSize: 11 }} />
              <YAxis tickFormatter={fmtCompact} tick={{ fontSize: 11 }} width={64} />
              <Tooltip formatter={(v: unknown) => [fmtBRL(v as number), 'Resultado']} />
              <ReferenceLine y={0} stroke="#94a3b8" strokeDasharray="4 2" />
              <Area dataKey="RESULTADO" name="Resultado" stroke="#16a34a" fill="url(#gradRes)" strokeWidth={2} dot={{ r: 3 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Charts row 2 */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Liquidez Corrente */}
        <div className="bg-white rounded-xl border border-gray-200 p-4">
          <h3 className="text-sm font-semibold text-gray-700 mb-1">Liquidez Corrente (AC / PC)</h3>
          <p className="text-xs text-gray-400 mb-3">Índice &gt; 1 indica folga de caixa no curto prazo</p>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={liquidezData} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="mesAbrev" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} width={40} />
              <Tooltip
                formatter={(v: unknown, name: unknown) =>
                  name === 'liquidez' ? [(v as number).toFixed(2), 'Liquidez Corrente'] : [fmtBRL(v as number), name as string]
                }
              />
              <ReferenceLine y={1} stroke="#f59e0b" strokeDasharray="4 2" label={{ value: '1,00', position: 'insideRight', fontSize: 10, fill: '#f59e0b' }} />
              <Line dataKey="liquidez" name="liquidez" stroke="#2563eb" strokeWidth={2} dot={{ r: 3 }} connectNulls={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {selectedEmpresas.length === 1 ? (
          /* Status de Importação — empresa única: grade de 12 meses */
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Status de Importação</h3>
            <div className="grid grid-cols-4 gap-2">
              {importStatus.map(s => (
                <div
                  key={s.mes}
                  className={`rounded-lg p-2 text-center border ${
                    s.imported ? 'bg-green-50 border-green-200' : 'bg-gray-50 border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-center mb-1">
                    {s.imported
                      ? <CheckCircle size={14} className="text-green-500" />
                      : <Circle size={14} className="text-gray-300" />
                    }
                  </div>
                  <p className={`text-xs font-medium ${s.imported ? 'text-green-700' : 'text-gray-400'}`}>
                    {s.mesAbrev}
                  </p>
                  {s.imported && s.dt_importacao && (
                    <p className="text-[10px] text-gray-400 mt-0.5 leading-tight">
                      {new Date(s.dt_importacao).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}
                    </p>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Cobertura de Importação — múltiplas empresas: matriz mês × empresa */
          <div className="bg-white rounded-xl border border-gray-200 p-4 flex flex-col">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Cobertura de Importação</h3>
            <div className="overflow-x-auto flex-1">
              <table className="w-full text-xs">
                <thead>
                  <tr>
                    <th className="text-left px-2 py-1.5 text-gray-500 font-medium w-10">Mês</th>
                    {selectedEmpresas.map(e => (
                      <th key={e.id} className="text-center px-2 py-1.5 text-gray-500 font-medium whitespace-nowrap">
                        {e.abreviacao}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {MES_ABREV.map((label, i) => {
                    const mes = i + 1
                    return (
                      <tr key={mes} className="border-t border-gray-100">
                        <td className="px-2 py-1 text-gray-500 font-medium">{label}</td>
                        {selectedEmpresas.map(e => {
                          const ok = perEmpresaImportStatus.get(e.id)?.has(mes) ?? false
                          return (
                            <td key={e.id} className="px-2 py-1 text-center">
                              {ok
                                ? <CheckCircle size={13} className="text-green-500 mx-auto" />
                                : <Circle size={13} className="text-gray-300 mx-auto" />
                              }
                            </td>
                          )
                        })}
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
