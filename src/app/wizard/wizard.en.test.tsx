/* UR-53 stage 3: the add-data wizard in English (demo mode). The Korean wizard stays covered by area/dates/sar tests. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LanguageProvider, translate } from '../../i18n';

jest.mock('../../api', () => ({ activeViewerAdapter: { getProjects: jest.fn(), getDatasets: jest.fn(), getProjectDatasets: jest.fn(), getJobs: jest.fn() }, useMockApi: true }));
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: { id: 1, name: 'Hong' }, signOut: jest.fn() }) }));

const adapter = require('../../api').activeViewerAdapter as Record<string, jest.Mock>;
const { appApi, generation } = require('../api');
const { blockerText, warningText, resolveArea, emptyArea } = require('./areaModel');
const { minutesText, selectionProblem } = require('./dateModel');
const { pairLine, sarError, defaultSar } = require('./sarModel');
const AddDataPage = require('./AddDataPage').default;
const DateTable = require('./DateTable').default;
const { PairTable, SarOptions } = require('./SarPairing');
const { geeFlow, EN } = require('./geeFlow.testutil');

const T = 4000;
const HANGUL = /[가-힣]/;
beforeEach(() => {
  adapter.getProjects.mockResolvedValue([]);
  adapter.getDatasets.mockResolvedValue([]);
});
afterEach(() => jest.restoreAllMocks());

const inEnglish = (node: ReactElement) => <LanguageProvider initial="en">{node}</LanguageProvider>;
function renderWizard() {
  return render(inEnglish(<MemoryRouter initialEntries={['/app/data/new']}><Routes><Route path="/app/data/new" element={<AddDataPage />} /></Routes></MemoryRouter>));
}
const next = () => screen.getByRole('button', { name: /^Next/ });
// UR-54: Method → Data (S2, B8) → Area; the period and the estimate are on "Period & dates".
const flow = geeFlow(EN);
async function toGeeArea() {
  renderWizard();
  await flow.toData();
  flow.choose(/Sentinel-2 L2A/, ['B8']);
  await flow.toArea();
}
const setPoint = (lon: string, lat: string) => flow.setPoint(lon, lat);
/** Area → Period & dates with May 2026. */
async function toDates() {
  await flow.toDates();
  flow.setPeriod('2026-05-01', '2026-05-31');
}
/** Back to the area, change it, and forward again. */
async function changeArea(change: () => void) {
  fireEvent.click(screen.getByRole('button', { name: /Back/ }));
  change();
  await flow.toDates();
}

