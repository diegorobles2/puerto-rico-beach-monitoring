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

Record the date, browser and version, device/OS, assistive technology (when applicable), and result for each item. Leave an item unchecked until it has been performed and its evidence recorded.

The November 17 entry below reports a manual pass, but does not identify the screen reader, phone devices, or results for individual checks. These checks remain pending evidence verification; this does not establish that they failed or were never performed. Automated Chromium checks do not verify screen-reader behavior or real-phone usability.

- [ ] Screen reader (NVDA + Firefox or VoiceOver + Safari): search, filter, select a beach from the list and from a marker, then hear each card's status, stale warnings, and source links.
- [ ] Screen reader announces loading, error, and "No beaches match your search" status messages without moving focus.
- [ ] 200% browser zoom and 400% zoom at 1280px width: no loss of content or functionality, no two-direction scrolling for text.
- [ ] Windows High Contrast / forced-colors mode: focus ring, markers, and status badges remain visible.
- [ ] Real phone (iOS Safari and Android Chrome): controls are easy to tap, the map pans without trapping page scroll, and the on-screen keyboard does not hide the search box.
- [ ] Status meaning never depends on color alone (water quality, ocean risk, alerts, weather).
- [ ] Reduced motion: no essential information relies on animation.

|   Date   |     Reviewer    |  Browser / device  |     Result / notes     |
|   ---    |       ---       |         ---        |           ---          |
| 11/17/26 | Christian Perez | Fire Fox Developer; version, device/OS, screen reader, and phone details not recorded | Original result: "All manual checks pass." Per-check evidence pending; not a verified pass for the checklist above. |

## Browser-assisted review: November 21, 2026

Inspected genuine local screenshots from branch `issue-43-accessibility`, using the existing synthetic fixtures (Beach 02). Capture: **2026-11-21 21:27:19 UTC / 17:27:19 America/La_Paz**. Environment: Windows, headless Chromium **159.0.8154.6**, Playwright, local production build and preview. No production data was changed. Map tiles are blank fixture images, not evidence of live map imagery.

One temporary Playwright evidence-capture test passed (**1/1**, 35.2 seconds including server startup). It used `e2e/fixtures.ts`, selected Beach 02, measured page overflow, captured the screenshots below, and recorded browser/media observations. The temporary test was removed after capture; it is not part of the committed regression suite. This was browser automation followed by image inspection, not human screen-reader or device testing.

| Check | Observed result | Evidence / limit |
| --- | --- | --- |
| Narrow-screen reflow | Pass for the captured state. At 640px and 320px, page scroll width equaled viewport width. Image review found readable cards and controls with no apparent text clipping. | [640px](accessibility-evidence/reflow-640.png), [320px](accessibility-evidence/reflow-320.png). Resizing is not an actual 200%/400% browser-zoom test; the manual zoom item remains pending. |
| Status meaning without color | Pass for the captured available-data state: water quality says "Suitable" with explanatory text, ocean risk says "high", alerts say "Active alerts", and weather describes the forecast in text. | [Status cards](accessibility-evidence/text-statuses.png). Other states were reviewed in source (`WaterQualityCard`, `OceanRiskCard`, `AlertsCard`, `WeatherCard`), but were not visually captured in this session; the full manual checklist item remains pending. |
| Forced colors | Inconclusive. The media query reported active, but the captured palette and marker computed colors remained the normal colors. The search focus ring was visible. | [Capture](accessibility-evidence/forced-colors.png). This does not verify Windows High Contrast rendering. |
| Reduced motion | The preference query reported `reduce`; zero running animations were observed at the static capture. | [Raw observations](accessibility-evidence/browser-observations.json). Map transitions during interaction were not assessed; the full manual item remains pending. |
| Screen-reader announcements | Not performed. No interactive screen-reader tool was available. | Requires NVDA + Firefox or VoiceOver + Safari; DOM roles do not prove audible announcements. |
| Real phones and on-screen keyboard | Not performed. No physical iOS/Android device was available. | Headless desktop viewport changes do not establish real-phone usability. |

To finish the pending human checks, record the tester and exact browser/OS/device or screen-reader version next to each result. Use a 1280px desktop window at actual 200% and 400% browser zoom; enable Windows High Contrast for the focus/marker checks; use the screen reader to search, select, and hear loading/error/stale messages; and test search, map pan/page scrolling, and the on-screen keyboard on both physical phone platforms.
