// Server locale: serve la build web, sincronizza i dati e inoltra le richieste a Gemini.
// Ascolta solo su 127.0.0.1. La chiave Gemini viene letta dal file utente a ogni richiesta e non viene mai esposta.
const http = require('http')
const fs = require('fs')
const os = require('os')
const path = require('path')

const PORT = 3103
const APP = 'project-command-center'
const DIST = path.join(__dirname, '..', 'dist')
const BASE = path.join(os.homedir(), '.app-personali')
const DATA_FILE = path.join(BASE, 'data', APP + '.json')
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml',
}

function readStore() {
  try { return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) } catch { return { rev: 0, data: null } }
}
function writeStore(store) {
  fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true })
  if (fs.existsSync(DATA_FILE)) fs.copyFileSync(DATA_FILE, DATA_FILE + '.bak')
  const tmp = DATA_FILE + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(store))
  fs.renameSync(tmp, DATA_FILE)
}
function loadGeminiEnv() {
  const file = path.join(BASE, 'gemini.env')
  if (!fs.existsSync(file)) throw new Error('File di configurazione non trovato: ' + file)
  const env = {}
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/)
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '')
  }
  if (!env.GEMINI_API_KEY) throw new Error('GEMINI_API_KEY mancante in gemini.env')
  if (!env.GEMINI_MODEL) throw new Error('GEMINI_MODEL mancante in gemini.env')
  return env
}
async function askGemini(prompt) {
  try {
    const { GEMINI_API_KEY, GEMINI_MODEL } = loadGeminiEnv()
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(GEMINI_MODEL)}:generateContent`
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': GEMINI_API_KEY },
      body: JSON.stringify({ contents: [{ parts: [{ text: String(prompt) }] }] }),
      signal: AbortSignal.timeout(120000),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, error: `Errore Gemini (${res.status}): ${(data && data.error && data.error.message) || 'richiesta non riuscita'}` }
    const parts = data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts
    const text = parts ? parts.map((p) => p.text || '').join('') : ''
    return text ? { ok: true, text } : { ok: false, error: 'Gemini ha restituito una risposta vuota.' }
  } catch (err) {
    return { ok: false, error: (err && err.name === 'TimeoutError') ? 'Gemini non ha risposto in tempo.' : ((err && err.message) || 'Errore sconosciuto') }
  }
}
function body(req) {
  return new Promise((resolve, reject) => {
    const chunks = []; let size = 0
    req.on('data', (c) => { size += c.length; if (size > 50e6) { reject(new Error('troppo grande')); req.destroy() } else chunks.push(c) })
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')))
    req.on('error', reject)
  })
}
function json(res, code, obj) {
  res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' })
  res.end(JSON.stringify(obj))
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://127.0.0.1')
    if (url.pathname === '/api/gemini' && req.method === 'POST') {
      const { prompt } = JSON.parse(await body(req) || '{}')
      return json(res, 200, await askGemini(prompt))
    }
    if (url.pathname === '/api/data' && req.method === 'GET') return json(res, 200, readStore())
    if (url.pathname === '/api/data' && req.method === 'PUT') {
      const { baseRev, data } = JSON.parse(await body(req))
      const cur = readStore()
      if (baseRev !== cur.rev) return json(res, 409, cur)
      const next = { rev: cur.rev + 1, data }
      writeStore(next)
      return json(res, 200, { rev: next.rev })
    }
    let file = path.join(DIST, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname))
    if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) file = path.join(DIST, 'index.html')
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream' })
    fs.createReadStream(file).pipe(res)
  } catch (err) {
    json(res, 500, { error: String(err && err.message) })
  }
})

function start() {
  server.on('error', (e) => { if (require.main === module) process.exit(e.code === 'EADDRINUSE' ? 0 : 1) })
  server.listen(PORT, '127.0.0.1')
  return server
}
if (require.main === module) start()
module.exports = { start, PORT }
