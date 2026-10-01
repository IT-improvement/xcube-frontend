import { generationApi } from './generationApi';
import { session } from './httpClient';

beforeEach(() => { sessionStorage.clear(); session.setToken('jwt'); jest.restoreAllMocks(); });

test('GEE 컬렉션 조회와 생성 작업 요청이 8083 계약을 사용한다', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'COPERNICUS/S2', bands: ['B2', 'B3'] }]), { status: 200, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 12, status: 'QUEUED' }), { status: 201, headers: { 'content-type': 'application/json' } }));
  expect((await generationApi.getCollections())[0].bands).toEqual(['B2', 'B3']);
  const input = { name: 'test cube', collectionId: 'COPERNICUS/S2', bands: ['B2'], startDate: '2026-01-01', endDate: '2026-02-01', maxCloudPercent: 20, bounds: { west:126, south:33, east:127, north:34 }, scaleMeters: 30, bandStyles: [{ variable: 'B2', colorBar: 'viridis', valueMin: 0, valueMax: 1 }] };
  expect(await generationApi.createGeeJob(input)).toMatchObject({ id: 12, status: 'QUEUED' });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8083/api/v1/gee/collections');
  expect(fetchMock.mock.calls[1][0]).toBe('http://localhost:8083/api/v1/generation-jobs/gee');
  expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual(input);
});

test('ColorBar는 Backoffice XCube capability 목록에서만 조회한다', async () => {
  jest.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ colorBars: ['viridis', 'cividis'] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  expect(await generationApi.getColorBars()).toEqual(['viridis', 'cividis']);
  expect((global.fetch as jest.Mock).mock.calls[0][0]).toBe('http://localhost:8082/api/v2/xcube-capabilities/colorbars?target=user');
});
