export function routeHistoryLegs(path, amount) {
  if (!Array.isArray(path) || path.length < 2) return []
  return path.slice(0, -1).map((from_user, index) => ({
    step_order: index + 1,
    from_user,
    to_user: path[index + 1],
    amount,
  }))
}
