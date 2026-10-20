import { createContext, useContext, useEffect, useState, type ReactNode } from "react"
import * as mock from "@/data/mock"
import type { StoreState } from "@/types"

interface Store extends StoreState {
  /** Replace one slice of state: update("expenses", (list) => [...list, item]) */
  update: <K extends keyof StoreState>(key: K, fn: (value: StoreState[K]) => StoreState[K]) => void
  userName: (id: string) => string
  groupName: (id: string) => string
  me: string
  /** Put the sample data back (clears what this browser saved). */
  resetDemo: () => void
}

const StoreCtx = createContext<Store | null>(null)

// Saved in this browser so a demo survives a refresh, until the backend stores the real data.
const SAVE_KEY = "nobroke-data-v1"
const demoState = (): StoreState => ({
    users: mock.users,
    friendships: mock.friendships,
    groups: mock.groups,
    expenses: mock.expenses,
    obligations: mock.obligations,
    rules: mock.payWhenPaidRules,
    recurring: mock.recurringTemplates,
    batches: mock.settlementBatches,
    myFinancials: mock.myPrivateFinancials,
    spending: mock.spendingHistory,
    notifications: mock.notifications,
})
function loadState(): StoreState {
  try {
    const raw = localStorage.getItem(SAVE_KEY)
    if (raw) return { ...demoState(), ...JSON.parse(raw) }
  } catch { /* blocked or corrupt storage: start from the sample data */ }
  return demoState()
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>(loadState)
  useEffect(() => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)) } catch { /* storage blocked: keep in memory */ } }, [state])
  const resetDemo = () => { try { localStorage.removeItem(SAVE_KEY) } catch { /* ignore */ } setState(demoState()) }
  const update: Store["update"] = (key, fn) => setState((s) => ({ ...s, [key]: fn(s[key]) }))
  const userName = (id: string) => state.users.find((u) => u.user_id === id)?.name ?? "Unknown"
  const groupName = (id: string) => state.groups.find((g) => g.group_id === id)?.group_name ?? "—"
  return (
    <StoreCtx.Provider value={{ ...state, update, userName, groupName, resetDemo, me: mock.CURRENT_USER_ID }}>
      {children}
    </StoreCtx.Provider>
  )
}

export function useStore(): Store {
  const store = useContext(StoreCtx)
  if (!store) throw new Error("useStore must be used inside <StoreProvider>")
  return store
}
export const newId = (prefix: string) => `${prefix}${Math.random().toString(36).slice(2, 8)}`
