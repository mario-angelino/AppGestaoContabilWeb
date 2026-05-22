import { useState } from 'react'
import * as xlsx from 'xlsx'
import { Upload, Download, X, CheckCircle, AlertTriangle } from 'lucide-react'
import { supabase } from '../../lib/supabase'
import { useActivePlan } from '../../contexts/ActivePlanContext'
import { pickExcelFile, downloadModelTemplate } from '../../lib/fileUtils'

const MODEL_FILENAME = 'PLANO-CONTAS-MODELO-V00.xlsx'

function extractError(err: unknown): string {
  if (err instanceof Error) return err.message
  if (err && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (typeof e.message === 'string') parts.push(e.message)
    if (typeof e.details === 'string' && e.details) parts.push(`Detalhes: ${e.details}`)
    if (typeof e.hint === 'string' && e.hint) parts.push(`Dica: ${e.hint}`)
    if (typeof e.code === 'string' && e.code) parts.push(`Código: ${e.code}`)
    if (parts.length) return parts.join(' | ')
    return JSON.stringify(err)
  }
  return String(err)
}

type Step = 'idle' | 'preview' | 'importing' | 'done'

interface ParsedRow {
  conta: string
  reduzido: number
  desc_conta: string
  fl_ativa: boolean
  id_class_subgrupo: number | null
  id_class_bp_dre: number | null
  id_class_nota_explicativa: number | null
  id_class_papel_trabalho: number | null
}

interface ImportResult {
  inserted: number
  updated: number
}

interface Props {
  open: boolean
  onClose: (imported: boolean) => void
}

function findCol(keys: string[], ...candidates: string[]): string | undefined {
  return candidates.reduce<string | undefined>((found, c) => {
    if (found) return found
    return keys.find((k) => k.toLowerCase().trim() === c.toLowerCase())
  }, undefined)
}

function parseBoolean(val: unknown): boolean {
  return ['true', '1', 'sim', 's', 'yes', 'y'].includes(String(val).toLowerCase().trim())
}

