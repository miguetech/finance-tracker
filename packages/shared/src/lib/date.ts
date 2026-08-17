export function todayLocal(d: Date = new Date()): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? 'UTC'
    return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
  } catch {
    return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
  }
}

export function monthLocal(d: Date = new Date()): string {
  return todayLocal(d).slice(0, 7)
}
