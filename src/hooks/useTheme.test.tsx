import { act, fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useTheme } from './useTheme';

let mediaListener: ((event: { matches: boolean }) => void) | undefined;
beforeEach(() => {
  localStorage.clear();
  mediaListener = undefined;
  Object.defineProperty(window, 'matchMedia', { writable: true, value: jest.fn().mockImplementation(() => ({ matches: false, addEventListener: (_: string, listener: (event: { matches: boolean }) => void) => { mediaListener = listener; }, removeEventListener: jest.fn() })) });
});

function ThemeProbe() {
  const { theme, toggle } = useTheme();
  return <button onClick={toggle} aria-pressed={theme === 'dark'} aria-label={theme}>theme</button>;
}

test('테마 선택을 root와 localStorage에 저장한다', () => {
  render(<ThemeProbe />);
  const button = screen.getByRole('button', { name: 'light' });
  fireEvent.click(button);
  expect(document.documentElement.dataset.theme).toBe('dark');
  expect(localStorage.getItem('xcube-viewer-theme')).toBe('dark');
  expect(button).toHaveAttribute('aria-pressed', 'true');
});

test('저장된 값이 없으면 시스템 테마 변경을 반영한다', () => {
  render(<ThemeProbe />);
  act(() => mediaListener?.({ matches: true }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});
