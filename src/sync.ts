import { db, seedIfEmpty } from './db'

// Sincronizzazione "fine": oltre a inviare tutto lo stato, tengo traccia delle singole righe
// modificate su questo dispositivo. Se il server ha una versione più recente, le due versioni
// vengono unite riga per riga (le mie modifiche sopra quelle del server) invece di scartare le mie.
type Row = Record<string, unknown> & { id: number }
type Data = Record<string, Row[]>

let rev = 0
let suppress = false
let timer: ReturnType<typeof setTimeout> | undefined
let saving = false
const sets = () => new Map<string, Set<number>>()
let dirty = sets(), created = sets(), removed = sets()
const mark = (m: Map<string, Set<number>>, table: string, id: number) => {
  if (!m.has(table)) m.set(table, new Set())
  m.get(table)!.add(id)
}
const pending = () => [dirty, removed].some((m) => [...m.values()].some((s) => s.size > 0))

type Status = 'ok' | 'salvataggio' | 'offline' | 'unito'
let status: Status = 'ok'
const listeners = new Set<(s: Status) => void>()
const setStatus = (s: Status) => { status = s; listeners.forEach((f) => f(s)) }
export const getSyncStatus = () => status
export function onSyncStatus(f: (s: Status) => void) { listeners.add(f); return () => { listeners.delete(f) } }

async function exportAll() {
  const data: Record<string, unknown[]> = {}
  for (const t of db.tables) data[t.name] = await t.toArray()
  return data
}

async function importAll(data: Record<string, unknown[]>) {
  suppress = true
  try {
    await db.transaction('rw', db.tables, async () => {
      for (const t of db.tables) { await t.clear(); await t.bulkAdd((data[t.name] ?? []) as never[]) }
    })
  } finally { suppress = false }
}

// Unisce i dati del server con le righe toccate qui. Restituisce lo stato unito.
function merge(server: Data, local: Data): Data {
  const out: Data = {}
  const remap = new Map<number, number>() // progetti creati qui con un id già usato dal server
  const order = ['projects', ...db.tables.map((t) => t.name).filter((n) => n !== 'projects')]
  for (const name of order) {
    const rows = new Map<number, Row>((server[name] ?? []).map((r) => [r.id, r]))
    for (const id of removed.get(name) ?? []) rows.delete(id)
    const mine = new Map((local[name] ?? []).map((r) => [r.id, r]))
    for (const id of dirty.get(name) ?? []) {
      const row = mine.get(id)
      if (!row) continue
      let next = { ...row }
      if (name !== 'projects' && typeof next.projectId === 'number' && remap.has(next.projectId)) next.projectId = remap.get(next.projectId)!
      if (created.get(name)?.has(id) && rows.has(id)) {
        // Stesso id creato su due dispositivi: la mia riga prende un id nuovo, quella del server resta.
        const fresh = Math.max(0, ...rows.keys(), ...mine.keys()) + 1
        if (name === 'projects') remap.set(id, fresh)
        next = { ...next, id: fresh }
      }
      rows.set(next.id, next)
    }
    out[name] = [...rows.values()]
  }
  // Righe figlie rimaste senza progetto (eliminato sull'altro dispositivo): le tolgo, tranne le decisioni generali.
  const ids = new Set(out.projects.map((p) => p.id))
  for (const name of order) if (name !== 'projects') out[name] = out[name].filter((r) => r.projectId == null || ids.has(r.projectId as number))
  return out
}

async function save(attempt = 0): Promise<void> {
  timer = undefined
  if (saving) { schedule(); return }
  saving = true
  setStatus('salvataggio')
  // Fotografo cosa sto inviando: le modifiche fatte durante l'invio restano in coda.
  const sent = { dirty, created, removed }
  dirty = sets(); created = sets(); removed = sets()
  const restoreSets = () => {
    for (const [from, to] of [[sent.dirty, dirty], [sent.created, created], [sent.removed, removed]] as const)
      for (const [t, s] of from) s.forEach((id) => mark(to, t, id))
  }
  try {
    const res = await fetch('/api/data', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ baseRev: rev, data: await exportAll() }),
    })
    if (res.status === 409) {
      const cur = await res.json()
      restoreSets()
      if (cur.data && attempt < 3) {
        const merged = merge(cur.data as Data, (await exportAll()) as Data)
        rev = cur.rev
        await importAll(merged)
        saving = false
        await save(attempt + 1)
        if (getSyncStatus() === 'ok') { setStatus('unito'); setTimeout(() => status === 'unito' && setStatus('ok'), 4000) }
        return
      }
      setStatus('offline')
    } else if (res.ok) { rev = (await res.json()).rev; setStatus('ok') }
    else { restoreSets(); setStatus('offline') }
  } catch { restoreSets(); setStatus('offline') /* server non raggiungibile: si riprova */ }
  finally { saving = false }
}

function schedule() {
  clearTimeout(timer)
  timer = setTimeout(() => { save() }, 800)
}

