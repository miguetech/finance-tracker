declare const ContentService: {
  createTextOutput: (s: string) => { setMimeType: (m: string) => void }
  MimeType: { JSON: string }
}

function respond(obj: unknown) {
  const out = ContentService.createTextOutput(JSON.stringify(obj))
  out.setMimeType(ContentService.MimeType.JSON)
  return out
}

function doGet() {
  return respond({ ok: true, service: 'ft-backend' })
}

const g = globalThis as Record<string, unknown>
g.doGet = doGet
g.doPost = doGet
