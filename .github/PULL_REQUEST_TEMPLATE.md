<!--
═══════════════════════════════════════════════════════════════════════
  TITLE (the field above this body)
═══════════════════════════════════════════════════════════════════════
  Format:  <type>: <imperative summary>   (optionally "(#issue)")
  Types:   feat | fix | docs | refactor | chore | test | perf
  Rules:
    - Imperative mood — "add X", not "added" or "adds"
    - Under ~70 characters
    - No marketing words (improve / enhance / better / robust)
    - Say what actually changed, not the vibe of the change

  Good:
    fix: skip MFA enforcement for local auth mode
    feat: seed 3 local test users for access control testing
    docs: Claude ecosystem adoption report

  Bad:
    Improvements to auth
    Various fixes
    Update migration stuff
═══════════════════════════════════════════════════════════════════════
-->

Closes #
<!-- Or "Fixes #N" for bugs. Delete if no linked issue. -->

## Context

<!--
  OPTIONAL — delete if the Problem section already explains the why.

  Use when the motivation isn't visible in the diff: strategy changes,
  external constraints (compliance, incident, stakeholder ask), or
  background a reviewer needs before reading the rest.

  1-3 sentences max.
-->


## Problem

<!--
  What is broken, missing, or wrong. State the concrete symptom or gap.
  For bugs: include the mechanism — error code, log line, failing
  behavior — not just "it didn't work".

  1-4 sentences max.
-->


## Goal

<!--
  What the PR achieves. Describe the desired end state, not the
  process to get there.

  1-2 sentences max.
-->


## Scope

<!--
  In scope: what this PR deliberately covers.
  Out of scope: things a reviewer might expect but you intentionally
  skipped. Each needs a one-line reason.

  Delete Out of scope if nothing surprising is excluded.
-->

**In scope**
-

**Out of scope**
- <thing> — <reason, e.g. "follow-up in #123">

## Verification Steps

<!--
  Mix automated and manual checks.

    [x] = already verified — include the command or evidence
    [ ] = still to verify — typically staging/prod checks

  Show WHAT you tested and HOW. Don't list "code review" or
  "CI passes" — those are table stakes.
-->
- [ ]
- [ ]
- [ ]

## Screenshots

<!--
  OPTIONAL — delete if there are no visual changes.

  Include before/after screenshots or recordings for any UI change.
  Annotate when the change is subtle.
-->


<!--
═══════════════════════════════════════════════════════════════════════
  COMPLETE EXAMPLE
═══════════════════════════════════════════════════════════════════════
  Title: fix: skip MFA enforcement for local auth mode

  Fixes #42

  ## Context

  Local dev environment uses a custom `LocalAuth` provider instead of
  Keycloak. Seed users don't have TOTP enrolled since MFA is only
  configured in the Keycloak realm.

  ## Problem

  Seed users are signed out immediately after login. `resolveAuthMode()`
  returns "local" but the MFA guard still runs the TOTP check, which
  fails because no TOTP secret exists for these users.

  ## Goal

  Allow seed users to log in without MFA when running in local auth
  mode. Prod/staging are unaffected — they use `<KeycloakAuth />` and
  never hit this code path.

  ## Scope

  **In scope**
  - Skip TOTP check in `LocalAuth` when auth mode is "local"
  - Add guard clause in `useMfaEnforcement` hook

  **Out of scope**
  - TOTP enrollment flow for local users — not needed, tracked in #58
  - Keycloak MFA config changes — separate concern, different repo

  ## Verification Steps

  - [x] `npx supabase db reset` — seed completes without errors
  - [x] Log in as `admin@local.dev` / `password123` — lands on dashboard
  - [x] `tsc --noEmit` passes clean
  - [ ] Deploy to staging — confirm Keycloak login still enforces MFA

  ## Screenshots

  **Before:** login redirects back to sign-in page
  ![before](url)

  **After:** login lands on dashboard
  ![after](url)
═══════════════════════════════════════════════════════════════════════
-->
