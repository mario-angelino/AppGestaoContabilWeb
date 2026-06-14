import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, AlignmentType, WidthType } from 'docx'
import { fmtMoeda, isAtivoSg, periodoLabel, type NotaQuadro } from './dfUtils'
import type { DFParams } from './dfData'
import { addHeader } from './gerarDFpdf'
import { buildHeader, cell, downloadBlob } from './gerarDFdocx'
import { addHtmlToPdf, htmlToDocxBlocks, lastAutoTableFinalY } from './richTextExport'

type CellDef = string | { content: string; styles: { fontStyle?: 'bold' | 'normal'; halign?: 'left' | 'center' | 'right' } }

export interface NotaParaImpressao {
  id: number
  numeroNota: number | null
  titulo: string
  tipo: 'quadro' | 'texto'
  textoAntes: string
  textoDepois: string
  quadros: NotaQuadro[]
}

function tituloNota(nota: NotaParaImpressao): string {
  return nota.numeroNota != null ? `Nota ${nota.numeroNota} — ${nota.titulo}` : nota.titulo
}

function resumoAtivoPassivo(quadros: NotaQuadro[]): { ativoFinal: number; ativoInicial: number; passivoFinal: number; passivoInicial: number } {
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
  return { ativoFinal, ativoInicial, passivoFinal, passivoInicial }
}

// ── PDF ──────────────────────────────────────────────────────────────────

function renderQuadroPdf(doc: jsPDF, quadro: NotaQuadro, params: DFParams, x: number, maxWidth: number, startY: number): number {
  const hasDual = !!params.periodo1
  const label = quadro.subgrupo.desc_subgrupo ? `${quadro.subgrupo.sigla_subgrupo} — ${quadro.subgrupo.desc_subgrupo}` : quadro.subgrupo.sigla_subgrupo

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(60, 60, 100)
  doc.text(label, x, startY)
  let y = startY + 4

  const head = hasDual
    ? [['', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['', periodoLabel(params.periodo2)]]

  const body = quadro.linhas.map(l => hasDual
    ? [l.desc_ne, fmtMoeda(l.saldoInicial ?? 0), fmtMoeda(l.saldoFinal)]
    : [l.desc_ne, fmtMoeda(l.saldoFinal)])

  const foot: CellDef[][] = hasDual
    ? [[
        { content: `Subtotal ${quadro.subgrupo.sigla_subgrupo}`, styles: { fontStyle: 'bold' } },
        { content: fmtMoeda(quadro.subtotalInicial ?? 0), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmtMoeda(quadro.subtotalFinal), styles: { fontStyle: 'bold', halign: 'right' } },
      ]]
    : [[
        { content: `Subtotal ${quadro.subgrupo.sigla_subgrupo}`, styles: { fontStyle: 'bold' } },
        { content: fmtMoeda(quadro.subtotalFinal), styles: { fontStyle: 'bold', halign: 'right' } },
      ]]

  const colStyles: Record<number, object> = hasDual
    ? { 0: { cellWidth: maxWidth * 0.5 }, 1: { cellWidth: maxWidth * 0.25, halign: 'right' as const }, 2: { cellWidth: maxWidth * 0.25, halign: 'right' as const } }
    : { 0: { cellWidth: maxWidth * 0.65 }, 1: { cellWidth: maxWidth * 0.35, halign: 'right' as const } }

  const pageW = doc.internal.pageSize.getWidth()
  autoTable(doc, {
    startY: y,
    head,
    body,
    foot,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5 },
    headStyles: { fillColor: [30, 30, 120], textColor: [255, 255, 255], fontStyle: 'bold' },
    footStyles: { fillColor: [220, 230, 255], textColor: [20, 20, 100] },
    columnStyles: colStyles,
    margin: { left: x, right: pageW - x - maxWidth },
  })
  return lastAutoTableFinalY(doc) + 4
}

