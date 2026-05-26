import { useState, useMemo, useRef, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Upload, Trash2, Eye, X, Building2, AlertTriangle, CheckCircle, CheckSquare, ArrowUpDown, ListChecks, PackageSearch, Plus } from 'lucide-react'
import * as XLSX from 'xlsx'
import { supabase } from '../../lib/supabase'
import { useAuth } from '../../contexts/AuthContext'
import { pickExcelFile, pickCSVFile } from '../../lib/fileUtils'

// ── Types ──────────────────────────────────────────────────────────────────

interface Vigencia {
  id: number
  ano_vigencia: number
  empresa: { id: number; abreviacao: string }
  plano_contas: { id: number; nome: string }
}

interface Balancete {
  id: number
  vigencia_id: number
  mes: number
  ano: number
  dt_importacao: string | null
  user_importacao: string | null
}

interface ParsedRow {
  conta: string
  reduzido: number
  descricao: string
  saldo_anterior: number
  val_debito: number
  val_credito: number
  saldo_atual: number
}

interface BalanceteItem extends ParsedRow {
  id: number
  balancete_id: number
}

// ── Helpers ────────────────────────────────────────────────────────────────

const MES_NOMES = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
]

function mesNome(mes: number): string {
  return MES_NOMES[mes - 1] ?? String(mes)
}

function mesLabel(mes: number): string {
  return `${String(mes).padStart(2, '0')} - ${mesNome(mes)}`
}

function parseBR(s: string): number {
  return parseFloat(s.trim().replace(/\./g, '').replace(',', '.')) || 0
}

// Aplica sinal correto ao saldo conforme natureza da conta vs natureza do balancete.
// Conta 1 (Ativo): natureza devedora — D=positivo, C=negativo.
// Demais (2, 3, 4, 5, 6... — Passivo, PL, DRE): C=positivo, D=negativo.
function aplicarSinal(saldo: number, conta: string, natureza: string): number {
  const primeiro = conta.trim().charAt(0)
  const nat = natureza.toUpperCase().trim()
  if (primeiro === '1') {
    return nat === 'D' ? Math.abs(saldo) : -Math.abs(saldo)
  }
  return nat === 'C' ? Math.abs(saldo) : -Math.abs(saldo)
}

function fmtBR(v: number): string {
  return v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function parseCSV(buf: ArrayBuffer): { mes: number | null; ano: number | null; rows: ParsedRow[] } {
  const text = new TextDecoder('windows-1252').decode(new Uint8Array(buf))
  const lines = text.split(/\r?\n/)

  let mes: number | null = null
  let ano: number | null = null

  // Period is on line index 4, field index 3: "01/01/2025 a 31/01/2025"
  if (lines[4]) {
    const fields = lines[4].split(';').map((f) => f.replace(/^"|"$/g, '').trim())
    const m = fields[3]?.match(/\d{2}\/(\d{2})\/(\d{4})/)
    if (m) { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10) }
  }

  const rows: ParsedRow[] = []
  for (const line of lines.slice(7)) {
    if (!line.trim() || line.trim() === '""') continue
    const f = line.split(';').map((v) => v.replace(/^"|"$/g, '').trim())
    if (f.length < 8 || !f[0]) continue
    const reduzido = parseInt(f[1], 10)
    if (!f[0] || isNaN(reduzido)) continue
    const naturezaAnt = f[4]?.trim() ?? ''
    const naturezaAtual = f[8]?.trim() ?? ''
    const saldoAnt = parseBR(f[3])
    const saldoAtual = parseBR(f[7])
    rows.push({
      conta: f[0],
      reduzido,
      descricao: f[2] || '',
      saldo_anterior: naturezaAnt ? aplicarSinal(saldoAnt, f[0], naturezaAnt) : saldoAnt,
      val_debito: parseBR(f[5]),
      val_credito: parseBR(f[6]),
      saldo_atual: naturezaAtual ? aplicarSinal(saldoAtual, f[0], naturezaAtual) : saldoAtual,
    })
  }

  return { mes, ano, rows }
}


function parseXLS(buf: ArrayBuffer): { mes: number | null; ano: number | null; rows: ParsedRow[] } {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const sheetName = wb.SheetNames.includes('Balancete') ? 'Balancete' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  let mes: number | null = null
  let ano: number | null = null

  // Period on row index 2 (row 3), col index 1: "01/11/2025 - 30/11/2025"
  const periodoCell = String((data[2] as unknown[])?.[1] ?? '')
  const m = periodoCell.match(/\d{2}\/(\d{2})\/(\d{4})/)
  if (m) { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10) }

  const rows: ParsedRow[] = []
  // Data rows start at index 7 (row 8 in spreadsheet)
  for (const row of data.slice(7) as unknown[][]) {
    const reduzido = Number(row[0])
    const conta = String(row[1] ?? '').trim()
    if (!conta || isNaN(reduzido) || reduzido === 0) continue
    // Accounts starting with "1" (Ativo) keep the sign; all others are inverted
    const sinal = conta.charAt(0) === '1' ? 1 : -1
    rows.push({
      conta,
      reduzido,
      descricao: String(row[3] ?? '').trim(),
      saldo_anterior: (Number(row[5]) || 0) * sinal,
      val_debito: Number(row[6]) || 0,
      val_credito: Number(row[7]) || 0,
      saldo_atual: (Number(row[9]) || 0) * sinal,
    })
  }

  return { mes, ano, rows }
}

function parseXLSAccion(buf: ArrayBuffer): { mes: number | null; ano: number | null; rows: ParsedRow[] } {
  const wb = XLSX.read(new Uint8Array(buf), { type: 'array' })
  const sheetName = wb.SheetNames.includes('Relatório') ? 'Relatório' : wb.SheetNames[0]
  const ws = wb.Sheets[sheetName]
  const data = XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, defval: '' }) as unknown[][]

  let mes: number | null = null
  let ano: number | null = null

  // Period on row 4, col 22: "01/01/2025 a 31/01/2025"
  const periodoCell = String((data[4] as unknown[])?.[22] ?? '')
  const m = periodoCell.match(/\d{2}\/(\d{2})\/(\d{4})/)
  if (m) { mes = parseInt(m[1], 10); ano = parseInt(m[2], 10) }

  const rows: ParsedRow[] = []
  for (const row of data.slice(7) as unknown[][]) {
    const conta = String(row[0] ?? '').trim()
    const reduzido = Number(row[3])
    if (!conta || isNaN(reduzido) || reduzido === 0) continue
    const naturezaAnt  = String(row[12] ?? '').trim()
    const naturezaAtual = String(row[24] ?? '').trim()
    const saldoAnt   = Number(row[10]) || 0
    const saldoAtual = Number(row[22]) || 0
    rows.push({
      conta,
      reduzido,
      descricao: String(row[4] ?? '').trim(),
      saldo_anterior: naturezaAnt   ? aplicarSinal(saldoAnt,   conta, naturezaAnt)   : saldoAnt,
      val_debito:  Number(row[13]) || 0,
      val_credito: Number(row[19]) || 0,
      saldo_atual: naturezaAtual ? aplicarSinal(saldoAtual, conta, naturezaAtual) : saldoAtual,
    })
  }

  return { mes, ano, rows }
}

// ── Items viewer modal ─────────────────────────────────────────────────────

