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
