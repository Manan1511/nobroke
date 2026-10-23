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
