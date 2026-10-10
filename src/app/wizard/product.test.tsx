/* UR-55: satellite product packages (Sentinel-2 L2A, Landsat 8/9 C2 L2) in the add-data wizard, and upload
   progress and cancel for every file upload (audit W9). Demo mode answers from the file names. */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider } from '../../i18n';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: 'Hong' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { generation } = require('../api');
const { ApiError } = require('../../api/httpClient');
const AddDataPage = require('./AddDataPage').default;
const { clientProblem, defaultChoices, estimateBytes, productFromName, suggestProductName } = require('./productModel');
const { secondsLeft } = require('./UploadMeter');

const T = 4000;
const HANGUL = /[가-힣]/;
const S2_A = 'S2B_MSIL2A_20240814T021529_N0511_R003_T52SCG_20240814T061000.zip';
const S2_B = 'S2A_MSIL2A_20240829T021531_N0511_R003_T52SCG_20240829T080000.zip';
const LC_A = 'LC09_L2SP_115034_20240816_20240817_02_T1.tar';
const LC_B = 'LC08_L2SP_115034_20240824_20240830_02_T1.tar';
const file = (name: string, size = 64) => new File(['x'.repeat(size)], name);

beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

/** Renders the wizard and lets the colour maps and projects load (demo answers in 150 ms). */
async function renderWizard(lang: 'ko' | 'en' = 'ko') {
  const page: ReactElement = <MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>;
  render(<LanguageProvider initial={lang}>{page}</LanguageProvider>);
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)); });
}
const ko = { next: /^다음/, card: /위성 원본 제품/, choose: '제품 파일 선택', list: '올린 제품' };
const en = { next: /^Next/, card: /Satellite product/, choose: 'Choose product files', list: 'Uploaded products' };
type Text = typeof ko;
const next = (text: Text = ko) => fireEvent.click(screen.getByRole('button', { name: text.next }));
/** Lets the loads a method change starts (the GEE list) finish inside act. */
const settle = () => act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
async function toSource(text: Text = ko) {
  fireEvent.click(await screen.findByRole('radio', { name: text.card }));
  await settle();
  next(text);
}
const add = (names: string[], text: Text = ko) => fireEvent.change(screen.getByLabelText(text.choose), { target: { files: names.map((name) => file(name)) } });
const rowOf = (name: string) => screen.getAllByRole('listitem').find((item) => item.textContent?.startsWith(name)) as HTMLElement;
/** The band checkboxes that are on, by source name (the label reads "B02blue · 10 m"). */
const expectPicked = (sources: string[]) => {
  expect(screen.getAllByRole('checkbox', { checked: true })).toHaveLength(sources.length);
  sources.forEach((source) => expect(screen.getByRole('checkbox', { name: new RegExp(`^${source}(?![0-9A])`) })).toBeChecked());
};
async function uploaded(names: string[], text: Text = ko) {
  add(names, text);
  await waitFor(() => names.forEach((name) => expect(within(rowOf(name)).getByText(text === ko ? '확인됨' : 'Checked')).toBeInTheDocument()), { timeout: T });
}

