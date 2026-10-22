export type AuthFormMode = "login" | "signup" | "recovery"

export function validateAuthForm(mode: AuthFormMode, email: string, password: string): {
  emailError: string
  passwordError: string
  valid: boolean
} {
  const emailError = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.trim())
    ? ""
    : "Enter a valid email address."
  const passwordError = mode !== "recovery" && password.length < 8
    ? "Use at least 8 characters."
    : ""

  return { emailError, passwordError, valid: !emailError && !passwordError }
}
