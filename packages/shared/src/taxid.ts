export type TipoDoc = 'RFC' | 'NIF' | 'Cedula' | 'Otro'

export const TIPO_DOC_OPTIONS: { value: TipoDoc; label: string }[] = [
  { value: 'RFC', label: 'RFC' },
  { value: 'NIF', label: 'NIF' },
  { value: 'Cedula', label: 'Cédula' },
  { value: 'Otro', label: 'Otro' }
]

export function getDocLabel(tipo: TipoDoc, etiqueta: string): string {
  switch (tipo) {
    case 'RFC': return 'RFC'
    case 'NIF': return 'NIF'
    case 'Cedula': return 'Cédula'
    case 'Otro': return etiqueta.trim() || 'Documento fiscal'
  }
}
