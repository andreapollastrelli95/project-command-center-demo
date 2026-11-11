import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { db, today, TASK_STATUSES, TaskStatus } from '../db'

function AddRow({ placeholder, onAdd }: { placeholder: string; onAdd: (v: string) => void }) {
  const [v, setV] = useState('')
  const go = () => { if (v.trim()) { onAdd(v.trim()); setV('') } }
  return (
    <div className="flex gap-2">
      <input className="inp" placeholder={placeholder} value={v} onChange={(e) => setV(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && go()} />
      <button className="btn" onClick={go}>+</button>
    </div>
  )
}

export default function ProjectPage() {
  const id = Number(useParams().id)
  const nav = useNavigate()
  const res = useLiveQuery(async () => ({ p: await db.projects.get(id) }), [id])
  const project = res?.p
  const del = (what: string, fn: () => unknown) => { if (confirm(`Eliminare ${what}?`)) fn() }
  const milestones = useLiveQuery(() => db.milestones.where('projectId').equals(id).toArray(), [id])
  const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(id).toArray(), [id])
  const notes = useLiveQuery(() => db.notes.where('projectId').equals(id).toArray(), [id])
  const decisions = useLiveQuery(() => db.decisions.where('projectId').equals(id).toArray(), [id])
  const [ai, setAi] = useState<{ loading: boolean; text?: string; error?: string }>({ loading: false })

  if (!res) return null
  if (!project) return <div className="text-slate-400">Progetto non trovato. <Link className="text-indigo-300 underline" to="/">Torna alla dashboard</Link></div>

  const remove = async () => {
    if (!confirm(`Eliminare "${project.name}" e tutti i suoi dati?`)) return
    await db.transaction('rw', [db.projects, db.milestones, db.tasks, db.notes, db.decisions], async () => {
      await db.milestones.where('projectId').equals(id).delete()
      await db.tasks.where('projectId').equals(id).delete()
      await db.notes.where('projectId').equals(id).delete()
      await db.decisions.where('projectId').equals(id).delete()
      await db.projects.delete(id)
    })
    nav('/')
  }

  // Gemini viene chiamato solo al clic dell'utente, tramite IPC verso il main process.
  const askGemini = async () => {
    setAi({ loading: true })
    const prompt = [
      'Sei un assistente per la gestione progetti. Rispondi in italiano, in modo conciso.',
      'Riassumi lo stato del progetto e proponi 3-5 prossimi passi concreti.',
      `Progetto: ${project.name} (stato: ${project.status}, priorità: ${project.priority})`,
      `Descrizione: ${project.description}`,
      `Obiettivi: ${project.goals}`,
      `Milestone: ${(milestones ?? []).map((m) => `${m.title}${m.due ? ' [' + m.due + ']' : ''} (${m.done ? 'fatta' : 'aperta'})`).join('; ')}`,
      `Task: ${(tasks ?? []).map((t) => `${t.title} (${t.status})`).join('; ')}`,
      `Note: ${(notes ?? []).map((n) => n.text).join(' | ')}`,
      `Decisioni: ${(decisions ?? []).map((d) => `${d.title}: ${d.rationale}`).join(' | ')}`,
    ].join('\n')
    try {
      const r: { ok: boolean; text?: string; error?: string } = await (await fetch('/api/gemini', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt }),
      })).json()
      setAi(r.ok ? { loading: false, text: r.text } : { loading: false, error: r.error })
    } catch (e) {
      setAi({ loading: false, error: 'Errore di comunicazione con Gemini.' })
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <input className="inp max-w-lg text-lg font-semibold" value={project.name} onChange={(e) => db.projects.update(id, { name: e.target.value })} />
        <button className="btn-ghost" onClick={remove}>Elimina progetto</button>
      </div>

      <section className="card grid gap-2 md:grid-cols-2">
        <label className="text-xs text-slate-400">Descrizione
          <textarea className="inp mt-1" rows={3} value={project.description} onChange={(e) => db.projects.update(id, { description: e.target.value })} />
        </label>
        <label className="text-xs text-slate-400">Obiettivi (uno per riga)
          <textarea className="inp mt-1" rows={3} value={project.goals} onChange={(e) => db.projects.update(id, { goals: e.target.value })} />
        </label>
      </section>

      <section className="card space-y-2">
        <div className="flex items-center gap-3">
          <h2 className="font-medium">Assistente Gemini</h2>
          <button className="btn" disabled={ai.loading} onClick={askGemini}>{ai.loading ? 'Attendo…' : 'Riassumi e proponi prossimi passi'}</button>
        </div>
        {ai.error && <div className="rounded border border-red-800 bg-red-950 p-2 text-sm text-red-200">{ai.error}</div>}
        {ai.text && <div className="whitespace-pre-wrap text-sm">{ai.text}</div>}
      </section>

      <section className="space-y-2">
        <h2 className="font-medium">Task</h2>
        <AddRow placeholder="Nuovo task…" onAdd={(title) => db.tasks.add({ projectId: id, title, status: 'da fare' })} />
        <div className="grid gap-3 md:grid-cols-3">
          {TASK_STATUSES.map((s) => (
            <div key={s} className="card space-y-2">
              <div className="text-xs font-semibold uppercase text-slate-400">{s}</div>
              {(tasks ?? []).filter((t) => t.status === s).map((t) => (
                <div key={t.id} className="space-y-1 rounded border border-slate-700 p-2 text-sm">
                  <input className="inp" value={t.title} onChange={(e) => db.tasks.update(t.id!, { title: e.target.value })} />
                  <div className="flex gap-1">
                    <select className="inp" value={t.status} onChange={(e) => db.tasks.update(t.id!, { status: e.target.value as TaskStatus })}>
                      {TASK_STATUSES.map((x) => <option key={x}>{x}</option>)}
                    </select>
                    <button className="btn-ghost" onClick={() => del(`il task "${t.title}"`, () => db.tasks.delete(t.id!))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium">Milestone</h2>
        <AddRow placeholder="Nuova milestone…" onAdd={(title) => db.milestones.add({ projectId: id, title, due: '', done: false })} />
        {milestones?.length === 0 && <div className="text-sm text-slate-500">Nessuna milestone: aggiungine una sopra.</div>}
        {milestones?.map((m) => (
          <div key={m.id} className="flex flex-wrap items-center gap-2 text-sm">
            <input type="checkbox" checked={m.done} onChange={(e) => db.milestones.update(m.id!, { done: e.target.checked })} />
            <input className={`inp min-w-0 flex-1 ${m.done ? 'text-slate-500 line-through' : ''}`} value={m.title} onChange={(e) => db.milestones.update(m.id!, { title: e.target.value })} />
            <input type="date" className="inp w-40" value={m.due} onChange={(e) => db.milestones.update(m.id!, { due: e.target.value })} />
            <button className="btn-ghost" onClick={() => del(`la milestone "${m.title}"`, () => db.milestones.delete(m.id!))}>✕</button>
          </div>
        ))}
      </section>

      <section className="card space-y-2">
        <h2 className="font-medium">Note</h2>
        <AddRow placeholder="Nuova nota…" onAdd={(text) => db.notes.add({ projectId: id, text, createdAt: today() })} />
        {notes?.length === 0 && <div className="text-sm text-slate-500">Nessuna nota.</div>}
        {notes?.map((n) => (
          <div key={n.id} className="flex items-start gap-2 text-sm">
            <span className="text-xs text-slate-500">{n.createdAt}</span>
            <textarea className="inp flex-1" rows={2} value={n.text} onChange={(e) => db.notes.update(n.id!, { text: e.target.value })} />
            <button className="btn-ghost" onClick={() => del('questa nota', () => db.notes.delete(n.id!))}>✕</button>
          </div>
        ))}
      </section>
    </div>
  )
}
