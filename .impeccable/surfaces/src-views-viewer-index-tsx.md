---
version: 1
slug: "src-views-viewer-index-tsx"
primary_target: "src/views/Viewer/index.tsx"
related_targets: []
---

# Viewer surface brief

Scope: `/app/viewer` (src/views/Viewer). Visitor mode: **Operate**.

Audience and job: 시·군·구 담당자 and water researchers reading how a reservoir, river or coast changed between satellite acquisitions, then querying a pixel's full time series. Long, map-centred sessions on 1280–1920 px desktops; phones only view.

Constraints: every existing Viewer function, accessible name and URL state stays; layout and design only. No HTML comps (project rule) — build path is code-led. Korean typography (keep-all), WCAG 2.2 AA, reduced motion, dark mode.

## Direction contract

THESIS: The Viewer is a surveyor's field book laid over the map: one ruled time staff that the chart and the playback share, and one overprint colour reserved for the marks the user makes. It refuses the category default of a blue SaaS toolbar stack with a slider, a separate chart card and a floating mode switch.

OWN-WORLD: Field-book paper ground (cool green-grey #f3f5f2), white sheets, 1px ruling lines (#d8ddd5) instead of shadows and cards, graphite ink text (#1b201d) and graphite-filled selection. Data owns the hues: water blue for series. A single overprint magenta (#b8166f) marks only what the user placed: the time cursor, A/B flags, the pixel reticle. Pretendard with tabular figures for every date, coordinate and value. Radii 4–6px, no gradients, no glow.

STORY: The visitor sees where they are as a breadcrumb (프로젝트 / 데이터), reads the date of the scene under the map, steps or plays through acquisitions, marks a point (mouse or keyboard reticle) and reads its whole series on the same time axis; to compare, A and B appear as flags on that same staff.

FIRST VIEWPORT: 48px quiet bar (brand, folder menu + project / dataset breadcrumb, status in words, data add, AI, help, one user menu). Map fills everything else. Layer sheet floats top-left over the map (closable), map tools float top-right. Bottom dock: pixel reading row (record | chart | current value) above the time-staff row (player + date | ruled staff with ticks, cursor and A/B flags | display mode + options); both rows share one plot column so chart points sit over their ticks.

FORM: Survey field book (측량 야장) — position 7 of the grounded list; seed 427eeb9c. Raises: orienteering overprint (reserved mark colour over terrain); centre-rail setting (1px rules, states as marks); transit diagram (chosen series full ink, rest recede); metro (chrome deleted, words are the controls); datamatics (tabular numerics density); gate board (state named in words, never a dot alone).

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Signature interaction
The time staff: the ruler ticks are acquisitions; the overprint cursor (A) moves with playback and ←/→; in compare modes a hollow B flag sits on the same staff; the pixel chart above uses the same plot column so its cursor and points align with the staff ticks.

## Unresolved
- Landing page redesign comes later and should inherit this world.
