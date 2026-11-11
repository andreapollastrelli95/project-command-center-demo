import Dexie, { Table } from 'dexie'

export type ProjectStatus = 'attivo' | 'in pausa' | 'completato'
export type Priority = 'alta' | 'media' | 'bassa'
export type TaskStatus = 'da fare' | 'in corso' | 'fatto'
export const PROJECT_STATUSES: ProjectStatus[] = ['attivo', 'in pausa', 'completato']
export const PRIORITIES: Priority[] = ['alta', 'media', 'bassa']
export const TASK_STATUSES: TaskStatus[] = ['da fare', 'in corso', 'fatto']

export interface Project { id?: number; name: string; description: string; goals: string; status: ProjectStatus; priority: Priority }
export interface Milestone { id?: number; projectId: number; title: string; due: string; done: boolean }
export interface Task { id?: number; projectId: number; title: string; status: TaskStatus }
export interface Note { id?: number; projectId: number; text: string; createdAt: string }
export interface Decision { id?: number; projectId: number | null; title: string; rationale: string; date: string }

class DB extends Dexie {
  projects!: Table<Project, number>
  milestones!: Table<Milestone, number>
  tasks!: Table<Task, number>
  notes!: Table<Note, number>
  decisions!: Table<Decision, number>
  constructor() {
    super('project-command-center')
    this.version(1).stores({
      projects: '++id, status, priority',
      milestones: '++id, projectId',
      tasks: '++id, projectId, status',
      notes: '++id, projectId',
      decisions: '++id, projectId',
    })
  }
}
export const db = new DB()

export const today = () => new Date().toISOString().slice(0, 10)

export async function seedIfEmpty() {
  if ((await db.projects.count()) > 0) return
  const a = await db.projects.add({ name: 'Sito personale', description: 'Rifacimento del sito portfolio.', goals: 'Pubblicare entro fine mese\nMigliorare la velocità di caricamento', status: 'attivo', priority: 'alta' })
  const b = await db.projects.add({ name: 'App fitness', description: 'Prototipo di tracker allenamenti.', goals: "Validare l'idea con 5 utenti", status: 'in pausa', priority: 'media' })
  await db.milestones.bulkAdd([
    { projectId: a, title: 'Design approvato', due: today(), done: true },
    { projectId: a, title: 'Pubblicazione', due: '', done: false },
  ])
  await db.tasks.bulkAdd([
    { projectId: a, title: 'Scrivere i testi', status: 'in corso' },
    { projectId: a, title: 'Ottimizzare immagini', status: 'da fare' },
    { projectId: a, title: 'Scegliere palette', status: 'fatto' },
    { projectId: b, title: 'Intervistare utenti', status: 'da fare' },
  ])
  await db.notes.add({ projectId: a, text: 'Valutare hosting statico gratuito.', createdAt: today() })
  await db.decisions.add({ projectId: a, title: 'Usare React + Vite', rationale: 'Familiarità e build veloce.', date: today() })
}
