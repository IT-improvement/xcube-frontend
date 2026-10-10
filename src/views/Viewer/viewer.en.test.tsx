/* UR-53 stage 4: the Viewer in English (demo mode). The Korean Viewer stays covered by the other tests here. */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LanguageProvider } from '../../i18n';
import Viewer from '.';
import ViewerTour from './ViewerTour';
import SourceLegend, { rgbMapping } from './SourceLegend';
import { AiLegend, AiResultList, areaCsv, csvFileName, entryDetail, shortDate, unitDecisionText, WaterAreaRow } from './AiPanel';
import { demoResult } from '../../app/aiDemo';

jest.mock('../../components/map', () => ({
  __esModule: true,
  default: () => <div aria-label="Test map" />,
}));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
// The demo adapter, plus two datasets with real dates: one time (nothing to play) and two times (date labels).
jest.mock('../../api', () => {
  const actual = jest.requireActual('../../api/viewerAdapter').viewerAdapter;
  const base = { projectId: '', subtitle: '', defaultVariable: 'B4', variables: ['B4', 'B3', 'B2'], accessType: 'OWNED' };
  const extra = [
    { ...base, id: 'single', name: 'Daecheong single', xcubeDatasetId: 'dc1', times: [{ iso: '2024-08-14T12:00:00', label: '2024. 8. 14.' }] },
    { ...base, id: 'pair', name: 'Daecheong pair', xcubeDatasetId: 'dc2', times: [{ iso: '2024-08-14T12:00:00', label: '2024. 8. 14.' }, { iso: '2024-09-01T12:00:00', label: '2024. 9. 1.' }] },
  ];
  return {
    activeViewerAdapter: { ...actual, getDatasets: async (projectId?: string) => [...(await actual.getDatasets(projectId)), ...extra] },
    useMockApi: true,
  };
});

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({ matches: false, media: query, onchange: null, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn() })),
  });
  window.history.replaceState(null, '', '/app/viewer');
});

const english = (ui: React.ReactElement) => render(<LanguageProvider initial="en">{ui}</LanguageProvider>);
async function openViewer(datasetId: string) {
  english(<Viewer initialDatasetId={datasetId} />);
  return screen.findByRole('region', { name: 'Time-series explorer' });
}

