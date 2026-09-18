// scripts/rename.mjs  —  uso: node scripts/rename.mjs <mapfile.json> [-n]
// mapfile: { idents: {ES:EN}, strings: {ES:EN}, files: [{from,to}], dirs: [{from,to}] }
//  - idents    : renombra solo en POSICIÓN DE IDENTIFICADOR (skipeando strings/comentarios)
//  - strings   : renombra SOLO dentro de literales de string (acciones wire, keys de storage,
//                claims JWT, headers de Sheets, valores de módulo). Nunca toca comentarios.
//  - files/dirs: git mv antes de reemplazar (los imports los arregla el pase de idents).
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { globSync } from 'node:fs'

const ROOT = new URL('..', import.meta.url).pathname
const IGNORE = /(node_modules|\.output|dist|\.wxt|\.vercel|pnpm-lock|tsbuildinfo)/
const DRY = process.argv.includes('-n')

function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') }
function identRe(token) {
  const up = /^[A-Z]/.test(token)
  const before = up ? '(?:(?<![A-Z0-9_$])|(?<=[a-z]))' : '(?<![A-Za-z0-9])'
  const after = '(?![a-z])' // no toca plurales/extensores; longest-first y tokens compuestos explícitos
  return new RegExp(`${before}${esc(token)}${after}`, 'g')
}

// Separa el archivo en segmentos: { text, kind: 'code' | 'str', line } — salta /* */, //, '...', "...", `...`
function segment(text) {
  const segs = [] // {code:boolean, start:number, end:number}
  let i = 0
  const n = text.length
  let codeStart = 0
  while (i < n) {
    const c = text[i]
    if (c === '/' && text[i + 1] === '/') { segs.push({ code: true, start: codeStart, end: i }); let j = i + 2; while (j < n && text[j] !== '\n' && text[j] !== '\r') j++; i = j; codeStart = i; continue }
    if (c === '/' && text[i + 1] === '*') { segs.push({ code: true, start: codeStart, end: i }); let j = i + 2; while (j < n && !(text[j] === '*' && text[j + 1] === '/')) j++; i = j + 2; codeStart = i; continue }
    if (c === "'" || c === '"' || c === '`') {
      segs.push({ code: true, start: codeStart, end: i })
      const q = c; let j = i + 1
      while (j < n && text[j] !== q) {
        if (text[j] === '\\') j += 2; else j++
      }
      const end = Math.min(j + 1, n)
      segs.push({ code: false, start: i, end }) // el string SÍ se registra para el mapa `strings`
      i = end; codeStart = end
      continue
    }
    i++
  }
  if (codeStart < n) segs.push({ code: true, start: codeStart, end: n })
  return segs
}

function apply(text, map) {
  const idents = Object.keys(map.idents ?? {}).sort((a, b) => b.length - a.length)
  const strings = Object.keys(map.strings ?? {}).sort((a, b) => b.length - a.length)
  const edits = []
  for (const seg of segment(text)) {
    const slice = text.slice(seg.start, seg.end)
    if (seg.code) {
      for (const from of idents) {
        let m
        const re = identRe(from)
        while ((m = re.exec(slice))) edits.push([seg.start + m.index, seg.start + m.index + from.length, map.idents[from]])
      }
    } else {
      for (const from of strings) {
        let idx = slice.indexOf(from)
        while (idx !== -1) { edits.push([seg.start + idx, seg.start + idx + from.length, map.strings[from]]); idx = slice.indexOf(from, idx + from.length) }
      }
    }
  }
  edits.sort((a, b) => b[0] - a[0]) // aplicar de atrás hacia adelante
  let out = text
  for (const [s, e, to] of edits) out = out.slice(0, s) + to + out.slice(e)
  return out
}

const map = JSON.parse(readFileSync(process.argv[2], 'utf8'))
// 1) git mv archivos/dirs antes de los reemplazos
for (const { from, to } of map.files ?? []) { if (DRY) continue; const s = `${ROOT}${from}`, d = `${ROOT}${to}`; const dd = d.slice(0, d.lastIndexOf('/')); if (!existsSync(dd)) execSync(`mkdir -p "${dd}"`); execSync(`git mv "${s}" "${d}"`); console.log(`  mv ${from} -> ${to}`) }
for (const { from, to } of map.dirs ?? []) { if (DRY) continue; execSync(`git mv "${ROOT}${from}" "${ROOT}${to}"`); console.log(`  mvDir ${from} -> ${to}`) }
// 2) reemplazos
let changed = 0
for (const f of globSync('**/*.{ts,tsx,json}', { cwd: ROOT }).filter(x => !IGNORE.test(x))) {
  const p = `${ROOT}${f}`; const before = readFileSync(p, 'utf8'); const after = apply(before, map)
  if (after !== before) { if (!DRY) writeFileSync(p, after); changed++; console.log(`  ${f}`) }
}
console.log(`\nTouched ${changed} files. ${DRY ? 'DRY RUN — sin escribir.' : 'Ahora: pnpm build para cazar referencias no actualizadas y colisiones.'}`)