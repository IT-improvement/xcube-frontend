/* A failed pod tile must end in ERROR, or it keeps a tile-queue slot forever and the map stops loading. */
jest.mock('ol/TileState', () => ({ __esModule: true, default: { ERROR: 3 } }));
jest.mock('ol/source/XYZ', () => ({ __esModule: true, default: class { mockOptions: any; constructor(mockArgs: any) { this.mockOptions = mockArgs; } getTileLoadFunction() { return this.mockOptions.tileLoadFunction; } } }));
jest.mock('ol/layer/Tile', () => ({ __esModule: true, default: class { mockOptions: any; constructor(mockArgs: any) { this.mockOptions = mockArgs; } getSource() { return this.mockOptions.source; } set() {} } }));
const addDynamicXcubeLayer = require('./index').default;
const TileState = { ERROR: 3 };

test('실패한 tile은 ERROR가 되어 지도 tile 대기열 자리를 돌려준다', async () => {
  const map: any = { addLayer: jest.fn() };
  const onError = jest.fn();
  const layer = await addDynamicXcubeLayer({ map, tileUrl: 'http://pod.example:18004/tiles/d/rgb/{z}/{y}/{x}', onError });
  const load = (layer.getSource() as any).getTileLoadFunction();
  const image = document.createElement('img');
  const tile = { getImage: () => image, setState: jest.fn() };
  (global as any).fetch = jest.fn().mockResolvedValue({ ok: false, status: 404, statusText: 'Not Found', json: async () => ({}) });
  load(tile, 'http://pod.example:18004/tiles/d/rgb/11/1/1');
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(tile.setState).toHaveBeenCalledWith(TileState.ERROR);
  expect(onError).toHaveBeenCalled();
});

export {};
