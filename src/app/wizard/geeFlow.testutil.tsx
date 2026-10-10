/* Test helpers that walk the GEE wizard (UR-54): 방식 → 자료 → 영역 → 기간·날짜 → 이름·확인. Used by the wizard tests only. */
import { fireEvent, screen, waitFor } from '@testing-library/react';

export type FlowText = { next: RegExp; create: string; start: string; end: string; lon: string; lat: string; name: string; pointTab: string };
export const KO: FlowText = { next: /^다음/, create: '생성 시작', start: '시작 날짜', end: '끝 날짜', lon: '중심 경도', lat: '중심 위도', name: '데이터 이름', pointTab: '지점 + 크기' };
export const EN: FlowText = { next: /^Next/, create: 'Start building', start: 'Start date', end: 'End date', lon: 'Center longitude', lat: 'Center latitude', name: 'Data name', pointTab: 'Point + size' };
const T = 4000;

export function geeFlow(text: FlowText = KO) {
  const next = () => screen.getByRole('button', { name: text.next });
  const clickNext = () => fireEvent.click(next());
  /** A typed number counts on blur (CommitField), as when the user tabs on. */
  const type = (label: string, value: string) => {
    const field = screen.getByLabelText(label);
    fireEvent.change(field, { target: { value } });
    fireEvent.blur(field);
  };
  return {
    next,
    clickNext,
    type,
    /** 방식 → 자료 (the collection list is loaded). */
    async toData() {
      fireEvent.click(await screen.findByRole('radio', { name: /Google Earth Engine/ }));
      clickNext();
      await screen.findByRole('radio', { name: /Sentinel-2 L2A/ });
    },
    /** A collection from the list and the bands to build (exact band names). */
    choose(collection: RegExp, bands: string[] = []) {
      fireEvent.click(screen.getByRole('radio', { name: collection }));
      for (const band of bands) fireEvent.click(screen.getByRole('checkbox', { name: band }));
    },
    async toArea() {
      clickNext();
      await screen.findByRole('tab', { name: text.pointTab });
    },
    setPoint(lon: string, lat: string) {
      type(text.lon, lon);
      type(text.lat, lat);
    },
    async toDates() {
      clickNext();
      await screen.findByLabelText(text.start);
    },
    setPeriod(start: string, end: string) {
      fireEvent.change(screen.getByLabelText(text.start), { target: { value: start } });
      fireEvent.change(screen.getByLabelText(text.end), { target: { value: end } });
    },
    /** Waits for the estimate (다음 opens), then goes to the review. */
    async toReview() {
      await waitFor(() => expect(next()).toBeEnabled(), { timeout: T });
      clickNext();
      await screen.findByLabelText(text.name);
    },
    /** The create button once the review's estimate is in. */
    async createButton() {
      const start = await screen.findByRole('button', { name: text.create });
      await waitFor(() => expect(start).toBeEnabled(), { timeout: T });
      return start;
    },
    /** 방식 → … → 기간·날짜 with a collection, bands, a point and a period. */
    async toDatesWith({ collection, bands = [], lon, lat, start, end }: { collection: RegExp; bands?: string[]; lon: string; lat: string; start: string; end: string }) {
      await this.toData();
      this.choose(collection, bands);
      await this.toArea();
      this.setPoint(lon, lat);
      await this.toDates();
      this.setPeriod(start, end);
    },
  };
}
