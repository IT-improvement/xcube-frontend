---
name: XCube
description: Satellite time series on a map, read like a surveyor's field book.
colors:
  ground: "#f3f5f2"
  surface: "#ffffff"
  sunken: "#eceee9"
  rule: "#d8ddd5"
  rule-strong: "#b3bbb0"
  input-border: "#7f8a81"
  ink: "#1b201d"
  ink-2: "#454d47"
  ink-3: "#5f6862"
  on-ink: "#ffffff"
  overprint: "#b8166f"
  overprint-text: "#a3135f"
  overprint-soft: "#f8e3ee"
  water: "#1769aa"
  water-soft: "#e2eef8"
  result: "#0f7a6e"
  ai-water: "#3fb4ff"
  basemap: "#7f9a7f"
  map-empty: "#e2eaec"
  halo: "#ffffff"
  channel-red: "#d0342c"
  channel-green: "#2e9d4a"
  channel-blue: "#2f6fd0"
  class-gained: "#1a9850"
  class-lost: "#d73027"
  class-only-a: "#7b3294"
  class-only-b: "#e08214"
  class-missed: "#fdae61"
  ok: "#2e7a3c"
  warn: "#94580a"
  bad: "#b42318"
typography:
  page-title:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "26px"
    fontWeight: 600
    lineHeight: 1.3
  section:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "18px"
    fontWeight: 600
    lineHeight: 1.4
  value:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
  title-lg:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.3
  title:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  control:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1
  label:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "13px"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  axis:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "tnum"
  mono:
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.55
rounded:
  hair: "2px"
  mark: "4px"
  md: "6px"
  lg: "8px"
  round: "50%"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  10: "10px"
  lg: "12px"
  14: "14px"
  xl: "16px"
  20: "20px"
  24: "24px"
  32: "32px"
  40: "40px"
  56: "56px"
  80: "80px"
components:
  button-ink:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-line:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  button-line-hover:
    backgroundColor: "{colors.sunken}"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    typography: "{typography.control}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "32px"
  icon-button:
    backgroundColor: "transparent"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.md}"
    size: "32px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.md}"
    padding: "0 11px"
    height: "30px"
  chip-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  segment-pressed:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.mark}"
    height: "28px"
  field-select:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.md}"
    padding: "0 10px"
    height: "36px"
  play-button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.round}"
    size: "36px"
  play-button-playing:
    backgroundColor: "{colors.overprint}"
  flag-a:
    backgroundColor: "{colors.overprint}"
    textColor: "{colors.on-ink}"
    rounded: "{rounded.mark}"
    size: "18px"
  flag-b:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.overprint-text}"
    rounded: "{rounded.mark}"
    size: "18px"
  step-num:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.mark}"
    size: "22px"
  step-num-current:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.on-ink}"
  avatar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.round}"
    size: "28px"
  floating-sheet:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
  top-bar:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    height: "48px"
    padding: "0 10px 0 14px"
---

# Design System: XCube

## Overview

**Creative North Star: "The Survey Field Book"**

XCube reads like a surveyor's field book laid over the map. The ground is cool green-grey paper. Sheets are white and separated by 1px ruling lines, not cards. Text is graphite ink, and a selection is filled with that ink. The map and the data carry the colour. The chrome stays quiet enough that a long session in front of the map never competes with the imagery.

One overprint magenta is reserved for marks the user places: the time cursor, the A/B compare flags, the pixel reticle and the chart's current point. It works like the overprint on an orienteering map, a single colour printed over the terrain. Water blue belongs to data series, teal to AI results and sage to the basemap. State is always named in words ("내 시각화 서버 연결됨"), and an icon only reinforces it. Every date, coordinate and value is set in tabular figures so columns of numbers hold still while playback runs.

The density is high and work-tool calm. A 48px bar sits on top, the map fills the body, sheets and tools float over the map, and a ruled dock holds the pixel reading and the time staff on one shared plot column.

