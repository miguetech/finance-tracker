import React, { useRef, useState } from 'react'
import { Button, useToast } from './components'
import { IconPlus, IconX } from './icons'
import { useI18n } from '../i18n'
import { isImageFile, fileTooBig } from '../lib/image'

export function ImageUploader({ value, onChange, disabled }: { value?: string; onChange: (f: File | null) => void; disabled?: boolean }) {
  const { t } = useI18n()
  const toast = useToast()
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [preview, setPreview] = useState<string | null>(null)

  const handleFiles = (files: FileList | null) => {
    const f = files?.[0]
    if (!f) return
    if (!isImageFile(f)) { toast(t('imagenes.errorTipo'), 'error'); return }
    if (fileTooBig(f)) { toast(t('imagenes.errorGrande'), 'error'); return }
    setPreview(URL.createObjectURL(f))
    onChange(f)
  }

  const quitar = () => {
    if (preview) URL.revokeObjectURL(preview)
    setPreview(null)
    if (inputRef.current) inputRef.current.value = ''
    onChange(null)
  }

  const url = preview ?? value

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" className="hidden" disabled={disabled}
        onChange={e => { handleFiles(e.target.files); e.target.value = '' }} />
      {url ? (
        <div className="flex items-center gap-3">
          <div className="relative shrink-0">
            <img src={url} alt="" className="h-24 w-24 rounded-xl border border-gray-200 object-contain bg-white" />
            {!disabled && (
              <button type="button" onClick={quitar} aria-label={t('imagenes.quitar')}
                className="absolute -top-1.5 -right-1.5 p-1 rounded-full bg-danger text-white shadow hover:opacity-90">
                <IconX className="w-3 h-3" />
              </button>
            )}
          </div>
          {!disabled && (
            <Button type="button" variant="outline" size="sm" icon={<IconPlus className="w-4 h-4" />} onClick={() => inputRef.current?.click()}>
              {t('imagenes.cambiar')}
            </Button>
          )}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); setDrag(true) }}
          onDragLeave={() => setDrag(false)}
          onDrop={e => { e.preventDefault(); setDrag(false); handleFiles(e.dataTransfer.files) }}
          className={`w-full rounded-xl border-2 border-dashed px-4 py-8 text-sm transition-colors disabled:opacity-50 ${drag ? 'border-primary bg-primary-soft/40' : 'border-gray-200 hover:border-primary/50 hover:bg-muted/40'}`}
        >
          <span className="inline-flex flex-col items-center gap-2 text-muted-foreground">
            <span className="p-2 rounded-full bg-primary-soft text-primary"><IconPlus className="w-5 h-5" /></span>
            <span>{t('imagenes.arrastrarSoltar')}</span>
          </span>
        </button>
      )}
    </div>
  )
}