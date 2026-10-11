// Keyboard control of a focused map (UX13, audit B "지도 키보드"): arrow keys pan, +/- zoom, Home fits the
// data, Enter or Space picks the pixel under the centre reticle. OpenLayers' own keyboard interactions are
// switched off (they animate and ignore reduced motion); this one moves at once when motion is reduced.
import type Map from "ol/Map";

/** CSS pixels one arrow press moves the map; Shift moves four times as far. */
export const PAN_STEP_PX = 96;
const ANIMATION_MS = 160;

export type MapKeyActions = {
  /** Enter / Space: the coordinate under the centre of the view. */
  onPick?: (coordinate: [number, number]) => void;
  /** Home: fit the shown dataset. */
  onHome?: () => void;
};

export function prefersReducedMotion() {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

/**
 * Handles one key on the focused map. Returns true when the key was used (the caller then stops it, so the
 * Viewer's ←/→ time keys and Space playback do not also run).
 */
export function handleMapKey(
  map: Map | null,
  event: Pick<KeyboardEvent, "key" | "shiftKey" | "altKey" | "ctrlKey" | "metaKey">,
  actions: MapKeyActions = {},
): boolean {
  // Browser and system shortcuts (Ctrl/⌘ + / -, Alt+←) keep their meaning.
  if (!map || event.altKey || event.ctrlKey || event.metaKey) return false;
  const view = map.getView();
  const reduced = prefersReducedMotion();
  const step = PAN_STEP_PX * (event.shiftKey ? 4 : 1);
  const pan: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  };
  const move = pan[event.key];
  if (move) {
    const center = view.getCenter();
    const resolution = view.getResolution();
    if (!center || resolution == null) return true;
    const next: [number, number] = [center[0] + move[0] * resolution, center[1] + move[1] * resolution];
    if (reduced) view.setCenter(next);
    else view.animate({ center: next, duration: ANIMATION_MS });
    return true;
  }
  const zoom = event.key === "+" || event.key === "=" ? 1 : event.key === "-" || event.key === "_" ? -1 : 0;
  if (zoom) {
    const next = (view.getZoom() ?? 0) + zoom;
    if (reduced) view.setZoom(next);
    else view.animate({ zoom: next, duration: ANIMATION_MS });
    return true;
  }
  if (event.key === "Home") {
    actions.onHome?.();
    return !!actions.onHome;
  }
  if (event.key === "Enter" || event.key === " ") {
    const center = view.getCenter();
    if (center && actions.onPick) actions.onPick([center[0], center[1]]);
    return !!actions.onPick;
  }
  return false;
}
