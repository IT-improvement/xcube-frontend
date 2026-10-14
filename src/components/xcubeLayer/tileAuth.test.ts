/* SEC1: tiles through the same-origin gateway (/xcube/...) carry the access token and refresh it once on 401;
   only a main xcube on another origin (development) is loaded as a plain public image. */
const mockRefresh = jest.fn();
jest.mock('../../api/httpClient', () => ({ ...jest.requireActual('../../api/httpClient'), refreshSession: () => mockRefresh() }));
jest.mock('ol/TileState', () => ({ __esModule: true, default: { ERROR: 3 } }));
jest.mock('ol/source/XYZ', () => ({ __esModule: true, default: class { mockOptions: any; refresh = jest.fn(); constructor(mockArgs: any) { this.mockOptions = mockArgs; } getTileLoadFunction() { return this.mockOptions.tileLoadFunction; } } }));
jest.mock('ol/layer/Tile', () => ({ __esModule: true, default: class { mockOptions: any; mockValues: any = {}; constructor(mockArgs: any) { this.mockOptions = mockArgs; } getSource() { return this.mockOptions.source; } set(key: string, value: any) { this.mockValues[key] = value; } get(key: string) { return this.mockValues[key]; } } }));
const { default: addDynamicXcubeLayer, fetchTile, isPublicXcubeTile } = require('./index');
const { session } = require('../../api/httpClient');

const ok = () => ({ ok: true, status: 200, blob: async () => new Blob(['png']) });
const unauthorized = () => ({ ok: false, status: 401, statusText: 'Unauthorized', json: async () => ({}) });
const flush = () => new Promise((resolve) => jest.requireActual('timers').setImmediate(resolve));
const original = process.env.REACT_APP_XCUBE_URL;

beforeEach(() => { sessionStorage.clear(); mockRefresh.mockReset(); (global as any).URL.createObjectURL = jest.fn(() => 'blob:x'); (global as any).URL.revokeObjectURL = jest.fn(); });
afterEach(() => { process.env.REACT_APP_XCUBE_URL = original; });

test('같은 주소의 tile 게이트웨이 요청에는 Authorization 헤더가 붙는다', async () => {
  session.setToken('t1');
  const fetchMock = jest.fn().mockResolvedValue(ok()); (global as any).fetch = fetchMock;
  process.env.REACT_APP_XCUBE_URL = '/xcube/main';
  const layer = await addDynamicXcubeLayer({ map: { addLayer: jest.fn() }, tileUrl: '/xcube/u1/tiles/u1-d1/b1/{z}/{y}/{x}' });
  const image = document.createElement('img');
  layer.getSource().getTileLoadFunction()({ getImage: () => image, setState: jest.fn() }, '/xcube/main/tiles/u1-d1/b1/3/1/2?crs=EPSG:3857');
  await flush(); await flush();
  expect(fetchMock).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[0][0]).toBe('/xcube/main/tiles/u1-d1/b1/3/1/2?crs=EPSG:3857');
  expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Bearer t1' });
  expect(image.src).toBe('blob:x');
});

test('만료된 토큰은 한 번 갱신해서 다시 요청한다', async () => {
  session.setToken('old');
  mockRefresh.mockImplementation(async () => { session.setToken('new'); return 'new'; });
  const fetchMock = jest.fn().mockResolvedValueOnce(unauthorized()).mockResolvedValueOnce(ok()); (global as any).fetch = fetchMock;
  const response = await fetchTile('/xcube/u1/tiles/a/b/0/0/0', new AbortController().signal);
  expect(response.status).toBe(200);
  expect(mockRefresh).toHaveBeenCalledTimes(1);
  expect(fetchMock.mock.calls[1][1].headers).toEqual({ Authorization: 'Bearer new' });
});

test('갱신이 실패하면 401을 그대로 돌려준다', async () => {
  session.setToken('old');
  mockRefresh.mockRejectedValue(new Error('expired'));
  (global as any).fetch = jest.fn().mockResolvedValue(unauthorized());
  const response = await fetchTile('/xcube/main/tiles/a/b/0/0/0', new AbortController().signal);
  expect(response.status).toBe(401);
});

test('다른 출처의 메인 xcube(개발)만 공개 이미지로 바로 불러온다', () => {
  process.env.REACT_APP_XCUBE_URL = 'http://localhost:8080';
  expect(isPublicXcubeTile('http://localhost:8080/tiles/a/b/0/0/0')).toBe(true);
  expect(isPublicXcubeTile('http://localhost:18001/tiles/a/b/0/0/0')).toBe(false);
  process.env.REACT_APP_XCUBE_URL = '/xcube/main';
  expect(isPublicXcubeTile('/xcube/main/tiles/a/b/0/0/0')).toBe(false);
});

export {};
