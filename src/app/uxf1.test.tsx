/* UXF1: leaving a screen with unsaved input inside the app asks first (데이터 추가, 수식 융합), and the one step track
   used by those flows reads current and finished steps. */
import { fireEvent, render, screen, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { LeaveGuardProvider, useConfirmLeave, useLeaveGuard } from './leaveGuard';
import { StepTrack } from '../components/ui/kit';

function Form({ dirty }: { dirty: boolean }) {
  useLeaveGuard(dirty);
  const confirmLeave = useConfirmLeave();
  return (
    <div>
      <h1>입력 화면</h1>
      <Link to="/other">다른 화면</Link>
      <a href="https://example.org/">밖으로</a>
      <button type="button" onClick={() => confirmLeave(() => undefined)}>로그아웃</button>
    </div>
  );
}
const renderAt = (dirty: boolean) => render(
  <MemoryRouter initialEntries={['/form']}>
    <LeaveGuardProvider>
      <Routes>
        <Route path="/form" element={<Form dirty={dirty} />} />
        <Route path="/other" element={<h1>다른 화면</h1>} />
      </Routes>
    </LeaveGuardProvider>
  </MemoryRouter>,
);

describe('UXF1 앱 안 이동 경고', () => {
  test('입력 중에 메뉴·링크로 떠나려 하면 묻고, “계속 입력하기”는 머물고 “떠나기”는 이동한다', () => {
    renderAt(true);
    fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
    const ask = screen.getByRole('alertdialog', { name: '이 화면을 떠날까요?' });
    expect(within(ask).getByText(/저장되지 않고 사라집니다/)).toBeInTheDocument();
    expect(within(ask).getByRole('button', { name: '계속 입력하기' })).toHaveFocus();
    fireEvent.click(within(ask).getByRole('button', { name: '계속 입력하기' }));
    expect(screen.getByRole('heading', { name: '입력 화면' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '떠나기' }));
    expect(screen.getByRole('heading', { name: '다른 화면' })).toBeInTheDocument();
  });

  test('입력이 없으면 묻지 않는다. 새 탭으로 여는 누름과 다른 사이트 링크도 막지 않는다', () => {
    const { unmount } = renderAt(true);
    fireEvent.click(screen.getByRole('link', { name: '다른 화면' }), { ctrlKey: true });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('link', { name: '밖으로' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    unmount();
    renderAt(false);
    fireEvent.click(screen.getByRole('link', { name: '다른 화면' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '다른 화면' })).toBeInTheDocument();
  });

  test('코드로 떠나는 동작(로그아웃 등)도 같은 확인을 거친다', () => {
    renderAt(true);
    fireEvent.click(screen.getByRole('button', { name: '로그아웃' }));
    expect(screen.getByRole('alertdialog', { name: '이 화면을 떠날까요?' })).toBeInTheDocument();
  });
});

test('UXF1 단계 표시: 지금 단계는 aria-current, 지난 단계는 화면 낭독용 “완료”와 체크', () => {
  render(<StepTrack label="진행 단계" steps={['방식', '원본', '설정']} current={1} />);
  const items = within(screen.getByRole('list', { name: '진행 단계' })).getAllByRole('listitem');
  expect(items.map((item) => item.textContent)).toEqual(['방식 (완료)', '2원본', '3설정']);
  expect(items[1]).toHaveAttribute('aria-current', 'step');
  expect(items[0]).toHaveClass('is-done');
  expect(items[2]).not.toHaveClass('is-done');
});
