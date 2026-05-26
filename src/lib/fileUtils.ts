function openFilePicker(accept: string): Promise<ArrayBuffer | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'
    input.accept = accept
    input.style.display = 'none'
    document.body.appendChild(input)

    input.onchange = () => {
      const file = input.files?.[0]
      document.body.removeChild(input)
      if (!file) { resolve(null); return }
      const reader = new FileReader()
      reader.onload = () => resolve(reader.result as ArrayBuffer)
      reader.onerror = () => resolve(null)
      reader.readAsArrayBuffer(file)
    }

    input.oncancel = () => { document.body.removeChild(input); resolve(null) }

    input.click()
  })
}

export function pickExcelFile(): Promise<ArrayBuffer | null> {
  return openFilePicker('.xlsx,.xls')
}

export function pickCSVFile(): Promise<ArrayBuffer | null> {
  return openFilePicker('.csv')
}

export function pickBalanceteFile(): Promise<ArrayBuffer | null> {
  return openFilePicker('.csv,.xlsx,.xls')
}

export function downloadFile(filename: string, data: ArrayBuffer | ArrayBufferView): void {
  const blob = new Blob([data as ArrayBuffer], { type: 'application/octet-stream' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export function downloadModelTemplate(filename: string): void {
  const a = document.createElement('a')
  a.href = `/${filename}`
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}
