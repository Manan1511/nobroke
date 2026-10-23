type RemindableObligation = {
  obligation_id: string
  creditor_id: string
  debtor_id: string
  remaining_amount: string
  reserved_amount?: string
  status: string
}

export function netPosition(balance: {
  user_id: string
  display_name?: string
  net_amount: string
} | null | undefined): {
  user_id: string
  display_name?: string
  direction: "OWES_YOU" | "YOU_OWE" | "SQUARE"
  amount: string
} | null

export function findRemindableReceivable<T extends RemindableObligation>(
  obligations: T[],
  creditorId: string | null | undefined,
  debtorId: string | null | undefined,
): T | null

export function onePaymentTargetPerPeer<T extends Pick<RemindableObligation, "obligation_id" | "creditor_id">>(
  obligations: T[],
  availableFor: (obligation: T) => string,
): T[]

export function individualPaymentTargets<T extends Pick<RemindableObligation, "obligation_id" | "status">>(
  obligations: T[],
  availableFor: (obligation: T) => string,
): T[]