**Status (checked against the code on 2026-10-27, after UXF1; VX1 on 2026-10-22, UX4C on 2026-10-17):** this system is shipped on every screen. The token values live in one file, `src/styles/fieldbook.css` (`--fb-*`, light on `:root`, dark on `:root[data-theme='dark']`). The type ramp is in the same file as `--fb-text-*` font shorthands (h1, h2, value, title, body, control, label, caption, axis), with `--fb-radius-hair` for thin bars and `--fb-mono` for formulas. The Viewer aliases the colours as `--vx-*` (`viewer.css`). The management screens, auth and landing page (`.xc`) use them directly or through the older names in `src/styles/tokens.css` (`--color-primary` is ink, `--color-mark` is overprint, `--shadow-*` are `none`). The landing page (UX3) and the management screens with the 48px top bar (UX2) were rebuilt on this file; there is no second, blue "SaaS" system any more. Dark theme is offered only in the Viewer (account menu); `.xc` screens stay light even when the Viewer switched the tab to dark. The Viewer's dark theme was checked by capture in UXF1 (every panel, 1440 and 390): text on sheets 4.5:1 or more; the OpenLayers credit line gets a surface backing and ink text because its own grey on white fell to 3.5:1 over dark imagery.

**Key Characteristics:**
- Ruled, not carded: 1px rules divide every docked region.
- One reserved mark colour (overprint magenta) for user-placed marks only.
- Selection is graphite ink fill, never a brand hue.
- Data owns the hues: water, result and basemap each have one colour.
- Pretendard throughout, with tabular figures for every number.
- State is named in words, and the icon is secondary.
- Light and dark themes share one token set (`fieldbook.css`: `:root` and `:root[data-theme='dark']`).

## Colors

The palette is green-grey paper and graphite ink, with three data hues and one overprint colour. Values below are the light theme. Dark-theme counterparts are listed in the sidecar (`.impeccable/design.json`, `colorMeta.*.dark`).

### Primary
- **Overprint Magenta** (overprint): the reserved mark colour. Use it for the time cursor (A flag), the hollow B flag outline, the pixel marker and keyboard reticle, the chart cursor line and current point, the playing state of the play button, and the area of interest the user draws or picks (add-data map, bbox mini maps). Never use it for navigation, selection or decoration.
- **Overprint Text** (overprint-text): a darker step used where the overprint sets text on white, as in the B flag letter.
- **Overprint Wash** (overprint-soft): the text-selection highlight only.

### Secondary
- **Water Blue** (water): the colour of data. It is used for the time-series line and points, the source-layer swatch, and the loading pulse. **Water Wash** (water-soft) backs the variable tag and info notes.

### Tertiary
- **Result Teal** (result): AI interface accents, such as the `AI 결과` tag, the run progress bar and the area title icon. **AI Water** (ai-water, `#3fb4ff`, dark `#7fcbff`): the AI water mask on the map, sent to xcube as a JSON colormap, plus its hatched legend, layer swatch and area bars. It reads as water and is lighter than Data Water (UR-52, UX6). **Basemap Sage** (basemap): the basemap layer swatch.

### Neutral
- **Field-Book Ground** (ground): the app background, the map's empty state and the scope strip inside popovers.
- **Sheet White** (surface): the top bar, dock, floating sheets, popovers and line buttons.
- **Sunken Paper** (sunken): hover fill, pressed line buttons, active list options and count badges.
- **Ruling Line** (rule): every 1px divider between regions, rows and sections.
- **Strong Rule** (rule-strong): control outlines next to a text label (line buttons, chips, segmented groups), the time-staff baseline and disabled icon colour.
- **Input Border** (input-border): text field and select outlines (3:1 or more on surface, ground and sunken). The rule colours are too light for an input outline.
- **Graphite Ink** (ink): primary text, selected and pressed fills, focus outline and checkbox/range accent.
- **Ink 2 / Ink 3** (ink-2, ink-3): secondary text, and then tertiary text (labels, axis, staff dates, placeholders).
- **Status trio** (ok, warn, bad): server and job states. They always appear next to words.