// Controlla se il server ha una versione più recente e la carica senza ricaricare la pagina.
async function refresh() {
  if (timer || saving || document.visibilityState !== 'visible') return
  try {
    const cur = await (await fetch('/api/data')).json()
    if (cur.rev <= rev || !cur.data) { if (status === 'offline') pending() ? schedule() : setStatus('ok'); return }
    if (pending()) { schedule(); return } // ho modifiche in sospeso: ci pensa l'unione al salvataggio
    rev = cur.rev
    await importAll(cur.data)
    setStatus('ok')
  } catch { setStatus('offline') }
}

export async function initSync() {
  try {
    const cur = await (await fetch('/api/data')).json()
    rev = cur.rev
    if (cur.data) await importAll(cur.data)
    else { await seedIfEmpty(); await save() }
  } catch { await seedIfEmpty(); setStatus('offline'); return }
  for (const t of db.tables) {
    const name = t.name
    t.hook('creating', function (primKey) {
      if (suppress) return
      const done = (id: number) => { mark(dirty, name, id); mark(created, name, id); schedule() }
      if (typeof primKey === 'number') done(primKey)
      else this.onsuccess = (id: number) => done(id)
    })
    t.hook('updating', (_mods, primKey) => { if (!suppress) { mark(dirty, name, primKey as number); schedule() } })
    t.hook('deleting', (primKey) => {
      if (suppress) return
      const id = primKey as number
      dirty.get(name)?.delete(id)
      // Una riga creata e cancellata qui prima del salvataggio non esiste per il server.
      if (created.get(name)?.delete(id)) { schedule(); return }
      mark(removed, name, id); schedule()
    })
  }
  // Al ritorno sulla pagina e a intervalli prendo le novità dagli altri dispositivi.
  // Versione online (dati su Google): controllo ogni 60 s e solo se l'app è stata usata negli ultimi 10 minuti,
  // per non consumare la quota gratuita; versione locale: ogni 20 s.
  const w = window as unknown as { __EXEC?: string; __ownSync?: boolean }
  w.__ownSync = true // dice alla pagina online che l'app aggiorna i dati da sola, senza ricaricare
  let lastAct = Date.now()
  for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, () => { lastAct = Date.now() }, { passive: true })
  document.addEventListener('visibilitychange', () => { lastAct = Date.now(); refresh() })
  window.addEventListener('pageshow', refresh)
  window.addEventListener('online', refresh)
  setInterval(() => { if (Date.now() - lastAct < 600000) refresh() }, w.__EXEC ? 60000 : 20000)
}

// ---- Esportazione / importazione JSON ----
const FORMAT = 'project-command-center'

export async function exportJson() {
  const blob = new Blob([JSON.stringify({ app: FORMAT, exportedAt: new Date().toISOString(), data: await exportAll() }, null, 2)], { type: 'application/json' })
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = `project-command-center-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(a.href)
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)

// Controlla il file prima di toccare i dati. Restituisce un messaggio d'errore oppure i dati validi.
function validate(raw: unknown): { error: string } | { data: Record<string, Record<string, unknown>[]> } {
  if (!isObj(raw) || raw.app !== FORMAT || !isObj(raw.data)) return { error: 'File non valido: non è un export di Project Command Center.' }
  const data: Record<string, Record<string, unknown>[]> = {}
  for (const t of db.tables) {
    const rows = raw.data[t.name]
    if (!Array.isArray(rows)) return { error: `File non valido: tabella "${t.name}" mancante.` }
    for (const r of rows) {
      if (!isObj(r) || typeof r.id !== 'number') return { error: `File non valido: riga senza id in "${t.name}".` }
    }
    data[t.name] = rows as Record<string, unknown>[]
  }
  const ids = new Set(data.projects.map((p) => p.id))
  if (data.projects.some((p) => typeof p.name !== 'string')) return { error: 'File non valido: progetto senza nome.' }
  for (const t of ['tasks', 'milestones', 'notes']) {
    if (data[t].some((r) => !ids.has(r.projectId as number))) return { error: `File non valido: "${t}" collegati a progetti inesistenti.` }
  }
  return { data }
}

export async function importJson(file: File): Promise<string> {
  let raw: unknown
  try { raw = JSON.parse(await file.text()) } catch { return 'File non valido: JSON illeggibile.' }
  const v = validate(raw)
  if ('error' in v) return v.error
  const n = v.data
  if (!confirm(`Importare ${n.projects.length} progetti, ${n.tasks.length} task, ${n.decisions.length} decisioni?\nI dati attuali verranno sostituiti (il server ne conserva una copia di backup).`)) return 'Importazione annullata.'
  // Sostituzione completa: prendo la versione attuale del server e la sovrascrivo, senza unione.
  try { rev = (await (await fetch('/api/data')).json()).rev } catch { /* offline: si salva appena possibile */ }
  dirty = sets(); created = sets(); removed = sets()
  await importAll(v.data)
  await save()
  return 'Importazione completata.'
}
