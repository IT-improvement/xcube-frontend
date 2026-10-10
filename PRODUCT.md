# Product

XCube turns satellite imagery (GeoTIFF/CAS500, Shapefile, Google Earth Engine) into chunk-compressed Zarr datacubes. It then lets people browse those datacubes as time series on a map, combine them with formulas, and extract and compare water bodies with AI.

## Platform

web

## Stack

React 19, TypeScript, React Router 7, OpenLayers 10 (map), lucide-react icons, CRA build, Jest + Testing Library. Design tokens live in `src/styles/fieldbook.css` (`--fb-*`, the "측량 야장" system in DESIGN.md, light and dark). The Viewer aliases them as `--vx-*`, and `src/styles/tokens.css` keeps the older `--color-*` / `--text-*` / `--space-*` names mapped onto them for the management screens. Shared components are in `src/components/ui` (`index.tsx`, `kit.tsx`). The font is Pretendard Variable. Tiles come from xcube-server directly (`tileBaseUrl`); the backend is a set of services (auth, backoffice, generation, analysis, AI) with Python workers for Zarr work. Ports and URLs come from environment variables.

## Users

- **Local-government officers (시·군·구 담당자):** non-specialists with small budgets who need to see how rivers and reservoirs change over time and put the result in a report. They read Korean, are not GIS experts, and use a desktop browser at work.
- **Companies with large satellite archives:** they want storage reduced and only the area and time they need, read quickly.
- **Water-resources researchers:** they compare seasons and years for the same lake, read pixel time series, and run fusion formulas and AI extraction. They are expert and keyboard-friendly, and they spend long sessions in the Viewer.

## Product Purpose

Make satellite time series usable without GIS expertise. A visitor should go from "I have imagery" to "I can see how the water changed, and show it to someone" in one place.

## Positioning

A Korean-first, practical analysis tool for public and enterprise water monitoring. It is not a flashy AI demo, a generic BI dashboard or a desktop GIS replacement.

## Operating Context

- Office desktops at 1280–1920 px are the main setting, and laptops are common. Phones are used for viewing results only.
- Sessions in the Viewer are long and map-centred. Landing visits are short and are about evaluating a purchase.
- Data is mostly CAS500, Sentinel-2 and Landsat over Korean rivers, reservoirs and Jeju.

## Capabilities and Constraints

- **Viewer (must keep):**
  - dataset/project selection, band/RGB layers and opacity;
  - timeline playback (speed, loop, ←/→, Space);
  - pixel query with a full time-series chart;
  - compare modes (single / swipe / side-by-side, time A vs B);
  - personal visualization-server status, an AI drawer and a feature tour;
  - URL state.

  Only layout and design may change.
- **AI water extraction (M7):** run from the Viewer drawer (NDWI baseline, U-Net, DeepLabV3+), then compare with the source in the Viewer: source ↔ AI swipe, per-date area, threshold curve, metrics against `water_gt`, CSV.
- **Management screens:** a 48px top bar like the Viewer's; dashboard, data library, add data (5-step wizard: GeoTIFF/CAS500, Shapefile, GEE with area and date picking, Zarr path registration), dataset detail, projects and sharing by login id, job center, formula fusion.
- **Public:** landing page (real Daecheong Lake capture, sign-in-aware actions including `Viewer 열기`) and login / sign-up with a safe `redirect`.
- **Not built yet:** comparison types beyond source vs AI (model vs model, date vs date, change maps; S9), the analysis list (`/app/analysis`), account settings (S11), admin and monitoring (M8, monitoring via Grafana), Zarr file upload. Do not describe them as available.
- Zarr is always EPSG:4326. Tiles are requested directly from xcube, and their colour range comes from the catalog.
- No real customer data may be exposed publicly until tile security exists.

## Brand Commitments

- Bright, calm, work-tool tone that is readable first. Korean typography done properly (`word-break: keep-all`, comfortable line height).
- **It must not look AI-generated or template-made** (UR-38, 2026-10-06). That rules out the generic blue-on-grey SaaS kit, icon-tile-over-heading card grids, decorative illustrations standing in for the product, and gradient or glow effects.
- Color is meaningful. Water and data carry the color, and the chrome stays quiet.
- Public copy addresses only the customers listed above and never uses unverified performance numbers.

## Evidence on Hand

- A critique on 2026-10-06 (`.impeccable/critique/`) scored the landing page 21/32 and the Viewer 26/40. Both read as category-interchangeable. The landing page was rebuilt after that (UX3, 2026-10-09).
- UI/UX audits on 2026-10-09 and 2026-10-10 (`docs/UI-UX/ux-audit-*.md`) unified the colour and type system and listed the remaining order of work (fast first load, Viewer legend, GEE wizard, list paging, Viewer accessibility, account settings, admin).
- The landing hero is a real Viewer capture (user decision on 2026-10-06): Daecheong Lake, 2024-08-14, Sentinel-1·2, source vs DeepLabV3+ result (decision on 2026-10-09; only public satellite data). Real CAS500 Jeju scenes (2021-11-27, 2022-10-19) are also available.

## Product Principles

1. The map and the data are the subject. Chrome recedes.
2. Every screen answers "what changed, where, when" in plain Korean.
3. Progressive disclosure: defaults for first-timers, accelerators for researchers.
4. Nothing decorative that a real capture or real number could replace.

## Accessibility & Inclusion

- WCAG 2.2 AA: 4.5:1 text contrast and visible focus everywhere.
- Every Viewer function is keyboard-operable, including pixel query and the swipe divider.
- No meaning is carried by color alone, and `prefers-reduced-motion` is respected.
