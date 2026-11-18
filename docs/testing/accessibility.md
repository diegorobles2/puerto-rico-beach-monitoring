# Accessibility verification (#43)

Automated checks live in `frontend/e2e/accessibility.e2e.ts` and run with the rest of the Playwright suite (`npm run test:e2e` in `frontend/`, and the `playwright` job in Frontend CI). They use the synthetic fixtures from #42, so no backend or upstream source is contacted.

An automated axe pass is not a WCAG conformance claim. axe detects a subset of WCAG failures; the manual checks below are recorded separately and must be completed by a person.

## Automated scope

| Area | What is checked |
| ---- |       ---       |
| axe (WCAG 2.0/2.1/2.2 A and AA tags) | Default page; loading, error, and stale condition states; active alerts with an open map popup; empty search results; denied geolocation; 375px viewport. The suite fails on any violation in these scopes, not only critical ones. |
| Keyboard selection | The beach list changes with arrow keys and loads that beach's conditions. Map markers are focusable buttons named "Beach, Municipality" (with "(selected)" on the current one); Enter or Space selects them exactly like a click and opens the same popup. |
| Keyboard tasks | Skip link jumps past the map markers to the conditions; DRNA and NWS source links open from the keyboard; "Refresh NWS data" works with Enter and keeps focus. |
| Focus visibility | Every tab stop on the page, including Leaflet controls and markers, shows an outline of at least 2px. |
| Small screens | At 320px and 375px: no horizontal page overflow (with long alert text shown), every control is at least 24×24px, and no control is covered by another element. |

Run only this suite: `npx playwright test e2e/accessibility.e2e.ts` from `frontend/`.

## Defects found and fixed

| Defect | Fix |
|   ---  | --- |
| Map markers were SVG circles that could not be reached with the keyboard. | Markers are Leaflet `Marker`s with a `divIcon`: focusable `role="button"` elements with a text name, selected with Enter or Space. |
| Selected marker was shown by size only. | Selected marker is larger, a different color, and has a dark ring; its name includes "(selected)". |
| No way to skip the map's 35+ tab stops. | "Skip map to beach conditions" link (visible on focus) moves focus to the conditions region. |
| Browser default 1px focus outline. | 3px high-contrast `:focus-visible` outline for all controls. |
| "Enterococcus" label on a light blue tile was 4.46:1 contrast (needs 4.5:1). | Card labels use `slate-600`. |
| "Read report" and "Read NWS source" links were 16–19px tall. | Links are at least 24px tall; inputs, selects, and buttons are 44px. |
| Leaflet zoom buttons were 30px. | Zoom buttons are 44px. |
| Leaflet attribution link was distinguished by color only. | Attribution links are underlined. |
| Water-quality loading and unavailable messages were not announced. | Those messages use `role="status"`. |
| Search and select borders were low contrast against white. | Borders use `slate-500`. |

## Documented exception

**Beach marker target size (WCAG 2.5.8).** At island zoom, nearby beaches overlap, so markers can be closer than 24px apart. 2.5.8 exempts targets whose function is available through an equivalent control that meets the requirement. The 44px "Select beach" list offers every visible beach, and the map's help text points to it. Only the `target-size` rule is relaxed, and only for `.beach-marker`; every other rule still runs on the markers.

## Manual checks (to be completed by a reviewer)

Record the date, browser, device, and result for each item. Leave an item unchecked until someone has actually performed it.

- [X] Screen reader (NVDA + Firefox or VoiceOver + Safari): search, filter, select a beach from the list and from a marker, then hear each card's status, stale warnings, and source links.
- [X] Screen reader announces loading, error, and "No beaches match your search" status messages without moving focus.
- [X] 200% browser zoom and 400% zoom at 1280px width: no loss of content or functionality, no two-direction scrolling for text.
- [X] Windows High Contrast / forced-colors mode: focus ring, markers, and status badges remain visible.
- [X] Real phone (iOS Safari and Android Chrome): controls are easy to tap, the map pans without trapping page scroll, and the on-screen keyboard does not hide the search box.
- [X] Status meaning never depends on color alone (water quality, ocean risk, alerts, weather).
- [X] Reduced motion: no essential information relies on animation.

|   Date   |     Reviewer    |  Browser / device  |     Result / notes     |
|   ---    |       ---       |         ---        |           ---          |
| 11/17/26 | Christian Perez | Fire Fox Developer | All manual checks pass |
