import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, VerticalAlign, WidthType, BorderStyle, HeightRule } from 'docx'
import { fmtMoeda, isAtivoSg, periodoLabel, type NotaQuadro } from './dfUtils'
import type { DFParams } from './dfData'
import type { TipoNota } from './notasExplicativasData'
import { addHeader } from './gerarDFpdf'
import { buildPageHeader, buildDocxBodyHeader, dataExtenso, cell, downloadBlob } from './gerarDFdocx'
import { addHtmlToPdf, htmlToDocxBlocks, lastAutoTableFinalY } from './richTextExport'

type CellDef = string | { content: string; styles: { fontStyle?: 'bold' | 'normal'; halign?: 'left' | 'center' | 'right' } }


export interface NotaParaImpressao {
  id: number
  numeroNota: number | null
  titulo: string
  tipo: TipoNota
  textoAntes: string
  textoDepois: string
  quadros: NotaQuadro[]
}

/** Espaço de uma linha em branco entre os elementos da nota (título, textos e quadro), em mm. */
const BLANK_LINE = 5

const NO_BORDER = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' }
const NO_BORDERS = {
  top: NO_BORDER,
  bottom: NO_BORDER,
  left: NO_BORDER,
  right: NO_BORDER,
  insideHorizontal: NO_BORDER,
  insideVertical: NO_BORDER,
}

// 0,6cm em twips (1cm = 566,929 twips)
const ROW_HEIGHT = { value: 340, rule: HeightRule.ATLEAST }

// Larguras de coluna fixas em DXA para A4 com margens 2cm (conteúdo = 9638 DXA).
// Garante que todos os quadros de uma mesma nota tenham colunas idênticas.
const SPACER_DXA = 180
const VAL_DXA    = 2120
const COL_WIDTHS_DUAL   = [9638 - SPACER_DXA - VAL_DXA * 2, VAL_DXA, SPACER_DXA, VAL_DXA] // [5218,2120,180,2120]
const COL_WIDTHS_SINGLE = [6738, 2900]                                                        // sum = 9638

// Célula espaçadora estreita entre colunas de valores de períodos distintos
function spacerCell(): TableCell {
  return new TableCell({
    width: { size: 180, type: WidthType.DXA },
    borders: { top: NO_BORDER, bottom: NO_BORDER, left: NO_BORDER, right: NO_BORDER },
    children: [new Paragraph({ text: '' })],
  })
}

// Célula de cabeçalho de data: alinhamento inferior-direito + borda inferior de 1,5pt
function dateHeaderCell(text: string): TableCell {
  return new TableCell({
    verticalAlign: VerticalAlign.BOTTOM,
    borders: {
      top: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
      bottom: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
    },
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text, bold: true, size: 24, font: 'Arial' })],
    })],
  })
}

// Célula de total com borda superior de 1,5pt (mesma grossura da borda inferior das datas)
function subtotalCell(text: string, opts: { align?: typeof AlignmentType.RIGHT } = {}): TableCell {
  return new TableCell({
    borders: {
      top: { style: BorderStyle.SINGLE, size: 12, color: '000000' },
      bottom: NO_BORDER,
      left: NO_BORDER,
      right: NO_BORDER,
    },
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: true, size: 24, font: 'Arial' })],
    })],
  })
}

function tituloNota(nota: NotaParaImpressao): string {
  return nota.numeroNota != null ? `${nota.numeroNota} — ${nota.titulo}` : nota.titulo
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

/** O resumo só faz sentido se houver valores tanto no lado do ATIVO quanto no do PASSIVO. */
function deveExibirResumo(quadros: NotaQuadro[]): boolean {
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)
  const temAtivo = ativoFinal !== 0 || ativoInicial !== 0
  const temPassivo = passivoFinal !== 0 || passivoInicial !== 0
  return temAtivo && temPassivo
}

// ── PDF ──────────────────────────────────────────────────────────────────

