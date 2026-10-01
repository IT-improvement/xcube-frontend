import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import Viewer from '.';
import ViewerTour, { VIEWER_TOUR_STEPS, tourDismissed } from './ViewerTour';

jest.mock('../../components/map', () => ({
  __esModule: true,
  default: () => <div>OpenLayers map</div>,
}));
jest.mock('../../components/xcubeLayer', () => ({ __esModule: true, default: jest.fn().mockResolvedValue(undefined) }));
jest.mock('ol/proj', () => ({ toLonLat: (coordinate: [number, number]) => coordinate }));
jest.mock('../../api', () => { const actual = jest.requireActual('../../api/viewerAdapter'); return { activeViewerAdapter: actual.viewerAdapter, useMockApi: true }; });

beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation((query) => ({ matches: false, media: query, addEventListener: jest.fn(), removeEventListener: jest.fn() })),
  });
});

test('다음·이전으로 기능을 차례로 보여 주고 마지막에 시작하기로 닫는다', () => {
  const onClose = jest.fn();
  render(<ViewerTour onClose={onClose} />);
  expect(screen.getByRole('dialog', { name: '데이터셋 선택' })).toBeInTheDocument();
  expect(screen.getByText(`1 / ${VIEWER_TOUR_STEPS.length}`)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: '이전' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByRole('dialog', { name: '프로젝트' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '이전' }));
  expect(screen.getByRole('dialog', { name: '데이터셋 선택' })).toBeInTheDocument();
  for (let step = 1; step < VIEWER_TOUR_STEPS.length; step++) fireEvent.click(screen.getByRole('button', { name: '다음' }));
  expect(screen.getByRole('dialog', { name: '데이터 추가' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '시작하기' }));
  expect(onClose).toHaveBeenCalledTimes(1);
  expect(tourDismissed()).toBe(false);
});

test('다시 보지 않기를 체크하고 닫으면 다음부터 보이지 않는다', () => {
  const onClose = jest.fn();
  render(<ViewerTour onClose={onClose} />);
  fireEvent.click(screen.getByRole('checkbox', { name: '다시 보지 않기' }));
  fireEvent.click(screen.getByRole('button', { name: '둘러보기 닫기' }));
  expect(onClose).toHaveBeenCalled();
  expect(tourDismissed()).toBe(true);
});

test('키보드로 이동하고 Escape로 닫는다', () => {
  const onClose = jest.fn();
  render(<ViewerTour onClose={onClose} />);
  const dialog = screen.getByRole('dialog', { name: '데이터셋 선택' });
  expect(screen.getByRole('button', { name: '다음' })).toHaveFocus();
  fireEvent.keyDown(dialog, { key: 'ArrowRight' });
  expect(screen.getByRole('dialog', { name: '프로젝트' })).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  expect(onClose).toHaveBeenCalled();
});

test('대상이 아직 없는 단계는 가운데 카드와 안내 문구로 보여 준다', () => {
  render(<ViewerTour onClose={jest.fn()} steps={[{ target: 'missing', title: '타임라인', body: '시점을 넘깁니다.', fallback: '데이터셋을 고르면 나타납니다.' }]} />);
  expect(screen.getByText('데이터셋을 고르면 나타납니다.')).toBeInTheDocument();
});

test('Viewer 첫 진입에 둘러보기를 열고, 다시 보지 않기 후에는 상단 버튼으로만 연다', async () => {
  const { unmount } = render(<Viewer onboarding />);
  expect(await screen.findByRole('dialog', { name: '데이터셋 선택' })).toBeInTheDocument();
  expect(screen.queryByText(/데이터셋을 선택하면/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox', { name: '다시 보지 않기' }));
  fireEvent.click(screen.getByRole('button', { name: '둘러보기 닫기' }));
  expect(screen.queryByRole('dialog', { name: '데이터셋 선택' })).not.toBeInTheDocument();
  unmount();

  render(<Viewer onboarding />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  expect(screen.queryByRole('dialog', { name: '데이터셋 선택' })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: '기능 둘러보기' }));
  expect(screen.getByRole('dialog', { name: '데이터셋 선택' })).toBeInTheDocument();
});

test('onboarding이 없으면 둘러보기를 자동으로 열지 않는다', async () => {
  render(<Viewer />);
  await screen.findByRole('option', { name: '한강 수체 모니터링' });
  expect(screen.queryByRole('dialog', { name: '데이터셋 선택' })).not.toBeInTheDocument();
});
