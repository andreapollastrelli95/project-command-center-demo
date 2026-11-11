import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db } from '../db'

export default function Search() {
  const [q, setQ] = useState('')
  const data = useLiveQuery(async () => {
    const [projects, tasks, notes, decisions, milestones] = await Promise.all([
      db.projects.toArray(), db.tasks.toArray(), db.notes.toArray(), db.decisions.toArray(), db.milestones.toArray(),
    ])
    return { projects, tasks, notes, decisions, milestones }
  }, [])

  const term = q.trim().toLowerCase()
  const has = (...s: (string | undefined)[]) => s.some((x) => x?.toLowerCase().includes(term))
  const results: { kind: string; text: string; projectId: number | null }[] = []
  if (term && data) {
    data.projects.filter((x) => has(x.name, x.description, x.goals)).forEach((x) => results.push({ kind: 'Progetto', text: x.name, projectId: x.id! }))
    data.tasks.filter((x) => has(x.title)).forEach((x) => results.push({ kind: 'Task', text: x.title, projectId: x.projectId }))
    data.milestones.filter((x) => has(x.title)).forEach((x) => results.push({ kind: 'Milestone', text: x.title, projectId: x.projectId }))
    data.notes.filter((x) => has(x.text)).forEach((x) => results.push({ kind: 'Nota', text: x.text, projectId: x.projectId }))
    data.decisions.filter((x) => has(x.title, x.rationale)).forEach((x) => results.push({ kind: 'Decisione', text: x.title, projectId: x.projectId }))
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Ricerca globale</h1>
      <input className="inp max-w-md" autoFocus placeholder="Cerca in tutto…" value={q} onChange={(e) => setQ(e.target.value)} />
      <div className="space-y-1">
        {results.map((r, i) => (
          <div key={i} className="card flex items-center gap-3 py-2">
            <span className="w-24 text-xs text-slate-400">{r.kind}</span>
            <span className="flex-1 text-sm">{r.text}</span>
            {r.projectId && <Link className="btn-ghost" to={`/progetto/${r.projectId}`}>Apri progetto</Link>}
          </div>
        ))}
        {term && results.length === 0 && <div className="text-slate-400">Nessun risultato.</div>}
      </div>
    </div>
  )
}
