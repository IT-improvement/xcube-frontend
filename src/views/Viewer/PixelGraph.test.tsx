import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BottomGraphPanel } from './PixelGraph';

const dataset = { id: '70', projectId: '', name: '제주', subtitle: '', xcubeDatasetId: 'u8-d70', defaultVariable: 'nir', variables: ['nir'], times: [] };

test('비교 시점 중 값이 없는 시점은 가까운 다른 시점 값으로 채우지 않는다', () => {
  // The series omits 2021 (no valid value there); only 2022 has a value.
  render(
    <BottomGraphPanel expanded onToggle={() => undefined} dataset={dataset} variable="nir"
      points={[{ time: '2022-10-19T00:00:00Z', value: 1050 }]} coordinate={{ lon: 126.83, lat: 33.42 }}
      currentTime="2021-11-27T00:00:00Z" currentLabel="2021. 11. 27." compareTime="2022-10-19T00:00:00Z" compareLabel="2022. 10. 19." />,
  );
  expect(screen.getByText('값 없음')).toBeInTheDocument();
  expect(screen.getAllByText('1,050').some((node) => node.tagName === 'DD')).toBe(true);
  expect(screen.queryByText(/0 \(0\.0%\)/)).not.toBeInTheDocument();
});

test('변화량은 이른 시점에서 늦은 시점 방향으로 표시한다', () => {
  render(
    <BottomGraphPanel expanded onToggle={() => undefined} dataset={dataset} variable="nir"
      points={[{ time: '2021-11-27T00:00:00Z', value: 356 }, { time: '2022-10-19T00:00:00Z', value: 1048 }]} coordinate={{ lon: 126.83, lat: 33.42 }}
      currentTime="2021-11-27T00:00:00Z" currentLabel="2021. 11. 27." compareTime="2022-10-19T00:00:00Z" compareLabel="2022. 10. 19." />,
  );
  expect(screen.getByText('A → B 변화')).toBeInTheDocument();
  expect(screen.getByText(/\+692/)).toBeInTheDocument();
});
