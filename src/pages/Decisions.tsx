import { useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today } from '../db'

export default function Decisions() {
  const decisions = useLiveQuery(() => db.decisions.orderBy('id').reverse().toArray(), [])
  const projects = useLiveQuery(() => db.projects.toArray(), [])
  const [title, setTitle] = useState('')
  const [rationale, setRationale] = useState('')
  const [projectId, setProjectId] = useState('')
  const pname = (id: number | null) => projects?.find((p) => p.id === id)?.name ?? 'Generale'

  const add = async () => {
    if (!title.trim()) return
    await db.decisions.add({ title: title.trim(), rationale, projectId: projectId ? Number(projectId) : null, date: today() })
    setTitle(''); setRationale('')
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Registro decisioni</h1>
      <div className="card grid max-w-2xl gap-2">
        <input className="inp" placeholder="Decisione" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="inp" placeholder="Motivazione" value={rationale} onChange={(e) => setRationale(e.target.value)} />
        <select className="inp" value={projectId} onChange={(e) => setProjectId(e.target.value)}>
          <option value="">Generale</option>
          {projects?.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <button className="btn w-fit" onClick={add}>Registra</button>
      </div>
      <div className="space-y-2">
        {decisions?.length === 0 && <div className="text-slate-500">Nessuna decisione registrata.</div>}
        {decisions?.map((d) => (
          <div key={d.id} className="card">
            <div className="flex justify-between">
              <div className="font-medium">{d.title}</div>
              <button className="btn-ghost" onClick={() => confirm(`Eliminare la decisione "${d.title}"?`) && db.decisions.delete(d.id!)}>Elimina</button>
            </div>
            <div className="text-xs text-slate-400">{d.date} · {pname(d.projectId)}</div>
            <input className="inp mt-2" value={d.title} onChange={(e) => db.decisions.update(d.id!, { title: e.target.value })} />
            <textarea className="inp mt-1" rows={2} placeholder="Motivazione" value={d.rationale} onChange={(e) => db.decisions.update(d.id!, { rationale: e.target.value })} />
          </div>
        ))}
      </div>
    </div>
  )
}
