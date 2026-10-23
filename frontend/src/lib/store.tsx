import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import type { AppNotification, DashboardSummary, Expense, ForwardingTask, Friendship, Group, Obligation, PayWhenPaidRule, PaymentReport, PrivateFinancials, RecurringTemplate, SettlementBatch, SpendingMonth, StoreState, User } from "@/types"
import { apiRpc } from "@/lib/supabase"
import { useSession } from "@/lib/session"
import { listAllPages } from "@/lib/pagination.mjs"
import { routeHistoryLegs } from "@/lib/route-history.mjs"

interface Store extends StoreState {
  /** Retained for transient form-only state; never persisted to browser storage. */
  update: <K extends keyof StoreState>(key: K, fn: (value: StoreState[K]) => StoreState[K]) => void
  userName: (id: string) => string
  groupName: (id: string) => string
  me: string
  refresh: () => Promise<void>
}

const StoreCtx = createContext<Store | null>(null)
const emptyState = (): StoreState => ({
  users: [], friendships: [], groups: [], expenses: [], obligations: [], rules: [], recurring: [],
  batches: [], myFinancials: { configured: false }, spending: [], notifications: [],
  forwardingTasks: [], payments: [], loading: false, loadError: null,
  notificationPreferences: { reminders: true, cascades: true, recurring: true, social: true },
  dashboard: { group_count: 0, owe_total: "0.00", owed_total: "0.00", net_balance: "0.00",
    open_payable_count: 0, open_receivable_count: 0, current_month_spend: "0.00",
    current_month_paid: "0.00", current_month_group_total: "0.00", current_month_settled: "0.00",
    current_month_settlement_count: 0, current_month_clear_percent: 100 },
  dashboardBalances: [], groupSpending: [],
})
const money = (value: unknown) => String(value ?? "0.00")

const listPages = <T extends Record<string, any>>(name: string, args: Record<string, unknown>, cursor: Parameters<typeof listAllPages<T>>[2]) =>
  listAllPages<T>((pageArgs) => apiRpc<T[]>(name, pageArgs), args, cursor)

