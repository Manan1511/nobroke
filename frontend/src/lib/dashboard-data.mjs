export function filterOpenObligations(obligations) {
  return obligations.filter((obligation) => obligation.status === "OPEN" || obligation.status === "PARTIAL")
}
