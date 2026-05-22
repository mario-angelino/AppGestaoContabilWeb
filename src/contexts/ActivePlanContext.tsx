import { createContext, useContext, useState } from 'react'

export interface PlanoContas {
  id: number
  nome: string
  descricao: string | null
  dt_criacao: string
}

interface ActivePlanContextType {
  activePlan: PlanoContas | null
  setActivePlan: (plan: PlanoContas | null) => void
}

const ActivePlanContext = createContext<ActivePlanContextType | undefined>(undefined)

const STORAGE_KEY = 'activePlan'

function loadFromStorage(): PlanoContas | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PlanoContas) : null
  } catch {
    return null
  }
}

export function ActivePlanProvider({ children }: { children: React.ReactNode }): JSX.Element {
  const [activePlan, setActivePlanState] = useState<PlanoContas | null>(loadFromStorage)

  const setActivePlan = (plan: PlanoContas | null) => {
    setActivePlanState(plan)
    if (plan) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(plan))
    } else {
      sessionStorage.removeItem(STORAGE_KEY)
    }
  }

  return (
    <ActivePlanContext.Provider value={{ activePlan, setActivePlan }}>
      {children}
    </ActivePlanContext.Provider>
  )
}

export function useActivePlan(): ActivePlanContextType {
  const context = useContext(ActivePlanContext)
  if (!context) throw new Error('useActivePlan deve ser usado dentro de ActivePlanProvider')
  return context
}