function ItemsModal({
  balancete,
  onClose,
}: {
  balancete: Balancete
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [invertingKey, setInvertingKey] = useState<string | null>(null)

  const { data: items = [], isLoading } = useQuery({
    queryKey: ['balancete_itens', balancete.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete_itens')
        .select('*')
        .eq('balancete_id', balancete.id)
        .order('conta')
      if (error) throw error
      return data as BalanceteItem[]
    }
  })

  const filtered = useMemo(() => {
    if (!search.trim()) return items
    const q = search.toLowerCase()
    return items.filter(
      (r) => r.conta.includes(q) || String(r.reduzido).includes(q) || r.descricao.toLowerCase().includes(q)
    )
  }, [items, search])

  const handleInvertField = async (item: BalanceteItem, field: 'saldo_anterior' | 'saldo_atual') => {
    const key = `${item.id}_${field}`
    setInvertingKey(key)
    try {
      const { error } = await supabase
        .from('balancete_itens')
        .update({ [field]: field === 'saldo_anterior' ? -item.saldo_anterior : -item.saldo_atual })
        .eq('id', item.id)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['balancete_itens', balancete.id] })
    } finally {
      setInvertingKey(null)
    }
  }

  const fmtSaldo = (v: number) => (
    <span className={v < 0 ? 'text-red-600' : 'text-gray-700'}>{fmtBR(v)}</span>
  )

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 max-h-[92vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">
              Itens do Balancete — {mesNome(balancete.mes)}/{balancete.ano}
            </h3>
            {items.length > 0 && (
              <p className="text-xs text-gray-400 mt-0.5">{items.length} registros</p>
            )}
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        <div className="px-6 py-3 border-b border-gray-100 flex-shrink-0">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar conta, reduzido ou descrição..."
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-80"
          />
        </div>

        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <table className="w-full text-xs border-collapse" style={{ minWidth: 980 }}>
              <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                <tr>
                  {['Conta', 'Red.', 'Descrição', 'Saldo Ant.', 'Débito', 'Crédito', 'Saldo Atual'].map((h) => (
                    <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-3 py-1.5 font-mono text-gray-700">{r.conta}</td>
                    <td className="px-3 py-1.5 text-gray-500">{r.reduzido}</td>
                    <td className="px-3 py-1.5 text-gray-700 max-w-xs truncate" title={r.descricao}>{r.descricao}</td>
                    <td className="px-3 py-1.5 font-mono">
                      <div className="flex items-center justify-end gap-1">
                        {fmtSaldo(r.saldo_anterior)}
                        {invertingKey === `${r.id}_saldo_anterior` ? (
                          <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-amber-500 flex-shrink-0" />
                        ) : (
                          <button
                            onClick={() => handleInvertField(r, 'saldo_anterior')}
                            className="text-gray-300 hover:text-amber-500 transition-colors flex-shrink-0"
                            title="Inverter sinal do Saldo Anterior"
                          >
                            <ArrowUpDown size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-1.5 text-right text-gray-700 font-mono">{fmtBR(r.val_debito)}</td>
                    <td className="px-3 py-1.5 text-right text-gray-700 font-mono">{fmtBR(r.val_credito)}</td>
                    <td className="px-3 py-1.5 font-mono">
                      <div className="flex items-center justify-end gap-1">
                        {fmtSaldo(r.saldo_atual)}
                        {invertingKey === `${r.id}_saldo_atual` ? (
                          <span className="inline-block animate-spin rounded-full h-3 w-3 border-b-2 border-amber-500 flex-shrink-0" />
                        ) : (
                          <button
                            onClick={() => handleInvertField(r, 'saldo_atual')}
                            className="text-gray-300 hover:text-amber-500 transition-colors flex-shrink-0"
                            title="Inverter sinal do Saldo Atual"
                          >
                            <ArrowUpDown size={11} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}

// ── Import wizard modal ────────────────────────────────────────────────────

type ImportStep = 'idle' | 'preview' | 'importing' | 'done'

function ImportModal({
  vigencia,
  balancetes,
  onClose,
}: {
  vigencia: Vigencia
  balancetes: Balancete[]
  onClose: (imported: boolean) => void
}) {
  const [step, setStep] = useState<ImportStep>('idle')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [detectedMes, setDetectedMes] = useState<number | null>(null)
  const [detectedAno, setDetectedAno] = useState<number | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [importCount, setImportCount] = useState(0)

  const { user } = useAuth()

  const existingBalancete = useMemo(
    () => balancetes.find((b) => b.mes === detectedMes && b.ano === detectedAno) ?? null,
    [balancetes, detectedMes, detectedAno]
  )

  const handleSelectWith = async (picker: () => Promise<ArrayBuffer | null>, parser: (buf: ArrayBuffer) => { mes: number | null; ano: number | null; rows: ParsedRow[] }) => {
    setLoading(true)
    setError('')
    try {
      const raw = await picker()
      if (!raw) return
      const { mes, ano, rows: parsed } = parser(raw)
      if (parsed.length === 0) { setError('Nenhum registro encontrado no arquivo.'); return }
      if (!mes || !ano) { setError('Não foi possível detectar o período no arquivo.'); return }
      setRows(parsed)
      setDetectedMes(mes)
      setDetectedAno(ano)
      setStep('preview')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao ler o arquivo.')
    } finally {
      setLoading(false)
    }
  }

  const handleSelectExcel         = () => handleSelectWith(pickExcelFile, parseXLS)
  const handleSelectExcelAccion   = () => handleSelectWith(pickExcelFile, parseXLSAccion)
  const handleSelectCSV           = () => handleSelectWith(pickCSVFile, parseCSV)

  const handleImport = async () => {
    if (!detectedMes || !detectedAno) return
    setStep('importing')
    setError('')
    try {
      // Se já existe, remove primeiro
      if (existingBalancete) {
        const { error: delErr } = await supabase
          .from('balancete')
          .delete()
          .eq('id', existingBalancete.id)
        if (delErr) throw new Error(delErr.message)
      }

      // Insere capa
      const { data: capa, error: capaErr } = await supabase
        .from('balancete')
        .insert({ vigencia_id: vigencia.id, mes: detectedMes, ano: detectedAno, user_importacao: user?.email ?? null })
        .select('id')
        .single()
      if (capaErr) throw new Error(capaErr.message)

      // Insere itens em lotes de 500
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r) => ({ ...r, balancete_id: capa.id }))
        const { error: iErr } = await supabase.from('balancete_itens').insert(batch)
        if (iErr) throw new Error(iErr.message)
      }

      setImportCount(rows.length)
      setStep('done')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erro ao importar.')
      setStep('preview')
    }
  }

  const previewRows = rows.slice(0, 20)

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Importar Balancete</h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {vigencia.empresa.abreviacao} — {vigencia.ano_vigencia}
            </p>
          </div>
          <button onClick={() => onClose(false)} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

          {step === 'idle' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500">Selecione o formato do arquivo a importar. Verifique a lógica de sinais antes de prosseguir.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">

                {/* XLS / XLSX */}
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">XLS / XLSX</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Contas iniciadas com <strong>1</strong> (Ativo): sinal mantido conforme o arquivo.<br />
                      Contas <strong>2 em diante</strong> (Passivo, PL, DRE): sinal <em>invertido</em> automaticamente.
                    </p>
                  </div>
                  <button
                    onClick={handleSelectExcel}
                    disabled={loading}
                    className="mt-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Upload size={15} />
                    {loading ? 'Lendo...' : 'Selecionar XLS / XLSX'}
                  </button>
                </div>

                {/* XLSX — Formato Vera Cruz */}
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">XLSX — ACCION</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Planilha com aba <strong>Relatório</strong>, colunas em posições distintas.<br />
                      Sinal corrigido pela coluna de natureza (D/C): conta <strong>1</strong> → D=positivo; demais → C=positivo.
                    </p>
                  </div>
                  <button
                    onClick={handleSelectExcelAccion}
                    disabled={loading}
                    className="mt-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    <Upload size={15} />
                    {loading ? 'Lendo...' : 'Selecionar XLSX (ACCION)'}
                  </button>
                </div>

                {/* CSV */}
                <div className="border border-gray-200 rounded-xl p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-semibold text-gray-800">CSV</p>
                    <p className="text-xs text-gray-500 mt-1.5 leading-relaxed">
                      Arquivo texto separado por <strong>ponto-e-vírgula</strong>, codificação windows-1252.<br />
                      Sinal corrigido pela coluna de natureza (D/C): conta <strong>1</strong> → D=positivo; demais → C=positivo.
                    </p>
                  </div>
                  <button
                    onClick={handleSelectCSV}
                    disabled={loading}
                    className="mt-auto flex items-center justify-center gap-2 border border-blue-600 text-blue-600 px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-50 transition-colors disabled:opacity-50"
                  >
                    <Upload size={15} />
                    {loading ? 'Lendo...' : 'Selecionar CSV'}
                  </button>
                </div>

              </div>
              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </div>
          )}

          {step === 'preview' && detectedMes && detectedAno && (
            <>
              <div className="flex items-center gap-6 p-3 bg-blue-50 rounded-lg text-sm">
                <span><span className="font-medium text-gray-700">Período detectado:</span> <span className="text-blue-700 font-semibold">{mesNome(detectedMes)}/{detectedAno}</span></span>
                <span><span className="font-medium text-gray-700">Registros:</span> <span className="font-semibold">{rows.length}</span></span>
              </div>

              {existingBalancete && (
                <div className="flex items-start gap-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2.5 text-sm text-amber-800">
                  <AlertTriangle size={15} className="flex-shrink-0 mt-0.5" />
                  <span>Já existe um balancete para <strong>{mesNome(detectedMes)}/{detectedAno}</strong> nesta vigência. Ao confirmar, ele será <strong>substituído</strong>.</span>
                </div>
              )}

              <div>
                <p className="text-xs text-gray-400 mb-2">
                  Pré-visualização — {previewRows.length} de {rows.length} registros{rows.length > 20 ? ' (primeiros 20)' : ''}
                </p>
                <div className="overflow-x-auto rounded-lg border border-gray-200">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="bg-gray-50 border-b border-gray-200">
                        {['Conta', 'Red.', 'Descrição', 'Saldo Ant.', 'Débito', 'Crédito', 'Saldo Atual'].map((h) => (
                          <th key={h} className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {previewRows.map((r, i) => (
                        <tr key={i} className={i < previewRows.length - 1 ? 'border-b border-gray-100' : ''}>
                          <td className="px-3 py-1.5 font-mono text-gray-700">{r.conta}</td>
                          <td className="px-3 py-1.5 text-gray-500">{r.reduzido}</td>
                          <td className="px-3 py-1.5 text-gray-600 max-w-xs truncate">{r.descricao}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmtBR(r.saldo_anterior)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmtBR(r.val_debito)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmtBR(r.val_credito)}</td>
                          <td className="px-3 py-1.5 text-right font-mono">{fmtBR(r.saldo_atual)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {error && <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</p>}
            </>
          )}

          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500">Importando {rows.length} registros...</p>
            </div>
          )}

          {step === 'done' && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <CheckCircle size={44} className="text-green-500" />
              <div className="text-center space-y-1.5">
                <p className="font-semibold text-gray-800 text-base">Importação concluída!</p>
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-green-600">{importCount}</span> registros importados para{' '}
                  <strong>{mesNome(detectedMes!)}/{detectedAno}</strong>
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            {step === 'preview' && (
              <button
                onClick={() => { setStep('idle'); setRows([]); setError('') }}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Selecionar outro arquivo
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {step !== 'importing' && (
              <button
                onClick={() => onClose(step === 'done')}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                {step === 'done' ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {step === 'preview' && (
              <button
                onClick={handleImport}
                className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                {existingBalancete ? 'Substituir e Importar' : 'Confirmar Importação'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// ── BpDre Detalhe modal ───────────────────────────────────────────────────

interface DetalheRow {
  pciId: number
  reduzido: number
  conta: string
  descricao: string
  saldo_anterior: number
  val_debito: number
  val_credito: number
  saldo_atual: number
  idSubgrupo: number | null
  idBpDre: number | null
  subgrupo: string | null
  bpDre: string | null
  nota: string | null
  papel: string | null
}

function BpDreDetalheModal({
  bpDreId, bpDreDesc, balanceteId, planoContasId, onClose,
}: {
  bpDreId: number
  bpDreDesc: string
  balanceteId: number
  planoContasId: number
  onClose: () => void
}) {
  const { data: balItems = [], isLoading: loadingBal } = useQuery({
    queryKey: ['detalhe_bal', balanceteId],
    queryFn: async () => {
      const PAGE = 1000; const all: { reduzido: number; conta: string; descricao: string; saldo_anterior: number; val_debito: number; val_credito: number; saldo_atual: number }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('balancete_itens')
          .select('reduzido, conta, descricao, saldo_anterior, val_debito, val_credito, saldo_atual')
          .eq('balancete_id', balanceteId).range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...data)
        if (data.length < PAGE) break
      }
      return all
    },
  })

  const { data: planoItems = [], isLoading: loadingPlano } = useQuery({
    queryKey: ['detalhe_plano', planoContasId, bpDreId],
    queryFn: async () => {
      const PAGE = 1000
      const all: { id: number; reduzido: number; id_class_subgrupo: number | null; id_class_bp_dre: number | null; class_subgrupo: { sigla_subgrupo: string } | null; class_bp_dre: { desc_bp_dre: string } | null; class_nota_explicativa: { desc_ne: string } | null; class_papel_trabalho: { sigla_papel: string } | null }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase.from('plano_contas_itens')
          .select('id, reduzido, id_class_subgrupo, id_class_bp_dre, class_subgrupo(sigla_subgrupo), class_bp_dre(desc_bp_dre), class_nota_explicativa(desc_ne), class_papel_trabalho(sigla_papel)')
          .eq('id_plano_contas', planoContasId).eq('id_class_bp_dre', bpDreId).range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...(data as typeof all))
        if (data.length < PAGE) break
      }
      return all
    },
  })

  const rows = useMemo((): DetalheRow[] => {
    const planoMap = new Map(planoItems.map(p => [p.reduzido, p]))
    return balItems
      .filter(b => planoMap.has(b.reduzido))
      .map(b => {
        const p = planoMap.get(b.reduzido)!
        return {
          ...b,
          pciId: p.id,
          idSubgrupo: p.id_class_subgrupo,
          idBpDre: p.id_class_bp_dre,
          subgrupo: p.class_subgrupo?.sigla_subgrupo ?? null,
          bpDre: p.class_bp_dre?.desc_bp_dre ?? null,
          nota: p.class_nota_explicativa?.desc_ne ?? null,
          papel: p.class_papel_trabalho?.sigla_papel ?? null,
        }
      })
      .sort((a, b) => a.conta.localeCompare(b.conta))
  }, [balItems, planoItems])

  const total = rows.reduce((acc, r) => acc + r.saldo_atual, 0)
  const loading = loadingBal || loadingPlano

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60]">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 max-h-[90vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">Detalhe — {bpDreDesc}</h3>
            <p className="text-xs text-gray-400 mt-0.5">{rows.length} conta{rows.length !== 1 ? 's' : ''} · clique em fechar para voltar</p>
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
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-gray-50 z-10">
                <tr>
                  {['PCI#', 'Red.', 'Conta', 'Descrição', 'Saldo Ant.', 'Saldo Atual', 'SG (id)', 'BP/DRE (id)', 'Nota Exp.', 'Papel'].map(h => (
                    <th key={h} className="text-left px-2 py-2 text-gray-500 font-semibold whitespace-nowrap border-b border-gray-200">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-t border-gray-100 hover:bg-gray-50">
                    <td className="px-2 py-1.5 font-mono text-gray-400 whitespace-nowrap text-[10px]">#{r.pciId}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-500 whitespace-nowrap">{r.reduzido}</td>
                    <td className="px-2 py-1.5 font-mono text-gray-700 whitespace-nowrap">{r.conta}</td>
                    <td className="px-2 py-1.5 text-gray-700 max-w-[160px] truncate" title={r.descricao}>{r.descricao}</td>
                    <td className="px-2 py-1.5 text-right font-mono text-gray-500 whitespace-nowrap">{fmtBR(r.saldo_anterior)}</td>
                    <td className={`px-2 py-1.5 text-right font-mono font-medium whitespace-nowrap ${r.saldo_atual < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtBR(r.saldo_atual)}</td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {r.subgrupo
                        ? <span className="px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded text-[10px] font-semibold">{r.subgrupo}</span>
                        : <span className="text-gray-300">—</span>}
                      {r.idSubgrupo != null && <span className="ml-1 text-gray-400 text-[10px]">#{r.idSubgrupo}</span>}
                    </td>
                    <td className="px-2 py-1.5 max-w-[140px]" title={r.bpDre ?? ''}>
                      <span className="truncate block text-gray-600">{r.bpDre ?? <span className="text-gray-300">—</span>}</span>
                      {r.idBpDre != null && <span className="text-gray-400 text-[10px]">#{r.idBpDre}</span>}
                    </td>
                    <td className="px-2 py-1.5 text-gray-500 max-w-[120px] truncate" title={r.nota ?? ''}>{r.nota ?? <span className="text-gray-300">—</span>}</td>
                    <td className="px-2 py-1.5 text-gray-500 whitespace-nowrap">{r.papel ?? <span className="text-gray-300">—</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="sticky bottom-0 bg-gray-50 border-t-2 border-gray-200">
                <tr>
                  <td colSpan={5} className="px-2 py-2 font-semibold text-gray-600 text-xs">Total ({rows.length} contas)</td>
                  <td className={`px-2 py-2 text-right font-mono font-bold text-sm whitespace-nowrap ${total < 0 ? 'text-red-600' : 'text-gray-800'}`}>{fmtBR(total)}</td>
                  <td colSpan={4} />
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

// ── Validação modal ────────────────────────────────────────────────────────

interface SubgrupoVal {
  id: number
  sigla_subgrupo: string
  desc_subgrupo: string | null
}

interface BpDreSubgrupoLink {
  id: number
  indice: number | null
  id_class_bp_dre: number
  id_class_subgrupo: number
  class_bp_dre: { id: number; desc_bp_dre: string } | null
  class_subgrupo: SubgrupoVal | null
}

interface PlanoItem {
  conta: string
  reduzido: number
  id_class_bp_dre: number | null
  id_class_subgrupo: number | null
  class_bp_dre: { id: number; desc_bp_dre: string } | null
  class_subgrupo: { id: number; sigla_subgrupo: string; desc_subgrupo: string | null } | null
}

interface GrupoVal {
  subgrupo: SubgrupoVal
  itens: { id: number; desc_bp_dre: string; saldo: number }[]
  subtotal: number
}

function isResultadoSg(sg: SubgrupoVal): boolean {
  return (
    sg.sigla_subgrupo.toUpperCase() === 'RESULTADO' ||
    (sg.desc_subgrupo ?? '').toUpperCase() === 'RESULTADO'
  )
}

function isPLSg(sg: SubgrupoVal): boolean {
  const s = sg.sigla_subgrupo.toUpperCase()
  const d = (sg.desc_subgrupo ?? '').toLowerCase()
  return s === 'PL' || d.includes('patrimônio') || d.includes('patrimonio')
}

function isAtivoSg(sg: SubgrupoVal): boolean {
  const d = (sg.desc_subgrupo ?? '').toLowerCase()
  const s = sg.sigla_subgrupo.toUpperCase()
  return d.includes('ativo') || s === 'AC' || s === 'ANC'
}

function fmtValModal(v: number): React.ReactNode {
  if (v < 0) return <span className="text-red-700 font-mono">({fmtBR(v)})</span>
  return fmtBR(v)
}

function ValidacaoModal({
  balancete,
  vigencia,
  onClose,
}: {
  balancete: Balancete
  vigencia: Vigencia
  onClose: () => void
}) {
  const { data: bItems = [], isLoading: loadingItems } = useQuery({
    queryKey: ['balancete_itens_validacao', balancete.id],
    queryFn: async () => {
      const PAGE = 1000
      const all: { conta: string; reduzido: number; saldo_atual: number }[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('balancete_itens')
          .select('conta, reduzido, saldo_atual')
          .eq('balancete_id', balancete.id)
          .range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...(data as { reduzido: number; saldo_atual: number }[]))
        if (data.length < PAGE) break
      }
      return all
    }
  })

  const { data: planoItens = [], isLoading: loadingPlano } = useQuery({
    queryKey: ['plano_itens_val', vigencia.plano_contas.id],
    queryFn: async () => {
      const PAGE = 1000
      const all: PlanoItem[] = []
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await supabase
          .from('plano_contas_itens')
          .select('conta, reduzido, id_class_bp_dre, id_class_subgrupo, class_bp_dre(id, desc_bp_dre), class_subgrupo(id, sigla_subgrupo, desc_subgrupo)')
          .eq('id_plano_contas', vigencia.plano_contas.id)
          .not('id_class_bp_dre', 'is', null)
          .range(from, from + PAGE - 1)
        if (error) throw error
        all.push(...(data as unknown as PlanoItem[]))
        if (data.length < PAGE) break
      }
      return all
    }
  })

  const { data: links = [], isLoading: loadingLinks } = useQuery({
    queryKey: ['class_bp_dre_subgrupo_val'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_bp_dre_subgrupo')
        .select('id, indice, id_class_bp_dre, id_class_subgrupo, class_bp_dre(id, desc_bp_dre), class_subgrupo(id, sigla_subgrupo, desc_subgrupo)')
        .order('indice', { ascending: true, nullsFirst: false })
      if (error) throw error
      return data as unknown as BpDreSubgrupoLink[]
    }
  })

  const loading = loadingItems || loadingPlano || loadingLinks

  const [detalheItem, setDetalheItem] = useState<{ bpDreId: number; desc: string } | null>(null)

  const { gruposResultado, gruposBP, totalResultado, totalAtivo, totalPassivoEPL } =
    useMemo(() => {
      // ── Passo 1: classificar itens do N:N em três categorias ──────────────
      // RESULTADO e PL são exclusivos (um bp_dre só pode estar em um deles).
      // AC/ANC/PC/PNC podem compartilhar o mesmo bp_dre entre si.
      const dreSet = new Set<number>() // bp_dre do subgrupo RESULTADO
      const plSet  = new Set<number>() // bp_dre do subgrupo PL

      type Entry = { bpId: number; desc: string; indice: number | null }
      const dreEntriesMap = new Map<number, Entry>()
      const plEntriesMap  = new Map<number, Entry>()
      let plSubgrupo: SubgrupoVal | null = null
      const indiceMapBP = new Map<string, number | null>() // "sgId|bpId" para AC/ANC/PC/PNC

      for (const link of links) {
        if (!link.class_bp_dre || !link.class_subgrupo) continue
        if (isResultadoSg(link.class_subgrupo)) {
          dreSet.add(link.id_class_bp_dre)
          if (!dreEntriesMap.has(link.id_class_bp_dre))
            dreEntriesMap.set(link.id_class_bp_dre, { bpId: link.id_class_bp_dre, desc: link.class_bp_dre.desc_bp_dre, indice: link.indice })
        } else if (isPLSg(link.class_subgrupo)) {
          plSet.add(link.id_class_bp_dre)
          plSubgrupo = link.class_subgrupo
          if (!plEntriesMap.has(link.id_class_bp_dre))
            plEntriesMap.set(link.id_class_bp_dre, { bpId: link.id_class_bp_dre, desc: link.class_bp_dre.desc_bp_dre, indice: link.indice })
        } else {
          indiceMapBP.set(`${link.id_class_subgrupo}|${link.id_class_bp_dre}`, link.indice)
        }
      }

      // ── Passo 2: mapear reduzido → { bpId, sgId } ─────────────────────────
      // sgId pode ser null — RESULTADO e PL são identificados pelo bpId, não pelo sgId
      type ItemClass = { bpId: number; sgId: number | null }
      const itemClassMap = new Map<string, ItemClass>()
      for (const pi of planoItens) {
        if (!pi.id_class_bp_dre) continue
        itemClassMap.set(pi.conta, { bpId: pi.id_class_bp_dre, sgId: pi.id_class_subgrupo })
      }

      // ── Passo 3: acumular saldos ───────────────────────────────────────────
      // DRE (dreSet) e PL (plSet): acumulam por bpId (sem risco de duplicação)
      // AC/ANC/PC/PNC: acumulam por "sgId|bpId" (evita duplicação entre subgrupos)
      const saldoDRE = new Map<number, number>()
      const saldoPL  = new Map<number, number>()
      const saldoBP  = new Map<string, number>()

      for (const item of bItems) {
        const cls = itemClassMap.get(item.conta)
        if (!cls) continue
        if (dreSet.has(cls.bpId)) {
          saldoDRE.set(cls.bpId, (saldoDRE.get(cls.bpId) ?? 0) + item.saldo_atual)
        } else if (plSet.has(cls.bpId)) {
          saldoPL.set(cls.bpId, (saldoPL.get(cls.bpId) ?? 0) + item.saldo_atual)
        } else if (cls.sgId !== null) {
          const key = `${cls.sgId}|${cls.bpId}`
          saldoBP.set(key, (saldoBP.get(key) ?? 0) + item.saldo_atual)
        }
      }

      // ── Passo 4: seção RESULTADO ───────────────────────────────────────────
      const sortEntries = (a: Entry, b: Entry) => {
        if (a.indice != null && b.indice != null) return a.indice - b.indice
        if (a.indice != null) return -1
        if (b.indice != null) return 1
        return a.desc.localeCompare(b.desc)
      }
      const dreItems = Array.from(dreEntriesMap.values()).sort(sortEntries)
      const gruposResultado: GrupoVal[] = dreItems.length > 0 ? [{
        subgrupo: { id: -1, sigla_subgrupo: 'RESULTADO', desc_subgrupo: null },
        itens: dreItems.map(d => ({ id: d.bpId, desc_bp_dre: d.desc, saldo: saldoDRE.get(d.bpId) ?? 0 })),
        subtotal: dreItems.reduce((acc, d) => acc + (saldoDRE.get(d.bpId) ?? 0), 0),
      }] : []

      // ── Passo 5: seção PL ──────────────────────────────────────────────────
      const plItems = Array.from(plEntriesMap.values()).sort(sortEntries)
      const grupoPL: GrupoVal | null = plSubgrupo && plItems.length > 0 ? {
        subgrupo: plSubgrupo,
        itens: plItems.map(p => ({ id: p.bpId, desc_bp_dre: p.desc, saldo: saldoPL.get(p.bpId) ?? 0 })),
        subtotal: plItems.reduce((acc, p) => acc + (saldoPL.get(p.bpId) ?? 0), 0),
      } : null

      // ── Passo 6: seção AC/ANC/PC/PNC (chave composta) ─────────────────────
      type BpDreRow = { id: number; desc_bp_dre: string; saldo: number; indice: number | null }
      const grupoMapBP = new Map<number, { subgrupo: SubgrupoVal; itensMap: Map<number, BpDreRow>; subtotal: number }>()

      for (const pi of planoItens) {
        if (!pi.id_class_bp_dre || !pi.id_class_subgrupo || !pi.class_bp_dre || !pi.class_subgrupo) continue
        if (dreSet.has(pi.id_class_bp_dre) || plSet.has(pi.id_class_bp_dre)) continue

        const compositeKey = `${pi.id_class_subgrupo}|${pi.id_class_bp_dre}`
        if (!grupoMapBP.has(pi.id_class_subgrupo))
          grupoMapBP.set(pi.id_class_subgrupo, { subgrupo: pi.class_subgrupo, itensMap: new Map(), subtotal: 0 })
        const g = grupoMapBP.get(pi.id_class_subgrupo)!
        if (!g.itensMap.has(pi.id_class_bp_dre)) {
          const saldo = saldoBP.get(compositeKey) ?? 0
          g.itensMap.set(pi.id_class_bp_dre, { id: pi.id_class_bp_dre, desc_bp_dre: pi.class_bp_dre.desc_bp_dre, saldo, indice: indiceMapBP.get(compositeKey) ?? null })
          g.subtotal += saldo
        }
      }

      const gruposBP: GrupoVal[] = []
      for (const g of grupoMapBP.values()) {
        const sorted = Array.from(g.itensMap.values()).sort((a, b) => {
          if (a.indice != null && b.indice != null) return a.indice - b.indice
          if (a.indice != null) return -1
          if (b.indice != null) return 1
          return a.desc_bp_dre.localeCompare(b.desc_bp_dre)
        })
        gruposBP.push({ subgrupo: g.subgrupo, itens: sorted.map(({ id, desc_bp_dre, saldo }) => ({ id, desc_bp_dre, saldo })), subtotal: g.subtotal })
      }
      // AC/ANC/PC/PNC em ordem alfabética, PL sempre por último
      gruposBP.sort((a, b) => a.subgrupo.sigla_subgrupo.localeCompare(b.subgrupo.sigla_subgrupo))
      if (grupoPL) gruposBP.push(grupoPL)

      // ── Totais para verificação ────────────────────────────────────────────
      const totalResultado = gruposResultado[0]?.subtotal ?? 0
      let totalAtivo = 0
      let totalPassivoEPL = 0
      for (const g of gruposBP) {
        if (isAtivoSg(g.subgrupo)) totalAtivo += g.subtotal
        else totalPassivoEPL += g.subtotal
      }
      totalPassivoEPL += totalResultado

      return { gruposResultado, gruposBP, totalResultado, totalAtivo, totalPassivoEPL }
    }, [bItems, planoItens, links])

  const equilibrado = Math.abs(totalAtivo - totalPassivoEPL) < 0.01

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-2xl mx-4 max-h-[92vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">
              Validação do Balancete — {mesNome(balancete.mes)}/{balancete.ano}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {vigencia.empresa.abreviacao} — Plano: {vigencia.plano_contas.nome} · <span className="italic">Clique em uma linha para ver as contas</span>
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="space-y-6">

              {/* ── DRE ── */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-blue-700 mb-2">
                  DRE — Resultado
                </h4>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-100">
                      <th className="text-left py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Descrição</th>
                      <th className="text-right py-1.5 text-xs font-semibold text-gray-400 uppercase tracking-wide">Saldo Atual</th>
                    </tr>
                  </thead>
                  <tbody>
                    {gruposResultado.flatMap((g) =>
                      g.itens.map((item) => (
                        <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer" onClick={() => setDetalheItem({ bpDreId: item.id, desc: item.desc_bp_dre })}>
                          <td className="py-1.5 text-gray-700 hover:text-blue-700">{item.desc_bp_dre}</td>
                          <td className="py-1.5 text-right font-mono text-gray-700">{fmtValModal(item.saldo)}</td>
                        </tr>
                      ))
                    )}
                    {gruposResultado.length === 0 && (
                      <tr>
                        <td colSpan={2} className="py-3 text-center text-xs text-gray-400">
                          Nenhuma conta classificada no subgrupo RESULTADO.
                        </td>
                      </tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-blue-200 bg-blue-50">
                      <td className="py-2 font-bold text-blue-800 text-sm">RESULTADO</td>
                      <td className="py-2 text-right font-bold font-mono text-blue-800 text-sm">
                        {fmtValModal(totalResultado)}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>

              {/* ── Balanço Patrimonial ── */}
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">
                  Balanço Patrimonial
                </h4>
                <div className="space-y-4">
                  {gruposBP.map((g) => (
                    <div key={g.subgrupo.id}>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                        {g.subgrupo.sigla_subgrupo}
                        {g.subgrupo.desc_subgrupo ? ` — ${g.subgrupo.desc_subgrupo}` : ''}
                      </p>
                      <table className="w-full text-sm">
                        <tbody>
                          {g.itens.map((item) => (
                            <tr key={item.id} className="border-b border-gray-50 hover:bg-blue-50 cursor-pointer" onClick={() => setDetalheItem({ bpDreId: item.id, desc: item.desc_bp_dre })}>
                              <td className="py-1.5 text-gray-700 pl-3 hover:text-blue-700">{item.desc_bp_dre}</td>
                              <td className="py-1.5 text-right font-mono text-gray-700">{fmtValModal(item.saldo)}</td>
                            </tr>
                          ))}
                          {isPLSg(g.subgrupo) && (
                            <tr className="border-b border-dashed border-blue-200 bg-blue-50/40">
                              <td className="py-1.5 pl-3 text-blue-700 italic text-sm">Resultado do Período</td>
                              <td className="py-1.5 text-right font-mono text-blue-700 italic">{fmtValModal(totalResultado)}</td>
                            </tr>
                          )}
                        </tbody>
                        <tfoot>
                          <tr className="border-t border-gray-200 bg-gray-50">
                            <td className="py-1.5 pl-3 text-xs font-semibold text-gray-500">
                              Subtotal {g.subgrupo.sigla_subgrupo}
                            </td>
                            <td className="py-1.5 text-right font-mono font-semibold text-gray-700 text-sm">
                              {fmtValModal(isPLSg(g.subgrupo) ? g.subtotal + totalResultado : g.subtotal)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  ))}
                </div>
              </div>

              {/* ── Verificação ── */}
              <div className={`rounded-xl p-4 ${equilibrado ? 'bg-green-50 border border-green-200' : 'bg-amber-50 border border-amber-200'}`}>
                <div className="flex items-start gap-3">
                  {equilibrado
                    ? <CheckCircle size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                    : <AlertTriangle size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
                  }
                  <div className="flex-1">
                    <p className={`font-semibold text-sm ${equilibrado ? 'text-green-800' : 'text-amber-800'}`}>
                      {equilibrado ? 'Balancete equilibrado' : 'Balancete desequilibrado'}
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <span className="text-gray-500">Total Ativo</span>
                        <p className="font-mono font-semibold text-gray-800">{fmtValModal(totalAtivo)}</p>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Passivo + PL</span>
                        <p className="font-mono font-semibold text-gray-800">{fmtValModal(totalPassivoEPL)}</p>
                      </div>
                    </div>
                    {!equilibrado && (
                      <p className="mt-2 text-xs text-amber-700">
                        Diferença: <span className="font-mono font-semibold">{fmtBR(Math.abs(totalAtivo - totalPassivoEPL))}</span>
                      </p>
                    )}
                  </div>
                </div>
              </div>

            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>

      {detalheItem && (
        <BpDreDetalheModal
          bpDreId={detalheItem.bpDreId}
          bpDreDesc={detalheItem.desc}
          balanceteId={balancete.id}
          planoContasId={vigencia.plano_contas.id}
          onClose={() => setDetalheItem(null)}
        />
      )}
    </div>
  )
}

// ── Saldo Validação modal ──────────────────────────────────────────────────

function SaldoValidacaoModal({
  vigencia,
  onClose,
}: {
  vigencia: Vigencia
  onClose: () => void
}) {
  const { data: mesesRaw = [], isLoading } = useQuery({
    queryKey: ['saldo_validacao', vigencia.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete')
        .select('id, mes, balancete_itens(conta, saldo_anterior, saldo_atual)')
        .eq('vigencia_id', vigencia.id)
        .order('mes')
      if (error) throw error
      return data as { id: number; mes: number; balancete_itens: { conta: string; saldo_anterior: number; saldo_atual: number }[] }[]
    }
  })

  const mesesData = useMemo(() => {
    return Array.from({ length: 12 }, (_, i) => {
      const mes = i + 1
      const bal = mesesRaw.find((b) => b.mes === mes)
      if (!bal) return { mes, saldoInicial: null as number | null, saldoFinal: null as number | null }
      // Usa a conta raiz do Ativo ('1') como referência — ela já carrega o total do ativo
      const contaRaiz = bal.balancete_itens.find((r) => r.conta === '1')
      if (!contaRaiz) return { mes, saldoInicial: null as number | null, saldoFinal: null as number | null }
      return { mes, saldoInicial: contaRaiz.saldo_anterior, saldoFinal: contaRaiz.saldo_atual }
    })
  }, [mesesRaw])

  function getValidacao(idx: number): { status: 'na' } | { status: 'ok' } | { status: 'diff'; diff: number } {
    if (idx === 0) return { status: 'na' }
    const curr = mesesData[idx]
    const prev = mesesData[idx - 1]
    if (curr.saldoInicial === null || prev.saldoFinal === null) return { status: 'na' }
    const diff = curr.saldoInicial - prev.saldoFinal
    return Math.abs(diff) < 0.01 ? { status: 'ok' } : { status: 'diff', diff }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-5xl mx-4 max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">
              Validação de Saldos — {vigencia.empresa.abreviacao} {vigencia.ano_vigencia}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">Saldo final de cada mês deve bater com o saldo inicial do mês seguinte</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto px-6 py-5">
          {isLoading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="text-sm border-collapse" style={{ minWidth: 900 }}>
                <thead>
                  <tr className="border-b border-gray-200 bg-gray-50">
                    <th className="sticky left-0 bg-gray-50 text-left px-4 py-3 w-36 text-xs font-semibold text-gray-500 uppercase tracking-wide">Período</th>
                    {Array.from({ length: 12 }, (_, i) => (
                      <th key={i} className="px-3 py-3 w-20 text-center text-xs font-semibold text-gray-500 uppercase tracking-wide">
                        {String(i + 1).padStart(2, '0')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-4 py-3 text-xs font-semibold text-gray-600 whitespace-nowrap">Saldo Inicial</td>
                    {mesesData.map((m, i) => (
                      <td key={i} className="px-3 py-3 text-right font-mono text-xs text-gray-700 whitespace-nowrap">
                        {m.saldoInicial !== null ? fmtBR(m.saldoInicial) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className="border-b-2 border-gray-200 hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-4 py-3 text-xs font-semibold text-gray-600 whitespace-nowrap">Saldo Final</td>
                    {mesesData.map((m, i) => (
                      <td key={i} className="px-3 py-3 text-right font-mono text-xs text-gray-700 whitespace-nowrap">
                        {m.saldoFinal !== null ? fmtBR(m.saldoFinal) : <span className="text-gray-300">—</span>}
                      </td>
                    ))}
                  </tr>
                  <tr className="hover:bg-gray-50">
                    <td className="sticky left-0 bg-white px-4 py-3 text-xs font-semibold text-gray-600 whitespace-nowrap">Validação</td>
                    {mesesData.map((_, i) => {
                      const v = getValidacao(i)
                      return (
                        <td key={i} className={`px-3 py-3 text-center whitespace-nowrap ${v.status === 'diff' ? 'bg-red-50' : ''}`}>
                          {v.status === 'na' && <span className="text-gray-400 text-xs">N/A</span>}
                          {v.status === 'ok' && (
                            <span className="bg-green-100 text-green-700 text-xs font-semibold px-1.5 py-0.5 rounded">Ok</span>
                          )}
                          {v.status === 'diff' && (
                            <span className="text-red-700 text-xs font-semibold">({fmtBR(v.diff)})</span>
                          )}
                        </td>
                      )
                    })}
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex justify-end flex-shrink-0">
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Nota Explicativa combobox ─────────────────────────────────────────────

interface NeOption { id: number; desc_ne: string }

function NeCombobox({
  value,
  options,
  onChange,
}: {
  value: number | null
  options: NeOption[]
  onChange: (v: number | null) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [pos, setPos] = useState({ top: 0, left: 0, width: 0 })
  const wrapperRef = useRef<HTMLDivElement>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const selectedLabel = value != null ? (options.find(o => o.id === value)?.desc_ne ?? '') : ''

  const filtered = query.trim()
    ? options.filter(o => o.desc_ne.toLowerCase().includes(query.toLowerCase()))
    : options

  const handleFocus = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect()
      setPos({ top: rect.bottom + 2, left: rect.left, width: Math.max(rect.width, 260) })
    }
    setOpen(true)
    setQuery('')
  }

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (
        wrapperRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return
      setOpen(false)
      setQuery('')
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={wrapperRef} className="inline-block">
      <div className="flex items-center border border-gray-200 rounded bg-white focus-within:ring-1 focus-within:ring-blue-500">
        <input
          ref={inputRef}
          type="text"
          value={open ? query : selectedLabel}
          placeholder={open ? 'Filtrar...' : '—'}
          onFocus={handleFocus}
          onChange={e => setQuery(e.target.value)}
          className="px-2 py-1 text-xs w-44 outline-none bg-transparent truncate"
        />
        {value != null && !open && (
          <button
            type="button"
            onMouseDown={e => { e.preventDefault(); onChange(null) }}
            className="pr-1.5 text-gray-300 hover:text-gray-500 flex-shrink-0"
          >
            <X size={10} />
          </button>
        )}
      </div>
      {open && createPortal(
        <div
          ref={dropdownRef}
          style={{ position: 'fixed', top: pos.top, left: pos.left, minWidth: pos.width, zIndex: 9999 }}
          className="bg-white border border-gray-200 rounded-lg shadow-xl max-h-56 overflow-y-auto"
        >
          {filtered.length === 0 ? (
            <div className="px-3 py-2 text-xs text-gray-400 italic">Nenhum resultado</div>
          ) : (
            filtered.map(o => (
              <button
                key={o.id}
                type="button"
                onMouseDown={() => { onChange(o.id); setOpen(false); setQuery('') }}
                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-blue-50 ${value === o.id ? 'bg-blue-50 text-blue-700 font-medium' : 'text-gray-700'}`}
              >
                {o.desc_ne}
              </button>
            ))
          )}
        </div>,
        document.body
      )}
    </div>
  )
}

// ── Contas Ausentes modal ──────────────────────────────────────────────────

interface RowClassState {
  id_class_subgrupo: number | null
  id_class_bp_dre: number | null
  id_class_nota_explicativa: number | null
  id_class_papel_trabalho: number | null
}


function ContasAusentesModal({
  balancete,
  vigencia,
  onClose,
}: {
  balancete: Balancete
  vigencia: Vigencia
  onClose: () => void
}) {
  const qc = useQueryClient()
  const [rowClasses, setRowClasses] = useState<Map<string, RowClassState>>(new Map())
  const [savingRows, setSavingRows] = useState<Set<string>>(new Set())
  const [savedRows, setSavedRows] = useState<Set<string>>(new Set())
  const [saveError, setSaveError] = useState('')

  const { data: bItems = [], isLoading: loadingBItems } = useQuery({
    queryKey: ['balancete_itens_ausentes', balancete.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete_itens')
        .select('conta, reduzido, descricao')
        .eq('balancete_id', balancete.id)
        .order('conta')
      if (error) throw error
      return data as { conta: string; reduzido: number; descricao: string }[]
    }
  })

  const { data: planoChaves = [], isLoading: loadingPlano } = useQuery({
    queryKey: ['plano_contas_itens_chaves', vigencia.plano_contas.id],
    queryFn: async () => {
      const PAGE = 1000
      const all: { conta: string; reduzido: number }[] = []
      let from = 0
      while (true) {
        const { data, error } = await supabase
          .from('plano_contas_itens')
          .select('conta, reduzido')
          .eq('id_plano_contas', vigencia.plano_contas.id)
          .range(from, from + PAGE - 1)
        if (error) throw error
        if (data) all.push(...data)
        if (!data || data.length < PAGE) break
        from += PAGE
      }
      return all
    }
  })

  const { data: subgrupos = [] } = useQuery({
    queryKey: ['class_subgrupo'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_subgrupo').select('id, sigla_subgrupo, desc_subgrupo').order('sigla_subgrupo')
      if (error) throw error
      return data as { id: number; sigla_subgrupo: string; desc_subgrupo: string | null }[]
    }
  })

  const { data: bpDres = [] } = useQuery({
    queryKey: ['class_bp_dre'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_bp_dre').select('id, desc_bp_dre').order('desc_bp_dre')
      if (error) throw error
      return data as { id: number; desc_bp_dre: string }[]
    }
  })

  const { data: notasExp = [] as NeOption[] } = useQuery({
    queryKey: ['class_nota_explicativa'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_nota_explicativa').select('id, desc_ne').order('desc_ne')
      if (error) throw error
      return data as NeOption[]
    }
  })

  const { data: papeis = [] } = useQuery({
    queryKey: ['class_papel_trabalho'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('class_papel_trabalho').select('id, sigla_papel, desc_papel').order('sigla_papel')
      if (error) throw error
      return data as { id: number; sigla_papel: string; desc_papel: string | null }[]
    }
  })

  const ausentes = useMemo(() => {
    if (loadingBItems || loadingPlano) return []
    const planoKeys = new Set(planoChaves.map(p => `${p.conta}|${p.reduzido}`))
    return bItems.filter(b => !planoKeys.has(`${b.conta}|${b.reduzido}`))
  }, [bItems, planoChaves, loadingBItems, loadingPlano])

  const loading = loadingBItems || loadingPlano

  const getRow = (conta: string): RowClassState =>
    rowClasses.get(conta) ?? { id_class_subgrupo: null, id_class_bp_dre: null, id_class_nota_explicativa: null, id_class_papel_trabalho: null }

  const setField = (conta: string, field: keyof RowClassState, value: number | null) => {
    setRowClasses(prev => {
      const next = new Map(prev)
      const curr = prev.get(conta) ?? { id_class_subgrupo: null, id_class_bp_dre: null, id_class_nota_explicativa: null, id_class_papel_trabalho: null }
      const updated: RowClassState = { ...curr, [field]: value }
      if (field === 'id_class_bp_dre') updated.id_class_nota_explicativa = null
      next.set(conta, updated)
      return next
    })
  }

  const ausentesVisiveis = useMemo(
    () => ausentes.filter(a => !savedRows.has(a.conta)),
    [ausentes, savedRows]
  )

  const handleSaveRow = async (a: { conta: string; reduzido: number; descricao: string }) => {
    setSavingRows(prev => new Set([...prev, a.conta]))
    setSaveError('')
    try {
      const cls = rowClasses.get(a.conta) ?? {} as RowClassState
      const { error: err } = await supabase
        .from('plano_contas_itens')
        .upsert({
          id_plano_contas: vigencia.plano_contas.id,
          conta: a.conta,
          reduzido: a.reduzido,
          desc_conta: a.descricao,
          fl_ativa: true,
          id_class_subgrupo: (cls as RowClassState).id_class_subgrupo ?? null,
          id_class_bp_dre: (cls as RowClassState).id_class_bp_dre ?? null,
          id_class_nota_explicativa: (cls as RowClassState).id_class_nota_explicativa ?? null,
          id_class_papel_trabalho: (cls as RowClassState).id_class_papel_trabalho ?? null,
        }, { onConflict: 'id_plano_contas,conta' })
      if (err) throw new Error(err.message)
      setSavedRows(prev => new Set([...prev, a.conta]))
      qc.invalidateQueries({ queryKey: ['plano_contas_itens', vigencia.plano_contas.id] })
      qc.invalidateQueries({ queryKey: ['plano_contas_itens_chaves', vigencia.plano_contas.id] })
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Erro ao incluir conta.')
    } finally {
      setSavingRows(prev => { const n = new Set(prev); n.delete(a.conta); return n })
    }
  }

  const selectCls = 'border border-gray-200 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white'

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-7xl mx-4 max-h-[92vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <div>
            <h3 className="font-semibold text-gray-800">
              Contas Ausentes no Plano — {mesNome(balancete.mes)}/{balancete.ano}
            </h3>
            <p className="text-xs text-gray-400 mt-0.5">
              {vigencia.empresa.abreviacao} — Plano: {vigencia.plano_contas.nome}
            </p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-auto">
          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
            </div>
          ) : ausentesVisiveis.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <CheckCircle size={36} className="text-green-500" />
              <p className="text-sm text-gray-600 font-medium">
                Todas as contas do balancete já estão cadastradas no plano.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse" style={{ minWidth: 1160 }}>
                <thead className="sticky top-0 bg-gray-50 border-b border-gray-200 z-10">
                  <tr>
                    {['Conta', 'Red.', 'Descrição', 'Subgrupo', 'BP/DRE', 'Nota Explic.', 'Papel Trabalho'].map(h => (
                      <th key={h} className="text-left px-3 py-2.5 text-xs font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap">
                        {h}
                      </th>
                    ))}
                    <th className="w-20 px-3 py-2.5" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ausentesVisiveis.map(a => {
                    const cls = getRow(a.conta)
                    const isSaving = savingRows.has(a.conta)
                    return (
                      <tr key={a.conta} className="hover:bg-gray-50">
                        <td className="px-3 py-2 font-mono text-gray-700 whitespace-nowrap">{a.conta}</td>
                        <td className="px-3 py-2 text-gray-500 whitespace-nowrap">{a.reduzido}</td>
                        <td className="px-3 py-2 text-gray-700 max-w-xs truncate" title={a.descricao}>{a.descricao}</td>
                        <td className="px-3 py-2">
                          <select
                            value={cls.id_class_subgrupo ?? ''}
                            onChange={e => setField(a.conta, 'id_class_subgrupo', e.target.value ? Number(e.target.value) : null)}
                            className={`${selectCls} w-36`}
                          >
                            <option value="">—</option>
                            {subgrupos.map(s => (
                              <option key={s.id} value={s.id}>
                                {s.sigla_subgrupo}{s.desc_subgrupo ? ` — ${s.desc_subgrupo}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={cls.id_class_bp_dre ?? ''}
                            onChange={e => setField(a.conta, 'id_class_bp_dre', e.target.value ? Number(e.target.value) : null)}
                            className={`${selectCls} w-44`}
                          >
                            <option value="">—</option>
                            {bpDres.map(b => (
                              <option key={b.id} value={b.id}>{b.desc_bp_dre}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2">
                          <NeCombobox
                            value={cls.id_class_nota_explicativa}
                            options={notasExp}
                            onChange={v => setField(a.conta, 'id_class_nota_explicativa', v)}
                          />
                        </td>
                        <td className="px-3 py-2">
                          <select
                            value={cls.id_class_papel_trabalho ?? ''}
                            onChange={e => setField(a.conta, 'id_class_papel_trabalho', e.target.value ? Number(e.target.value) : null)}
                            className={`${selectCls} w-36`}
                          >
                            <option value="">—</option>
                            {papeis.map(p => (
                              <option key={p.id} value={p.id}>
                                {p.sigla_papel}{p.desc_papel ? ` — ${p.desc_papel}` : ''}
                              </option>
                            ))}
                          </select>
                        </td>
                        <td className="px-3 py-2 text-right">
                          {isSaving ? (
                            <div className="inline-flex justify-center w-16">
                              <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-purple-600" />
                            </div>
                          ) : (
                            <button
                              onClick={() => handleSaveRow(a)}
                              className="inline-flex items-center gap-1 bg-purple-600 hover:bg-purple-700 text-white text-xs font-medium px-2.5 py-1 rounded-lg transition-colors"
                              title="Incluir no plano"
                            >
                              <Plus size={11} />
                              Incluir
                            </button>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between flex-shrink-0">
          <div>
            {ausentesVisiveis.length > 0 && (
              <p className="text-xs text-gray-400">
                {ausentesVisiveis.length} conta{ausentesVisiveis.length !== 1 ? 's' : ''} pendente{ausentesVisiveis.length !== 1 ? 's' : ''}
                {savedRows.size > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    · {savedRows.size} incluída{savedRows.size !== 1 ? 's' : ''}
                  </span>
                )}
              </p>
            )}
            {saveError && <p className="text-xs text-red-600 mt-0.5">{saveError}</p>}
          </div>
          <button
            onClick={onClose}
            className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
          >
            Fechar
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Page ───────────────────────────────────────────────────────────────────

export default function Balancetes(): JSX.Element {
  const qc = useQueryClient()

  const [vigenciaId, setVigenciaId] = useState<number | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [viewingBalancete, setViewingBalancete] = useState<Balancete | null>(null)
  const [validatingBalancete, setValidatingBalancete] = useState<Balancete | null>(null)
  const [contasAusentesBalancete, setContasAusentesBalancete] = useState<Balancete | null>(null)
  const [showSaldoValidacao, setShowSaldoValidacao] = useState(false)
  const [deleteId, setDeleteId] = useState<number | null>(null)
  const [deleting, setDeleting] = useState(false)

  // ── Queries ──────────────────────────────────────────────────────────────

  const { data: vigencias = [] } = useQuery({
    queryKey: ['plano_contas_vigencia_lista'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plano_contas_vigencia')
        .select('id, ano_vigencia, empresa(id, abreviacao), plano_contas(id, nome)')
      if (error) throw error
      return (data as unknown as Vigencia[]).sort((a, b) => {
        const cmp = a.empresa.abreviacao.localeCompare(b.empresa.abreviacao, 'pt-BR')
        return cmp !== 0 ? cmp : b.ano_vigencia - a.ano_vigencia
      })
    }
  })

  const { data: balancetes = [], isLoading } = useQuery({
    queryKey: ['balancete', vigenciaId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('balancete')
        .select('id, vigencia_id, mes, ano, dt_importacao, user_importacao')
        .eq('vigencia_id', vigenciaId!)
        .order('mes')
      if (error) throw error
      return data as Balancete[]
    },
    enabled: !!vigenciaId
  })

  // ── Helpers ──────────────────────────────────────────────────────────────

  const selectedVigencia = vigencias.find((v) => v.id === vigenciaId) ?? null

  const handleImportClose = (imported: boolean) => {
    setImportOpen(false)
    if (imported) qc.invalidateQueries({ queryKey: ['balancete', vigenciaId] })
  }

  const handleDelete = async () => {
    if (!deleteId) return
    setDeleting(true)
    try {
      const { error } = await supabase.from('balancete').delete().eq('id', deleteId)
      if (error) throw error
      qc.invalidateQueries({ queryKey: ['balancete', vigenciaId] })
      setDeleteId(null)
    } finally {
      setDeleting(false)
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────

  return (
    <div className="p-8">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-bold text-gray-800">Balancetes</h2>
        {vigenciaId && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowSaldoValidacao(true)}
              className="flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-green-800 transition-colors"
            >
              <ListChecks size={16} />
              Validar Saldos
            </button>
            <button
              onClick={() => setImportOpen(true)}
              className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors"
            >
              <Upload size={16} />
              Importar Balancete
            </button>
          </div>
        )}
      </div>

      {/* Filtro de vigência */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-1">Vigência</label>
        <select
          value={vigenciaId ?? ''}
          onChange={(e) => setVigenciaId(e.target.value ? Number(e.target.value) : null)}
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-96"
        >
          <option value="">— Selecione uma vigência —</option>
          {vigencias.map((v) => (
            <option key={v.id} value={v.id}>
              {v.empresa.abreviacao} — {v.ano_vigencia} ({v.plano_contas.nome})
            </option>
          ))}
        </select>
      </div>

      {/* Conteúdo */}
      {!vigenciaId ? (
        <div className="flex flex-col items-center justify-center py-24 text-gray-300 gap-3">
          <Building2 size={40} />
          <p className="text-sm text-gray-400">Selecione uma vigência para ver os balancetes.</p>
        </div>
      ) : isLoading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : balancetes.length === 0 ? (
        <div className="text-center py-20 text-gray-400 text-sm">
          Nenhum balancete importado para esta vigência.
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Mês</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Ano</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Data Importação</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wide">Importado por</th>
                <th className="w-24 px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {balancetes.map((b, i) => (
                <tr key={b.id} className={`hover:bg-gray-50 ${i < balancetes.length - 1 ? 'border-b border-gray-50' : ''}`}>
                  <td className="px-4 py-3 font-medium text-gray-800">{mesLabel(b.mes)}</td>
                  <td className="px-4 py-3 text-gray-600">{b.ano}</td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {b.dt_importacao
                      ? new Date(b.dt_importacao).toLocaleString('pt-BR')
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {b.user_importacao ?? '—'}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        onClick={() => setViewingBalancete(b)}
                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                        title="Ver itens"
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        onClick={() => setValidatingBalancete(b)}
                        className="p-1.5 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition-colors"
                        title="Validar balancete"
                      >
                        <CheckSquare size={14} />
                      </button>
                      <button
                        onClick={() => setContasAusentesBalancete(b)}
                        className="p-1.5 text-gray-400 hover:text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
                        title="Contas não cadastradas no plano"
                      >
                        <PackageSearch size={14} />
                      </button>
                      <button
                        onClick={() => setDeleteId(b.id)}
                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                        title="Excluir"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Modais */}
      {importOpen && selectedVigencia && (
        <ImportModal
          vigencia={selectedVigencia}
          balancetes={balancetes}
          onClose={handleImportClose}
        />
      )}

      {viewingBalancete && (
        <ItemsModal
          balancete={viewingBalancete}
          onClose={() => setViewingBalancete(null)}
        />
      )}

      {validatingBalancete && selectedVigencia && (
        <ValidacaoModal
          balancete={validatingBalancete}
          vigencia={selectedVigencia}
          onClose={() => setValidatingBalancete(null)}
        />
      )}

      {contasAusentesBalancete && selectedVigencia && (
        <ContasAusentesModal
          balancete={contasAusentesBalancete}
          vigencia={selectedVigencia}
          onClose={() => setContasAusentesBalancete(null)}
        />
      )}

      {showSaldoValidacao && selectedVigencia && (
        <SaldoValidacaoModal
          vigencia={selectedVigencia}
          onClose={() => setShowSaldoValidacao(false)}
        />
      )}

      {/* Confirmação de exclusão */}
      {deleteId !== null && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4">
            <h3 className="font-semibold text-gray-800 mb-2">Confirmar exclusão</h3>
            <p className="text-sm text-gray-500 mb-6">
              O balancete e todos os seus itens serão removidos. Esta ação não pode ser desfeita.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setDeleteId(null)}
                className="flex-1 border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 bg-red-600 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-red-700 disabled:opacity-50 transition-colors"
              >
                {deleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
