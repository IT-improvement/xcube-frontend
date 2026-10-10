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

test('S1 짝 맞춤·JRC 참조는 estimate와 생성 요청 본문에 그대로 실린다 (UR-41)', async () => {
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ areaKm2: 1, grid: { width: 1, height: 1 }, scenes: 1, estimatedBytes: 1, requestTiles: 1, warnings: [], blockers: [], pairs: [{ s2Date: '2024-08-14', s1Date: '2024-08-13', daysApart: 0.6, orbitPass: 'DESCENDING', coverage: 1 }], pairedCount: 1, unpairedCount: 0 }), { status: 200, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 13, status: 'QUEUED' }), { status: 201, headers: { 'content-type': 'application/json' } }));
  const input = {
    name: '대청호', collectionId: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B2'], startDate: '2024-08-13', endDate: '2024-08-15', maxCloudPercent: 40,
    bounds: { west: 127.4636, south: 36.3191, east: 127.797, north: 36.589 }, scaleMeters: 10,
    bandStyles: [{ variable: 'B2', colorBar: 'viridis', valueMin: 0, valueMax: 3000 }],
    variables: [{ source: 'B2', name: 'blue', kind: 'continuous' as const, style: { colorBar: 'viridis', min: 0, max: 3000 } }],
    sarPairing: { enabled: true, maxDaysApart: 15, orbitPass: 'ANY' as const, minCoverage: 0.99, dropUnpaired: true },
    waterReference: { enabled: true, occurrenceThreshold: 50 },
  };
  expect((await generationApi.estimateGee(input)).pairs?.[0]).toMatchObject({ s1Date: '2024-08-13', daysApart: 0.6 });
  await generationApi.createGeeJob(input);
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8083/api/v1/generation-jobs/gee/estimate');
  for (const call of fetchMock.mock.calls) {
    const body = JSON.parse(String((call[1] as RequestInit).body));
    expect(body.sarPairing).toEqual({ enabled: true, maxDaysApart: 15, orbitPass: 'ANY', minCoverage: 0.99, dropUnpaired: true });
    expect(body.waterReference).toEqual({ enabled: true, occurrenceThreshold: 50 });
    expect(body.variables[0]).toMatchObject({ source: 'B2', name: 'blue' });
  }
});

test('estimate의 dates·bytesPerDate·estimatedSeconds를 읽고, 생성 요청에 selectedDates를 그대로 싣는다 (UR-43)', async () => {
  const dates = [{ date: '2024-08-14', time: '2024-08-14T02:27:28.344Z', sceneCount: 2, cloudPercent: 3.1, coverage: 1, s1: { date: '2024-08-17', daysApart: 3.3, orbitPass: 'ASCENDING', coverage: 0.99997 } }];
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({ areaKm2: 900, grid: { width: 3000, height: 3000 }, scenes: 2, estimatedBytes: 1, requestTiles: 1, warnings: [], blockers: [], dates, bytesPerDate: 123456789, estimatedSeconds: 95 }), { status: 200, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ id: 14, status: 'QUEUED' }), { status: 201, headers: { 'content-type': 'application/json' } }));
  const input = { name: '대청호', collectionId: 'COPERNICUS/S2_SR_HARMONIZED', bands: ['B2'], startDate: '2024-08-01', endDate: '2024-08-31', maxCloudPercent: 40, bounds: { west: 127.4, south: 36.3, east: 127.8, north: 36.6 }, scaleMeters: 10, bandStyles: [] };
  const estimate = await generationApi.estimateGee(input);
  expect(estimate.dates?.[0]).toMatchObject({ date: '2024-08-14', sceneCount: 2, s1: { date: '2024-08-17', daysApart: 3.3 } });
  expect(estimate).toMatchObject({ bytesPerDate: 123456789, estimatedSeconds: 95 });
  await generationApi.createGeeJob({ ...input, selectedDates: ['2024-08-14'] });
  expect(JSON.parse(String((fetchMock.mock.calls[0][1] as RequestInit).body))).not.toHaveProperty('selectedDates');
  expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body)).selectedDates).toEqual(['2024-08-14']);
});

test('upload failures keep the server code, or word the missing sentence from the dictionary (UR-53 stage 5)', async () => {
  const { userMessage } = require('./httpClient');
  // The add-data wizard registers these parts when it loads.
  require('../i18n/wizard');
  require('../i18n/codes/data');
  jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 500, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ code: 'GEOTIFF_READ_FAILED', message: 'GeoTIFF 파일을 읽을 수 없습니다.', params: {} }), { status: 400, headers: { 'content-type': 'application/json' } }));
  const saved = await generationApi.uploadArea(new File(['x'], 'a.zip'), 'A').catch((error) => error);
  expect(userMessage(saved, 'ko')).toBe('영역을 저장하지 못했습니다.');
  const inspected = await generationApi.inspectSpatialFile('geotiff', new File(['x'], 'a.tif')).catch((error) => error);
  expect(inspected).toMatchObject({ code: 'GEOTIFF_READ_FAILED', params: {} });
  expect(userMessage(inspected, 'en')).toBe('Couldn’t read the GeoTIFF file.');
});
