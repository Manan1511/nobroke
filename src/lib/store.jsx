import { createContext, useContext, useState } from "react"
import * as mock from "@/data/mock"

const StoreCtx = createContext(null)

export function StoreProvider({ children }) {
  const [state, setState] = useState({
    users: mock.users,
    friendships: mock.friendships,
    groups: mock.groups,
    expenses: mock.expenses,
    obligations: mock.obligations,
    rules: mock.payWhenPaidRules,
    recurring: mock.recurringTemplates,
    batches: mock.settlementBatches,
    myFinancials: mock.myPrivateFinancials,
  })
  const update = (key, fn) => setState((s) => ({ ...s, [key]: fn(s[key]) }))
  const userName = (id) => state.users.find((u) => u.user_id === id)?.name ?? "Unknown"
  const groupName = (id) => state.groups.find((g) => g.group_id === id)?.group_name ?? "—"
  return (
    <StoreCtx.Provider value={{ ...state, update, userName, groupName, me: mock.CURRENT_USER_ID }}>
      {children}
    </StoreCtx.Provider>
  )
}

export const useStore = () => useContext(StoreCtx)
export const newId = (p) => `${p}${Math.random().toString(36).slice(2, 8)}`