describe('Viewer chrome in English', () => {
  test('top bar and status', async () => {
    await openViewer('landsat');
    expect(screen.getByRole('main', { name: 'XCube time-series GIS Viewer' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'XCube home' })).toHaveAttribute('href', '/');
    const crumbs = screen.getByRole('navigation', { name: 'Current project and data' });
    expect(within(crumbs).getByRole('combobox', { name: 'Choose project' })).toHaveDisplayValue('No project');
    expect(within(crumbs).getByRole('combobox', { name: 'Choose data or Zarr' })).toHaveTextContent('Landsat-8 · 2024');
    expect(within(crumbs).getByRole('button', { name: 'Manage project' })).toBeInTheDocument();
    // Demo mode counts as connected to the main map server.
    const status = screen.getAllByRole('status').find((item) => item.classList.contains('vx-status'))!;
    expect(status).toHaveTextContent('Map server connected');
    expect(status).toHaveAttribute('title', 'Map server connected');
    const add = screen.getByRole('link', { name: 'Upload or build a Zarr' });
    expect(add).toHaveTextContent('Add data');
    expect(add).toHaveAttribute('title', 'Add data (new tab)');
    expect(screen.getByRole('button', { name: 'AI water extraction' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Results' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Feature tour' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'User account menu' })).toBeInTheDocument();
    const tools = screen.getByRole('toolbar', { name: 'Map tools' });
    expect(within(tools).getAllByRole('button').map((button) => button.getAttribute('aria-label')))
      .toEqual(['Pan', 'Query pixel value', 'Zoom in', 'Zoom out', 'Zoom to data']);
  });

  test('layer sheet: layer names, band chips and data info, with dates in English', async () => {
    await openViewer('pair');
    fireEvent.click(screen.getByRole('button', { name: 'Open layers and AI jobs panel' }));
    const sheet = screen.getByRole('complementary', { name: 'Layers and AI jobs panel' });
    expect(within(sheet).getAllByRole('tab').map((tab) => tab.textContent)).toEqual(['Layers', 'AI jobs']);
    expect(within(sheet).getByRole('heading', { name: 'Band to show' })).toBeInTheDocument();
    expect(within(sheet).getAllByRole('button', { pressed: false }).map((chip) => chip.textContent)).toEqual(expect.arrayContaining(['B3', 'B2']));
    expect(within(sheet).getByRole('checkbox', { name: 'Source imagery' })).toBeChecked();
    expect(within(sheet).getByRole('slider', { name: 'Source imagery opacity' })).toBeInTheDocument();
    expect(within(sheet).getByText('Opacity')).toBeInTheDocument();
    expect(within(sheet).getByRole('checkbox', { name: 'Basemap' })).toBeChecked();
    expect(within(sheet).getByRole('heading', { name: 'Data info' })).toBeInTheDocument();
    const info = Object.fromEntries(Array.from(sheet.querySelectorAll('.vx-meta > div')).map((row) => [row.querySelector('dt')!.textContent, row.querySelector('dd')!.textContent])); // eslint-disable-line testing-library/no-node-access
    expect(info).toEqual({ Name: 'Daecheong pair', Times: '2', Period: 'Aug 14, 2024 – Sep 1, 2024', Bands: '3', CRS: 'EPSG:4326' });
    // The time staff and the current time use the same English dates.
    expect(screen.getByRole('slider', { name: 'Acquisition time' })).toHaveAttribute('aria-valuetext', 'Aug 14, 2024, 1 / 2');
    fireEvent.click(within(sheet).getByRole('tab', { name: 'AI jobs' }));
    expect(within(sheet).getByRole('heading', { name: 'AI results for this data' })).toBeInTheDocument();
    expect(await within(sheet).findByText('No AI results for this data yet.')).toBeInTheDocument();
  });

  test('dock: play, playback options and compare modes', async () => {
    const timeline = await openViewer('landsat');
    expect(within(timeline).getByRole('button', { name: 'Previous time' })).toHaveAttribute('title', 'Previous time (←)');
    expect(within(timeline).getByRole('button', { name: 'Play' })).toHaveAttribute('title', 'Play (Space)');
    expect(within(timeline).getByRole('button', { name: 'Next time' })).toBeInTheDocument();
    const options = within(timeline).getByRole('button', { name: 'Playback options, 1x, loop' });
    fireEvent.click(options);
    const panel = within(timeline).getByRole('group', { name: 'Playback options' });
    expect(within(panel).getByText('Jump')).toBeInTheDocument();
    expect(within(panel).getByRole('button', { name: 'First time' })).toHaveTextContent('First');
    expect(within(panel).getByRole('button', { name: 'Last time' })).toHaveTextContent('Last');
    expect(within(panel).getByRole('group', { name: 'Speed' })).toHaveTextContent('0.5x1x2x4x');
    expect(within(panel).getByRole('checkbox', { name: 'Loop' })).toHaveAccessibleDescription('After the last time, start again from the first.');
    fireEvent.click(within(panel).getByRole('button', { name: '2x' }));
    expect(within(timeline).getByRole('button', { name: 'Playback options, 2x, loop' })).toBeInTheDocument();

    const modes = within(timeline).getByRole('group', { name: 'Display mode' });
    expect(within(modes).getAllByRole('button').map((button) => button.textContent)).toEqual(['Single', 'Swipe', 'Side by side']);
    expect(within(modes).getByRole('button', { name: 'Single' })).toHaveAttribute('title', 'Single view');
    expect(within(modes).getByRole('button', { name: 'Swipe' })).toHaveAttribute('title', 'Swipe comparison');
    fireEvent.click(within(modes).getByRole('button', { name: 'Swipe' }));
    const target = screen.getByRole('group', { name: 'Compare' });
    expect(within(target).getByText('Compare:')).toBeInTheDocument();
    expect(within(target).getByRole('button', { name: 'Time' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('combobox', { name: 'Compare time B' })).toBeInTheDocument();
    expect(screen.getByRole('slider', { name: 'Swipe divider' })).toHaveAttribute('aria-valuetext', 'A on the left 50%, B on the right 50%');
    await waitFor(() => expect(within(target).getByRole('button', { name: 'AI result' })).toBeEnabled());
    fireEvent.click(within(target).getByRole('button', { name: 'AI result' }));
    expect(screen.getByRole('slider', { name: 'Swipe divider' })).toHaveAttribute('aria-valuetext', 'Source on the left 50%, AI result on the right 50%');
    expect(within(timeline).getByText('Source ↔ AI result')).toBeInTheDocument();
  });

  test('dock: one time cannot play, and says why', async () => {
    const timeline = await openViewer('single');
    const play = within(timeline).getByRole('button', { name: 'Play (needs two or more times)' });
    expect(play).toBeDisabled();
    expect(play).toHaveAttribute('title', 'Only one time, so there’s nothing to play');
    expect(within(timeline).getByRole('button', { name: 'Swipe' })).toBeDisabled();
    expect(within(timeline).getByText('Aug 14, 2024', { selector: 'strong' })).toBeInTheDocument();
  });

  test('tour step 1', () => {
    english(<ViewerTour onClose={jest.fn()} />);
    const dialog = screen.getByRole('dialog', { name: 'Choose a dataset' });
    expect(dialog).toHaveAccessibleDescription(/Find the satellite data \(Zarr\) to show on the map by name/);
    expect(within(dialog).getByText('1 / 8')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Next' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Close tour' })).toHaveAttribute('title', 'Close');
    expect(within(dialog).getByRole('checkbox', { name: 'Don’t show again' })).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Next' }));
    expect(screen.getByRole('dialog', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});

describe('Legends and AI in English', () => {
  test('source legend: the RGB line names channels in English', () => {
    english(<SourceLegend variable="rgb" rgbBands={['B4', 'B3', 'B2']} />);
    const legend = screen.getByRole('group', { name: 'Source legend: RGB composite, Red B4 · Green B3 · Blue B2' });
    expect(within(legend).getByText('RGB composite')).toBeInTheDocument();
    expect(within(legend).getByText('Red B4 · Green B3 · Blue B2')).toBeInTheDocument();
    expect(rgbMapping(['red', 'green', 'blue'], 'en')).toBe('Red red · Green green · Blue blue');
  });

  test('source legend: categorical codes and range', () => {
    english(<SourceLegend variable="scl" style={{ colorBarName: 'tab10', colorBarNorm: 'cat', colorBarMin: 0, colorBarMax: 11 }} />);
    expect(screen.getByRole('group', { name: 'Source legend: scl, categories (codes), Code 0 – 11' })).toHaveTextContent('Code 0 – 11');
  });

  test('AI drawer: model list and input check wording', async () => {
    await openViewer('nakdong');
    fireEvent.click(screen.getByRole('button', { name: 'AI water extraction' }));
    const drawer = screen.getByRole('complementary', { name: 'AI water extraction settings' });
    expect(within(drawer).getByRole('heading', { name: 'AI water extraction' })).toBeInTheDocument();
    const radios = await within(drawer).findAllByRole('radio');
    expect(radios.map((radio) => radio.closest('label')!.querySelector('strong')!.textContent)) // eslint-disable-line testing-library/no-node-access
      .toEqual(['NDWI baseline', 'U-Net (S1+S2, 10 channels)', 'DeepLabV3+ (S1+S2, 10 channels)']);
    expect(within(drawer).getByText('Index-based · Default threshold 0.00')).toBeInTheDocument();
    expect(within(drawer).getAllByText('Deep learning · Default threshold 0.50')).toHaveLength(2);
    expect(within(drawer).getByText(/Counts a pixel as water when NDWI/)).toBeInTheDocument();
    expect(await within(drawer).findByText('All present')).toBeInTheDocument();
    expect(within(drawer).getByText('Required inputs')).toBeInTheDocument();
    expect(within(drawer).getAllByText(/^← .+ · Kept as is$/)).toHaveLength(2);
    expect(within(drawer).getByRole('slider', { name: 'NDWI threshold' })).toHaveAttribute('aria-valuetext', '0.00 (default)');
    expect(within(drawer).getByText(/NDWI above this value counts as water\. Default 0\.00/)).toBeInTheDocument();
    expect(within(drawer).getByText(/^8 times to process · Grid 3,008 × 3,715$/)).toBeInTheDocument();
    expect(within(drawer).getByLabelText('Start time')).toHaveDisplayValue('From the first');
    expect(within(drawer).getByLabelText('End time')).toHaveDisplayValue('To the last');
    expect(within(drawer).getByRole('textbox', { name: 'Result name' })).toHaveAttribute('placeholder', expect.stringMatching(/^Nakdong · 2025_water_NDWI baseline_\d{8}$/));
    await waitFor(() => expect(within(drawer).getByRole('button', { name: 'Run' })).toBeEnabled());

    fireEvent.click(within(drawer).getByRole('radio', { name: /U-Net/ }));
    const note = await within(drawer).findByText(/so this model can’t run/);
    expect(note).toHaveTextContent('This data has no VV (radar), VH (radar), SWIR, so this model can’t run. Build “For water analysis” data with both Sentinel-1 and Sentinel-2, or choose the NDWI baseline, which needs only Green and NIR.');
    expect(within(drawer).getByText('3 missing')).toBeInTheDocument();
    expect(within(drawer).getAllByText('Missing')).toHaveLength(3);
    expect(within(drawer).getByRole('slider', { name: 'Water probability threshold' })).toBeInTheDocument();
    expect(within(drawer).getByText('Every required input is needed to run.')).toBeInTheDocument();
    expect(unitDecisionText('dB→×100', 'en')).toEqual({ text: 'Scaled ×100', detail: 'Radar dB values are multiplied by 100 to match the training format (dB×100).' });
  });

  test('AI result rows: period, threshold and created time in English', () => {
    const year = new Date().getFullYear();
    const entry = {
      key: 'a', name: 'Daecheong_water', status: 'SUCCEEDED', modelId: 'unet-s1s2-10ch', threshold: 0.5,
      timeStart: new Date(2024, 7, 14).toISOString(), timeEnd: new Date(2024, 8, 1).toISOString(), createdAt: new Date(year, 9, 9, 14, 32).toISOString(),
    };
    expect(entryDetail(entry, 'en')).toBe('Aug 14, 2024 – Sep 1, 2024 · Threshold 0.50 · Created Oct 9, 14:32');
    expect(entryDetail({ key: 'b', name: 'x', status: 'SUCCEEDED', threshold: 0.35 }, 'en')).toBe('All times · Threshold 0.35');
    expect(shortDate(new Date(2024, 7, 14).toISOString(), 'en')).toBe('Aug 14, 2024');
    english(<AiResultList entries={[entry, { key: 'c', name: 'Queued run', status: 'QUEUED' }]} selectedKey="a" onMap onSelect={jest.fn()} />);
    const row = screen.getByRole('button', { name: /Daecheong_water/ });
    expect(row).toHaveTextContent('DoneU-Net (S1+S2, 10 channels)');
    expect(row).toHaveTextContent('Aug 14, 2024 – Sep 1, 2024 · Threshold 0.50 · Created Oct 9, 14:32');
    expect(within(row).getByText('On the map')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Queued run/ })).toHaveTextContent('Queued');
  });

  test('AI legend and the area graph', () => {
    const times = [
      { iso: '2025-07-03T00:00:00Z', label: 'Jul 3, 2025' },
      { iso: '2025-07-18T00:00:00Z', label: 'Jul 18, 2025' },
      { iso: '2025-08-02T00:00:00Z', label: 'Aug 2, 2025' },
    ];
    const result = demoResult(times, 'unet-s1s2-10ch', 0.5, true);
    english(
      <>
        <AiLegend entry={{ key: 'a', name: 'r', status: 'SUCCEEDED', modelId: 'ndwi-baseline', threshold: 0 }} timeLabel="Jul 3, 2025" covered={false} />
        <WaterAreaRow result={result} times={times} index={0} onIndex={jest.fn()} expanded onToggle={jest.fn()} title="Daecheong_water" />
      </>,
    );
    const legend = screen.getByRole('group', { name: 'AI result legend' });
    expect(legend).toHaveTextContent('Water · AI result');
    expect(legend).toHaveTextContent('NDWI baseline · Threshold 0.00 · Jul 3, 2025');
    expect(legend).toHaveTextContent('This time is outside the AI result’s period, so nothing is shown.');

    const area = screen.getByRole('region', { name: 'Water area by time' });
    expect(within(area).getByText('Water area')).toBeInTheDocument();
    expect(within(area).getByText('AI result')).toBeInTheDocument();
    expect(within(area).getByRole('img')).toHaveAccessibleName(/^Water area bars by time, max [\d.,]+ km², 2 of 3 times with values$/);
    expect(within(area).getByText('Water area, Jul 3, 2025')).toBeInTheDocument();
    expect(within(area).getByText('Ratio 20.9% · valid 182.40 km²')).toBeInTheDocument();
    expect(within(area).getByRole('button', { name: 'Hide water area graph' })).toBeInTheDocument();
  });

  test('area CSV: English headers and an ASCII-safe file name', () => {
    const times = [{ iso: '2025-07-03T00:00:00Z', label: 'Jul 3, 2025' }];
    const csv = areaCsv(demoResult(times, 'unet-s1s2-10ch', 0.5, true), (iso) => times.find((time) => time.iso === iso)?.label ?? iso, 'en');
    expect(csv.replace(/^﻿/, '').split('\n')[0]).toBe('Time,Date,Water area (km²),Water ratio (%),Valid area (km²),IoU,F1,Precision,Recall');
    expect(csv.split('\n')[1]).toBe('2025-07-03T00:00:00Z,"Jul 3, 2025",38.20,20.9,182.40,0.845,0.916,0.870,0.970');
    expect(csvFileName('Landsat-8 · 2024_수체_U-Net (데모)', 'en')).toBe('Landsat-8_2024_U-Net_water_area.csv');
    expect(csvFileName('대청호', 'en')).toBe('ai_result_water_area.csv');
    expect(csvFileName('대청호/결과', 'ko')).toBe('대청호_결과_수체면적.csv');
  });

  test('result panel: threshold estimate and metrics', async () => {
    await openViewer('landsat');
    fireEvent.click(await screen.findByRole('button', { name: 'Results' }));
    const drawer = screen.getByRole('complementary', { name: 'Compare results' });
    expect(within(drawer).getByRole('heading', { name: 'Result vs. source' })).toBeInTheDocument();
    const slider = await within(drawer).findByRole('slider', { name: 'Estimate threshold' });
    expect(slider).toHaveAttribute('aria-valuetext', 'Threshold 0.50, estimated area 38.20 km²');
    expect(within(drawer).getByText('Estimated area, 2025.07.03')).toBeInTheDocument();
    expect(within(drawer).getByText('Result area (threshold 0.50)')).toBeInTheDocument();
    fireEvent.change(slider, { target: { value: '13' } });
    expect(within(drawer).getByRole('button', { name: 'Run again with threshold 0.70' })).toBeEnabled();
    expect(within(drawer).getByText('Accuracy against ground truth (water_gt)')).toBeInTheDocument();
    for (const label of ['IoU', 'F1', 'Precision', 'Recall']) expect(within(drawer).getByText(label)).toBeInTheDocument();
    expect(within(drawer).getByText(/^Research only/)).toBeInTheDocument();
    expect(within(drawer).getByText(/Best threshold 0\.90/)).toBeInTheDocument();
    expect(within(drawer).getByRole('button', { name: 'Export area by time (CSV)' })).toBeEnabled();
    expect(within(drawer).getByText('Demo data, not a real analysis result.')).toBeInTheDocument();
  });
});

test('no Hangul is left in the English Viewer chrome (data names aside)', async () => {
  const timeline = await openViewer('landsat');
  // Result drawer (the layer sheet closes for it on this narrow window), then the AI run tab of the same drawer.
  fireEvent.click(await screen.findByRole('button', { name: 'Results' }));
  await screen.findByRole('slider', { name: 'Estimate threshold' });
  fireEvent.click(within(screen.getByRole('complementary', { name: 'Compare results' })).getByRole('tab', { name: 'AI jobs' }));
  const drawer = screen.getByRole('complementary', { name: 'AI water extraction settings' });
  await within(drawer).findByRole('radio', { name: /NDWI baseline/ });
  await waitFor(() => expect(within(drawer).queryByText('Checking…')).not.toBeInTheDocument());
  // Layer sheet with its AI results list, the AI comparison and the playback options.
  fireEvent.click(screen.getByRole('button', { name: 'Open layers and AI jobs panel' }));
  const sheet = screen.getByRole('complementary', { name: 'Layers and AI jobs panel' });
  fireEvent.click(within(sheet).getByRole('tab', { name: /AI jobs/ }));
  await within(sheet).findAllByText(/Water extraction result #/);
  fireEvent.click(within(timeline).getByRole('button', { name: 'Swipe' }));
  fireEvent.click(within(screen.getByRole('group', { name: 'Compare' })).getByRole('button', { name: 'AI result' }));
  fireEvent.click(within(timeline).getByRole('button', { name: /Playback options/ }));

  // Names that come from data: projects, datasets and AI result names in the demo catalogue.
  const dataNames = ['한강 수체 모니터링', '낙동강 변화 분석', 'Landsat-8 · 2024_수체_U-Net (데모)'];
  const strip = (text: string) => dataNames.reduce((rest, name) => rest.split(name).join(''), text);
  const texts = [document.body.textContent ?? ''];
  document.body.querySelectorAll('[aria-label], [title], [placeholder], [aria-valuetext]').forEach((element) => { // eslint-disable-line testing-library/no-node-access
    for (const name of ['aria-label', 'title', 'placeholder', 'aria-valuetext']) texts.push(element.getAttribute(name) ?? '');
  });
  const left = texts.map(strip).filter((text) => /[가-힣]/.test(text));
  expect(left).toEqual([]);
});
