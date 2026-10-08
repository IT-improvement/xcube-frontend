/* A failed pod tile must end in ERROR, or it keeps a tile-queue slot forever and the map stops loading.
   A layer that has drawn nothing yet retries (a pod restarting to serve new data answers 404 for ~10 s). */
jest.mock('ol/TileState', () => ({ __esModule: true, default: { ERROR: 3 } }));
jest.mock('ol/source/XYZ', () => ({ __esModule: true, default: class { mockOptions: any; refresh = jest.fn(); constructor(mockArgs: any) { this.mockOptions = mockArgs; } getTileLoadFunction() { return this.mockOptions.tileLoadFunction; } } }));
jest.mock('ol/layer/Tile', () => ({ __esModule: true, default: class { mockOptions: any; mockValues: any = {}; constructor(mockArgs: any) { this.mockOptions = mockArgs; } getSource() { return this.mockOptions.source; } set(key: string, value: any) { this.mockValues[key] = value; } get(key: string) { return this.mockValues[key]; } } }));
const addDynamicXcubeLayer = require('./index').default;
const { TILE_RETRY_DELAYS } = require('./index');
const TileState = { ERROR: 3 };

const notFound = () => jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) });
const flush = () => new Promise((resolve) => jest.requireActual('timers').setImmediate(resolve));

async function failOneTile(layer: any) {
  const tile = { getImage: () => document.createElement('img'), setState: jest.fn() };
  layer.getSource().getTileLoadFunction()(tile, 'http://pod.example:18004/tiles/d/rgb/11/1/1');
  await flush(); await flush();
  return tile;
}

afterEach(() => jest.useRealTimers());

test('실패한 tile은 ERROR가 되어 대기열 자리를 돌려주고, 아무것도 못 그린 layer는 몇 번 다시 시도한다', async () => {
  jest.useFakeTimers();
  (global as any).fetch = notFound();
  const onError = jest.fn();
  const layer = await addDynamicXcubeLayer({ map: { addLayer: jest.fn() }, tileUrl: 'http://pod.example:18004/tiles/d/rgb/{z}/{y}/{x}', onError });
  const source = layer.getSource();
  for (let attempt = 0; attempt < TILE_RETRY_DELAYS.length; attempt += 1) {
    const tile = await failOneTile(layer);
    expect(tile.setState).toHaveBeenCalledWith(TileState.ERROR);
    expect(onError).not.toHaveBeenCalled();
    jest.advanceTimersByTime(TILE_RETRY_DELAYS[attempt]);
    expect(source.refresh).toHaveBeenCalledTimes(attempt + 1);
  }
  await failOneTile(layer);
  expect(onError).toHaveBeenCalledTimes(1);
});

test('정리된 layer는 다시 시도하지 않는다', async () => {
  jest.useFakeTimers();
  (global as any).fetch = notFound();
  const layer = await addDynamicXcubeLayer({ map: { addLayer: jest.fn() }, tileUrl: 'http://pod.example:18004/tiles/d/rgb/{z}/{y}/{x}' });
  await failOneTile(layer);
  layer.get('cleanup')();
  jest.advanceTimersByTime(60_000);
  expect(layer.getSource().refresh).not.toHaveBeenCalled();
});

export {};
