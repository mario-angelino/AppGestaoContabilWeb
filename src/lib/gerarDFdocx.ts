import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  ImageRun,
  WidthType,
  AlignmentType,
  ShadingType,
} from 'docx'
import logoEbisaUrl from '../../assets/LOGO_EBISA_ENGENHARIA.png'
import { isPLSg, fmtMoeda, periodoLabel, type CalcDFResult } from './dfUtils'
import type { DFParams } from './dfData'

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

async function loadArrayBuffer(url: string): Promise<ArrayBuffer> {
  const resp = await fetch(url)
  return resp.arrayBuffer()
}

export async function buildHeader(params: DFParams, title: string): Promise<Paragraph[]> {
  const isEbisa = params.empresa.abreviacao.toLowerCase().includes('ebisa')
  const dataGeracao = new Date().toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const vigenciaText = params.periodo1 && params.periodo1.anoVigencia !== params.periodo2.anoVigencia
    ? `Vigências: ${params.periodo1.anoVigencia} / ${params.periodo2.anoVigencia}`
    : `Vigência: ${params.periodo2.anoVigencia}`
  const periodoText = params.periodo1
    ? `${periodoLabel(params.periodo1)} a ${periodoLabel(params.periodo2)}`
    : periodoLabel(params.periodo2)

  const paragraphs: Paragraph[] = []

  if (isEbisa) {
    const imgData = await loadArrayBuffer(logoEbisaUrl)
    paragraphs.push(new Paragraph({
      children: [new ImageRun({ type: 'png', data: imgData, transformation: { width: 160, height: 60 } })],
    }))
  }

  paragraphs.push(
    new Paragraph({ children: [new TextRun({ text: params.empresa.razao_social, bold: true, size: 24 })] }),
    new Paragraph({ children: [new TextRun({ text: vigenciaText, size: 18, color: '505050' })] }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: title, bold: true, size: 26, color: '141478' })],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `Período: ${periodoText}`, size: 18, color: '505050' })],
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [new TextRun({ text: `Gerado em ${dataGeracao}`, size: 14, color: '969696' })],
    }),
    new Paragraph({ text: '' }),
  )

  return paragraphs
}

export function cell(text: string, opts: { bold?: boolean; align?: typeof AlignmentType.RIGHT; shading?: string; italics?: boolean; color?: string; colSpan?: number } = {}): TableCell {
  return new TableCell({
    columnSpan: opts.colSpan,
    shading: opts.shading ? { type: ShadingType.SOLID, color: opts.shading, fill: opts.shading } : undefined,
    children: [new Paragraph({
      alignment: opts.align,
      children: [new TextRun({ text, bold: opts.bold, italics: opts.italics, color: opts.color, size: 18 })],
    })],
  })
}

function headerRow(cols: string[]): TableRow {
  return new TableRow({
    children: cols.map(c => cell(c, { bold: true, shading: '1E1E78', color: 'FFFFFF', align: cols.indexOf(c) > 0 ? AlignmentType.RIGHT : undefined })),
  })
}

