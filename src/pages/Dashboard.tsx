import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { exportJson, importJson } from '../sync'
import { db, Priority, PRIORITIES, ProjectStatus, PROJECT_STATUSES } from '../db'

const order: Record<Priority, number> = { alta: 0, media: 1, bassa: 2 }

export default function Dashboard() {
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const tasks = useLiveQuery(() => db.tasks.toArray(), [])
  const [name, setName] = useState('')
  const [filter, setFilter] = useState('tutti')
  const [msg, setMsg] = useState('')
  const sorted = [...(projects ?? [])].filter((p) => filter === 'tutti' || p.status === filter).sort((x, y) => order[x.priority] - order[y.priority])

  const add = async () => {
    if (!name.trim()) return
    await db.projects.add({ name: name.trim(), description: '', goals: '', status: 'attivo', priority: 'media' })
    setName('')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Dashboard</h1>
      <div className="flex gap-2">
        <input className="inp max-w-xs" placeholder="Nuovo progetto…" value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && add()} />
        <button className="btn" onClick={add}>Aggiungi</button>
      </div>
      <select className="inp max-w-xs" value={filter} onChange={(e) => setFilter(e.target.value)} aria-label="Filtra per stato">
        <option value="tutti">Tutti gli stati</option>
        {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
      </select>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {sorted.map((p) => {
          const t = (tasks ?? []).filter((x) => x.projectId === p.id)
          const done = t.filter((x) => x.status === 'fatto').length
          return (
            <div key={p.id} className="card space-y-2">
              <Link to={`/progetto/${p.id}`} className="font-medium text-indigo-300 hover:underline">{p.name}</Link>
              <div className="flex gap-2">
                <select className="inp" value={p.status} onChange={(e) => db.projects.update(p.id!, { status: e.target.value as ProjectStatus })}>
                  {PROJECT_STATUSES.map((s) => <option key={s}>{s}</option>)}
                </select>
                <select className="inp" value={p.priority} onChange={(e) => db.projects.update(p.id!, { priority: e.target.value as Priority })}>
                  {PRIORITIES.map((s) => <option key={s}>{s}</option>)}
                </select>
              </div>
              <div className="text-xs text-slate-400">Task completati: {done}/{t.length}</div>
            </div>
          )
        })}
        {projects && sorted.length === 0 && <div className="text-slate-400">{projects.length === 0 ? 'Nessun progetto: creane uno sopra.' : 'Nessun progetto con questo stato.'}</div>}
      </div>
      <div className="card flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-400">Dati:</span>
        <button className="btn" onClick={exportJson}>Esporta JSON</button>
        <label className="btn cursor-pointer">Importa JSON
          <input type="file" accept="application/json,.json" className="hidden" onChange={async (e) => {
            const f = e.target.files?.[0]; e.target.value = ''
            if (f) setMsg(await importJson(f))
          }} />
        </label>
        {msg && <span className="text-sm text-slate-300">{msg}</span>}
      </div>
    </div>
  )
}