### Utility and data colours
- **Map Empty** (map-empty, dark `#5b6365`): the map area before tiles arrive, in the Viewer and the small maps (add data, detail).
- **Halo** (halo): white on imagery in both themes — the reticle ring, the probe focus ring and the swipe line.
- **Channel stripes** (channel-red, channel-green, channel-blue): the RGB composite swatch in the layer list.
- **Comparison classes** (S9 and the Viewer compare legend): kept/both/TP = ai-water, gained = class-gained, lost/FP = class-lost, only A = class-only-a, only B = class-only-b, FN = class-missed. These are contract colours sent to xcube as a colormap (`src/api/compare.ts`), so they stay literal there and the legend reads them from the class list.

### Named Rules
**The Overprint Rule.** Magenta marks only what the user placed or set in motion: cursor, A/B flags, reticle, chart current point, playing state. If the user did not put it there, it is not magenta.

**The Data Owns the Hues Rule.** Chrome is green-grey and graphite. Blue, teal and sage are spent only on data layers and series.

**The Ink Selection Rule.** Selected, pressed and active controls fill with graphite ink and use on-ink text. There is no blue selection state.

## Typography

**Display Font:** none (the system has no display face)
**Body Font:** Pretendard Variable (with Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR), loaded in `public/index.html`; `index.css` uses `--fb-font`.
**Mono:** `--fb-mono` (ui-monospace, SFMono-Regular, Menlo) only for formulas and code in fusion (S12).

**Character:** A single Korean-first sans set at work-tool sizes. Hierarchy comes from weight (400/500/600, and 700 only on the wordmark and on letter or number marks set on a filled square: A/B flags, fusion binding letters, compare step numbers, onboarding numbers, the notification count) and ink step, not from size jumps.

**The ramp (UX4C, 2026-10-17; 13px floor UXF1, 2026-10-27).** Sizes: 13 · 14 · 15 · 16 · 18 · 22 · 26 px (landing keeps its own `--lp-*` clamp scale). **13px is the floor for every text on every screen** — app, auth, Viewer (VX1, 2026-10-22) and the admin console: label, caption and axis are 13px, and there is no 10–12.5 px any more. The only text below it is inside the exported PNG sheet (`mapPng.ts`, a picture, not the interface) and OpenLayers' own credit line, which `viewer.css`/`app.css` lift to 13px too. Line heights: 1 (one-line controls), 1.15 (value), 1.3 (tight two-line titles, small meta), 1.4 (titles, labels, captions), 1.55 (body and multi-line secondary text), 1.65 (tour and auth reading text). Where a declaration matches a role exactly it uses the token (`font: var(--fb-text-body)` and so on); the older `--text-*` names in `tokens.css` now point at the same tokens.

### Hierarchy
- **Value** (600, 22px, 1.15, -0.01em, tabular): the current pixel value in the dock. It drops to 18px below 1024px and to 16px on phones.
- **Title** (600, 15px, 1.4; 16px/1.3 for drawer and tour headlines): drawer headings, the current date on the staff, tour card titles and empty-state headlines.
- **Body** (400, 14px, 1.55): the base text, set with `word-break: keep-all`. Tour body text uses 1.65.
- **Control** (500–600, 13px, 1): buttons, tabs, chips, menu items, layer names and breadcrumb dataset.
- **Label** (600, 13px, 1.4, ink-2): section titles inside sheets. Labels are sentence case, not uppercase.
- **Caption** (400, 13px, 1.45, ink-3; ink-2 inside Viewer panels): hints, metadata, counts and secondary lines in lists.
- **Axis** (500, 13px, tabular, ink-3): chart axis labels and staff dates. Where 13px dates would collide (phone time staff), only the first and last date are written and every tick stays.

