import { availableMoney, compareMoney, isPositiveMoney, subtractMoney } from "./money.mjs"

/** Classify a PostgreSQL-computed peer balance without recomputing its total. */
export function netPosition(balance) {
  const sign = compareMoney(balance?.net_amount, "0.00")
  if (sign === null) return null
  return {
    user_id: balance.user_id,
    display_name: balance.display_name,
    direction: sign > 0 ? "OWES_YOU" : sign < 0 ? "YOU_OWE" : "SQUARE",
    amount: sign < 0 ? subtractMoney("0.00", balance.net_amount) : sign > 0 ? balance.net_amount : "0.00",
  }
}

/** Pick one unreserved, open receivable to back a reminder from a net position. */
export function findRemindableReceivable(obligations, creditorId, debtorId) {
  if (!creditorId || !debtorId || creditorId === debtorId) return null

  return obligations.reduce((best, obligation) => {
    if (obligation.creditor_id !== creditorId || obligation.debtor_id !== debtorId) return best
    if (obligation.status !== "OPEN" && obligation.status !== "PARTIAL") return best

    const available = availableMoney(obligation.remaining_amount, obligation.reserved_amount)
    if (!isPositiveMoney(available)) return best
    if (!best) return obligation

    const comparison = compareMoney(available, availableMoney(best.remaining_amount, best.reserved_amount))
    if (comparison !== null && (comparison > 0 || (comparison === 0 && obligation.obligation_id < best.obligation_id))) {
      return obligation
    }
    return best
  }, null)
}

/** Pick one payable ledger row per creditor for a person-level net payment choice. */
export function onePaymentTargetPerPeer(obligations, availableFor) {
  const targets = new Map()

  for (const obligation of obligations) {
    const available = availableFor(obligation)
    if (!isPositiveMoney(available)) continue

    const current = targets.get(obligation.creditor_id)
    const comparison = current ? compareMoney(available, current.available) : 1
    if (!current || comparison > 0 || (comparison === 0 && obligation.obligation_id < current.obligation.obligation_id)) {
      targets.set(obligation.creditor_id, { obligation, available })
    }
  }

  return [...targets.values()].map(({ obligation }) => obligation)
}

/** Keep every open payable available for deliberate debt-by-debt reporting. */
export function individualPaymentTargets(obligations, availableFor) {
  return obligations.filter((obligation) =>
    (obligation.status === "OPEN" || obligation.status === "PARTIAL")
      && isPositiveMoney(availableFor(obligation)))
}
