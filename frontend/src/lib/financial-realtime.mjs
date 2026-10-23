const subscriptions = [
  ["obligations", "debtor_user_id"],
  ["obligations", "creditor_user_id"],
  ["payment_reports", "debtor_user_id"],
  ["payment_reports", "creditor_user_id"],
]

/** Refresh server-computed balances when either side reports or confirms a debt payment. */
export function subscribeToFinancialChanges(client, userId, onChange) {
  let timer = null
  const scheduleRefresh = () => {
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(() => {
      timer = null
      onChange()
    }, 25)
  }

  const channel = client.channel(`financial-changes:${userId}`)
  for (const [table, column] of subscriptions) {
    channel.on("postgres_changes", {
      event: "*",
      schema: "app",
      table,
      filter: `${column}=eq.${userId}`,
    }, scheduleRefresh)
  }
  channel.subscribe((status) => {
    // Re-fetch after reconnect to cover updates missed while offline.
    if (status === "SUBSCRIBED") scheduleRefresh()
  })

  return () => {
    if (timer !== null) clearTimeout(timer)
    void client.removeChannel(channel)
  }
}