function renderQuadroPdf(doc: jsPDF, quadro: NotaQuadro, params: DFParams, x: number, maxWidth: number, startY: number): number {
  const hasDual = !!params.periodo1
  let y = startY

  const head = hasDual
    ? [['', periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]]
    : [['', periodoLabel(params.periodo2)]]

  const body = quadro.linhas.map(l => hasDual
    ? [l.desc_ne, fmtMoeda(l.saldoInicial ?? 0), fmtMoeda(l.saldoFinal)]
    : [l.desc_ne, fmtMoeda(l.saldoFinal)])

  const foot: CellDef[][] = hasDual
    ? [[
        { content: '', styles: { fontStyle: 'bold' } },
        { content: fmtMoeda(quadro.subtotalInicial ?? 0), styles: { fontStyle: 'bold', halign: 'right' } },
        { content: fmtMoeda(quadro.subtotalFinal), styles: { fontStyle: 'bold', halign: 'right' } },
      ]]
    : [[
        { content: '', styles: { fontStyle: 'bold' } },
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
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 1.5 },
    headStyles: { fontStyle: 'bold' },
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
    theme: 'plain',
    styles: { fontSize: 12, cellPadding: 1.5 },
    headStyles: { fontStyle: 'bold' },
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
    doc.setFontSize(12)
    doc.setTextColor(20, 20, 20)
    const linhasTitulo = doc.splitTextToSize(tituloNota(nota), maxWidth) as string[]
    for (const linha of linhasTitulo) {
      doc.text(linha, margin, y)
      y += 5.5
    }
    y += BLANK_LINE

    const temTextoAntes = !!nota.textoAntes && nota.textoAntes !== '<p></p>'
    if (temTextoAntes) {
      y = addHtmlToPdf(doc, nota.textoAntes, margin, maxWidth, y, margin)
      y += BLANK_LINE
    }

    if (nota.tipo === 'quadro') {
      for (const quadro of nota.quadros) {
        y = renderQuadroPdf(doc, quadro, params, margin, maxWidth, y)
      }
      if (deveExibirResumo(nota.quadros)) {
        y = renderResumoPdf(doc, nota.quadros, params, margin, maxWidth, y)
        y += BLANK_LINE
      }
    }

    const temTextoDepois = !!nota.textoDepois && nota.textoDepois !== '<p></p>'
    if (temTextoDepois) {
      y = addHtmlToPdf(doc, nota.textoDepois, margin, maxWidth, y, margin)
    }
  }

  doc.save(`Notas_Explicativas_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.pdf`)
}

// ── DOCX ─────────────────────────────────────────────────────────────────

