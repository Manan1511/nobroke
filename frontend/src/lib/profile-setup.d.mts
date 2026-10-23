export interface ProfileNameRecord {
  display_name?: string | null
  name_setup_complete?: boolean
}

export interface ProfileNameState {
  displayName: string
  needsName: boolean
  setupComplete: boolean
}

export function getProfileNameState(
  profile: ProfileNameRecord | null | undefined,
): ProfileNameState

export function normalizeUsername(value: unknown): string
export function isValidUsername(value: unknown): boolean
export function getUsernameSetupValue(username: unknown): string