export default function ImportExcel({ open, onClose }: Props): JSX.Element | null {
  const { activePlan } = useActivePlan()

  const [step, setStep] = useState<Step>('idle')
  const [rows, setRows] = useState<ParsedRow[]>([])
  const [validationErrors, setValidationErrors] = useState<string[]>([])
  const [result, setResult] = useState<ImportResult | null>(null)
  const [loading, setLoading] = useState(false)
  const [generalError, setGeneralError] = useState('')

  if (!open) return null

  const reset = () => {
    setStep('idle')
    setRows([])
    setValidationErrors([])
    setResult(null)
    setGeneralError('')
  }

  const handleClose = () => {
    const imported = step === 'done'
    reset()
    onClose(imported)
  }

  const handleDownloadModel = () => {
    downloadModelTemplate(MODEL_FILENAME)
  }

  const handleSelectFile = async () => {
    if (!activePlan) return
    setLoading(true)
    setGeneralError('')
    setValidationErrors([])

    try {
      const raw = await pickExcelFile()
      if (!raw) return

      const wb = xlsx.read(new Uint8Array(raw), { type: 'array' })
      const ws = wb.Sheets[wb.SheetNames[0]]
      const jsonRows = xlsx.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: '' })

      if (jsonRows.length === 0) {
        setGeneralError('O arquivo está vazio.')
        return
      }

      const keys = Object.keys(jsonRows[0])
      const colConta = findCol(keys, 'conta')
      const colReduzido = findCol(keys, 'reduzido')
      const colDesc = findCol(keys, 'desc_conta', 'descricao', 'descrição', 'desc')
      const colAtiva = findCol(keys, 'fl_ativa', 'ativa', 'ativo')
      const colSubgrupo = findCol(keys, 'id_class_subgrupo')
      const colBpDre = findCol(keys, 'id_class_bp_dre')
      const colNota = findCol(keys, 'id_class_nota_explicativa')
      const colPapel = findCol(keys, 'id_class_papel_trabalho')

      const missing: string[] = []
      if (!colConta) missing.push('conta')
      if (!colReduzido) missing.push('reduzido')
      if (!colDesc) missing.push('desc_conta')
      if (missing.length) {
        setGeneralError(`Colunas obrigatórias não encontradas: ${missing.join(', ')}`)
        return
      }

      const parseClassId = (val: unknown): number | null => {
        if (val === '' || val === null || val === undefined) return null
        const n = Number(val)
        return isNaN(n) || n === 0 ? null : Math.round(n)
      }

      const errors: string[] = []

      const parsed: ParsedRow[] = []
      jsonRows.forEach((r, idx) => {
        const conta = String(r[colConta!]).trim()
        if (!conta) return // linha vazia — ignorar

        const rawRed = r[colReduzido!]
        const reduzido = Math.round(Number(rawRed))
        if (!rawRed || isNaN(reduzido)) {
          errors.push(`Linha ${idx + 2}: campo "reduzido" ausente ou inválido (conta: "${conta}")`)
          return
        }

        parsed.push({
          conta,
          reduzido,
          desc_conta: String(r[colDesc!]).trim(),
          fl_ativa: colAtiva ? parseBoolean(r[colAtiva]) : true,
          id_class_subgrupo: colSubgrupo ? parseClassId(r[colSubgrupo]) : null,
          id_class_bp_dre: colBpDre ? parseClassId(r[colBpDre]) : null,
          id_class_nota_explicativa: colNota ? parseClassId(r[colNota]) : null,
          id_class_papel_trabalho: colPapel ? parseClassId(r[colPapel]) : null,
        })
      })

      if (parsed.length === 0) {
        setGeneralError('Nenhuma linha válida encontrada no arquivo.')
        return
      }

      // Duplicates within file — conta
      const contaCounts = new Map<string, number>()
      parsed.forEach((r) => contaCounts.set(r.conta, (contaCounts.get(r.conta) ?? 0) + 1))
      contaCounts.forEach((count, conta) => {
        if (count > 1) errors.push(`Conta duplicada no arquivo: "${conta}" (aparece ${count}×)`)
      })

      // Duplicates within file — reduzido
      const reduzidoCounts = new Map<number, number>()
      parsed.forEach((r) =>
        reduzidoCounts.set(r.reduzido, (reduzidoCounts.get(r.reduzido) ?? 0) + 1)
      )
      reduzidoCounts.forEach((count, red) => {
        if (count > 1) errors.push(`Reduzido duplicado no arquivo: "${red}" (aparece ${count}×)`)
      })

      // Cross-check reduzido against existing DB records (only if no errors so far)
      if (errors.length === 0) {
        const { data: existing, error: dbErr } = await supabase
          .from('plano_contas_itens')
          .select('conta, reduzido')
          .eq('id_plano_contas', activePlan.id)

        if (dbErr) throw new Error(extractError(dbErr))

        const dbContaByReduzido = new Map(
          (existing ?? [])
            .filter((r) => r.reduzido !== null)
            .map((r) => [r.reduzido as number, r.conta as string])
        )

        parsed.forEach((r) => {
          const dbConta = dbContaByReduzido.get(r.reduzido)
          if (dbConta && dbConta !== r.conta) {
            errors.push(
              `Reduzido "${r.reduzido}" já está vinculado à conta "${dbConta}" no banco, mas o arquivo traz a conta "${r.conta}"`
            )
          }
        })
      }

      setRows(parsed)
      setValidationErrors(errors)
      setStep('preview')
    } catch (err) {
      setGeneralError(extractError(err))
    } finally {
      setLoading(false)
    }
  }

  const handleImport = async () => {
    if (!activePlan) return
    setStep('importing')
    setGeneralError('')

    try {
      // Pre-count insert vs update
      const contas = rows.map((r) => r.conta)
      const { data: existing } = await supabase
        .from('plano_contas_itens')
        .select('conta')
        .eq('id_plano_contas', activePlan.id)
        .in('conta', contas)

      const existingContas = new Set((existing ?? []).map((r) => r.conta))
      const updateCount = rows.filter((r) => existingContas.has(r.conta)).length
      const insertCount = rows.length - updateCount

      // Upsert in batches of 500
      const BATCH = 500
      for (let i = 0; i < rows.length; i += BATCH) {
        const batch = rows.slice(i, i + BATCH).map((r) => ({
          id_plano_contas: activePlan.id,
          conta: r.conta,
          reduzido: r.reduzido,
          desc_conta: r.desc_conta,
          fl_ativa: r.fl_ativa,
          id_class_subgrupo: r.id_class_subgrupo,
          id_class_bp_dre: r.id_class_bp_dre,
          id_class_nota_explicativa: r.id_class_nota_explicativa,
          id_class_papel_trabalho: r.id_class_papel_trabalho,
        }))
        const { error } = await supabase
          .from('plano_contas_itens')
          .upsert(batch, { onConflict: 'id_plano_contas,conta' })
        if (error) throw error
      }

      setResult({ inserted: insertCount, updated: updateCount })
      setStep('done')
    } catch (err) {
      setGeneralError(extractError(err))
      setStep('preview')
    }
  }

  const hasErrors = validationErrors.length > 0
  const previewRows = rows.slice(0, 20)
  const classifiedCount = rows.filter(
    (r) => r.id_class_subgrupo && r.id_class_bp_dre && r.id_class_nota_explicativa && r.id_class_papel_trabalho
  ).length

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl shadow-xl w-full max-w-3xl mx-4 max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 flex-shrink-0">
          <h3 className="font-semibold text-gray-800">Importar Plano de Contas — Excel</h3>
          <button onClick={handleClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

          {/* idle */}
          {step === 'idle' && (
            <>
              <p className="text-sm text-gray-500">
                Selecione um arquivo <strong>.xlsx</strong> com as colunas obrigatórias{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">conta</code>,{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">reduzido</code> e{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">desc_conta</code>.
                Opcionalmente inclua{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">fl_ativa</code> e as colunas de classificação{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">id_class_subgrupo</code>,{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">id_class_bp_dre</code>,{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">id_class_nota_explicativa</code> e{' '}
                <code className="bg-gray-100 px-1 rounded text-xs">id_class_papel_trabalho</code>{' '}
                para importar contas já classificadas.
              </p>
              <div className="flex flex-wrap gap-3">
                <button
                  onClick={handleDownloadModel}
                  className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-2 rounded-lg text-sm hover:bg-gray-50 transition-colors"
                >
                  <Download size={15} />
                  Baixar Modelo (.xlsx)
                </button>
                <button
                  onClick={handleSelectFile}
                  disabled={loading}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  <Upload size={15} />
                  {loading ? 'Processando...' : 'Selecionar Arquivo'}
                </button>
              </div>
              {generalError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{generalError}</p>
              )}
            </>
          )}

          {/* preview */}
          {step === 'preview' && (
            <>
              <p className="text-sm text-gray-600">
                <strong>{rows.length}</strong> linha{rows.length !== 1 ? 's' : ''} válida{rows.length !== 1 ? 's' : ''} encontrada{rows.length !== 1 ? 's' : ''}
                {classifiedCount > 0 && (
                  <span className="ml-2 text-green-600 font-medium">
                    · {classifiedCount} já classificada{classifiedCount !== 1 ? 's' : ''}
                  </span>
                )}
              </p>

              {hasErrors && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-red-700 flex items-center gap-1.5 mb-2">
                    <AlertTriangle size={15} />
                    {validationErrors.length} erro{validationErrors.length !== 1 ? 's' : ''} encontrado{validationErrors.length !== 1 ? 's' : ''} — corrija o arquivo e reimporte
                  </p>
                  <ul className="space-y-0.5">
                    {validationErrors.map((e, i) => (
                      <li key={i} className="text-xs text-red-600">• {e}</li>
                    ))}
                  </ul>
                </div>
              )}

              {rows.length > 0 && (
                <div>
                  <p className="text-xs text-gray-400 mb-2">
                    Pré-visualização — {previewRows.length} de {rows.length} linha{rows.length !== 1 ? 's' : ''}
                    {rows.length > 20 ? ' (mostrando as primeiras 20)' : ''}
                  </p>
                  <div className="overflow-x-auto rounded-lg border border-gray-200">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-gray-50 border-b border-gray-200">
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Conta</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Reduzido</th>
                          <th className="text-left px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Descrição</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Ativa</th>
                          <th className="text-center px-3 py-2 font-semibold text-gray-500 uppercase tracking-wide">Classif.</th>
                        </tr>
                      </thead>
                      <tbody>
                        {previewRows.map((r, i) => {
                          const isClassified = !!(r.id_class_subgrupo && r.id_class_bp_dre && r.id_class_nota_explicativa && r.id_class_papel_trabalho)
                          return (
                            <tr
                              key={i}
                              className={i < previewRows.length - 1 ? 'border-b border-gray-100' : ''}
                            >
                              <td className="px-3 py-1.5 font-mono text-gray-700">{r.conta}</td>
                              <td className="px-3 py-1.5 text-gray-700">{r.reduzido}</td>
                              <td className="px-3 py-1.5 text-gray-600 max-w-xs truncate">{r.desc_conta}</td>
                              <td className="px-3 py-1.5 text-center text-gray-500">{r.fl_ativa ? '✓' : '✗'}</td>
                              <td className="px-3 py-1.5 text-center">{isClassified ? <span className="text-green-600">✓</span> : <span className="text-gray-300">—</span>}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {generalError && (
                <p className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{generalError}</p>
              )}
            </>
          )}

          {/* importing */}
          {step === 'importing' && (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <div className="animate-spin rounded-full h-9 w-9 border-b-2 border-blue-600" />
              <p className="text-sm text-gray-500">Importando {rows.length} registros...</p>
            </div>
          )}

          {/* done */}
          {step === 'done' && result && (
            <div className="flex flex-col items-center justify-center py-12 gap-4">
              <CheckCircle size={44} className="text-green-500" />
              <div className="text-center space-y-1.5">
                <p className="font-semibold text-gray-800 text-base">Importação concluída!</p>
                <p className="text-sm text-gray-500">
                  <span className="font-semibold text-green-600">{result.inserted}</span> inserido{result.inserted !== 1 ? 's' : ''}
                  {' · '}
                  <span className="font-semibold text-blue-600">{result.updated}</span> atualizado{result.updated !== 1 ? 's' : ''}
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
                onClick={reset}
                className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
              >
                ← Selecionar outro arquivo
              </button>
            )}
          </div>
          <div className="flex gap-3">
            {step !== 'importing' && (
              <button
                onClick={handleClose}
                className="border border-gray-300 text-gray-700 rounded-lg px-4 py-2 text-sm hover:bg-gray-50 transition-colors"
              >
                {step === 'done' ? 'Fechar' : 'Cancelar'}
              </button>
            )}
            {step === 'preview' && !hasErrors && (
              <button
                onClick={handleImport}
                className="bg-blue-600 text-white rounded-lg px-5 py-2 text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Confirmar Importação
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