describe('method card and product type', () => {
  test('a fifth "생성" card; the source step offers Sentinel-2 or Landsat with where to get each', async () => {
    await renderWizard();
    const cards = within(await screen.findByRole('radiogroup', { name: '데이터 추가 방식' })).getAllByRole('radio');
    expect(cards).toHaveLength(5);
    expect(cards[1]).toHaveTextContent(/^위성 원본 제품 생성/);
    expect(cards[1]).toHaveTextContent('Copernicus·USGS에서 받은 Sentinel-2 L2A·Landsat 8/9 L2 원본을 그대로 올립니다.');
    expect(cards[0]).toHaveTextContent(/^GeoTIFF \/ CAS500 생성/);
    fireEvent.click(cards[1]);
    await settle();
    next();
    expect(screen.getByRole('heading', { level: 2, name: '원본 입력' })).toBeInTheDocument();
    const kind = screen.getByRole('group', { name: '제품 종류' });
    expect(within(kind).getByRole('button', { name: /Sentinel-2 L2A/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(kind).getByRole('button', { name: /Sentinel-2 L2A/ })).toHaveTextContent('.zip (.SAFE)');
    expect(screen.getByText(/Copernicus Browser에서/)).toBeInTheDocument();
    expect(screen.getByLabelText(ko.choose)).toHaveAttribute('accept', '.zip,application/zip');
    expect(screen.getByLabelText(ko.choose)).toHaveAttribute('multiple');
    fireEvent.click(within(kind).getByRole('button', { name: /Landsat 8\/9 Collection 2 Level-2/ }));
    expect(within(kind).getByRole('button', { name: /Landsat/ })).toHaveAttribute('aria-pressed', 'true');
    expect(within(kind).getByRole('button', { name: /Landsat/ })).toHaveTextContent('.tar / .tar.gz');
    expect(screen.getByText(/USGS EarthExplorer의 데이터 세트에서 "Landsat Collection 2 Level-2"/)).toBeInTheDocument();
    // 다음 waits for at least one checked product.
    next();
    expect(screen.getByText('제품 파일을 하나 이상 올려 검사를 마치세요.')).toBeInTheDocument();
  });
});

describe('upload progress and cancel (W9)', () => {
  /** An upload that reports half its bytes and then waits until it is cancelled. */
  const halfThenWait = () => jest.spyOn(generation, 'inspect').mockImplementation((...args: unknown[]) => {
    const options = args[2] as { onProgress?: (p: { loaded: number; total: number }) => void; signal?: AbortSignal };
    return new Promise((_, reject) => {
      setTimeout(() => options.onProgress?.({ loaded: 50 * 1024 * 1024, total: 100 * 1024 * 1024 }), 0);
      options.signal?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
    });
  });

  test('a product shows percent, MB of total and a cancel; cancel aborts it', async () => {
    const inspect = halfThenWait();
    await renderWizard();
    await toSource();
    add([S2_A]);
    const bar = await screen.findByRole('progressbar', { name: `${S2_A} 업로드 진행률` });
    await waitFor(() => expect(bar).toHaveAttribute('value', '50'));
    expect(within(rowOf(S2_A)).getByText(/^50% · 50\.0 MB \/ 100 MB/)).toBeInTheDocument();
    expect(within(rowOf(S2_A)).getByText('올리는 중')).toBeInTheDocument();
    // 다음 says why it waits.
    expect(screen.getByRole('status')).toHaveTextContent('제품 파일을 올리고 검사하는 중입니다.');
    const signal = (inspect.mock.calls[0][2] as { signal: AbortSignal }).signal;
    fireEvent.click(screen.getByRole('button', { name: `${S2_A} 업로드 취소` }));
    expect(signal.aborted).toBe(true);
    expect(await within(rowOf(S2_A)).findByText('취소됨')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: `${S2_A} 목록에서 빼기` }));
    expect(screen.queryByText(S2_A)).not.toBeInTheDocument();
  });

  test('an existing GeoTIFF upload gets the same progress and cancel', async () => {
    const inspect = halfThenWait();
    await renderWizard();
    fireEvent.click(await screen.findByRole('radio', { name: /GeoTIFF \/ CAS500/ }));
    await settle();
    next();
    fireEvent.change(screen.getByLabelText('파일 선택'), { target: { files: [file('scene.tif')] } });
    expect(inspect).toHaveBeenCalledWith('geotiff', expect.any(File), expect.objectContaining({ signal: expect.any(AbortSignal), onProgress: expect.any(Function) }));
    const bar = await screen.findByRole('progressbar', { name: 'scene.tif 업로드 진행률' });
    await waitFor(() => expect(bar).toHaveAttribute('value', '50'));
    expect(screen.getByText(/^50% · 50\.0 MB \/ 100 MB/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'scene.tif 업로드 취소' }));
    expect(await screen.findByText('업로드를 취소했습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '파일 선택' })).toBeEnabled();
  });

  test('time left from the average rate', () => {
    expect(secondsLeft({ loaded: 25, total: 100, startedAt: 0 }, 10_000)).toBe(30);
    expect(secondsLeft({ loaded: 25, total: 100, startedAt: 0 }, 500)).toBeNull();
    expect(secondsLeft({ loaded: 100, total: 100, startedAt: 0 }, 10_000)).toBeNull();
  });
});

describe('Sentinel-2 L2A', () => {
  test('inspection table (+1000 note), default bands, 10/20/60 m and the job request', async () => {
    const create = jest.spyOn(generation, 'createFileJob');
    await renderWizard();
    await toSource();
    await uploaded([S2_A, S2_B]);
    next();
    expect(screen.getByRole('heading', { level: 2, name: '자동 검사 결과' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: '제품 검사 결과' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['촬영 시각', '위성', '타일', '구름', '처리 기준', '참고']);
    const rows = within(table).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent('S2B');
    expect(rows[0]).toHaveTextContent('52SCG');
    expect(rows[0]).toHaveTextContent('3.2%');
    expect(rows[0]).toHaveTextContent('05.11');
    // Local time in the screen language (the day may differ by time zone).
    expect(rows[0]).toHaveTextContent(/2024\. 8\. 1[34]\./);
    expect(rows[0]).toHaveTextContent('2022년 이후 처리 기준: 값에 +1000이 들어 있어 분석 때 자동 보정합니다');
    expect(rows[1]).toHaveTextContent('S2A');
    const bands = screen.getByRole('list', { name: 'band' });
    expect(bands).toHaveTextContent('blue ← B02 · 10 m');
    expect(bands).toHaveTextContent('swir ← B11 · 20 m');
    expect(bands).toHaveTextContent('scl ← SCL · 20 m · 범주형');
    next();

    expect(screen.getByRole('heading', { level: 2, name: '설정' })).toBeInTheDocument();
    expect(screen.getByLabelText('데이터 이름')).toHaveValue('52SCG 2024-08');
    expectPicked(['B02', 'B03', 'B04', 'B08', 'B11', 'SCL']);
    expect(screen.getByRole('checkbox', { name: /B05/ })).not.toBeChecked();
    const resolution = screen.getByRole('group', { name: '출력 해상도' });
    expect(within(resolution).getAllByRole('button').map((button) => button.textContent)).toEqual(['10 m', '20 m', '60 m']);
    expect(within(resolution).getByRole('button', { name: '10 m' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('red·green·blue를 모두 골라 RGB 컬러 영상도 자동으로 만듭니다.')).toBeInTheDocument();
    // Reflectance in Greys with the +1000 offset; SCL categorical.
    expect(screen.getByLabelText('B02 색상표')).toHaveValue('Greys');
    expect(screen.getByLabelText('B02 표시 최솟값')).toHaveValue(1000);
    expect(screen.getByLabelText('B02 표시 최댓값')).toHaveValue(4000);
    expect(within(screen.getByRole('region', { name: 'SCL 표시 설정' })).getByRole('button', { name: '범주형' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(resolution).getByRole('button', { name: '20 m' }));
    fireEvent.click(screen.getByRole('checkbox', { name: /B08/ }));
    next();

    expect(screen.getByRole('heading', { level: 2, name: '확인 및 생성' })).toBeInTheDocument();
    expect(screen.getByText('위성 원본 제품 · Sentinel-2 L2A')).toBeInTheDocument();
    expect(screen.getByText('2개 · 시점 2개')).toBeInTheDocument();
    expect(screen.getByText('2024-08-14 ~ 2024-08-29')).toBeInTheDocument();
    expect(screen.getByText('20 m')).toBeInTheDocument();
    expect(screen.getByText(/^압축 전 최대 /)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    const reflectance = (source: string, name: string) => ({ source, name, kind: 'continuous', style: { colorBar: 'Greys', min: 1000, max: 4000 } });
    expect(JSON.parse(JSON.stringify(create.mock.calls[0][0]))).toStrictEqual({
      type: 'SENTINEL2_L2A', name: '52SCG 2024-08',
      inputs: [{ kind: 'zip', uri: `file:///demo/${S2_A}` }, { kind: 'zip', uri: `file:///demo/${S2_B}` }],
      variables: [reflectance('B02', 'blue'), reflectance('B03', 'green'), reflectance('B04', 'red'), reflectance('B11', 'swir'), { source: 'SCL', name: 'scl', kind: 'categorical', style: { colorBar: 'viridis' } }],
      params: { resolution: 20 },
    });
  });

  test('mixed sensors: a Landsat file next to Sentinel-2 is refused before uploading; a server code is shown as well', async () => {
    const inspect = jest.spyOn(generation, 'inspect');
    await renderWizard();
    await toSource();
    await uploaded([S2_A]);
    add([LC_A]);
    expect(within(rowOf(LC_A)).getByRole('alert')).toHaveTextContent('Sentinel-2와 Landsat 제품을 한 데이터로 섞을 수 없습니다. 같은 종류만 올려 주세요.');
    expect(within(rowOf(LC_A)).getByText('실패')).toBeInTheDocument();
    expect(inspect).toHaveBeenCalledTimes(1);
    // Level-1 by name, and the server's code when the name says nothing.
    add(['S2A_MSIL1C_20240801T021531_N0510_R003_T52SCG_20240801T050000.zip']);
    expect(screen.getByText(/Level-1\(대기보정 전\) 제품은 올릴 수 없습니다/)).toBeInTheDocument();
    inspect.mockRejectedValueOnce(new ApiError(400, 'PRODUCT_SENSOR_MIXED', '센서가 섞였습니다.'));
    add(['renamed.zip']);
    await waitFor(() => expect(within(rowOf('renamed.zip')).getByRole('alert')).toHaveTextContent('Sentinel-2와 Landsat 제품을 한 데이터로 섞을 수 없습니다.'), { timeout: T });
    // The checked product still goes on.
    next();
    expect(screen.getByRole('heading', { level: 2, name: '자동 검사 결과' })).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2);
  });
});

describe('Landsat 8/9 C2 L2', () => {
  test('Path/Row column without baseline, default bands without SR_B1/B7, 30 m only, request type and resolution', async () => {
    const create = jest.spyOn(generation, 'createFileJob');
    await renderWizard();
    await toSource();
    fireEvent.click(screen.getByRole('button', { name: /Landsat 8\/9/ }));
    expect(screen.getByLabelText(ko.choose).getAttribute('accept')).toContain('.tar');
    await uploaded([LC_A, LC_B]);
    next();
    const table = screen.getByRole('table', { name: '제품 검사 결과' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['촬영 시각', '위성', 'Path/Row', '구름', '참고']);
    expect(table).toHaveTextContent('LC09');
    expect(table).toHaveTextContent('LC08');
    expect(table).toHaveTextContent('115034');
    expect(table).not.toHaveTextContent('+1000');
    next();
    expect(screen.getByLabelText('데이터 이름')).toHaveValue('115034 2024-08');
    expectPicked(['SR_B2', 'SR_B3', 'SR_B4', 'SR_B5', 'SR_B6', 'QA_PIXEL']);
    expect(screen.getByRole('checkbox', { name: /SR_B1/ })).not.toBeChecked();
    expect(screen.getByRole('checkbox', { name: /SR_B7/ })).not.toBeChecked();
    const resolution = screen.getByRole('group', { name: '출력 해상도' });
    expect(within(resolution).getAllByRole('button').map((button) => button.textContent)).toEqual(['30 m']);
    expect(screen.getByLabelText('SR_B4 표시 최솟값')).toHaveValue(7273);
    next();
    fireEvent.click(screen.getByRole('button', { name: '생성 시작' }));
    await waitFor(() => expect(create).toHaveBeenCalled(), { timeout: T });
    const body = create.mock.calls[0][0] as Record<string, any>;
    expect(body).toMatchObject({ type: 'LANDSAT_C2L2', name: '115034 2024-08', params: { resolution: 30 } });
    expect(body.inputs).toEqual([{ kind: 'tar', uri: `file:///demo/${LC_A}` }, { kind: 'tar', uri: `file:///demo/${LC_B}` }]);
    expect(body.variables.map((item: { source: string; name: string }) => `${item.source}:${item.name}`)).toEqual(['SR_B2:blue', 'SR_B3:green', 'SR_B4:red', 'SR_B5:nir', 'SR_B6:swir', 'QA_PIXEL:qa_pixel']);
    expect(body.variables[5]).toMatchObject({ kind: 'categorical' });
  });
});

describe('in English', () => {
  test('every product step reads in English with no Hangul', async () => {
    await renderWizard('en');
    const cards = within(await screen.findByRole('radiogroup', { name: 'How to add data' })).getAllByRole('radio');
    expect(cards[1]).toHaveTextContent(/^Satellite product Build/);
    expect(cards[1]).toHaveTextContent('Upload Sentinel-2 L2A or Landsat 8/9 L2 products just as you downloaded them from Copernicus or USGS.');
    await toSource(en);
    expect(screen.getByText(/In Copernicus Browser, pick a scene/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
    await uploaded([S2_A], en);
    add([LC_A], en);
    expect(within(rowOf(LC_A)).getByRole('alert')).toHaveTextContent('Sentinel-2 and Landsat products can’t be mixed in one dataset. Upload one type only.');
    expect(within(rowOf(S2_A)).getByText('Sentinel-2 L2A product checked.')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
    next(en);
    expect(screen.getByRole('heading', { level: 2, name: 'Inspection' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Product check results' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Acquired', 'Satellite', 'Tile', 'Cloud', 'Processing baseline', 'Note']);
    expect(table).toHaveTextContent(/Aug 1[34], 2024/);
    expect(table).toHaveTextContent('Processed with the 2022+ baseline: values include +1000, which analysis corrects automatically');
    expect(document.body).not.toHaveTextContent(HANGUL);
    next(en);
    expect(screen.getByRole('group', { name: 'Output resolution' })).toBeInTheDocument();
    expect(screen.getByText('Filled in from the tile and the period. You can change it.')).toBeInTheDocument();
    expect(screen.getByText(/red, green and blue are all selected/)).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
    next(en);
    expect(screen.getByText('Satellite product · Sentinel-2 L2A')).toBeInTheDocument();
    expect(screen.getByText('1 · time steps: 1')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
  });
});

describe('product model', () => {
  test('file names, client checks and the suggested name', () => {
    expect(productFromName(S2_A)).toEqual({ kind: 'sentinel2', level1: false });
    expect(productFromName(LC_A)).toEqual({ kind: 'landsat', level1: false });
    expect(productFromName('LC08_L1TP_115034_20240824_20240830_02_T1.tar')).toEqual({ kind: 'landsat', level1: true });
    expect(productFromName('my_scene.zip')).toBeNull();
    expect(clientProblem('sentinel2', LC_A, false)).toEqual({ code: 'PRODUCT_TYPE_MISMATCH' });
    expect(clientProblem('sentinel2', LC_A, true)).toEqual({ code: 'PRODUCT_SENSOR_MIXED' });
    expect(clientProblem('landsat', LC_B, true)).toBeNull();
    const product = (acquiredAt: string, tile: string) => ({ sensor: 'SENTINEL2_L2A', platform: 'S2B', productId: tile + acquiredAt, acquiredAt, tile, bands: [] });
    expect(suggestProductName([product('2024-06-03T02:00:00Z', '52SCG'), product('2024-08-14T02:00:00Z', '52SCG'), product('2024-08-14T02:00:05Z', '52SDG')])).toBe('52SCG·52SDG 2024-06–08');
  });

  test('defaults follow the band flags; no size without footprints', () => {
    const bands = [
      { source: 'B02', name: 'blue', resolution: 10, kind: 'continuous', default: true },
      { source: 'B05', name: 'rededge1', resolution: 20, kind: 'continuous', default: false },
      { source: 'SCL', name: 'scl', resolution: 20, kind: 'categorical', default: true },
    ];
    const products = [{ sensor: 'SENTINEL2_L2A', platform: 'S2B', productId: 'a', acquiredAt: '2024-08-14T02:00:00Z', boaAddOffset: 0, bands }];
    const choices = defaultChoices('sentinel2', products, [{ id: 'viridis' }, { id: 'Greys' }, { id: 'tab10' }]);
    expect(choices.map((choice: { source: string; colorBar: string; min: string }) => [choice.source, choice.colorBar, choice.min])).toEqual([['B02', 'Greys', '0'], ['SCL', 'tab10', '']]);
    expect(estimateBytes(products, choices, 10)).toBeNull();
    const withFootprint = [{ ...products[0], footprint: [127, 36, 127.1, 36.1] }];
    // About 900 × 1,106 px × (2 + 1) bytes × 1 time step.
    expect(estimateBytes(withFootprint, choices, 10)).toBeGreaterThan(2_900_000);
    expect(estimateBytes(withFootprint, choices, 10)).toBeLessThan(3_100_000);
  });
});
