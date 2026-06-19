import type jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import { Paragraph, TextRun, Table, TableRow, TableCell, AlignmentType, WidthType, ShadingType } from 'docx'

type Align = 'left' | 'center' | 'right' | 'justify'

function alignFromStyle(el: Element): Align {
  const style = el.getAttribute('style') ?? ''
  const m = style.match(/text-align:\s*(left|center|right|justify)/)
  return (m?.[1] as Align) ?? 'left'
}

/** true se todo o conteúdo de `el` está envolvido por alguma das tags informadas (ex.: parágrafo todo em negrito). */
function isFullyWrapped(el: Element, tags: string[]): boolean {
  if (tags.includes(el.tagName)) return true
  if (el.children.length === 1 && (el.textContent ?? '').trim() === (el.children[0].textContent ?? '').trim()) {
    return isFullyWrapped(el.children[0], tags)
  }
  return false
}

// ── PDF ──────────────────────────────────────────────────────────────────

const PDF_MARGIN_BOTTOM = 15

interface PdfCursor { y: number }

/** Lê o `finalY` da última tabela desenhada pelo jspdf-autotable (não tipado oficialmente). */
export function lastAutoTableFinalY(doc: jsPDF): number {
  return (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 0
}

function ensureSpace(doc: jsPDF, cursor: PdfCursor, needed: number, marginTop: number): void {
  const pageH = doc.internal.pageSize.getHeight()
  if (cursor.y + needed > pageH - PDF_MARGIN_BOTTOM) {
    doc.addPage()
    cursor.y = marginTop
  }
}

function renderPdfParagraph(doc: jsPDF, el: Element, cursor: PdfCursor, x: number, maxWidth: number, marginTop: number, prefix = ''): void {
  const text = (prefix + (el.textContent ?? '').trim()).trim()
  if (!text) {
    cursor.y += 3
    return
  }
  const tag = el.tagName.toLowerCase()
  const align = alignFromStyle(el)
  const isHeading = /^h[1-6]$/.test(tag)
  const fontSize = isHeading ? (tag === 'h1' ? 16 : tag === 'h2' ? 14.5 : 13.5) : 12
  const bold = isHeading || isFullyWrapped(el, ['STRONG', 'B'])
  const italic = isFullyWrapped(el, ['EM', 'I'])
  doc.setFont('helvetica', bold && italic ? 'bolditalic' : bold ? 'bold' : italic ? 'italic' : 'normal')
  doc.setFontSize(fontSize)
  doc.setTextColor(30, 30, 30)

  const lines = doc.splitTextToSize(text, maxWidth) as string[]
  const lineHeight = fontSize * 0.42
  for (const line of lines) {
    ensureSpace(doc, cursor, lineHeight, marginTop)
    const lx = align === 'center' ? x + maxWidth / 2 : align === 'right' ? x + maxWidth : x
    doc.text(line, lx, cursor.y, { align: align === 'justify' ? 'left' : align, maxWidth })
    cursor.y += lineHeight
  }
  cursor.y += 1.5
}

function renderPdfTable(doc: jsPDF, table: Element, cursor: PdfCursor, x: number, maxWidth: number, marginTop: number): void {
  type CellDef = { content: string; colSpan?: number; rowSpan?: number; styles: { halign: Align; fontStyle: 'bold' | 'normal' } }
  const trs = Array.from(table.querySelectorAll('tr'))
  let head: CellDef[][] | undefined
  const body: CellDef[][] = []

  for (const tr of trs) {
    const cells = Array.from(tr.children) as HTMLElement[]
    if (cells.length === 0) continue
    const isHeaderRow = cells.every(c => c.tagName.toLowerCase() === 'th')
    const row: CellDef[] = cells.map(c => {
      const align = alignFromStyle(c)
      return {
        content: (c.textContent ?? '').trim(),
        colSpan: Number(c.getAttribute('colspan')) || undefined,
        rowSpan: Number(c.getAttribute('rowspan')) || undefined,
        styles: { halign: align === 'justify' ? 'left' : align, fontStyle: isHeaderRow ? 'bold' : 'normal' },
      }
    })
    if (isHeaderRow && !head) head = [row]
    else body.push(row)
  }

  ensureSpace(doc, cursor, 12, marginTop)
  const pageW = doc.internal.pageSize.getWidth()
  autoTable(doc, {
    startY: cursor.y,
    head,
    body,
    margin: { left: x, right: pageW - x - maxWidth },
    theme: 'grid',
    styles: { fontSize: 12, cellPadding: 1.5 },
    headStyles: { fillColor: [230, 230, 240], textColor: [30, 30, 30] },
  })
  cursor.y = lastAutoTableFinalY(doc) + 3
}

function renderPdfBlock(doc: jsPDF, el: Element, cursor: PdfCursor, x: number, maxWidth: number, marginTop: number): void {
  const tag = el.tagName.toLowerCase()
  if (tag === 'table') {
    renderPdfTable(doc, el, cursor, x, maxWidth, marginTop)
    return
  }
  if (tag === 'ul' || tag === 'ol') {
    let i = 1
    for (const li of Array.from(el.children)) {
      if (li.tagName.toLowerCase() !== 'li') continue
      const prefix = tag === 'ol' ? `${i}. ` : '• '
      renderPdfParagraph(doc, li, cursor, x, maxWidth, marginTop, prefix)
      i++
    }
    return
  }
  renderPdfParagraph(doc, el, cursor, x, maxWidth, marginTop)
}

/** Renderiza o HTML do editor de texto rico no PDF, com quebra de página automática. Retorna o novo Y. */
export function addHtmlToPdf(doc: jsPDF, html: string, x: number, maxWidth: number, startY: number, marginTop: number): number {
  if (!html || html === '<p></p>') return startY
  const cursor: PdfCursor = { y: startY }
  const root = new DOMParser().parseFromString(html, 'text/html').body
  for (const el of Array.from(root.children)) {
    renderPdfBlock(doc, el, cursor, x, maxWidth, marginTop)
  }
  return cursor.y
}

// ── DOCX ─────────────────────────────────────────────────────────────────

interface Marks { bold?: boolean; italics?: boolean; strike?: boolean }

function alignType(el: Element): typeof AlignmentType[keyof typeof AlignmentType] | undefined {
  switch (alignFromStyle(el)) {
    case 'center': return AlignmentType.CENTER
    case 'right': return AlignmentType.RIGHT
    case 'justify': return AlignmentType.JUSTIFIED
    case 'left': return AlignmentType.LEFT
    default: return undefined
  }
}

function inlineRuns(node: Node, marks: Marks, size: number): TextRun[] {
  const runs: TextRun[] = []
  node.childNodes.forEach(child => {
    if (child.nodeType === Node.TEXT_NODE) {
      const text = child.textContent ?? ''
      if (text) runs.push(new TextRun({ text, size, font: 'Arial', ...marks }))
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      const el = child as Element
      const tag = el.tagName.toLowerCase()
      if (tag === 'br') {
        runs.push(new TextRun({ text: '', break: 1 }))
        return
      }
      const nextMarks: Marks = { ...marks }
      if (tag === 'strong' || tag === 'b') nextMarks.bold = true
      if (tag === 'em' || tag === 'i') nextMarks.italics = true
      if (tag === 's' || tag === 'strike' || tag === 'del') nextMarks.strike = true
      runs.push(...inlineRuns(el, nextMarks, size))
    }
  })
  return runs
}

function docxParagraph(el: Element, prefix = ''): Paragraph {
  const tag = el.tagName.toLowerCase()
  const isHeading = /^h[1-6]$/.test(tag)
  const size = isHeading ? 28 : 24
  const baseMarks: Marks = isHeading ? { bold: true } : {}
  const runs = inlineRuns(el, baseMarks, size)
  if (prefix) runs.unshift(new TextRun({ text: prefix, size, font: 'Arial' }))
  return new Paragraph({
    alignment: alignType(el),
    children: runs.length ? runs : [new TextRun({ text: '', size })],
  })
}

function docxCellContent(td: Element): Paragraph[] {
  const blocks = Array.from(td.children).filter(c => /^(p|h[1-6]|ul|ol)$/i.test(c.tagName))
  if (blocks.length === 0) {
    return [new Paragraph({ alignment: alignType(td), children: inlineRuns(td, {}, 24) })]
  }
  const paragraphs: Paragraph[] = []
  for (const block of blocks) {
    const tag = block.tagName.toLowerCase()
    const cellAlign = alignType(block) ?? alignType(td)
    if (tag === 'ul' || tag === 'ol') {
      let i = 1
      for (const li of Array.from(block.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue
        const prefix = tag === 'ol' ? `${i}. ` : '• '
        paragraphs.push(new Paragraph({
          alignment: alignType(li) ?? cellAlign,
          children: [new TextRun({ text: prefix, size: 24, font: 'Arial' }), ...inlineRuns(li, {}, 24)],
        }))
        i++
      }
    } else {
      const isHeading = tag.startsWith('h')
      paragraphs.push(new Paragraph({
        alignment: cellAlign,
        children: inlineRuns(block, isHeading ? { bold: true } : {}, isHeading ? 28 : 24),
      }))
    }
  }
  return paragraphs.length ? paragraphs : [new Paragraph({ text: '' })]
}

function docxTable(table: Element): Table {
  const rows: TableRow[] = []
  for (const tr of Array.from(table.querySelectorAll('tr'))) {
    const cells: TableCell[] = []
    for (const td of Array.from(tr.children) as HTMLElement[]) {
      const isHeader = td.tagName.toLowerCase() === 'th'
      cells.push(new TableCell({
        columnSpan: Number(td.getAttribute('colspan')) || undefined,
        rowSpan: Number(td.getAttribute('rowspan')) || undefined,
        shading: isHeader ? { type: ShadingType.SOLID, color: 'E5E7EB', fill: 'E5E7EB' } : undefined,
        children: docxCellContent(td),
      }))
    }
    if (cells.length > 0) rows.push(new TableRow({ children: cells }))
  }
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows })
}

/** Converte o HTML do editor de texto rico em blocos para o documento Word. */
export function htmlToDocxBlocks(html: string): (Paragraph | Table)[] {
  if (!html || html === '<p></p>') return []
  const root = new DOMParser().parseFromString(html, 'text/html').body
  const blocks: (Paragraph | Table)[] = []

  for (const el of Array.from(root.children)) {
    const tag = el.tagName.toLowerCase()
    if (tag === 'table') {
      blocks.push(docxTable(el))
    } else if (tag === 'ul' || tag === 'ol') {
      let i = 1
      for (const li of Array.from(el.children)) {
        if (li.tagName.toLowerCase() !== 'li') continue
        const prefix = tag === 'ol' ? `${i}. ` : '• '
        blocks.push(docxParagraph(li, prefix))
        i++
      }
    } else {
      blocks.push(docxParagraph(el))
    }
  }
  return blocks
}