### Other screens
- **Management and auth screens**: page title 26px/600 (`--fb-text-h1`, the auth form title too), section 18px/600 (`--fb-text-h2`, also the project intro title), sheet title 15px/600, body 14px/1.55, label 13px/600, caption 13px/1.45.
- **Landing page** (`landing.css`, own scale): headline `clamp(34px, 5.4vw, 68px)`/600, section `clamp(26px, 3.2vw, 40px)`/600, lead 16–18px/1.7, body 16px/1.7, small 13px. The landing scale is intentionally larger (Persuade surface) and stays separate; the app, auth and Viewer share one ramp.
- Inputs on phones use 16px text so iOS does not zoom.

### Named Rules
**The Tabular Rule.** Every date, coordinate, count and value uses `font-variant-numeric: tabular-nums`, so numbers do not shift while playback steps.

**The Keep-All Rule.** Korean text never breaks mid-word (`word-break: keep-all; overflow-wrap: break-word`).

## Layout

### Viewer

The Viewer layout is a full-viewport column (`100dvh`, min 520px). It stacks a 48px top bar, a map body that fills the remaining space, and a docked bottom panel.

- **Top bar:** brand (with a right rule), a breadcrumb of project and dataset selects separated by a light slash, then status in words, actions and one account cluster.
- **Map body:** sheets and tools float 12px in from the map edges (8px on phones). The layer sheet (312px) sits top-left, map tools top-right, and the analysis drawer (340px) on the right.
- **Dock:** two rows share the grid `lead | plot | tail`. Lead is 276px and tail 344px; they shrink to 252/312px below 1280px and 232/200px below 1024px. The plot column has fixed insets of 56px left and 16px right, so chart points sit exactly over the time-staff ticks. The pixel reading row is `clamp(196px, 26dvh, 252px)`, or 44px when collapsed. The time-staff row is 72px, or 84px in compare modes.
- **Rhythm:** a 2px-based scale (2, 4, 6, 8, 10, 12, 14, 16), then the management steps 20, 24, 32, 40, 56, 80 (`--space-*`). Odd paddings (3, 5, 7, 9 px) were removed in UX4C; the only odd values left compensate a 1px border so the box lands on the scale (chip `0 11px`, tool groups `3px`), centre a mark (`margin: -15px`) or nudge an icon optically (1–3px `margin-top`). Section padding is 14px 16px, the floating inset 12px and the control gap 6–8px.
- **Breakpoints:** 1279px (labels collapse to icons, user name hidden), 1159px (status text becomes screen-reader only), 1023px (wordmark hidden, mode labels hidden), 767px (breadcrumb wraps to a second bar row, sheets go full width, the drawer becomes a bottom sheet, the dock restacks so the staff spans full width, and split compare stacks vertically).

### Management screens (app shell)

The signed-in pages (`/app`, data, projects, jobs, fusion) share the Viewer's 48px top bar instead of a side menu: logo with a right rule, text menu (`대시보드` `데이터` `프로젝트` `작업` `수식 융합` `Viewer ↗` in a new tab) where the current item is ink with a 2px ink underline, then `처리 중 n` (only while jobs run), the `데이터 추가` ink button and the account menu. Below 1024px the add button and the user name hide; below 768px the menu becomes a drop-down sheet. The page below is a page header (title, one-line description, actions) over ruled sheets. The dashboard has no KPI tiles or icon cards: one summary line (`내 데이터 n · 공유받음 n · 처리 중 n`), a ruled list of three shortcuts and two ledgers (recent data, recent jobs).

### Landing page

A transparent bar over the hero that takes a surface sheet and a rule once the page scrolls, a large plain headline, then a full-bleed real Viewer capture (Daecheong Lake, source vs AI). Sections are ruled field-book blocks (three ruled lines, one case study next to its result-panel capture, two customer columns, an honest adoption list) with no eyebrows, icon cards or entrance animations. Colour comes only from the captures. Sign-in-aware actions: one ink action per group (`시작하기` or `콘솔로 이동`) with `Viewer 열기` as a line or quiet action (UR-51).

### Admin console (separate app, `xcube-admin-frontend`)