function renderResumoPdf(doc: jsPDF, quadros: NotaQuadro[], params: DFParams, x: number, maxWidth: number, startY: number): number {
  const hasDual = !!params.periodo1
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)

  const head = hasDual
    ? [['', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['', periodoLabel(params.periodo2)]]

  const body: CellDef[][] = hasDual
    ? [
        [{ content: 'ATIVO', styles: { fontStyle: 'bold' } }, { content: fmtMoeda(ativoInicial), styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmtMoeda(ativoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
        [{ content: 'PASSIVO', styles: { fontStyle: 'bold' } }, { content: fmtMoeda(passivoInicial), styles: { fontStyle: 'bold', halign: 'right' } }, { content: fmtMoeda(passivoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
      ]
    : [
        [{ content: 'ATIVO', styles: { fontStyle: 'bold' } }, { content: fmtMoeda(ativoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
        [{ content: 'PASSIVO', styles: { fontStyle: 'bold' } }, { content: fmtMoeda(passivoFinal), styles: { fontStyle: 'bold', halign: 'right' } }],
      ]

  const colStyles: Record<number, object> = hasDual
    ? { 0: { cellWidth: maxWidth * 0.5 }, 1: { cellWidth: maxWidth * 0.25, halign: 'right' as const }, 2: { cellWidth: maxWidth * 0.25, halign: 'right' as const } }
    : { 0: { cellWidth: maxWidth * 0.65 }, 1: { cellWidth: maxWidth * 0.35, halign: 'right' as const } }

  const pageW = doc.internal.pageSize.getWidth()
  autoTable(doc, {
    startY,
    head,
    body,
    theme: 'grid',
    styles: { fontSize: 8, cellPadding: 1.5, fillColor: [245, 246, 250] },
    headStyles: { fillColor: [30, 30, 120], textColor: [255, 255, 255], fontStyle: 'bold' },
    columnStyles: colStyles,
    margin: { left: x, right: pageW - x - maxWidth },
  })
  return lastAutoTableFinalY(doc) + 4
}

export async function gerarNotasPdf(params: DFParams, notas: NotaParaImpressao[]): Promise<void> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const margin = 15
  const pageW = doc.internal.pageSize.getWidth()
  const maxWidth = pageW - margin * 2

  let first = true
  for (const nota of notas) {
    if (!first) doc.addPage()
    first = false

    let y = await addHeader(doc, params, 'Notas Explicativas')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(10)
    doc.setTextColor(20, 20, 20)
    const linhasTitulo = doc.splitTextToSize(tituloNota(nota), maxWidth) as string[]
    for (const linha of linhasTitulo) {
      doc.text(linha, margin, y)
      y += 4.5
    }
    y += 2

    y = addHtmlToPdf(doc, nota.textoAntes, margin, maxWidth, y, margin)

    if (nota.tipo === 'quadro') {
      for (const quadro of nota.quadros) {
        y = renderQuadroPdf(doc, quadro, params, margin, maxWidth, y)
      }
      if (nota.quadros.length > 0) {
        y = renderResumoPdf(doc, nota.quadros, params, margin, maxWidth, y)
      }
    }

    y = addHtmlToPdf(doc, nota.textoDepois, margin, maxWidth, y, margin)
  }

  doc.save(`Notas_Explicativas_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.pdf`)
}

// ── DOCX ─────────────────────────────────────────────────────────────────

function quadroToDocx(quadro: NotaQuadro, params: DFParams): (Paragraph | Table)[] {
  const hasDual = !!params.periodo1
  const label = quadro.subgrupo.desc_subgrupo ? `${quadro.subgrupo.sigla_subgrupo} — ${quadro.subgrupo.desc_subgrupo}` : quadro.subgrupo.sigla_subgrupo

  const head = hasDual
    ? [periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]
    : [periodoLabel(params.periodo2)]
  const rows: TableRow[] = [
    new TableRow({ children: ['', ...head].map(h => cell(h, { bold: true, shading: '1E1E78', color: 'FFFFFF', align: h !== '' ? AlignmentType.RIGHT : undefined })) }),
  ]

  for (const linha of quadro.linhas) {
    const cells = hasDual
      ? [cell(linha.desc_ne), cell(fmtMoeda(linha.saldoInicial ?? 0), { align: AlignmentType.RIGHT }), cell(fmtMoeda(linha.saldoFinal), { align: AlignmentType.RIGHT })]
      : [cell(linha.desc_ne), cell(fmtMoeda(linha.saldoFinal), { align: AlignmentType.RIGHT })]
    rows.push(new TableRow({ children: cells }))
  }

  const subtotalCells = hasDual
    ? [cell(`Subtotal ${quadro.subgrupo.sigla_subgrupo}`, { bold: true, shading: 'F0F2F8' }), cell(fmtMoeda(quadro.subtotalInicial ?? 0), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT }), cell(fmtMoeda(quadro.subtotalFinal), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT })]
    : [cell(`Subtotal ${quadro.subgrupo.sigla_subgrupo}`, { bold: true, shading: 'F0F2F8' }), cell(fmtMoeda(quadro.subtotalFinal), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT })]
  rows.push(new TableRow({ children: subtotalCells }))

  return [
    new Paragraph({ children: [new TextRun({ text: label, bold: true, size: 18, color: '3C3C64' })] }),
    new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }),
    new Paragraph({ text: '' }),
  ]
}

function resumoToDocx(quadros: NotaQuadro[], params: DFParams): Table {
  const hasDual = !!params.periodo1
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)

  const head = hasDual
    ? [periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]
    : [periodoLabel(params.periodo2)]
  const rows: TableRow[] = [
    new TableRow({ children: ['', ...head].map(h => cell(h, { bold: true, shading: '1E1E78', color: 'FFFFFF', align: h !== '' ? AlignmentType.RIGHT : undefined })) }),
  ]
  const ativoCells = hasDual
    ? [cell('ATIVO', { bold: true }), cell(fmtMoeda(ativoInicial), { bold: true, align: AlignmentType.RIGHT }), cell(fmtMoeda(ativoFinal), { bold: true, align: AlignmentType.RIGHT })]
    : [cell('ATIVO', { bold: true }), cell(fmtMoeda(ativoFinal), { bold: true, align: AlignmentType.RIGHT })]
  const passivoCells = hasDual
    ? [cell('PASSIVO', { bold: true }), cell(fmtMoeda(passivoInicial), { bold: true, align: AlignmentType.RIGHT }), cell(fmtMoeda(passivoFinal), { bold: true, align: AlignmentType.RIGHT })]
    : [cell('PASSIVO', { bold: true }), cell(fmtMoeda(passivoFinal), { bold: true, align: AlignmentType.RIGHT })]
  rows.push(new TableRow({ children: ativoCells }))
  rows.push(new TableRow({ children: passivoCells }))

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

export async function gerarNotasDocx(params: DFParams, notas: NotaParaImpressao[]): Promise<void> {
  const children: (Paragraph | Table)[] = await buildHeader(params, 'Notas Explicativas')

  for (const nota of notas) {
    children.push(new Paragraph({ children: [new TextRun({ text: tituloNota(nota), bold: true, size: 22 })] }))
    children.push(...htmlToDocxBlocks(nota.textoAntes))

    if (nota.tipo === 'quadro') {
      for (const quadro of nota.quadros) {
        children.push(...quadroToDocx(quadro, params))
      }
      if (nota.quadros.length > 0) {
        children.push(resumoToDocx(nota.quadros, params))
      }
    }

    children.push(...htmlToDocxBlocks(nota.textoDepois))
    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `Notas_Explicativas_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}