export async function gerarDREdocx(params: DFParams, df1: CalcDFResult, df2?: CalcDFResult): Promise<void> {
  const hasDual = !!df2
  const header = await buildHeader(params, 'DRE — Demonstração do Resultado do Exercício')

  const head = hasDual
    ? [periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]
    : [periodoLabel(params.periodo2)]

  const rows: TableRow[] = [headerRow(['Descrição', ...head])]

  for (const g of df1.gruposResultado) {
    for (const item of g.itens) {
      if (hasDual) {
        const saldo2 = df2!.gruposResultado.flatMap(g2 => g2.itens).find(i => i.id === item.id)?.saldo ?? 0
        rows.push(new TableRow({ children: [cell(item.desc_bp_dre), cell(fmtMoeda(item.saldo), { align: AlignmentType.RIGHT }), cell(fmtMoeda(saldo2), { align: AlignmentType.RIGHT })] }))
      } else {
        rows.push(new TableRow({ children: [cell(item.desc_bp_dre), cell(fmtMoeda(item.saldo), { align: AlignmentType.RIGHT })] }))
      }
    }
  }

  const totalCells = hasDual
    ? [cell('RESULTADO', { bold: true, shading: 'DCE6FF' }), cell(fmtMoeda(df1.totalResultado), { bold: true, shading: 'DCE6FF', align: AlignmentType.RIGHT }), cell(fmtMoeda(df2!.totalResultado), { bold: true, shading: 'DCE6FF', align: AlignmentType.RIGHT })]
    : [cell('RESULTADO', { bold: true, shading: 'DCE6FF' }), cell(fmtMoeda(df1.totalResultado), { bold: true, shading: 'DCE6FF', align: AlignmentType.RIGHT })]
  rows.push(new TableRow({ children: totalCells }))

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })

  const doc = new Document({ sections: [{ children: [...header, table] }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `DRE_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}

export async function gerarBPdocx(params: DFParams, df1: CalcDFResult, df2?: CalcDFResult): Promise<void> {
  const hasDual = !!df2
  const numCols = hasDual ? 3 : 2
  const header = await buildHeader(params, 'BP — Balanço Patrimonial')

  const head = hasDual
    ? [periodoLabel(params.periodo1!), periodoLabel(params.periodo2)]
    : [periodoLabel(params.periodo2)]

  const rows: TableRow[] = [headerRow(['Descrição', ...head])]

  for (const g of df1.gruposBP) {
    const label = g.subgrupo.desc_subgrupo
      ? `${g.subgrupo.sigla_subgrupo} — ${g.subgrupo.desc_subgrupo}`
      : g.subgrupo.sigla_subgrupo
    rows.push(new TableRow({ children: [cell(label, { bold: true, shading: 'D2D7EB', colSpan: numCols })] }))

    for (const item of g.itens) {
      if (hasDual) {
        const saldo2 = df2!.gruposBP.flatMap(g2 => g2.itens).find(i => i.id === item.id)?.saldo ?? 0
        rows.push(new TableRow({ children: [cell(item.desc_bp_dre), cell(fmtMoeda(item.saldo), { align: AlignmentType.RIGHT }), cell(fmtMoeda(saldo2), { align: AlignmentType.RIGHT })] }))
      } else {
        rows.push(new TableRow({ children: [cell(item.desc_bp_dre), cell(fmtMoeda(item.saldo), { align: AlignmentType.RIGHT })] }))
      }
    }

    if (isPLSg(g.subgrupo)) {
      const resultCells = hasDual
        ? [cell('Resultado do Período', { italics: true, color: '283C8C' }), cell(fmtMoeda(df1.totalResultado), { italics: true, color: '283C8C', align: AlignmentType.RIGHT }), cell(fmtMoeda(df2!.totalResultado), { italics: true, color: '283C8C', align: AlignmentType.RIGHT })]
        : [cell('Resultado do Período', { italics: true, color: '283C8C' }), cell(fmtMoeda(df1.totalResultado), { italics: true, color: '283C8C', align: AlignmentType.RIGHT })]
      rows.push(new TableRow({ children: resultCells }))
    }

    const subtotal1 = isPLSg(g.subgrupo) ? g.subtotal + df1.totalResultado : g.subtotal
    const g2 = df2?.gruposBP.find(x => x.subgrupo.id === g.subgrupo.id)
    const subtotal2 = g2 ? (isPLSg(g.subgrupo) ? g2.subtotal + df2!.totalResultado : g2.subtotal) : 0

    const subtotalCells = hasDual
      ? [cell(`Subtotal ${g.subgrupo.sigla_subgrupo}`, { bold: true, shading: 'F0F2F8' }), cell(fmtMoeda(subtotal1), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT }), cell(fmtMoeda(subtotal2), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT })]
      : [cell(`Subtotal ${g.subgrupo.sigla_subgrupo}`, { bold: true, shading: 'F0F2F8' }), cell(fmtMoeda(subtotal1), { bold: true, shading: 'F0F2F8', align: AlignmentType.RIGHT })]
    rows.push(new TableRow({ children: subtotalCells }))
  }

  const totalAtivoCells = hasDual
    ? [cell('Total Ativo', { bold: true }), cell(fmtMoeda(df1.totalAtivo), { bold: true, align: AlignmentType.RIGHT }), cell(fmtMoeda(df2!.totalAtivo), { bold: true, align: AlignmentType.RIGHT })]
    : [cell('Total Ativo', { bold: true }), cell(fmtMoeda(df1.totalAtivo), { bold: true, align: AlignmentType.RIGHT })]
  const totalPassivoCells = hasDual
    ? [cell('Total Passivo + PL', { bold: true }), cell(fmtMoeda(df1.totalPassivoEPL), { bold: true, align: AlignmentType.RIGHT }), cell(fmtMoeda(df2!.totalPassivoEPL), { bold: true, align: AlignmentType.RIGHT })]
    : [cell('Total Passivo + PL', { bold: true }), cell(fmtMoeda(df1.totalPassivoEPL), { bold: true, align: AlignmentType.RIGHT })]
  rows.push(new TableRow({ children: totalAtivoCells }))
  rows.push(new TableRow({ children: totalPassivoCells }))

  const table = new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })

  const doc = new Document({ sections: [{ children: [...header, table] }] })
  const blob = await Packer.toBlob(doc)
  downloadBlob(blob, `BP_${params.empresa.abreviacao}_${params.periodo2.anoVigencia}.docx`)
}
