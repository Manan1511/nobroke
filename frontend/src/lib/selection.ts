export function resolveSelectedObligation(selected: string, openObligations: readonly string[]): string {
  return openObligations.includes(selected) ? selected : openObligations[0] ?? ""
}
