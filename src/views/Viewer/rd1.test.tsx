/* RD1: the Viewer data picker as picture cards or rows (remembered), groups with counts, keyboard by cards. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import DatasetPicker from './DatasetPicker';
import type { ZarrDataset } from '../../api/viewerAdapter';

jest.mock('../../api/thumbnails', () => ({ cachedThumbnail: () => undefined, loadThumbnail: () => Promise.resolve({ state: 'failed' }), PENDING_RETRY_MS: 15000 }));

const times = (count: number) => Array.from({ length: count }, (_, index) => ({ iso: `2024-${String(1 + index).padStart(2, '0')}-14T02:00:00Z`, label: '' }));
const base = { projectId: '', subtitle: '', defaultVariable: '', variables: ['blue', 'green', 'red'], bbox: [126, 33, 127, 34] as [number, number, number, number] };
const datasets = [
  { ...base, id: '1', name: '제주 시계열', xcubeDatasetId: 'd1', times: times(12), accessType: 'OWNED', projectName: '제주 점검' },
  { ...base, id: '2', name: '대청호 한 장면', xcubeDatasetId: 'd2', times: times(1), accessType: 'OWNED' },
  { ...base, id: '3', name: '받은 융합', xcubeDatasetId: 'd3', times: times(3), accessType: 'SHARED', kind: 'FUSION' },
] as unknown as ZarrDataset[];

const open = () => {
  fireEvent.click(screen.getByRole('button', { name: /^데이터 또는 Zarr 선택/ }));
  return screen.getByRole('listbox');
};

beforeEach(() => {
  try { localStorage.clear(); } catch { /* storage unavailable */ }
});

describe('RD1 Viewer 데이터 고르기', () => {
  test('기본은 그림 보기: 카드마다 큰 그림, 종류 태그, 이름, 한 줄 정보, 고른 데이터는 ✓', () => {
    render(<DatasetPicker datasets={datasets} value="1" onChange={jest.fn()} />);
    const list = open();
    expect(list).toHaveClass('dataset-list--grid');
    const card = within(list).getByRole('option', { name: /제주 시계열/ });
    expect(card).toHaveClass('dataset-option--grid');
    expect(card.querySelector('.dataset-card__thumb')).not.toBeNull();
    expect(card.querySelector('.dataset-card__pic .dataset-kind')).toHaveTextContent('원본');
    expect(card).toHaveTextContent('시계열 12시점');
    expect(card).toHaveTextContent('2024.01–2024.12');
    expect(card).toHaveTextContent('band 3개');
    expect(card).toHaveAttribute('aria-selected', 'true');
    expect(card.querySelector('.dataset-card__check')).not.toBeNull();
    // The third line only names a project when there is one.
    expect(card).toHaveTextContent('제주 점검');
    const single = within(list).getByRole('option', { name: /대청호 한 장면/ });
    expect(single).toHaveTextContent('단일 시점');
    expect(single).not.toHaveTextContent('프로젝트 없음');
    expect(single.querySelector('.dataset-where')).toBeNull();
  });

  test('목록 보기로 바꾸면 기억해서 다시 열어도 목록 보기', () => {
    const { unmount } = render(<DatasetPicker datasets={datasets} value="1" onChange={jest.fn()} />);
    open();
    const viewGroup = screen.getByRole('group', { name: '보기 방식' });
    expect(within(viewGroup).getByRole('button', { name: '그림 보기' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(within(viewGroup).getByRole('button', { name: '목록 보기' }));
    expect(screen.getByRole('listbox')).toHaveClass('dataset-list--list');
    expect(screen.getByRole('option', { name: /제주 시계열/ })).toHaveClass('dataset-option--list');
    expect(localStorage.getItem('xcube.viewer.pickerView')).toBe('list');
    unmount();
    render(<DatasetPicker datasets={datasets} value="1" onChange={jest.fn()} />);
    expect(open()).toHaveClass('dataset-list--list');
    expect(within(screen.getByRole('group', { name: '보기 방식' })).getByRole('button', { name: '목록 보기' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('묶음 머리: 내 데이터·공유받음과 개수, 프로젝트를 고르면 “프로젝트: 이름”', () => {
    const { unmount } = render(<DatasetPicker datasets={datasets} value="1" onChange={jest.fn()} />);
    const list = open();
    const mine = within(list).getByRole('group', { name: /내 데이터/ });
    expect(mine).toHaveTextContent('2개');
    expect(within(mine).getAllByRole('option')).toHaveLength(2);
    const shared = within(list).getByRole('group', { name: /공유받음/ });
    expect(within(shared).getByRole('option', { name: /받은 융합/ })).toHaveTextContent('융합');
    unmount();
    render(<DatasetPicker datasets={datasets} value="1" onChange={jest.fn()} project={{ name: '제주 점검', items: [datasets[0], datasets[2]] }} />);
    const scoped = open();
    const group = within(scoped).getByRole('group', { name: /프로젝트: 제주 점검/ });
    expect(group).toHaveTextContent('2개');
    // Inside a project, shared data still says so; own data has no third line.
    expect(within(group).getByRole('option', { name: /받은 융합/ })).toHaveTextContent('공유받음');
    expect(within(group).getByRole('option', { name: /제주 시계열/ }).querySelector('.dataset-where')).toBeNull();
  });

  test('키보드: 방향키로 카드를 옮기고 Enter로 고른다 (검색창에 글자가 있으면 ←/→는 글자 사이를 움직인다)', () => {
    const onChange = jest.fn();
    render(<DatasetPicker datasets={datasets} value="1" onChange={onChange} />);
    open();
    const combo = screen.getByRole('combobox');
    expect(combo).toHaveAttribute('aria-activedescendant', 'zarr-option-0');
    fireEvent.keyDown(combo, { key: 'ArrowRight' });
    expect(combo).toHaveAttribute('aria-activedescendant', 'zarr-option-1');
    fireEvent.keyDown(combo, { key: 'ArrowDown' });
    expect(combo).toHaveAttribute('aria-activedescendant', 'zarr-option-2');
    fireEvent.keyDown(combo, { key: 'ArrowLeft' });
    expect(combo).toHaveAttribute('aria-activedescendant', 'zarr-option-1');
    fireEvent.keyDown(combo, { key: 'Enter' });
    expect(onChange).toHaveBeenCalledWith('2');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    open();
    const typed = screen.getByRole('combobox');
    fireEvent.change(typed, { target: { value: '제' } });
    fireEvent.keyDown(typed, { key: 'ArrowRight' });
    expect(typed).toHaveAttribute('aria-activedescendant', 'zarr-option-0');
  });

  test('목록 보기에서는 ↑/↓만 줄을 옮긴다', () => {
    localStorage.setItem('xcube.viewer.pickerView', 'list');
    render(<DatasetPicker datasets={datasets} value="1" onChange={jest.fn()} />);
    open();
    const combo = screen.getByRole('combobox');
    fireEvent.keyDown(combo, { key: 'ArrowRight' });
    expect(combo).toHaveAttribute('aria-activedescendant', 'zarr-option-0');
    fireEvent.keyDown(combo, { key: 'ArrowDown' });
    expect(combo).toHaveAttribute('aria-activedescendant', 'zarr-option-1');
    expect(screen.getByRole('option', { name: /대청호 한 장면/ }).querySelector('.thumb')).toHaveStyle({ '--thumb': '88px' });
  });
});
