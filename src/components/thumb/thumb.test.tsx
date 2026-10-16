/* FB1 preview pictures: one request per picture (memory cache), 503 → grey place, any error → extent sketch,
   the object URL is made per shown picture and revoked when it leaves. */
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

jest.mock('../../api', () => ({ useMockApi: false }));
jest.mock('../../api/backofficeApi', () => ({ BACKOFFICE_API_BASE_URL: 'http://bo' }));
jest.mock('../../api/httpClient', () => ({ ...jest.requireActual('../../api/httpClient'), requestBlob: jest.fn() }));

const { ApiError, requestBlob } = require('../../api/httpClient') as { ApiError: any; requestBlob: jest.Mock };
const { loadThumbnail, resetThumbnailCache } = require('../../api/thumbnails');
const DatasetThumb = require('./DatasetThumb').default;
const { ThumbStack } = require('./DatasetThumb');

const created: string[] = [];
const revoked: string[] = [];
beforeEach(() => {
  resetThumbnailCache();
  requestBlob.mockReset();
  created.length = 0;
  revoked.length = 0;
  let n = 0;
  (URL as any).createObjectURL = jest.fn(() => { const url = `blob:t${++n}`; created.push(url); return url; });
  (URL as any).revokeObjectURL = jest.fn((url: string) => revoked.push(url));
});

test('같은 그림은 한 번만 받고(인증 요청), 크기별로 따로 받는다', async () => {
  requestBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  const [a, b] = await Promise.all([loadThumbnail('70', 128), loadThumbnail('70', 128)]);
  expect(a.state).toBe('ready');
  expect(b).toBe(a);
  await loadThumbnail('70', 128);
  expect(requestBlob).toHaveBeenCalledTimes(1);
  expect(requestBlob).toHaveBeenCalledWith('http://bo', '/api/v1/datasets/70/thumbnail.png?size=128');
  await loadThumbnail('70', 256);
  expect(requestBlob).toHaveBeenCalledTimes(2);
});

test('503 THUMBNAIL_NOT_READY는 준비 중, 다른 오류는 실패', async () => {
  requestBlob.mockRejectedValueOnce(new ApiError(503, 'THUMBNAIL_NOT_READY', 'not yet'));
  expect(await loadThumbnail('71', 128)).toEqual({ state: 'pending' });
  requestBlob.mockRejectedValueOnce(new ApiError(404, 'NOT_FOUND', 'no'));
  expect(await loadThumbnail('72', 128)).toEqual({ state: 'failed' });
});

test('그림이 오면 object URL로 보이고, 화면을 떠나면 해제한다', async () => {
  requestBlob.mockResolvedValue(new Blob(['png'], { type: 'image/png' }));
  const { container, unmount } = render(<DatasetThumb dataset={{ id: '70', bbox: [126, 33, 127, 34] }} size={48} />);
  await waitFor(() => expect(container.querySelector('img')).toHaveAttribute('src', 'blob:t1'));
  expect(container.querySelector('.thumb')).toHaveAttribute('data-state', 'ready');
  expect(container.querySelector('.thumb')).toHaveAttribute('aria-hidden', 'true');
  unmount();
  expect(revoked).toEqual(['blob:t1']);
  // A second showing reuses the cached picture (no new request) with its own URL.
  const again = render(<DatasetThumb dataset={{ id: '70' }} />);
  await waitFor(() => expect(again.container.querySelector('img')).toHaveAttribute('src', 'blob:t2'));
  expect(requestBlob).toHaveBeenCalledTimes(1);
});

test('준비 중이면 회색 자리, 실패하면 범위 도식', async () => {
  requestBlob.mockRejectedValueOnce(new ApiError(503, 'THUMBNAIL_NOT_READY', 'not yet')).mockRejectedValueOnce(new ApiError(500, 'X', 'boom'));
  const pending = render(<DatasetThumb dataset={{ id: '71', bbox: [126, 33, 127, 34] }} />);
  await waitFor(() => expect(pending.container.querySelector('.thumb')).toHaveAttribute('data-state', 'pending'));
  expect(pending.container.querySelector('img, svg')).toBeNull();
  const failed = render(<DatasetThumb dataset={{ id: '72', bbox: [126, 33, 127, 34] }} />);
  await waitFor(() => expect(failed.container.querySelector('.thumb')).toHaveAttribute('data-state', 'failed'));
  expect(failed.container.querySelector('.thumb-sketch__area')).not.toBeNull();
});

test('프로젝트 줄은 최대 3장만 겹쳐 보인다', () => {
  requestBlob.mockResolvedValue(new Blob(['png']));
  const { container } = render(<ThumbStack datasets={['1', '2', '3', '4'].map((id) => ({ id }))} />);
  expect(container.querySelectorAll('.thumb')).toHaveLength(3);
});
