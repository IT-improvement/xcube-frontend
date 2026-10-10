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
  basemap: "#7f9a7f"
  ok: "#2e7a3c"
  warn: "#94580a"
  bad: "#b42318"
typography:
  value:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "22px"
    fontWeight: 600
    lineHeight: 1.15
    letterSpacing: "-0.01em"
    fontFeature: "tnum"
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
    fontSize: "12.5px"
    fontWeight: 600
    lineHeight: 1.4
  caption:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.4
  axis:
    fontFamily: "'Pretendard Variable', Pretendard, -apple-system, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif"
    fontSize: "11.5px"
    fontWeight: 500
    lineHeight: 1
    fontFeature: "tnum"
rounded:
  mark: "4px"
  md: "6px"
  lg: "8px"
  round: "50%"
spacing:
  hair: "2px"
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "12px"
  xl: "16px"
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

**Status (checked against the code on 2026-10-10, after UX4):** this system is shipped on every screen. The token values live in one file, `src/styles/fieldbook.css` (`--fb-*`, light on `:root`, dark on `:root[data-theme='dark']`). The Viewer aliases them as `--vx-*` (`viewer.css`). The management screens, auth and landing page (`.xc`) use them directly or through the older names in `src/styles/tokens.css` (`--color-primary` is ink, `--color-mark` is overprint, `--shadow-*` are `none`). The landing page (UX3) and the management screens with the 48px top bar (UX2) were rebuilt on this file; there is no second, blue "SaaS" system any more. Dark theme is offered only in the Viewer (account menu); `.xc` screens stay light even when the Viewer switched the tab to dark.

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
- **Result Teal** (result): AI interface accents, such as the `AI 결과` tag, the run progress bar and the area title icon. **AI Water** (ai-water, `#1f9ae0`, dark `#5cbcf2`): the AI water mask on the map, sent to xcube as a JSON colormap, plus its hatched legend, layer swatch and area bars. It reads as water and is lighter than Data Water (UR-52, UX6). **Basemap Sage** (basemap): the basemap layer swatch.

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

### Named Rules
**The Overprint Rule.** Magenta marks only what the user placed or set in motion: cursor, A/B flags, reticle, chart current point, playing state. If the user did not put it there, it is not magenta.

**The Data Owns the Hues Rule.** Chrome is green-grey and graphite. Blue, teal and sage are spent only on data layers and series.

**The Ink Selection Rule.** Selected, pressed and active controls fill with graphite ink and use on-ink text. There is no blue selection state.

## Typography

**Display Font:** none (the system has no display face)
**Body Font:** Pretendard Variable (with Pretendard, -apple-system, Apple SD Gothic Neo, Noto Sans KR). The global `body` rule in `index.css` still loads the older `Pretendard-Regular` web font; moving it to the variable font is pending (audit 2026-10-10, order 3).

**Character:** A single Korean-first sans set at work-tool sizes. Hierarchy comes from weight (400/500/600, and 700 only on the wordmark and flag letters) and ink step, not from size jumps.

### Hierarchy
- **Value** (600, 22px, 1.15, -0.01em, tabular): the current pixel value in the dock. It drops to 18px below 1024px and to 16px on phones.
- **Title** (600, 15–16px, 1.4): drawer headings, the current date on the staff, tour card titles and empty-state headlines.
- **Body** (400, 14px, 1.55): the base text, set with `word-break: keep-all`. Tour body text uses 1.65.
- **Control** (500–600, 13–13.5px, 1): buttons, tabs, chips, menu items, layer names and breadcrumb dataset.
- **Label** (600, 12.5px, 1.4, ink-2): section titles inside sheets. Labels are sentence case, not uppercase.
- **Caption** (400, 12px, 1.3–1.5, ink-3): hints, metadata, counts and secondary lines in lists.
- **Axis** (500, 11.5px, tabular, ink-3): chart axis labels and staff dates.

### Other screens
- **Management screens** (`tokens.css`): page title 26px/600, section 18px/600, sheet title 15px/600, body 14px/1.55, label 12.5px/600, caption 12px.
- **Landing page** (`landing.css`, own scale): headline `clamp(34px, 5.4vw, 68px)`/600, section `clamp(26px, 3.2vw, 40px)`/600, lead 16–18px/1.7, body 16px/1.7, small 13px. The three scales are not unified yet.
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
- **Rhythm:** a 2px-based scale (2, 4, 6, 8, 10, 12, 14, 16). Section padding is 14px 16px, the floating inset 12px and the control gap 6–8px.
- **Breakpoints:** 1279px (labels collapse to icons, user name hidden), 1159px (status text becomes screen-reader only), 1023px (wordmark hidden, mode labels hidden), 767px (breadcrumb wraps to a second bar row, sheets go full width, the drawer becomes a bottom sheet, the dock restacks so the staff spans full width, and split compare stacks vertically).

