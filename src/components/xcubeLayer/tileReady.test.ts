import { FRAME_SAFETY_MS, watchTileLayerReady } from "./tileReady";

function emitter() {
  const handlers: Record<string, Set<() => void>> = {};
  return {
    on: (type: string, handler: () => void) => { (handlers[type] ??= new Set()).add(handler); },
    un: (type: string, handler: () => void) => { handlers[type]?.delete(handler); },
    emit: (type: string) => Array.from(handlers[type] ?? []).forEach((handler) => handler()),
    count: () => Object.values(handlers).reduce((sum, set) => sum + set.size, 0),
  };
}
const setup = () => {
  const map = emitter();
  const source = emitter();
  const layer = { getSource: () => source };
  const onReady = jest.fn();
  const stop = watchTileLayerReady(map as any, layer as any, onReady);
  return { map, source, onReady, stop };
};

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

test('visible tiles: ready only after every started tile ended or failed, then listeners are removed', () => {
  const { map, source, onReady } = setup();
  source.emit("tileloadstart");
  source.emit("tileloadstart");
  source.emit("tileloadend");
  jest.advanceTimersByTime(200);
  map.emit("rendercomplete");
  expect(onReady).not.toHaveBeenCalled();
  source.emit("tileloaderror");
  jest.advanceTimersByTime(80);
  expect(onReady).toHaveBeenCalledTimes(1);
  expect(map.count() + source.count()).toBe(0);
});

test('a frame without tile requests is ready on the next rendercomplete; a stuck one after the safety timeout', () => {
  const cached = setup();
  cached.map.emit("rendercomplete");
  expect(cached.onReady).toHaveBeenCalledTimes(1);
  const stuck = setup();
  stuck.source.emit("tileloadstart");
  jest.advanceTimersByTime(FRAME_SAFETY_MS);
  expect(stuck.onReady).toHaveBeenCalledTimes(1);
});

test('disposing stops watching', () => {
  const { map, onReady, stop } = setup();
  stop();
  map.emit("rendercomplete");
  jest.advanceTimersByTime(FRAME_SAFETY_MS);
  expect(onReady).not.toHaveBeenCalled();
});