The admin console (`/admin`, A0–A7) copies `fieldbook.css`, `tokens.css` and the shared `ui.css`/`kit.css`/`kit.tsx` from this repo (each file names its source and the resync date, last 2026-10-27 UXF1; re-copy them when the system changes). Its own `admin.css` follows the same ramp, radii and spacing, with a 232px ruled sidebar instead of the top-bar menu. Page and login titles use `--fb-text-h1` like the app. Since UXF1 the overview reads like the app dashboard: no boxed KPI tiles — the four figures sit in a ruled ledger (ink rule on top, rules between, values at the page-title size 26px instead of the earlier 38px), and each section is a section title over an ink rule with ruled rows on the ground. The list screens (users, data, jobs, access, system, audit) keep the ruled white sheet, as the app's list screens (data, jobs) do. The top bar shows the account mark with the name. Role changes say the change (`{from} → {to}`) before it is made and warn when the admin role is given or taken. One admin-only measure is deliberate: chart series B `#c27a12` next to water for series A (checked for colour-vision difference and 3:1 contrast). Rows are at least 52px for readability.

### Named Rules
**The Shared Plot Column Rule.** Anything on the time axis (chart cursor, points, staff ticks, flags) is positioned on the same plot column with the same insets. A time-aware element never gets its own axis.

## Elevation & Depth

The system is a hybrid. Docked chrome (top bar, dock, sections, rows) is flat and divided by 1px rules. Shadows appear only on surfaces that float over the map, because they must separate from the imagery under them. Inside a floating sheet, structure goes back to rules.

### Shadow Vocabulary
- **Lift** (`box-shadow: 0 1px 2px rgba(27,32,29,0.07), 0 6px 16px rgba(27,32,29,0.09)`): resting floating elements over the map. These are the layer sheet, map tool groups, the drawer, toasts, the empty state, map labels and the swipe handle.
- **Lift High** (`box-shadow: 0 2px 4px rgba(27,32,29,0.08), 0 16px 36px rgba(27,32,29,0.16)`): popovers and menus that open over other chrome. These are the dataset popover, project menu, account menu, playback options and tour card.

### Named Rules
**The Float-Only Shadow Rule.** A surface casts a shadow only if it floats over the map or opens over chrome. Docked regions are separated by rules, never shadows.

## Shapes

Corners are small and squared-off. Thin bars, meters, colour swatches and staff stems use 2px (`--fb-radius-hair`), flags, tags, badges, count badges and inner segments 4px, controls 6px, and floating sheets and popovers 8px. There are no pill shapes (the Viewer account button and the notification count were pills until UX4C). Only three things are fully round: the play button, the avatar and the pixel reticle, which is a ring with crosshair arms and a white halo. The time staff is drawn from rules: a 1px rule-strong baseline, 1px ink-3 ticks 13px tall, and flags on 2px stems. AI result overlays carry a 135° hatch (12px stripes) in result teal. This hatch is a cartographic fill pattern, not a decorative gradient.

## Components

### Buttons
Words are the controls. Buttons are compact, ruled and inked.
- **Shape:** gently squared (6px), 32px tall, 0 12px padding, 600 13px text, and an icon gap of 6px. Small is 28px; large (landing, auth) is 40px with 14px text. With a coarse pointer or below 768px, every press target is at least 44px (UXF1: buttons of all sizes, icon buttons, selects, inputs, segments, tabs, the language switch, the brand link, standalone links such as `← 데이터`, the dashboard counts and `알림 설정`).
- **Ink (primary):** ink fill with on-ink text. On hover it mixes 14% toward surface.
- **Line:** surface fill with a rule-strong outline. Hover is sunken. When pressed it takes an ink outline and a sunken fill.
- **Quiet:** transparent with ink-2 text. Hover is sunken with ink text.
- **Icon button:** 32px square, transparent, ink-2. Hover is sunken. Disabled uses the rule-strong colour.
- **Focus:** a 2px ink outline with 2px offset on every interactive element.
- **Disabled:** sunken fill, rule outline and ink-3 text, with a not-allowed cursor.
- **Danger:** bad fill with white text, only inside a destructive confirmation dialog.
- **Motion:** background, border and colour transitions of 140ms ease-out, and a press scale of 0.97 (`--fb-press`, `--fb-ease-out`). These are zeroed under reduced motion.

