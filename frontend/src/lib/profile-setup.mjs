const USERNAME_PATTERN = /^[a-z0-9][a-z0-9_.-]{1,39}$/

export function getProfileNameState(profile) {
  const displayName = typeof profile?.display_name === "string"
    ? profile.display_name.trim()
    : ""
  const setupComplete = profile?.name_setup_complete === true && displayName.length > 0

  return {
    displayName: setupComplete ? displayName : "You",
    needsName: profile != null && !setupComplete,
    setupComplete,
  }
}

export function normalizeUsername(value) {
  return typeof value === "string" ? value.trim().toLowerCase() : ""
}

export function isValidUsername(value) {
  return USERNAME_PATTERN.test(normalizeUsername(value))
}

export function getUsernameSetupValue(username) {
  const normalized = normalizeUsername(username)
  if (/^user-[a-f0-9]{32}$/.test(normalized)) return ""
  return isValidUsername(normalized) ? normalized : ""
}
