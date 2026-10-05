import { backofficeAdapter } from './backofficeApi';
import { session } from './httpClient';

const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
beforeEach(() => { sessionStorage.clear(); session.setToken('jwt'); jest.restoreAllMocks(); });

test('카탈로그 목록 endpoint를 사용하고 프로젝트/원본만 선택한다', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(json({ content: [
    { datacubeId: 1, xcubeDatasetId: 'custom_original', ownerUserId: 7, accessType: 'OWNED', projectId: 10, projectName: 'Project A', name: 'original', kind: 'ORIGINAL', integrationStatus: 'REGISTERED', availabilityStatus: 'AVAILABLE', variables: [{ name: 'red' }], defaultVariable: 'red', rgbAvailable: false },
    { datacubeId: 2, xcubeDatasetId: 'custom_infer', ownerUserId: 7, accessType: 'OWNED', projectId: 10, projectName: 'Project A', name: 'infer', kind: 'AI_RESULT', integrationStatus: 'REGISTERED', availabilityStatus: 'AVAILABLE' },
    { datacubeId: 3, xcubeDatasetId: 'custom_other', ownerUserId: 8, accessType: 'SHARED', projectId: 11, projectName: 'Project B', name: 'other', kind: 'ORIGINAL', integrationStatus: 'REGISTERED', availabilityStatus: 'AVAILABLE' },
  ], page: 0, size: 100, totalElements: 3, totalPages: 1 }));
  const items = await backofficeAdapter.getDatasets('10');
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8082/api/v1/datasets?scope=all&page=0&size=100&projectId=10');
  expect(items.map((item) => item.name)).toEqual(['original']);
  expect(items[0]).toMatchObject({ id: '1', xcubeDatasetId: 'custom_original', accessType: 'OWNED', projectName: 'Project A', defaultVariable: 'red' });
});

test('timeseries에 정확한 PointSeries DTO와 JWT를 전송한다', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(json({ points: [{ time: '2025-01-01T00:00:00Z', value: 0.4 }] }));
  const points = await backofficeAdapter.getTimeseries('12', 'red', { lon: 126.5, lat: 33.4, startDate: '2025-01-01', endDate: '2025-02-01', aggMethods: 'mean', maxValids: 500 });
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8082/api/v1/datasets/12/timeseries/red');
  const init = fetchMock.mock.calls[0][1] as RequestInit;
  expect(JSON.parse(String(init.body))).toEqual({ lon: 126.5, lat: 33.4, startDate: '2025-01-01', endDate: '2025-02-01', aggMethods: 'mean', maxValids: 500 });
  expect(new Headers(init.headers).get('Authorization')).toBe('Bearer jwt');
  expect(points).toEqual([{ time: '2025-01-01T00:00:00Z', value: 0.4 }]);
});

test('coordinates, legend, statistics 경로가 Backend proxy를 향한다', async () => {
  const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(json({ coordinates: ['2025-01-01'] }));
  await backofficeAdapter.getCoordinates('12', 'time');
  expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8082/api/v1/datasets/12/coordinates/time');
  expect(backofficeAdapter.legendUrl('12', 'red')).toBe('http://localhost:8082/api/v1/datasets/12/legend/red');
  expect(backofficeAdapter.tileUrl('12', 'red', '2025-01-01')).toBe('http://localhost:8080/tiles/12/red/{z}/{y}/{x}?crs=EPSG%3A3857&format=png&time=2025-01-01');
  expect(backofficeAdapter.tileUrl('u7-d62', 'red', undefined, 'http://localhost:18007/')).toBe('http://localhost:18007/tiles/u7-d62/red/{z}/{y}/{x}?crs=EPSG%3A3857&format=png');
  expect(backofficeAdapter.tileUrl('u7-d62', 'nir', undefined, undefined, { cmap: 'viridis', vmin: 600, vmax: 2400 })).toBe('http://localhost:8080/tiles/u7-d62/nir/{z}/{y}/{x}?crs=EPSG%3A3857&format=png&cmap=viridis&vmin=600&vmax=2400');
});