### Chips and Segmented Controls
- **Band chips:** 30px tall with a min width of 44px, surface fill and a rule-strong outline. When selected they fill with ink.
- **Segmented groups** (display mode, speed): a rule-strong framed track with 2px padding and 4px-radius segments. The pressed segment fills with ink.

### Cards / Containers
There are no cards. Floating sheets (layer sheet, drawer, popovers) use the surface colour, an 8px radius, a 1px rule border and Lift or Lift High. Inside them, sections are separated by rules (14px 16px padding) and key/value lists by row rules.

### Inputs / Fields
- **Select and text field:** surface fill, input-border 1px outline (ink-2 on hover, bad when invalid), 6px radius, 36px tall, 400 14px text, in the Viewer too. Errors sit under the field in words; there are no browser validation bubbles.
- **Focus:** a 2px ink outline.
- **Checkbox and range:** native controls with `accent-color` set to ink.
- **Breadcrumb selects:** borderless and transparent, with a sunken fill on hover.

### Feedback (management screens)
- **Dialog:** surface, 8px radius, Lift High, opens with opacity and scale .97→1 in about 160ms. Destructive actions (delete, unlink, remove member, cancel job) all use the same confirmation dialog; no browser `confirm`.
- **Toast:** 8px radius, rises 8px in 180ms, leaves after about 3.2s. Errors are inline alerts, not toasts.
- **Skeleton:** flat sunken bars that breathe in opacity. No shimmer gradient.
- **Tags:** 20px tall, 4px radius, 600 12px, words first; tone colours them (`water` for shared and fusion, `result` for AI results). The kind tag on a data card and the Viewer's variable and area tags use the same 20px box.
- **Progress bars and meters:** 4px (jobs, AI run, wizard) or 8px (storage, fusion quota) tall, sunken with a 1px rule, 2px radius, filled in ink (warn/bad at limits). The fill moves by `transform: scaleX`, never by animating width.
- **Menus:** account menu items are 36px rows with a 10px icon gap in both the app and the Viewer.
- **Account mark** (`.xc-avatar`, UXF1): one 28px ring — surface fill, 1px ink-2 ring, the name's first letter in ink 600 13px — in the app top bar, the Viewer top bar and the admin console top bar. It sits in a 36px quiet button (app, Viewer) or next to the name (admin). It is quiet on purpose: the ink fill belongs to the `데이터 추가` action next to it.
- **Leaving with unsaved input** (UXF1): 데이터 추가 (from step 2) and 수식 융합 ask before an in-app link, the account menu's `시작 안내 다시 보기` or `로그아웃` leaves them — the shared confirmation dialog, `이 화면을 떠날까요?` with `계속 입력하기` (safe, focused) and `떠나기` (danger). Closing the tab keeps the browser's own warning. Back/forward are not guarded.

### Steps (UXF1)
One shape for steps on every screen.
- **Number mark** (`StepNum`, `.xc-step-num`): a 22px square with a 4px radius and the step number in 700 13px tabular. Upcoming: surface with a 1px rule-strong ring and ink-2 number. Current: ink fill, on-ink number. Done: a 1px ink-2 ring and a check in ink, with `완료` for screen readers. Used by the add-data and fusion flows, the numbered sections of 비교 분석 (always "current": all three are on screen at once), the dashboard's 시작하기 list (upcoming or done) and, at 18px, the job stages in the job center.
- **Step track** (`StepTrack`, `.xc-steps`): for a flow shown one step at a time (데이터 추가, 수식 융합). A staff, like the time staff: a 1px rule-strong line on top, one equal column per step with the number mark and a 600 13px word. A done step lays a 2px ink-2 rule over its column, the current one a 2px ink rule. No boxes. Below 768px only the current step keeps its word on screen (it takes two columns); the others keep it for screen readers.

