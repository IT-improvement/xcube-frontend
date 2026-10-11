// UX13: the focused map takes the keys — arrows pan, +/- zoom, Home fits, Enter/Space picks the centre pixel.
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { handleMapKey, PAN_STEP_PX } from './keyboard';

// CRA resets jest.fn implementations before each test, so values come from plain functions; jest.fn only records calls.
const mockView = {
  getCenter: () => [1000, 2000],
  getResolution: () => 10,
  getZoom: () => 9,
  animate: jest.fn(),
  setCenter: jest.fn(),
  setZoom: jest.fn(),
};
const mockMapInstance = { getView: () => mockView, on: () => undefined, setTarget: () => undefined };
const mockDefaults = jest.fn();

jest.mock('ol/Map', () => ({ __esModule: true, default: function MockMap() { return mockMapInstance; } }));
jest.mock('ol/View', () => ({ __esModule: true, default: function MockView() { return {}; } }));
jest.mock('ol/layer/Tile', () => ({ __esModule: true, default: function MockTile() { return { setVisible: () => undefined }; } }));
jest.mock('ol/source/OSM', () => ({ __esModule: true, default: function MockOsm() { return {}; } }));
jest.mock('ol/proj', () => ({ fromLonLat: (value: number[]) => value }));
jest.mock('ol/interaction/defaults', () => ({ defaults: (options: unknown) => { mockDefaults(options); return []; } }));

const OlMap = require('.').default;

let reducedMotion = false;
beforeEach(() => {
  reducedMotion = false;
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: (query: string) => ({ matches: query.includes('reduce') && reducedMotion, media: query, addEventListener: () => undefined, removeEventListener: () => undefined }),
  });
});

const key = (name: string, extra: Partial<KeyboardEvent> = {}) => ({ key: name, shiftKey: false, altKey: false, ctrlKey: false, metaKey: false, ...extra });

describe('handleMapKey', () => {
  test('방향키는 화면 기준 한 칸(Shift는 네 칸)씩 옮기고 애니메이션한다', () => {
    expect(handleMapKey(mockMapInstance as never, key('ArrowRight'))).toBe(true);
    expect(mockView.animate).toHaveBeenLastCalledWith({ center: [1000 + PAN_STEP_PX * 10, 2000], duration: 160 });
    handleMapKey(mockMapInstance as never, key('ArrowUp', { shiftKey: true }));
    expect(mockView.animate).toHaveBeenLastCalledWith({ center: [1000, 2000 + PAN_STEP_PX * 4 * 10], duration: 160 });
    expect(mockView.setCenter).not.toHaveBeenCalled();
  });

  test('움직임 줄이기를 켜면 애니메이션 없이 바로 옮기고 확대한다', () => {
    reducedMotion = true;
    handleMapKey(mockMapInstance as never, key('ArrowLeft'));
    expect(mockView.setCenter).toHaveBeenCalledWith([1000 - PAN_STEP_PX * 10, 2000]);
    handleMapKey(mockMapInstance as never, key('+'));
    expect(mockView.setZoom).toHaveBeenCalledWith(10);
    expect(mockView.animate).not.toHaveBeenCalled();
  });

  test('+/-는 한 단계 확대·축소, Home은 데이터 맞춤, Enter·Space는 가운데 좌표를 조회한다', () => {
    const onPick = jest.fn();
    const onHome = jest.fn();
    handleMapKey(mockMapInstance as never, key('='));
    expect(mockView.animate).toHaveBeenLastCalledWith({ zoom: 10, duration: 160 });
    handleMapKey(mockMapInstance as never, key('-'));
    expect(mockView.animate).toHaveBeenLastCalledWith({ zoom: 8, duration: 160 });
    expect(handleMapKey(mockMapInstance as never, key('Home'), { onHome })).toBe(true);
    expect(onHome).toHaveBeenCalled();
    expect(handleMapKey(mockMapInstance as never, key('Enter'), { onPick })).toBe(true);
    handleMapKey(mockMapInstance as never, key(' '), { onPick });
    expect(onPick).toHaveBeenCalledTimes(2);
    expect(onPick).toHaveBeenCalledWith([1000, 2000]);
  });

  test('Ctrl·⌘·Alt 조합과 다른 키는 브라우저에 맡긴다', () => {
    expect(handleMapKey(mockMapInstance as never, key('+', { ctrlKey: true }))).toBe(false);
    expect(handleMapKey(mockMapInstance as never, key('ArrowLeft', { altKey: true }))).toBe(false);
    expect(handleMapKey(mockMapInstance as never, key('a'))).toBe(false);
    expect(handleMapKey(mockMapInstance as never, key('Enter'))).toBe(false); // nothing to pick yet
    expect(mockView.animate).not.toHaveBeenCalled();
  });
});

describe('OlMap keyboard', () => {
  test('keyboard가 있으면 이름·설명이 있는 포커스 가능한 지도가 되고, OpenLayers 기본 키 처리는 끈다', () => {
    const onPick = jest.fn();
    render(
      <>
        <OlMap keyboard={{ label: '지도: 대청호. 방향키로 이동', helpId: 'help', onPick }} />
        <p id="help">방향키로 지도를 옮깁니다</p>
      </>,
    );
    expect(mockDefaults).toHaveBeenCalledWith({ keyboard: false });
    const map = screen.getByRole('application', { name: '지도: 대청호. 방향키로 이동' });
    expect(map).toHaveAttribute('tabindex', '0');
    expect(map).toHaveAccessibleDescription('방향키로 지도를 옮깁니다');
    fireEvent.keyDown(map, { key: 'ArrowDown' });
    expect(mockView.animate).toHaveBeenCalledWith({ center: [1000, 2000 - PAN_STEP_PX * 10], duration: 160 });
    const outside = jest.fn();
    window.addEventListener('keydown', outside);
    fireEvent.keyDown(map, { key: 'Enter' });
    window.removeEventListener('keydown', outside);
    expect(onPick).toHaveBeenCalledWith([1000, 2000]);
    expect(outside).not.toHaveBeenCalled(); // the Viewer's time keys never see a key the map used
  });

  test('keyboard가 없으면(나란히의 두 번째 지도) 포커스를 받지 않는다', () => {
    const { container } = render(<OlMap />);
    // eslint-disable-next-line testing-library/no-node-access, testing-library/no-container
    const map = container.querySelector('.map-component');
    expect(map).not.toHaveAttribute('tabindex');
    expect(screen.queryByRole('application')).not.toBeInTheDocument();
  });
});
