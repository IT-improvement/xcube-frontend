// M5: view state in the address, keyboard time control and the time comparison modes.
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';

jest.mock('../../components/map', () => ({
  __esModule: true,
  default: () => <div aria-label="테스트 지도" />,
}));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({ matches: false, media: query, onchange: null, addEventListener: jest.fn(), removeEventListener: jest.fn(), addListener: jest.fn(), removeListener: jest.fn(), dispatchEvent: jest.fn() })),
  });
  window.history.replaceState(null, '', '/app/viewer');
});

const counter = () => within(screen.getByRole('region', { name: '시계열 탐색기' })).getByText(/\d+ \/ \d+/);

test('주소의 시점·변수·비교 방식을 복원하고, 바꾸면 주소를 갱신한다', async () => {
  window.history.replaceState(null, '', '/app/viewer?dataset=landsat&var=NDWI&t=2025-observation-3&mode=swipe&b=2025-observation-1');
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  await waitFor(() => expect(counter()).toHaveTextContent(/^3 \//));
  expect(screen.getByRole('button', { name: /스와이프/ })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('slider', { name: '스와이프 구분선' })).toBeInTheDocument();
  expect((screen.getByRole('combobox', { name: '비교 시점 B' }) as HTMLSelectElement).value).toBe('0');
  await waitFor(() => expect(window.location.search).toContain('var=NDWI'));
  expect(window.location.search).toContain('t=2025-observation-3');
  expect(window.location.search).toContain('mode=swipe');
  expect(window.location.search).toContain('b=2025-observation-1');

  fireEvent.click(screen.getByRole('button', { name: /나란히/ }));
  expect(screen.getByRole('region', { name: /비교 지도 B/ })).toBeInTheDocument();
  await waitFor(() => expect(window.location.search).toContain('mode=split'));
  fireEvent.click(screen.getByRole('button', { name: /단일/ }));
  await waitFor(() => expect(window.location.search).not.toContain('mode='));
  expect(screen.queryByRole('combobox', { name: '비교 시점 B' })).not.toBeInTheDocument();
});

test('비교를 켜면 B 시점은 현재 시점의 바로 앞이고, 구분선은 키보드로 움직인다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  fireEvent.click(screen.getByRole('button', { name: '다음 시점' }));
  fireEvent.click(screen.getByRole('button', { name: '다음 시점' }));
  fireEvent.click(screen.getByRole('button', { name: /스와이프/ }));
  expect((screen.getByRole('combobox', { name: '비교 시점 B' }) as HTMLSelectElement).value).toBe('1');
  const divider = screen.getByRole('slider', { name: '스와이프 구분선' });
  expect(divider).toHaveAttribute('aria-valuenow', '50');
  fireEvent.keyDown(divider, { key: 'ArrowRight' });
  expect(divider).toHaveAttribute('aria-valuenow', '55');
  // The divider keeps the arrow keys; the time does not move.
  expect(counter()).toHaveTextContent(/^3 \//);
});

test('←/→는 시점을 넘기고 Space는 재생한다. 입력 칸에서는 반응하지 않는다', async () => {
  render(<Viewer initialDatasetId="landsat" />);
  await screen.findByRole('region', { name: '시계열 탐색기' });
  expect(counter()).toHaveTextContent(/^1 \//);
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  fireEvent.keyDown(document.body, { key: 'ArrowRight' });
  expect(counter()).toHaveTextContent(/^3 \//);
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  expect(counter()).toHaveTextContent(/^2 \//);
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  fireEvent.keyDown(document.body, { key: 'ArrowLeft' });
  expect(counter()).toHaveTextContent(/^1 \//);

  fireEvent.keyDown(document.body, { key: ' ' });
  expect(screen.getByRole('button', { name: '일시정지' })).toHaveAttribute('aria-pressed', 'true');
  fireEvent.keyDown(document.body, { key: ' ' });
  expect(screen.getByRole('button', { name: '재생' })).toHaveAttribute('aria-pressed', 'false');

  fireEvent.keyDown(screen.getByRole('slider', { name: '관측 시점' }), { key: 'ArrowRight' });
  expect(counter()).toHaveTextContent(/^1 \//);
});
