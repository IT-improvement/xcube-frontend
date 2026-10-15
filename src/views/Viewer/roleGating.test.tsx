/* UR-59 in the Viewer: the project menu keeps "new project" and "add to project", off with the reason, when the
   account role is too low. Outside an AuthProvider (other Viewer tests) nothing is locked. */
import { fireEvent, render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LanguageProvider } from '../../i18n';

let mockRole: string | undefined = 'USER';
jest.mock('../../auth/AuthProvider', () => ({ useAuth: () => ({ user: mockRole ? { id: 5, name: '박', role: mockRole } : null }) }));

const ProjectQuickMenu = require('./ProjectQuickMenu').default;
const dataset = { id: '1', name: '대청호', projectId: '', xcubeDatasetId: 'd1', defaultVariable: 'b', variables: ['b'], times: [] };
const project = { id: '9', name: '모니터링', accessRole: 'EDITOR' };

function open() {
  render(<LanguageProvider initial="ko"><ProjectQuickMenu project={project} dataset={dataset} inProject={false} onCreated={jest.fn()} onLinked={jest.fn()} /></LanguageProvider>);
  fireEvent.click(screen.getByRole('button', { name: '프로젝트 관리' }));
}

test('유저: 새 프로젝트와 프로젝트에 추가가 꺼지고 각각 요청할 등급을 말한다', () => {
  open();
  const create = screen.getByRole('button', { name: /새 프로젝트 만들기/ });
  expect(create).toBeDisabled();
  expect(create).toHaveTextContent('관리자에게 프로젝트 관리자 등급을 요청하세요.');
  const link = screen.getByRole('button', { name: /지금 보는 데이터를 이 프로젝트에 추가/ });
  expect(link).toBeDisabled();
  expect(link).toHaveTextContent('관리자에게 프로젝트 유저 등급을 요청하세요.');
});

test('프로젝트 유저: 편집 권한 받은 프로젝트에 추가는 되고, 새 프로젝트만 꺼진다', () => {
  mockRole = 'PROJECT_USER';
  open();
  expect(screen.getByRole('button', { name: /새 프로젝트 만들기/ })).toBeDisabled();
  expect(screen.getByRole('button', { name: /지금 보는 데이터를 이 프로젝트에 추가/ })).toBeEnabled();
});