test('프로젝트 목록·상세·수정·삭제가 실제 CRUD endpoint와 DTO를 사용한다', async () => {
  const dto = { id: 9, ownerUserId: 3, accessRole: 'EDITOR', name: '연구 프로젝트', description: '설명', createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-02T00:00:00Z' };
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(json({ content: [dto], totalElements: 1, totalPages: 1, number: 0, size: 100 }))
    .mockResolvedValueOnce(json(dto))
    .mockResolvedValueOnce(json({ ...dto, name: '수정됨' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const projects = await backofficeAdapter.getProjects();
  expect(projects[0]).toMatchObject({ id: '9', ownerUserId: '3', accessRole: 'EDITOR', name: '연구 프로젝트', description: '설명' });
  await backofficeAdapter.getProject('9');
  await backofficeAdapter.updateProject('9', { name: '수정됨', description: '설명2' });
  await backofficeAdapter.deleteProject('9');
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    'http://localhost:8082/api/v1/projects?page=0&size=100',
    'http://localhost:8082/api/v1/projects/9',
    'http://localhost:8082/api/v1/projects/9',
    'http://localhost:8082/api/v1/projects/9',
  ]);
  expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('PATCH');
  expect((fetchMock.mock.calls[3][1] as RequestInit).method).toBe('DELETE');
});

test('프로젝트 멤버 조회·추가·역할 변경·해제가 공유 API 계약을 따른다', async () => {
  const owner = { userId: 1, role: 'OWNER', sharedByUserId: 1, createdAt: '2026-01-01T00:00:00Z' };
  const viewer = { userId: 22, role: 'VIEWER', sharedByUserId: 1, createdAt: '2026-01-02T00:00:00Z' };
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(json([owner, viewer]))
    .mockResolvedValueOnce(new Response(JSON.stringify(viewer), { status: 201, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(json({ ...viewer, role: 'EDITOR' }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  expect(await backofficeAdapter.getProjectMembers('9')).toEqual([expect.objectContaining({ userId: '1', role: 'OWNER' }), expect.objectContaining({ userId: '22', role: 'VIEWER' })]);
  await backofficeAdapter.addProjectMember('9', { userId: '22', role: 'VIEWER' });
  await backofficeAdapter.updateProjectMember('9', '22', { role: 'EDITOR' });
  await backofficeAdapter.removeProjectMember('9', '22');
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    'http://localhost:8082/api/v1/projects/9/members',
    'http://localhost:8082/api/v1/projects/9/members',
    'http://localhost:8082/api/v1/projects/9/members/22',
    'http://localhost:8082/api/v1/projects/9/members/22',
  ]);
  expect(JSON.parse(String((fetchMock.mock.calls[1][1] as RequestInit).body))).toEqual({ userId: 22, role: 'VIEWER' });
  expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('PATCH');
  expect((fetchMock.mock.calls[3][1] as RequestInit).method).toBe('DELETE');
});

test('Zarr 전역 등록과 프로젝트 연결·해제를 분리한다', async () => {
  const cube = { datacubeId: 41, projectId: null, name: 'global.zarr', kind: 'ORIGINAL', status: 'CREATED', metadata: {} };
  const fetchMock = jest.spyOn(global, 'fetch')
    .mockResolvedValueOnce(new Response(JSON.stringify(cube), { status: 201, headers: { 'content-type': 'application/json' } }))
    .mockResolvedValueOnce(json({ content: [cube], totalElements: 1, totalPages: 1, number: 0, size: 100 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }))
    .mockResolvedValueOnce(new Response(null, { status: 204 }));
  const created = await backofficeAdapter.registerDatacube({ name: 'global.zarr', storageUri: 's3://bucket/global.zarr' });
  expect(created).toMatchObject({ id: '41', projectId: '' });
  expect((await backofficeAdapter.getLinkableDatacubes())[0].name).toBe('global.zarr');
  await backofficeAdapter.linkProjectDataset('9', '41');
  await backofficeAdapter.unlinkProjectDataset('9', '41');
  expect(fetchMock.mock.calls.map((call) => call[0])).toEqual([
    'http://localhost:8082/api/v1/datacubes',
    'http://localhost:8082/api/v1/datacubes?page=0&size=100',
    'http://localhost:8082/api/v1/projects/9/datasets/41',
    'http://localhost:8082/api/v1/projects/9/datasets/41',
  ]);
  expect((fetchMock.mock.calls[0][1] as RequestInit).body).not.toContain('projectId');
  expect((fetchMock.mock.calls[2][1] as RequestInit).method).toBe('POST');
  expect((fetchMock.mock.calls[3][1] as RequestInit).method).toBe('DELETE');
});

test('Viewer 목록은 융합 결과(FUSION)도 포함하고 AI 결과는 제외한다', async () => {
  const base = { ownerUserId: 7, accessType: 'OWNED', integrationStatus: 'REGISTERED', availabilityStatus: 'AVAILABLE', variables: [{ name: 'fusion' }] };
  jest.spyOn(global, 'fetch').mockResolvedValue(json({ content: [
    { ...base, datacubeId: 1, xcubeDatasetId: 'a', name: 'original', kind: 'ORIGINAL' },
    { ...base, datacubeId: 2, xcubeDatasetId: 'b', name: 'NDWI 융합', kind: 'FUSION', metadata: { fusion: { formula: 'A - B' } } },
    { ...base, datacubeId: 3, xcubeDatasetId: 'c', name: 'infer', kind: 'AI_RESULT' },
  ], page: 0, size: 100, totalElements: 3, totalPages: 1 }));
  const items = await backofficeAdapter.getDatasets();
  expect(items.map((item) => item.name)).toEqual(['original', 'NDWI 융합']);
  expect(items[1]).toMatchObject({ kind: 'FUSION', fusion: { formula: 'A - B' } });
  jest.spyOn(global, 'fetch').mockResolvedValue(json({ content: [
    { datacubeId: 2, name: 'NDWI 융합', kind: 'FUSION', status: 'READY', metadata: {} },
    { datacubeId: 3, name: 'infer', kind: 'AI_RESULT', status: 'READY', metadata: {} },
  ], totalElements: 2, totalPages: 1, number: 0, size: 100 }));
  expect((await backofficeAdapter.getProjectDatasets!('10')).map((item) => item.name)).toEqual(['NDWI 융합']);
});