describe('Method step in English', () => {
  test('steps, the four method cards with their group badges, and the validation message', async () => {
    renderWizard();
    expect(screen.getByRole('heading', { level: 1, name: 'Add data' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Data' })).toHaveAttribute('href', '/app/data');
    const steps = screen.getByRole('list', { name: 'Progress' });
    expect(within(steps).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['1Method', '2Source', '3Inspection', '4Settings', '5Review and create']);
    const cards = within(screen.getByRole('radiogroup', { name: 'How to add data' })).getAllByRole('radio');
    expect(cards[0]).toHaveTextContent(/^GeoTIFF \/ CAS500 Build/);
    expect(cards[1]).toHaveTextContent(/^Shapefile Build/);
    expect(cards[2]).toHaveTextContent(/^Google Earth Engine Build/);
    expect(cards[3]).toHaveTextContent(/^Register Zarr Register/);
    expect(cards[2]).toHaveTextContent('Pick satellite data and fetch it by period and area.');
    expect(cards[3]).toHaveTextContent('Server path or s3:// URI');
    fireEvent.click(next());
    expect(screen.getByText('Choose a method.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Back/ })).toBeDisabled();
    expect(document.body).not.toHaveTextContent(HANGUL);
  });
});

describe('GEE area step in English', () => {
  test('tabs, map captions and the point, rectangle and administrative-area panels', async () => {
    await toGeeArea();
    expect(screen.getByRole('heading', { level: 2, name: 'Area' })).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Point + size', 'Administrative area', 'Rectangle', 'My areas (Shape)']);
    expect(screen.getByRole('radio', { name: 'Custom' })).toBeInTheDocument();
    expect(screen.getByTestId('area-preview')).toHaveTextContent('Click the map to pick the center.');
    fireEvent.click(next());
    expect(screen.getByText('Click the map to pick the center, or enter longitude and latitude.')).toBeInTheDocument();
    setPoint('127.502', '36.454');
    expect(screen.getByTestId('area-preview')).toHaveTextContent('Center 127.5020, 36.4540 · 30 km per side');
    expect(screen.getByTestId('area-preview')).toHaveTextContent('900 km²');

    fireEvent.click(screen.getByRole('tab', { name: 'Rectangle' }));
    expect(screen.getByTestId('area-preview')).toHaveTextContent('Drag on the map to draw a rectangle.');
    expect(screen.getByLabelText('Lower-left longitude')).toHaveAttribute('placeholder', 'e.g. 126.50');

    fireEvent.click(screen.getByRole('tab', { name: 'Administrative area' }));
    expect(screen.getByRole('radiogroup', { name: 'Administrative level' })).toHaveTextContent('AllProvinceCity/county/district');
    expect(screen.getByText('Boundaries: Statistics Korea SGIS (KOGL Type 1), admdongkor (CC BY 4.0)')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search administrative areas'), { target: { value: '제주' } });
    const list = await screen.findByRole('list', { name: 'Administrative area results' }, { timeout: T });
    // Area names come from the boundary data and stay as they are; the level badge is translated.
    expect(within(list).getByRole('button', { name: /제주시/ })).toHaveTextContent('City/county/district');
    fireEvent.click(within(list).getByRole('button', { name: /제주시/ }));
    expect(await screen.findByRole('radio', { name: 'Clip to boundary' }, { timeout: T })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: /Save a boundary mask variable/ })).toBeEnabled();
  });

  test('estimate: loading, a blocker in words, a failure with Recalculate, then counts and plurals', async () => {
    const real = generation.estimateGee;
    let release: (() => void) | null = null;
    jest.spyOn(generation, 'estimateGee').mockImplementationOnce((body: unknown) => new Promise((done) => { release = () => done(real(body)); }));
    await toGeeArea();
    setPoint('127.5', '36.4');
    await toDates();
    expect(await screen.findByText('Calculating the estimated size.', undefined, { timeout: T })).toBeInTheDocument();
    expect(next()).toBeDisabled();
    await waitFor(() => expect(release).not.toBeNull(), { timeout: T });
    release!();
    const panel = screen.getByRole('region', { name: 'Estimated size' });
    await waitFor(() => expect(panel).toHaveTextContent('Estimated scenes'), { timeout: T });
    expect(within(panel).getByTestId('estimate-times')).toHaveTextContent(/^\d+ dates · 1 unpaired date left out$/);
    expect(within(panel).getByTestId('estimate-time')).toHaveTextContent(/^About \d+ min$/);
    expect(panel).toHaveTextContent(/\d+ scenes/);

    jest.spyOn(generation, 'estimateGee').mockResolvedValue({ areaKm2: 400, grid: { width: 2000, height: 2000 }, scenes: 1, estimatedBytes: 1e8, requestTiles: 3, warnings: ['SIDE_EXCEEDS_100_KM'], blockers: ['NO_FULL_COVER_DATE'] });
    await changeArea(() => fireEvent.click(screen.getByRole('radio', { name: '20 km' })));
    expect(await screen.findByRole('alert', undefined, { timeout: T })).toHaveTextContent('No image covers 100% of this place in the chosen period. Widen the period or move the area.');
    expect(screen.getByText('The area is large, so it is fetched in parts (automatic).')).toBeInTheDocument();
    expect(next()).toHaveAccessibleDescription(/Resolve the issue shown in the estimate first\./);
    expect(screen.getByText('A side of the area is over 100 km. Fetching may take a long time.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Estimated size' })).toHaveTextContent('1 scene');
    expect(next()).toBeDisabled();

    jest.spyOn(generation, 'estimateGee').mockRejectedValueOnce(new Error('down'));
    await changeArea(() => fireEvent.click(screen.getByRole('radio', { name: '10 km' })));
    expect(await screen.findByText('Can’t continue: the estimate couldn’t be loaded.', undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('Couldn’t calculate the estimate. Something went wrong. Press Recalculate below.')).toBeInTheDocument();
    jest.spyOn(generation, 'estimateGee').mockImplementation(real);
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate' }));
    await waitFor(() => expect(next()).toBeEnabled(), { timeout: T });
    expect(document.body).not.toHaveTextContent(HANGUL);
  });
});

describe('Date table in English', () => {
  const ESTIMATE = { areaKm2: 900, grid: { width: 3000, height: 3000 }, scenes: 8, estimatedBytes: 4e9, requestTiles: 1, warnings: [], blockers: [], bytesPerDate: 1e9, estimatedSeconds: 1200 };
  const NOISY = [
    { date: '2025-04-11', sceneCount: 2, cloudPercent: 0.1, noisePercent: 1.1, coverage: 1 },
    { date: '2025-07-10', sceneCount: 2, cloudPercent: 1.3, noisePercent: 0, coverage: 1 },
    { date: '2025-11-07', sceneCount: 1, cloudPercent: 13.3, noisePercent: 1.0, coverage: 1 },
    { date: '2025-05-21', sceneCount: 2, cloudPercent: 98.6, noisePercent: 100, coverage: 1 },
  ];

  test('ranking columns, the count field and its hint, sort buttons and the left-out dates', () => {
    const onChange = jest.fn();
    const data = { ...ESTIMATE, dates: NOISY, excludedDates: [{ date: '2025-06-01', coverage: 0.82 }] };
    render(inEnglish(<DateTable data={data} picked={NOISY.map((item) => item.date)} onChange={onChange} />));
    expect(screen.getByRole('heading', { name: 'Choose dates' })).toBeInTheDocument();
    const table = screen.getByRole('table', { name: 'Choose dates' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Select', 'Cloud rank', 'Date', 'Area cloud/shadow %', 'Tile cloud %', 'Scenes']);
    expect(screen.getByText(/selected$/)).toHaveTextContent('4 of 4 dates selected');
    expect(screen.getByRole('checkbox', { name: 'Select 2025-07-10' })).toBeChecked();
    expect(screen.getByRole('button', { name: 'Least cloud' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'By date' })).toBeInTheDocument();
    expect(screen.getByText('of 4')).toBeInTheDocument();
    expect(screen.getByText('Picks the 4 dates with the least cloud and shadow inside the area. You can also change the checks yourself.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Dates to build'), { target: { value: '1' } });
    expect(onChange).toHaveBeenLastCalledWith(['2025-07-10']);
    expect(screen.getByText('Picks the date with the least cloud and shadow inside the area. You can also change the checks yourself.')).toBeInTheDocument();
    expect(screen.getByText('1 date left out for partial cover')).toBeInTheDocument();
    expect(screen.getByText('2025-06-01 (82%)')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
  });

  test('singular count and the empty selection', () => {
    const one = [{ date: '2025-07-10', sceneCount: 1, cloudPercent: 1.3, coverage: 1 }];
    const { rerender } = render(inEnglish(<DateTable data={{ ...ESTIMATE, dates: one }} picked={['2025-07-10']} onChange={jest.fn()} />));
    expect(screen.getByText(/selected$/)).toHaveTextContent('1 of 1 date selected');
    expect(screen.getByText('Picks the least cloudy date. You can also change the checks yourself.')).toBeInTheDocument();
    expect(within(screen.getByRole('table')).getAllByRole('columnheader').map((cell) => cell.textContent)).toContain('Cloud %');
    rerender(inEnglish(<DateTable data={{ ...ESTIMATE, dates: one }} picked={[]} onChange={jest.fn()} />));
    expect(screen.getByRole('alert')).toHaveTextContent('Pick at least one date. Only the dates you pick are built.');
  });

  test('model texts take the language', () => {
    expect(minutesText(1500, 'en')).toBe('About 25 min');
    expect(minutesText(1500, 'ko')).toBe('약 25분');
    expect(selectionProblem({ scope: '', all: ['a'], picked: [] }, null, null, 'en')).toBe('Pick at least one date.');
    expect(blockerText('DATE_LIST_UNAVAILABLE', 'en')).toMatch(/^Couldn’t get the date list from GEE\./);
    expect(blockerText({ code: 'NEW_CODE' }, 'en')).toBe('This request can’t go ahead. (NEW_CODE)');
    expect(warningText('DATE_LIST_TRUNCATED', 'en')).toBe('More than 366 dates; only the first 366 are shown.');
    const area = resolveArea({ ...emptyArea(), tab: 'box', west: '127', south: '36', east: '126', north: '37' }, 'en');
    expect(area.error).toBe('The lower-left corner must be smaller than the upper-right corner.');
    expect(area.modeLabel).toBe('Rectangle');
  });
});

describe('Sentinel-1 pairing in English', () => {
  const base = { areaKm2: 400, grid: { width: 2000, height: 2000 }, scenes: 4, estimatedBytes: 1e8, requestTiles: 1, warnings: [], blockers: [] };

  test('options, the pair table and the dataset line', () => {
    const onChange = jest.fn();
    render(inEnglish(<SarOptions sar={defaultSar()} onChange={onChange} showErrors={false} />));
    expect(screen.getByRole('checkbox', { name: /Also fetch Sentinel-1 VV\/VH for AI water analysis/ })).toBeChecked();
    expect(screen.getByText('Pairing settings · max gap 15 days · orbit Any · unpaired dates left out')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: 'Orbit direction' })).toHaveTextContent('AnyAscendingDescending');
    expect(screen.getByRole('button', { name: 'Keep without radar' })).toHaveAttribute('aria-pressed', 'false');
    expect(sarError({ ...defaultSar(), maxDaysApart: '40' }, 'en')).toBe('Enter a whole number of days from 1 to 30 for the max gap.');

    const pairs = [
      { s2Date: '2024-08-14', s1Date: '2024-08-13', daysApart: 0.6, orbitPass: 'DESCENDING', coverage: 1 },
      { s2Date: '2024-08-19', s1Date: '2024-08-09', daysApart: 9.5, orbitPass: 'ASCENDING', coverage: 0.999 },
      { s2Date: '2024-08-24', s1Date: null },
    ];
    render(inEnglish(<PairTable data={{ ...base, pairs }} keepUnpaired={false} />));
    expect(screen.getByText(/^Radar pairs/)).toHaveTextContent('Radar pairs 2 of 3 dates · 1 unpaired (left out)');
    const table = screen.getByRole('table', { name: 'Optical/radar date pairs' });
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['Optical date', 'Radar date', 'Gap (days)', 'Orbit', 'Area covered %']);
    const rows = within(table).getAllByRole('row');
    expect(rows[1]).toHaveTextContent('Descending');
    expect(rows[2]).toHaveTextContent('Caution · over 7 days');
    expect(rows[3]).toHaveTextContent('No radar – left out');
    expect(document.body).not.toHaveTextContent(HANGUL);

    expect(pairLine({ time: '2024-08-14T02:15:00Z', s1Time: '2024-08-13T21:30:00Z', orbitPass: 'DESCENDING', daysApart: 0.6 }, 'en')).toBe('S1 pair: 2024-08-13 Descending (0.6-day gap)');
    expect(pairLine({ time: '2024-08-19', s1Time: null }, 'en')).toBe('No S1 pair (radar values empty)');
    expect(translate('en', 'wizard.estimate.blockers.NO_S1_MATCH')).toMatch(/^No radar \(Sentinel-1\) image covers the area/);
  });

  test('no pair at all blocks with the reason', () => {
    render(inEnglish(<PairTable data={{ ...base, pairs: [{ s2Date: '2024-08-14', s1Date: null }] }} keepUnpaired />));
    expect(screen.getByRole('alert')).toHaveTextContent('No radar (Sentinel-1) image covers the area within the date gap. Widen the period or allow a larger gap.');
    expect(screen.getByRole('table')).toHaveTextContent('No radar – kept without radar');
  });
});

describe('Whole GEE flow in English', () => {
  test('every step, the review and the result screen have no Korean', async () => {
    renderWizard();
    await flow.toData();
    expect(screen.getByRole('heading', { level: 2, name: 'Data' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('radio', { name: /Sentinel-2 L2A/ }));
    expect(screen.getByRole('group', { name: /^Bands to build into Zarr/ })).toHaveTextContent('0 of 7 selected');
    fireEvent.click(screen.getByRole('checkbox', { name: 'B8' }));
    expect(document.body).not.toHaveTextContent(HANGUL);
    await flow.toArea();
    setPoint('127.502', '36.454');
    await toDates();
    expect(screen.getByRole('heading', { level: 2, name: 'Period & dates' })).toBeInTheDocument();
    const panel = screen.getByRole('region', { name: 'Estimated size' });
    await waitFor(() => expect(panel).toHaveTextContent('Estimated scenes'), { timeout: T });
    expect(await screen.findByRole('table', { name: 'Choose dates · optical/radar date pairs' }, { timeout: T })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);

    await flow.toReview();
    expect(screen.getByRole('heading', { level: 2, name: 'Name & review' })).toBeInTheDocument();
    // The name is filled in from the place and period; clearing it asks for one.
    expect(screen.getByLabelText('Data name')).toHaveValue('127.50,36.45 2026-05');
    fireEvent.change(screen.getByLabelText('Data name'), { target: { value: '' } });
    fireEvent.click(screen.getByRole('button', { name: 'Start building' }));
    expect(screen.getAllByText('Enter a data name.').length).toBeGreaterThan(0);
    expect(screen.getByLabelText('Data name')).toHaveFocus();
    fireEvent.change(screen.getByLabelText('Data name'), { target: { value: 'Chungju S2' } });
    fireEvent.change(screen.getByLabelText('B8 display min'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('B8 display max'), { target: { value: '4000' } });
    expect(screen.getByRole('combobox', { name: 'B8 color map' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'No project' })).toBeInTheDocument();
    expect(screen.getByText(/Point \+ size · Center 127\.5020, 36\.4540 · 30 km per side/)).toBeInTheDocument();
    expect(screen.getByTestId('summary-clip')).toHaveTextContent('Keep the rectangle');
    expect(await screen.findByText(/^\d+ of \d+ dates selected$/, undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText(/· viridis · 0 – 4000/)).toBeInTheDocument();
    const start = await flow.createButton();
    expect(document.body).not.toHaveTextContent(HANGUL);
    fireEvent.click(start);

    expect(await screen.findByRole('heading', { level: 2, name: 'Build started' }, { timeout: T })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Build started' })).toHaveFocus();
    expect(screen.getByText(/^“Chungju S2” job demo-\d+ ·/)).toHaveTextContent(/^“Chungju S2” job demo-\d+ · Queued · The job keeps running if you close this page\.$/);
    expect(screen.getByRole('link', { name: 'View in Jobs' })).toHaveAttribute('href', '/app/jobs');
    expect(screen.getByRole('button', { name: 'Add other data' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
  });
});

describe('Result screen in English', () => {
  test('a registered Zarr: title, sentence and the links', async () => {
    jest.spyOn(appApi, 'registerDataset').mockResolvedValue({ id: '5' });
    renderWizard();
    fireEvent.click(await screen.findByRole('radio', { name: /Register Zarr/ }));
    fireEvent.click(next());
    expect(within(screen.getByRole('list', { name: 'Progress' })).getAllByRole('listitem').map((item) => item.textContent)).toEqual(['Method', '2Source', '3Settings', '4Review and create']);
    fireEvent.change(screen.getByLabelText('Zarr path / URI'), { target: { value: '/data/lake.zarr' } });
    // Nothing to inspect before registering: straight to the settings.
    fireEvent.click(next());
    fireEvent.change(await screen.findByLabelText('Data name'), { target: { value: 'Lake' } });
    fireEvent.change(screen.getByLabelText('Add variable name'), { target: { value: 'ndwi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));
    fireEvent.click(next());
    expect(screen.getByText('Check the display settings.')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Enter the display min and max.');
    fireEvent.change(screen.getByLabelText('ndwi display min'), { target: { value: '-1' } });
    fireEvent.change(screen.getByLabelText('ndwi display max'), { target: { value: '1' } });
    fireEvent.click(next());
    const note = await screen.findByText(/When you register, the server checks/);
    expect(note).toHaveTextContent('When you register, the server checks the CRS (EPSG:4326), variables and times of /data/lake.zarr. Any problem shows up as a status in your data list.');
    expect(within(note).getByText('/data/lake.zarr').tagName).toBe('STRONG');
    fireEvent.click(await screen.findByRole('button', { name: 'Register' }));
    expect(await screen.findByRole('heading', { level: 2, name: 'Registration requested' }, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('“Lake” is registered. You can see it in the Viewer once the map server finishes syncing.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View data' })).toHaveAttribute('href', '/app/data/5');
    expect(screen.getByRole('link', { name: 'Open in Viewer (new tab)' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
  });
});

// UR-53 stage 5: server message codes with values, worded by the dictionaries. No Korean in English.
describe('Server message codes in English', () => {
  test('estimate blockerItems and warningItems: code text with values; a coded-less Korean note stays out', async () => {
    await toGeeArea();
    jest.spyOn(generation, 'estimateGee').mockResolvedValue({
      areaKm2: 400, grid: { width: 2000, height: 2000 }, scenes: 2, estimatedBytes: 1e8, requestTiles: 1,
      warnings: ['영역을 다 덮지 못해 제외한 날짜: 2024-08-01, 2024-08-06', 'SIDE_EXCEEDS_100_KM', '새 안내 문장'],
      warningItems: [
        { code: 'PARTIAL_COVER_DATES_DROPPED', params: { dates: ['2024-08-01', '2024-08-06'] }, message: '영역을 다 덮지 못해 제외한 날짜: 2024-08-01, 2024-08-06' },
        { code: 'SIDE_EXCEEDS_100_KM', params: {}, message: 'SIDE_EXCEEDS_100_KM' },
        { message: '새 안내 문장' },
      ],
      blockers: ['SELECTED_DATE_HAS_NO_SCENE'],
      blockerItems: [{ code: 'SELECTED_DATE_HAS_NO_SCENE', params: { date: '2024-08-14' }, message: 'SELECTED_DATE_HAS_NO_SCENE: 2024-08-14' }],
    });
    setPoint('127.5', '36.4');
    await toDates();
    expect(await screen.findByRole('alert', undefined, { timeout: T })).toHaveTextContent('No image on a chosen date: 2024-08-14');
    expect(screen.getByText('Left out because they don’t cover the whole area: 2024-08-01, 2024-08-06')).toBeInTheDocument();
    expect(screen.getByText('A side of the area is over 100 km. Fetching may take a long time.')).toBeInTheDocument();
    expect(screen.getByText('The server added a note that isn’t available in English.')).toBeInTheDocument();
    expect(next()).toBeDisabled();
    expect(screen.getByRole('region', { name: 'Estimated size' })).not.toHaveTextContent(HANGUL);
  });

  test('blockerText and warningText: wizard codes first, then server codes, sentences and a generic line', () => {
    expect(blockerText({ code: 'NO_FULL_COVER_DATE', params: { dates: [] }, message: 'NO_FULL_COVER_DATE' }, 'en')).toMatch(/^No image covers 100% of this place/);
    expect(blockerText({ code: 'COLLECTION_NOT_VERIFIED', params: { collectionId: 'X' }, message: '검증된 컬렉션만 생성할 수 있습니다.' }, 'en')).toBe('Only verified collections can be built.');
    expect(blockerText({ code: 'NEW_CODE', message: '새 차단 사유' }, 'en')).toBe('This request can’t go ahead. (NEW_CODE)');
    expect(blockerText({ code: 'NEW_CODE', message: '새 차단 사유' }, 'ko')).toBe('새 차단 사유');
    expect(warningText({ code: 'MAX_SCENES_LIMITED', params: { count: 40, used: 30 } }, 'en')).toBe('Time-step limit: built 30 of 40 dates.');
    expect(warningText({ code: 'GEE_SCENE_COUNT_UNAVAILABLE', message: 'GEE_SCENE_COUNT_UNAVAILABLE' }, 'en')).toBe('Couldn’t get the scene count from GEE.');
  });

  test('admin areas: attributionCode in English; an older server’s Korean attribution falls back to the known source', async () => {
    const search = jest.spyOn(generation, 'searchAdminAreas').mockResolvedValue({ items: [], attribution: '경계: 새 출처', attributionCode: 'SGIS_ADMDONGKOR' });
    await toGeeArea();
    fireEvent.click(screen.getByRole('tab', { name: 'Administrative area' }));
    fireEvent.change(screen.getByLabelText('Search administrative areas'), { target: { value: 'Jeju' } });
    await waitFor(() => expect(search).toHaveBeenCalled(), { timeout: T });
    expect(await screen.findByText('No results.', undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('Boundaries: Statistics Korea SGIS (KOGL Type 1), admdongkor (CC BY 4.0)')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
    search.mockResolvedValue({ items: [{ code: '11', level: 'sido', name: 'Seoul', bbox: [126.7, 37.4, 127.2, 37.7], areaKm2: 605 }], attribution: '경계: 옛 서버 문장' });
    fireEvent.change(screen.getByLabelText('Search administrative areas'), { target: { value: 'Seoul' } });
    expect(await screen.findByRole('button', { name: /Seoul/ }, { timeout: T })).toBeInTheDocument();
    expect(screen.getByText('Boundaries: Statistics Korea SGIS (KOGL Type 1), admdongkor (CC BY 4.0)')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(HANGUL);
  });

  test('file check: messageCode and messageParams instead of the Korean message', async () => {
    jest.spyOn(generation, 'inspect').mockResolvedValue({
      sourceType: 'CAS500', fileName: 'cas.zip', bands: ['B', 'G', 'R', 'N'], bounds: { west: 126, south: 35, east: 127, north: 36 }, files: ['a_B.tif', 'a_G.tif', 'a_R.tif', 'a_N.tif', 'a_Aux.xml'],
      message: 'CAS500 패키지를 확인했습니다. 4개 TIFF · 1개 Aux.xml', messageCode: 'CAS500_CHECKED', messageParams: { tiffs: 4, aux: 1 }, inputs: [{ kind: 'zip', uri: 'file:///tmp/cas.zip' }],
    });
    renderWizard();
    fireEvent.click(await screen.findByRole('radio', { name: /GeoTIFF \/ CAS500/ }));
    fireEvent.click(next());
    fireEvent.change(screen.getByLabelText('Choose file'), { target: { files: [new File(['x'], 'cas.zip', { type: 'application/zip' })] } });
    expect(await screen.findByText('CAS500 package checked. TIFF files: 4 · Aux.xml files: 1', undefined, { timeout: T })).toBeInTheDocument();
    expect(screen.queryByText(/패키지를 확인했습니다/)).not.toBeInTheDocument();
  });
});
