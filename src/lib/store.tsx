import { createContext, useContext, useState, type ReactNode } from "react"
import * as mock from "@/data/mock"
import type { StoreState } from "@/types"

interface Store extends StoreState {
  /** Replace one slice of state: update("expenses", (list) => [...list, item]) */
  update: <K extends keyof StoreState>(key: K, fn: (value: StoreState[K]) => StoreState[K]) => void
  userName: (id: string) => string
  groupName: (id: string) => string
  me: string
}

const StoreCtx = createContext<Store | null>(null)

export function StoreProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<StoreState>({
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
  const update: Store["update"] = (key, fn) => setState((s) => ({ ...s, [key]: fn(s[key]) }))
  const userName = (id: string) => state.users.find((u) => u.user_id === id)?.name ?? "Unknown"
  const groupName = (id: string) => state.groups.find((g) => g.group_id === id)?.group_name ?? "—"
  return (
    <StoreCtx.Provider value={{ ...state, update, userName, groupName, me: mock.CURRENT_USER_ID }}>
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
