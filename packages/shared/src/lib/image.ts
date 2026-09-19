export interface OptimizedImage {
  base64: string
  mimeType: string
}

const MAX_DIM_DEFAULT = 900
const QUALITY_DEFAULT = 0.82
const MAX_FILE_MB = 10

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function fileTooBig(file: File): boolean {
  return file.size > MAX_FILE_MB * 1024 * 1024
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('No se pudo leer el archivo'))
    reader.readAsDataURL(file)
  })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Imagen inválida'))
    img.src = src
  })
}

function webpSupported(canvas: HTMLCanvasElement): boolean {
  try {
    return canvas.toDataURL('image/webp', 0.1).startsWith('data:image/webp')
  } catch {
    return false
  }
}

/** Redimensiona y comprime la imagen en el navegador para que pese lo mínimo sin perder calidad visible. */
export async function optimizeImage(file: File, opts: { maxDim?: number; quality?: number } = {}): Promise<OptimizedImage> {
  const maxDim = opts.maxDim ?? MAX_DIM_DEFAULT
  const quality = opts.quality ?? QUALITY_DEFAULT
  const dataUrl = await readAsDataUrl(file)
  const img = await loadImage(dataUrl)

  const scale = Math.min(1, maxDim / Math.max(img.naturalWidth, img.naturalHeight))
  const w = Math.max(1, Math.round(img.naturalWidth * scale))
  const h = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')
  ctx.drawImage(img, 0, 0, w, h)

  const mimeType = webpSupported(canvas) ? 'image/webp' : 'image/jpeg'
  const out = canvas.toDataURL(mimeType, quality)
  return { base64: out.replace(/^data:[^,]+,/, ''), mimeType }
}