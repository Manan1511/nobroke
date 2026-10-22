import type { SupabaseClient } from "@supabase/supabase-js"

type SignupAuth = Pick<SupabaseClient["auth"], "signUp">

export async function requestSignup(
  auth: SignupAuth,
  email: string,
  password: string,
  emailRedirectTo: string,
): Promise<"confirmation_required"> {
  const { error } = await auth.signUp({ email, password, options: { emailRedirectTo } })
  if (error) throw error
  return "confirmation_required"
}
