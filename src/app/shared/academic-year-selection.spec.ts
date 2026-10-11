import { academicToday, selectAcademicYear } from './academic-year-selection';

describe('Academic year selection', () => {
  const previous = { id: 1, startDate: '2025-09-01', endDate: '2026-08-31', isCurrent: true, closed: false };
  const next = { id: 2, startDate: '2026-09-01', endDate: '2027-08-31', isCurrent: false, closed: false };
  it('selects the year containing today, including both boundary dates', () => {
    for (const day of ['2026-09-01', '2026-10-09', '2027-08-31']) {
      expect(selectAcademicYear([previous, next], 1, false, day)?.id).toBe(2);
    }
  });
  it('preserves any explicit choice, including the year marked current', () => {
    expect(selectAcademicYear([previous, next], 1, true, '2026-10-09')?.id).toBe(1);
    expect(selectAcademicYear([previous, next], 2, true, '2026-08-31')?.id).toBe(2);
  });
  it('falls back to the configured current year outside the calendar', () => {
    expect(selectAcademicYear([previous, next], 2, false, '2028-01-01')?.id).toBe(1);
  });
  it('preserves a saved choice when no current year or matching date exists', () => {
    expect(selectAcademicYear([{ ...previous, isCurrent: false }], 1, false, '2028-01-01')?.id).toBe(1);
    expect(selectAcademicYear([next], null, false, '2028-01-01')).toBeUndefined();
  });
  it('ignores a removed manual choice and closed years for automatic selection', () => {
    expect(selectAcademicYear([previous, next], 999, true, '2026-10-09')?.id).toBe(2);
    expect(selectAcademicYear([{ ...next, closed: true }], null, false, '2026-10-09')).toBeUndefined();
    expect(selectAcademicYear([{ ...next, closed: true }], 2, true, '2026-10-09')?.id).toBe(2);
    expect(selectAcademicYear([], 2, true)).toBeUndefined();
  });
  it('uses the local calendar date', () => {
    expect(academicToday(new Date(2026, 8, 1, 23, 30))).toBe('2026-09-01');
  });
});
