/** Convert a PostgREST error into a stable app-level code without exposing backend details. */
export function normalizeApiError(code, message, knownApiErrors = new Set()) {
  if (code === "P0001" && knownApiErrors.has(message)) return message
  if (code === "PGRST301" || code === "401") return "authentication_required"
  if (code === "PGRST202" && /could not find the function/i.test(message)) return "api_function_unavailable"
  return "request_failed"
}