### Management screens (app shell)

The signed-in pages (`/app`, data, projects, jobs, fusion) share the Viewer's 48px top bar instead of a side menu: logo with a right rule, text menu (`대시보드` `데이터` `프로젝트` `작업` `수식 융합` `Viewer ↗` in a new tab) where the current item is ink with a 2px ink underline, then `처리 중 n` (only while jobs run), the `데이터 추가` ink button and the account menu. Below 1024px the add button and the user name hide; below 768px the menu becomes a drop-down sheet. The page below is a page header (title, one-line description, actions) over ruled sheets. The dashboard has no KPI tiles or icon cards: one summary line (`내 데이터 n · 공유받음 n · 처리 중 n`), a ruled list of three shortcuts and two ledgers (recent data, recent jobs).

### Landing page

A transparent bar over the hero that takes a surface sheet and a rule once the page scrolls, a large plain headline, then a full-bleed real Viewer capture (Daecheong Lake, source vs AI). Sections are ruled field-book blocks (three ruled lines, one case study next to its result-panel capture, two customer columns, an honest adoption list) with no eyebrows, icon cards or entrance animations. Colour comes only from the captures. Sign-in-aware actions: one ink action per group (`시작하기` or `콘솔로 이동`) with `Viewer 열기` as a line or quiet action (UR-51).

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

Corners are small and squared-off. Flags, tags, badges and inner segments use 4px, controls 6px, and floating sheets and popovers 8px. Only three things are fully round: the play button, the avatar and the pixel reticle, which is a ring with crosshair arms and a white halo. The time staff is drawn from rules: a 1px rule-strong baseline, 1px ink-3 ticks 13px tall, and flags on 2px stems. AI result overlays carry a 135° hatch (12px stripes) in result teal. This hatch is a cartographic fill pattern, not a decorative gradient.

## Components

### Buttons
Words are the controls. Buttons are compact, ruled and inked.
- **Shape:** gently squared (6px), 32px tall, 0 12px padding, 600 13px text, and an icon gap of 6px. Small is 28px; large (landing, auth) is 40px with 14px text. With a coarse pointer or below 768px, buttons grow to 40px (large 44px).
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
- **Select and text field:** surface fill, input-border 1px outline (ink-2 on hover, bad when invalid), 6px radius, 36px tall, 400 14px text. Errors sit under the field in words; there are no browser validation bubbles. The Viewer's own selects still use rule-strong (1.97:1) and should move to input-border (audit 2026-10-10, order 4).
- **Focus:** a 2px ink outline.
- **Checkbox and range:** native controls with `accent-color` set to ink.
- **Breadcrumb selects:** borderless and transparent, with a sunken fill on hover.

### Feedback (management screens)
- **Dialog:** surface, 8px radius, Lift High, opens with opacity and scale .97→1 in about 160ms. Destructive actions (delete, unlink, remove member, cancel job) all use the same confirmation dialog; no browser `confirm`.
- **Toast:** 8px radius, rises 8px in 180ms, leaves after about 3.2s. Errors are inline alerts, not toasts.
- **Skeleton:** flat sunken bars that breathe in opacity. No shimmer gradient.
- **Tags:** 4px radius, words first; tone colours them (`water` for shared and fusion, `result` for AI results).

### Navigation
- **Tabs:** 600 13px in ink-3. The selected tab is ink with a 2px ink underline that sits on the sheet's bottom rule.
- **Top bar:** a 48px surface bar with a bottom rule. Status reads in words with a coloured icon (ok, warn spinning, bad). Below 1160px the words become screen-reader text.

### Time Staff (signature)
A ruled staff in the dock's plot column. Each tick is one acquisition, and its date sits beneath in axis type. The A cursor is a filled overprint flag on a 2px stem. It slides 160ms ease-out and tracks playback and ←/→. In compare modes a hollow B flag (surface fill, 1.5px overprint inset ring) sits on the same staff. A transparent native range input spans the staff for pointer and keyboard use, and its focus ring is drawn on the A flag. Without compare, the cursor collapses to a bare 4px tick.

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
