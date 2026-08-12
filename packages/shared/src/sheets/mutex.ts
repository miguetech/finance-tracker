const MUTEX_KEY = 'mutex'
const STALE_MS = 30000

export async function withMutex<T>(
  readRow: (clave: string) => Promise<string | null>,
  writeRow: (clave: string, valor: string) => Promise<void>,
  fn: () => Promise<T>,
  opts: { maxRetries?: number; retryMs?: number } = {}
): Promise<T> {
  const { maxRetries = 10, retryMs = 300 } = opts
  let attempts = 0
  while (true) {
    const current = await readRow(MUTEX_KEY)
    const fresh = current !== null && (Date.now() - Number(current) < STALE_MS)
    if (current === null || !fresh) {
      await writeRow(MUTEX_KEY, String(Date.now()))
      try {
        return await fn()
      } finally {
        await writeRow(MUTEX_KEY, '')
      }
    }
    attempts++
    if (attempts >= maxRetries) throw new Error('Hoja ocupada, intenta de nuevo')
    await new Promise(r => setTimeout(r, retryMs))
  }
}