function quadroToDocx(quadro: NotaQuadro, params: DFParams, showLabel = false): (Paragraph | Table)[] {
  const hasDual = !!params.periodo1
  const colWidths = hasDual ? COL_WIDTHS_DUAL : COL_WIDTHS_SINGLE

  const headCells = hasDual
    ? [
        cell('', { size: 24, font: 'Arial' }),
        dateHeaderCell(periodoLabel(params.periodo1!)),
        spacerCell(),
        dateHeaderCell(periodoLabel(params.periodo2)),
      ]
    : [
        cell('', { size: 24, font: 'Arial' }),
        dateHeaderCell(periodoLabel(params.periodo2)),
      ]
  const rows: TableRow[] = [new TableRow({ height: ROW_HEIGHT, children: headCells })]

  for (const linha of quadro.linhas) {
    const cells = hasDual
      ? [
          cell(linha.desc_ne, { size: 24, font: 'Arial' }),
          cell(fmtMoeda(linha.saldoInicial ?? 0), { align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
          spacerCell(),
          cell(fmtMoeda(linha.saldoFinal), { align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
        ]
      : [
          cell(linha.desc_ne, { size: 24, font: 'Arial' }),
          cell(fmtMoeda(linha.saldoFinal), { align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
        ]
    rows.push(new TableRow({ height: ROW_HEIGHT, children: cells }))
  }

  const subtotalCells = hasDual
    ? [
        cell('', { size: 24, font: 'Arial' }),
        subtotalCell(fmtMoeda(quadro.subtotalInicial ?? 0), { align: AlignmentType.RIGHT }),
        spacerCell(),
        subtotalCell(fmtMoeda(quadro.subtotalFinal), { align: AlignmentType.RIGHT }),
      ]
    : [
        cell('', { size: 24, font: 'Arial' }),
        subtotalCell(fmtMoeda(quadro.subtotalFinal), { align: AlignmentType.RIGHT }),
      ]
  rows.push(new TableRow({ height: ROW_HEIGHT, children: subtotalCells }))

  const result: (Paragraph | Table)[] = []
  if (showLabel) {
    const sg = quadro.subgrupo
    const labelText = sg.desc_subgrupo
      ? `${sg.sigla_subgrupo} — ${sg.desc_subgrupo}`
      : sg.sigla_subgrupo
    result.push(new Paragraph({
      children: [new TextRun({ text: labelText, size: 18, font: 'Arial', color: '888888', italics: true })],
    }))
  }
  result.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: colWidths, borders: NO_BORDERS, rows }))
  result.push(new Paragraph({ text: '' }))
  return result
}

function resumoToDocx(quadros: NotaQuadro[], params: DFParams): Table {
  const hasDual = !!params.periodo1
  const { ativoFinal, ativoInicial, passivoFinal, passivoInicial } = resumoAtivoPassivo(quadros)

  const headCells = hasDual
    ? [
        cell('', { size: 24, font: 'Arial' }),
        dateHeaderCell(periodoLabel(params.periodo1!)),
        spacerCell(),
        dateHeaderCell(periodoLabel(params.periodo2)),
      ]
    : [
        cell('', { size: 24, font: 'Arial' }),
        dateHeaderCell(periodoLabel(params.periodo2)),
      ]
  const rows: TableRow[] = [new TableRow({ height: ROW_HEIGHT, children: headCells })]

  const ativoCells = hasDual
    ? [
        cell('ATIVO', { bold: true, size: 24, font: 'Arial' }),
        cell(fmtMoeda(ativoInicial), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
        spacerCell(),
        cell(fmtMoeda(ativoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
      ]
    : [
        cell('ATIVO', { bold: true, size: 24, font: 'Arial' }),
        cell(fmtMoeda(ativoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
      ]
  const passivoCells = hasDual
    ? [
        cell('PASSIVO', { bold: true, size: 24, font: 'Arial' }),
        cell(fmtMoeda(passivoInicial), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
        spacerCell(),
        cell(fmtMoeda(passivoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
      ]
    : [
        cell('PASSIVO', { bold: true, size: 24, font: 'Arial' }),
        cell(fmtMoeda(passivoFinal), { bold: true, align: AlignmentType.RIGHT, size: 24, font: 'Arial' }),
      ]
  rows.push(new TableRow({ height: ROW_HEIGHT, children: ativoCells }))
  rows.push(new TableRow({ height: ROW_HEIGHT, children: passivoCells }))

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, columnWidths: hasDual ? COL_WIDTHS_DUAL : COL_WIDTHS_SINGLE, borders: NO_BORDERS, rows })
}

export async function gerarNotasDocx(params: DFParams, notas: NotaParaImpressao[]): Promise<void> {
  const pageHeader = await buildPageHeader(params)
  const tituloNotas = params.periodo1
    ? `Notas Explicativas às Demonstrações Financeiras dos exercícios findos em ${dataExtenso(params.periodo1.mes, params.periodo1.ano)} e ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
    : `Notas Explicativas às Demonstrações Financeiras do exercício findo em ${dataExtenso(params.periodo2.mes, params.periodo2.ano)}`
  const children: (Paragraph | Table)[] = buildDocxBodyHeader(params, tituloNotas)

  for (const nota of notas) {
    children.push(new Paragraph({ children: [new TextRun({ text: tituloNota(nota), bold: true, size: 24, font: 'Arial' })] }))
    children.push(new Paragraph({ text: '' }))

    const temTextoAntes = !!nota.textoAntes && nota.textoAntes !== '<p></p>'
    if (temTextoAntes) {
      children.push(...htmlToDocxBlocks(nota.textoAntes))
      children.push(new Paragraph({ text: '' }))
    }

    if (nota.tipo === 'quadro') {
      const multiQuadro = nota.quadros.length > 1
      for (const quadro of nota.quadros) {
        children.push(...quadroToDocx(quadro, params, multiQuadro))
      }
      if (deveExibirResumo(nota.quadros)) {
        children.push(resumoToDocx(nota.quadros, params))
        children.push(new Paragraph({ text: '' }))
      }
    }

    const temTextoDepois = !!nota.textoDepois && nota.textoDepois !== '<p></p>'
    if (temTextoDepois) {
      children.push(...htmlToDocxBlocks(nota.textoDepois))
    }

    children.push(new Paragraph({ text: '' }))
  }

  const doc = new Document({ sections: [{ properties: { page: { margin: { top: 1276, bottom: 1276, left: 1134, right: 1134 } } }, headers: pageHeader ? { default: pageHeader } : undefined, children }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `Notas_Explicativas_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}
