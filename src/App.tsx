import { useEffect, useState } from 'react'
import { NavLink, Route, Routes } from 'react-router-dom'
import { getSyncStatus, onSyncStatus } from './sync'
import Dashboard from './pages/Dashboard'
import ProjectPage from './pages/ProjectPage'
import Decisions from './pages/Decisions'
import Search from './pages/Search'

const link = ({ isActive }: { isActive: boolean }) =>
  `block rounded px-3 py-2 text-sm ${isActive ? 'bg-indigo-600' : 'hover:bg-slate-800'}`

const SYNC = {
  ok: ['bg-emerald-400', 'Sincronizzato'],
  salvataggio: ['bg-amber-400', 'Salvataggio…'],
  unito: ['bg-sky-400', 'Unito con le modifiche di un altro dispositivo'],
  offline: ['bg-red-400', 'Non sincronizzato: riprovo da solo'],
} as const

function SyncBadge() {
  const [s, setS] = useState(getSyncStatus())
  useEffect(() => onSyncStatus(setS), [])
  return (
    <div className="flex items-center gap-2 px-3 py-2 text-xs text-slate-400" role="status">
      <span className={`h-2 w-2 shrink-0 rounded-full ${SYNC[s][0]}`} />{SYNC[s][1]}
    </div>
  )
}

export default function App() {
  return (
    <div className="flex h-screen flex-col md:flex-row">
      <nav className="flex shrink-0 flex-wrap items-center gap-1 border-b border-slate-800 bg-slate-900 p-2 md:block md:w-52 md:space-y-1 md:border-b-0 md:border-r md:p-3">
        <div className="w-full px-3 text-sm font-bold text-indigo-400 md:mb-4 md:w-auto">Project Command Center</div>
        <NavLink to="/" end className={link}>Dashboard</NavLink>
        <NavLink to="/decisioni" className={link}>Decisioni</NavLink>
        <NavLink to="/ricerca" className={link}>Ricerca</NavLink>
        <SyncBadge />
      </nav>
      <main className="min-w-0 flex-1 overflow-auto p-4 md:p-6">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/progetto/:id" element={<ProjectPage />} />
          <Route path="/decisioni" element={<Decisions />} />
          <Route path="/ricerca" element={<Search />} />
        </Routes>
      </main>
    </div>
  )
}
