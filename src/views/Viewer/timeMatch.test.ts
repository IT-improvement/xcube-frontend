import { matchTimeIndex, parseUtc } from './timeMatch';

const times = ['2025-10-23T02:26:51Z', '2025-11-22T02:26:48Z', '2025-12-22T02:26:49.123Z'].map((iso) => ({ iso }));

describe('UXF1: a time from the address matches the dataset time however it is written', () => {
  test('exact text', () => expect(matchTimeIndex(times, '2025-11-22T02:26:48Z')).toBe(1));
  test('milliseconds, nanoseconds or no zone', () => {
    expect(matchTimeIndex(times, '2025-11-22T02:26:48.000Z')).toBe(1);
    expect(matchTimeIndex(times, '2025-11-22T02:26:48.000000000')).toBe(1);
    expect(matchTimeIndex(times, '2025-11-22T02:26:48')).toBe(1);
    expect(matchTimeIndex(times, '2025-12-22T02:26:49Z')).toBe(2);
    expect(matchTimeIndex(times, '2025-11-22T11:26:48+09:00')).toBe(1);
  });
  test('seconds off, or the day only, picks that day', () => {
    expect(matchTimeIndex(times, '2025-11-22T02:27:27Z')).toBe(1);
    expect(matchTimeIndex(times, '2025-11-22')).toBe(1);
  });
  test('another day or not a date: no match', () => {
    expect(matchTimeIndex(times, '2025-11-23T02:26:48Z')).toBe(-1);
    expect(matchTimeIndex(times, 'latest')).toBe(-1);
    expect(matchTimeIndex(times, undefined)).toBe(-1);
    expect(matchTimeIndex([], '2025-11-22')).toBe(-1);
  });
  test('parseUtc reads a time without a zone as UTC', () => {
    expect(parseUtc('2025-11-22T02:26:48')).toBe(Date.UTC(2025, 10, 22, 2, 26, 48));
    expect(Number.isNaN(parseUtc('soon'))).toBe(true);
  });
});