### Navigation
- **Tabs:** 600 13px in ink-3. The selected tab is ink with a 2px ink underline that sits on the sheet's bottom rule.
- **Top bar:** a 48px surface bar with a bottom rule. Status reads in words with a coloured icon (ok, warn spinning, bad). Below 1160px the words become screen-reader text.

### Viewer tool panels (VX1, 2026-10-22)
The five panels on the right rail (레이어, 영역 통계, AI 수체 추출, 결과 비교, 내보내기) share one frame: **title → one-line lead (what the panel does; `aria-describedby`) → one main action → results → folded details**. Details fold into `PanelMore` (`.vx-more`, a native `<details>` row, 44px on touch) whose summary says what is inside and its current value (`계산 설정  원본 영상 · blue · 모든 시점 4개`). A rail tool that cannot be used yet says why next to the rail with the next step (`데이터 고르기`). On phones (≤767px) the panel is a bottom sheet with two heights — half (`min(32dvh, 290px)`, map and comparison layer stay visible) and full — switched by a 72×44 grip button (`aria-pressed`), never by dragging. While a panel is open the phone dock keeps only the time staff. 내보내기 offers its four formats as large radio choices with one line each (PNG first) and one button named by the action (`PNG로 저장`, `{형식} 만들기`). Closing it while exports are still being made asks whether they keep going on the server (`계속 만들고 닫기`, focused) or are cancelled (`취소하고 닫기`) — UXF1.

### Time Staff (signature)
A ruled staff in the dock's plot column. Each tick is one acquisition, and its date sits beneath in axis type. The A cursor is a filled overprint flag on a 2px stem. It slides 160ms ease-out and tracks playback and ←/→. In compare modes a hollow B flag (surface fill, 1.5px overprint inset ring) sits on the same staff. A transparent native range input spans the staff for pointer and keyboard use, and its focus ring is drawn on the A flag. Without compare, the cursor collapses to a bare 4px tick. With a finger pointer at 768px and wider (tablets, touch laptops) the `n / m` count sits under the date, because the 44px player leaves no room beside it. A new date is shown on the map only once all its tiles are drawn (UR-66), so while it loads the previous date stays whole and `불러오는 중…` (spinner, 600 13px ink-2) sits beside the date in the dock; on phones the words wrap under the date instead of hiding (UXF1). `?t=` and `?b=` match a dataset time written with or without milliseconds or zone, or the same day (UXF1).

### Pixel Reading
This row sits above the staff. Lead holds the reticle-icon title, the variable tag (water-soft) and coordinate rows. Plot holds the chart: water line 2px, points with a surface stroke, a dashed overprint cursor, an overprint current point, rule gridlines and a dashed zero line. Tail holds the current value in Value type.

## Do's and Don'ts

### Do:
- **Do** separate docked regions, rows and sections with 1px rule lines (rule) instead of cards or shadows.
- **Do** fill selected, pressed and active controls with graphite ink (ink / on-ink).
- **Do** reserve overprint magenta (overprint) for user-placed marks: cursor, A/B flags, reticle, chart current point, playing state.
- **Do** set every date, coordinate and value in tabular figures.
- **Do** name state in words next to any status icon or colour.
- **Do** place any time-aware element on the shared plot column (56px / 16px insets).
- **Do** give shadows (Lift, Lift High) only to surfaces floating over the map or opening over chrome.
- **Do** define both themes through the `--fb-*` tokens in `fieldbook.css`. Never hard-code a light-only value.

### Don't:
- **Don't** use magenta for navigation, selection, headings, links or decoration.
- **Don't** use a blue selection or primary-button state. Blue is water and data.
- **Don't** use decorative gradients or glow. The only gradient in the system is the result-layer hatch pattern.
- **Don't** wrap content in shadowed cards inside docked regions.
- **Don't** give time-aware elements a separate axis or slider of their own.
- **Don't** signal state with a coloured dot or icon alone.
