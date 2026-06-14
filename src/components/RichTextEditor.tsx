import { useEditor, EditorContent } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { Table } from '@tiptap/extension-table'
import TableRow from '@tiptap/extension-table-row'
import TableHeader from '@tiptap/extension-table-header'
import TableCell from '@tiptap/extension-table-cell'
import TextAlign from '@tiptap/extension-text-align'
import { useEffect } from 'react'
import { Trash2, AlignLeft, AlignCenter, AlignRight, AlignJustify } from 'lucide-react'

interface RichTextEditorProps {
  value: string
  onChange?: (html: string) => void
  editable?: boolean
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, editable = true, placeholder }: RichTextEditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit,
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
    ],
    content: value,
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getHTML())
    },
    editorProps: {
      attributes: {
        class: editable
          ? 'prose prose-sm max-w-none focus:outline-none min-h-[100px] px-3 py-2'
          : 'prose prose-sm max-w-none',
      },
    },
  })

  useEffect(() => {
    if (!editor) return
    if (value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  if (!editor) return null

  if (!editable) {
    if (!value || value === '<p></p>') return null
    return <EditorContent editor={editor} />
  }

  const emEstaTabela = editor.isActive('table')

  const alinhamentos: { value: string; label: string; Icon: typeof AlignLeft }[] = [
    { value: 'left', label: 'Alinhar à esquerda', Icon: AlignLeft },
    { value: 'center', label: 'Centralizar', Icon: AlignCenter },
    { value: 'right', label: 'Alinhar à direita', Icon: AlignRight },
    { value: 'justify', label: 'Justificar', Icon: AlignJustify },
  ]

  return (
    <div className="border border-gray-300 rounded-lg bg-white focus-within:ring-2 focus-within:ring-blue-500">
      <div className="flex items-center gap-1 border-b border-gray-200 px-2 py-1">
        {alinhamentos.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            onClick={() => editor.chain().focus().setTextAlign(value).run()}
            className={`p-1.5 rounded hover:bg-gray-100 transition-colors ${editor.isActive({ textAlign: value }) ? 'text-blue-600 bg-blue-50' : 'text-gray-600 hover:text-gray-900'}`}
            title={label}
          >
            <Icon size={14} />
          </button>
        ))}
        {emEstaTabela && (
          <>
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <button type="button" onClick={() => editor.chain().focus().addColumnBefore().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">+Col antes</button>
            <button type="button" onClick={() => editor.chain().focus().addColumnAfter().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">+Col depois</button>
            <button type="button" onClick={() => editor.chain().focus().deleteColumn().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">-Col</button>
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <button type="button" onClick={() => editor.chain().focus().addRowBefore().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">+Lin antes</button>
            <button type="button" onClick={() => editor.chain().focus().addRowAfter().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">+Lin depois</button>
            <button type="button" onClick={() => editor.chain().focus().deleteRow().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">-Lin</button>
            <span className="w-px h-4 bg-gray-200 mx-1" />
            <button type="button" onClick={() => editor.chain().focus().mergeOrSplit().run()} className="text-xs text-gray-600 hover:text-gray-900 px-2 py-1 rounded hover:bg-gray-100 transition-colors">Mesclar/Dividir</button>
            <button
              type="button"
              onClick={() => editor.chain().focus().deleteTable().run()}
              className="flex items-center gap-1 text-xs text-red-500 hover:text-red-700 px-2 py-1 rounded hover:bg-red-50 transition-colors"
              title="Excluir tabela"
            >
              <Trash2 size={14} />
            </button>
          </>
        )}
      </div>
      <EditorContent editor={editor} />
      {placeholder && !value && (
        <p className="text-xs text-gray-400 px-3 pb-2 -mt-2 pointer-events-none">{placeholder}</p>
      )}
    </div>
  )
}
