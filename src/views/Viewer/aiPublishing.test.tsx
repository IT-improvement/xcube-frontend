/* A finished AI result waits for the owner's pod to serve it; the legend says so instead of an empty map. */
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { AiLegend } from './AiPanel';

const entry: any = { key: 'r1', name: '결과', modelId: 'ndwi-baseline', threshold: 0, datacubeId: '80' };

test('지도에 올리는 중이면 범례가 그렇게 알리고, 기간 밖 안내는 숨긴다', () => {
  const { rerender } = render(<AiLegend entry={entry} covered={false} publishing />);
  expect(screen.getByRole('status')).toHaveTextContent('지도에 올리는 중');
  expect(screen.queryByText(/기간 밖/)).not.toBeInTheDocument();
  rerender(<AiLegend entry={entry} covered={false} />);
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
  expect(screen.getByText(/기간 밖/)).toBeInTheDocument();
});