export function StoreProvider({ children }: { children: ReactNode }) {
  const session = useSession()
  const sessionName = useRef(session?.name ?? "You")
  sessionName.current = session?.name ?? "You"
  const [state, setState] = useState<StoreState>(() => ({ ...emptyState(), loading: true }))
  const generation = useRef(0)

  const refresh = useCallback(async () => {
    const userId = session?.userId
    const thisGeneration = ++generation.current
    if (!userId) { setState(emptyState()); return }
    setState((current) => ({ ...current, loading: true, loadError: null }))
    try {
      const groupRows = await listPages<any>("list_groups", {}, { idField: "group_id" })
      const groupDetails = await Promise.all(groupRows.map(async (row) => {
        const [detail, members, expenses] = await Promise.all([
          apiRpc<any>("get_group", { p_group_id: row.group_id }),
          listPages<any>("list_group_members", { p_group_id: row.group_id },
            { idArg: "p_after_membership_id", idField: "membership_id" }),
          listPages<any>("list_expenses", { p_group_id: row.group_id }, { idField: "expense_id" }),
        ])
        return { row, detail, members, expenses }
      }))
      const [friendRows, obligationRows, ruleRows, taskRows, paymentRows, historyRows, routeRows, cycleRows,
        spendingRows, notificationRows, privateIncome, preferences, dashboard, dashboardBalances, groupSpending] = await Promise.all([
        listPages<any>("list_my_friends", {}, { idField: "friendship_id" }),
        listPages<any>("list_my_obligations", {}, { idField: "obligation_id" }),
        listPages<any>("list_my_pay_when_paid_rules", {}, { idField: "rule_id" }),
        listPages<any>("list_forwarding_tasks", {}, { idField: "task_id" }),
        listPages<any>("list_payment_reports", {}, { idField: "payment_id", timestampField: "reported_at", timestampArg: "p_after_created_at" }),
        listPages<any>("list_settlement_history", {}, { idField: "settlement_id", timestampField: "created_at", timestampArg: "p_after_created_at" }),
        listPages<any>("list_route_history", {}, { idField: "route_id", timestampField: "created_at", timestampArg: "p_after_created_at" }),
        listPages<any>("list_cycle_net_batches", {}, { idField: "cycle_net_id", timestampField: "created_at", timestampArg: "p_after_created_at" }),
        apiRpc<any[]>("list_my_spending", { p_months: 12 }),
        listPages<any>("list_notifications", {}, { idField: "notification_id", timestampField: "created_at", timestampArg: "p_after_created_at" }),
        apiRpc<{ configured: boolean }>("get_private_income_status"),
        apiRpc<{ reminders: boolean; cascades: boolean; recurring: boolean; social: boolean }>("get_notification_preferences"),
        apiRpc<Record<string, unknown>>("get_dashboard_summary"),
        apiRpc<any[]>("get_dashboard_balances"),
        apiRpc<any[]>("get_dashboard_group_spending"),
      ])

      const userById = new Map<string, User>()
      const remember = (id: string, username: string, name: string) => {
        if (!id) return
        const existing = userById.get(id)
        userById.set(id, { user_id: id, username: username || existing?.username || id.slice(0, 8), name: name || existing?.name || username || id.slice(0, 8) })
      }
      remember(userId, sessionName.current, sessionName.current)
      const groups: Group[] = groupDetails.map(({ row, detail, members }) => {
        members.forEach((member) => remember(member.user_id, member.username, member.display_name))
        return { group_id: row.group_id, group_name: row.group_name,
          created_by: detail?.created_by ?? "", owner_id: members.find((member) => member.role === "OWNER")?.user_id,
          members: members.map((member) => member.user_id) }
      })
      friendRows.forEach((friend) => remember(friend.friend_id, friend.username, friend.display_name))
      const expenses: Expense[] = groupDetails.flatMap(({ expenses: rows }) => rows.map((expense) => ({
        expense_id: expense.expense_id, group_id: expense.group_id, paid_by: expense.paid_by,
        title: expense.title, total_amount: money(expense.total_amount), split_mode: expense.split_mode,
        created_at: String(expense.created_at).slice(0, 10),
        recurring_template_id: expense.source_template_id,
        participants: (expense.splits ?? []).map((split: any) => split.participant_id),
        exact_shares: Object.fromEntries((expense.splits ?? []).map((split: any) => [split.participant_id, split.share_amount])),
      })))
      const obligations: Obligation[] = obligationRows.map((row) => {
        remember(row.counterparty_id ?? (row.debtor_user_id === userId ? row.creditor_user_id : row.debtor_user_id),
          row.counterparty_username, row.counterparty_name)
        return { obligation_id: row.obligation_id, debtor_id: row.debtor_user_id, creditor_id: row.creditor_user_id,
          original_amount: money(row.original_amount), remaining_amount: money(row.remaining_amount),
          cleared_percent: Number(row.cleared_percent ?? 0),
          status: row.status, source: row.expense_title, group_id: row.group_id, reserved_amount: money(row.reserved_amount),
          is_routed: Boolean(row.is_routed) } as Obligation
      })
      const friendships: Friendship[] = friendRows.map((row) => ({
        friendship_id: row.friendship_id, friend_id: row.friend_id, status: row.status,
        requested_by: row.requested_by,
        credit_limit_me_to_them: money(row.trust_limit_me_to_them),
        credit_limit_them_to_me: money(row.trust_limit_them_to_me),
        exposure_me_to_them: money(row.exposure_me_to_them),
        exposure_them_to_me: money(row.exposure_them_to_me),
      }))
      const rules: PayWhenPaidRule[] = ruleRows.map((row) => ({ rule_id: row.rule_id,
        trigger_receivable_id: row.trigger_obligation_id, target_payable_id: row.target_obligation_id,
        max_cascade_amount: money(row.max_budget), status: row.status, created_at: String(row.created_at).slice(0, 10) }))
      const recurring: RecurringTemplate[] = []
      for (const group of groups) {
        const rows = await listPages<any>("list_recurring_templates", { p_group_id: group.group_id }, { idField: "template_id" })
        recurring.push(...rows.map((item) => ({
          template_id: item.template_id, group_id: item.group_id, paid_by: item.paid_by, title: item.title,
          total_amount: money(item.total_amount), split_mode: item.split_mode, frequency: item.frequency,
          next_run_date: item.next_run_date, is_active: item.is_active,
          last_success_at: item.last_success_at, last_success_date: item.last_success_date,
          backlog_count: Number(item.backlog_count ?? 0), failed_date: item.failed_date,
          last_error_code: item.last_error_code,
          participants: item.participants?.map((person: any) => person.user_id) ?? [],
          fixed_shares: Object.fromEntries((item.participants ?? []).filter((person: any) => person.fixed_share != null)
            .map((person: any) => [person.user_id, person.fixed_share])),
        })))
      }
      const batches: SettlementBatch[] = historyRows.map((row) => ({
        batch_id: row.settlement_id, settlement_type: row.type === "CYCLE_NET" ? "CYCLE_CLEAR" : row.type === "ROUTE" ? "MULTI_HOP" : "DIRECT",
        total_cleared: money(row.amount), executed_at: String(row.created_at).slice(0, 10),
        legs: [{ step_order: 1, from_user: row.from_user_id, to_user: row.to_user_id, amount: money(row.amount) }],
      }))
      batches.unshift(...routeRows.map((row) => ({
        batch_id: row.route_id, settlement_type: "MULTI_HOP" as const,
        total_cleared: money(row.amount), executed_at: String(row.created_at).slice(0, 10),
        legs: routeHistoryLegs(row.path as string[], money(row.amount)),
      })))
      batches.unshift(...cycleRows.map((row) => ({
        batch_id: row.cycle_net_id, settlement_type: "CYCLE_CLEAR" as const,
        total_cleared: money(row.amount), executed_at: String(row.created_at).slice(0, 10), legs: [],
      })))
      const notifications: AppNotification[] = notificationRows.map((row) => ({
        id: row.notification_id, type: row.category === "SOCIAL" ? "FRIEND_REQUEST"
          : row.category === "RECURRING" ? "BILL" : row.kind === "PAYMENT_CONFIRMED" ? "SETTLED"
            : row.category === "CASCADES" ? "RULE_ARMED" : "REMINDER",
        text: `${row.title}: ${row.body}`, at: row.created_at, read: Boolean(row.read_at),
      }))
      const next: StoreState = {
        users: [...userById.values()], friendships, groups, expenses, obligations, rules, recurring, batches,
        myFinancials: { configured: Boolean(privateIncome?.configured) },
        spending: spendingRows.map((row) => ({ month: row.month, your_share: money(row.your_share),
          you_paid: money(row.you_paid), group_total: money(row.group_total) })),
        notifications,
        forwardingTasks: taskRows.map((row) => ({ task_id: row.task_id, rule_id: row.rule_id,
          trigger_payment_id: row.trigger_payment_id, target_obligation_id: row.target_obligation_id,
          amount: money(row.amount), remaining_amount: money(row.remaining_amount), status: row.status,
          expense_title: row.expense_title, creditor_user_id: row.creditor_user_id,
          creditor_name: row.creditor_name, created_at: row.created_at } as ForwardingTask)),
        payments: paymentRows.map((row) => ({ payment_id: row.payment_id, obligation_id: row.obligation_id,
          debtor_id: row.debtor_user_id, creditor_id: row.creditor_user_id, amount: money(row.amount),
          status: row.status, reported_at: row.reported_at, task_id: row.task_id } as PaymentReport)),
        notificationPreferences: preferences,
        dashboard: dashboard as unknown as DashboardSummary,
        dashboardBalances: dashboardBalances.map((row) => ({ ...row, net_amount: String(row.net_amount) })),
        groupSpending: groupSpending.map((row) => ({ ...row, amount: String(row.amount), total_amount: String(row.total_amount) })),
        loading: false, loadError: null,
      }
      if (thisGeneration === generation.current) setState(next)
    } catch (error) {
      if (thisGeneration === generation.current) setState((current) => ({
        ...current, loading: false, loadError: error instanceof Error ? error.message : "request_failed",
      }))
    }
  }, [session?.userId])

  useEffect(() => { void refresh() }, [refresh])
  const update: Store["update"] = (key, fn) => setState((current) => ({ ...current, [key]: fn(current[key]) }))
  const userName = (id: string) => id === session?.userId
    ? session.name
    : state.users.find((user) => user.user_id === id)?.name ?? id.slice(0, 8)
  const groupName = (id: string) => state.groups.find((group) => group.group_id === id)?.group_name ?? "Group unavailable"
  const value = useMemo(() => ({ ...state, update, userName, groupName, me: session?.userId ?? "", refresh }),
    [state, session?.userId, update, refresh])
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>
}

export function useStore(): Store {
  const store = useContext(StoreCtx)
  if (!store) throw new Error("useStore must be used inside <StoreProvider>")
  return store
}
