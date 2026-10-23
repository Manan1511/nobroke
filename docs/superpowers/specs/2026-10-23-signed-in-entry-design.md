# NoBroke signed-in entry screen

## Intent

Match the signed-in welcome screen before **ENTER** to the supplied reference. The hero should feel like the same NoBroke scene, with its large wordmark, orange tube, floating icons, centered tagline, signed-in greeting, and single entry action.

## Goals

- Preserve the current landing artwork and intro animation while correcting scale, spacing, and alignment to match the reference at desktop sizes.
- Keep the greeting and **ENTER** action clear and inside the viewport, with a layout that adapts cleanly to narrow screens.
- Retain keyboard access, the existing navigation menu, and reduced-motion behavior.

## Non-goals

- Do not restyle the financial dashboard shown after **ENTER**.
- Do not change signup, login, account state, or backend behavior.
- Do not deploy through Netlify. The user manages publishing and has locked autopublishing.

## Approaches

1. Refine the existing signed-in branch in `frontend/src/landing/Landing.tsx` and its stylesheet. This keeps the public and signed-in states in one scene and is the selected approach.
2. Create a separate signed-in intro route. This duplicates the same scene and risks visual drift, so it is not selected.

## Decisions

- Use the existing `session` conditional to show the greeting and **ENTER** action.
- Tune the hero composition in `frontend/src/landing/landing.css`, keeping the logo and tube as the visual leads and the greeting and button as supporting actions.
- Preserve the public logged-out actions and the app route.

## Implementation status

The signed-in welcome layout adjustment is implemented. Frontend tests and the production build pass, and the local app responds at `http://127.0.0.1:5173/`. The final visual pass for the authenticated state at the reference, desktop, and narrow widths remains open because no authenticated browser session was available during this verification. A separate dashboard update was made in response to later user requests. Netlify deployment remains user-managed.
