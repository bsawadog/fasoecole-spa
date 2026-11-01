import { AttendanceVault, PendingCall, OfflineEntry, enqueueCall, confirmCall, firstForContext, localSnapshot } from './attendance-queue';
import { TeacherAttendanceItem } from '../self-space/self-space.service';

describe('Offline attendance queue', () => {
  const baseline: TeacherAttendanceItem[] = [1, 2].map(studentId => ({ studentId, fullName: `Élève ${studentId}`, registrationNumber: `${studentId}`, status: null, justification: null, version: null }));
  const empty = (): AttendanceVault => ({ snapshots: {}, pending: [] });
  const call = (id: string, studentId: number, status: OfflineEntry['status'] = 'ABSENT'): PendingCall => ({
    operationId: id, schoolId: 1, classId: 11, date: '2026-10-31',
    entries: [{ studentId, status, justification: null, expectedStatus: null, expectedJustification: null, expectedVersion: null }],
  });
  it('accepts several saves for one class and displays the latest local choices', () => {
    const state = empty();
    enqueueCall(state, call('one', 1), baseline);
    enqueueCall(state, call('two', 2), baseline);
    enqueueCall(state, call('three', 1, 'LATE'), baseline);
    expect(state.pending).toHaveLength(3);
    expect(localSnapshot(state, 1, 11, '2026-10-31')?.rows.map(row => row.status)).toEqual(['LATE', 'ABSENT']);
    expect(state.snapshots['1/11/2026-10-31'].rows.map(row => row.status)).toEqual([null, null]);
    expect(firstForContext(state, state.pending[1])).toBe(false);
  });
  it('keeps attempted payloads immutable when more changes are queued', () => {
    const state = empty(); enqueueCall(state, call('one', 1), baseline);
    state.pending[0].attempted = true;
    const sent = JSON.stringify(state.pending[0]);
    enqueueCall(state, call('two', 1, 'PRESENT'), baseline);
    expect(JSON.stringify(state.pending[0])).toBe(sent);
    confirmCall(state, 'one', baseline.map(row => row.studentId === 1 ? { ...row, status: 'ABSENT', version: 0 } : row));
    expect(state.pending[0].entries[0]).toMatchObject({ status: 'PRESENT', expectedStatus: 'ABSENT', expectedVersion: 0 });
    const after = JSON.stringify(state);
    confirmCall(state, 'one', baseline); // Late duplicate response from another tab.
    expect(JSON.stringify(state)).toBe(after);
  });
  it('advances only the next dependent change per student and preserves unrelated conflict baselines', () => {
    const state = empty(); enqueueCall(state, call('one', 1), baseline);
    enqueueCall(state, call('two', 2), baseline);
    enqueueCall(state, call('three', 1, 'LATE'), baseline);
    enqueueCall(state, call('four', 1, 'PRESENT'), baseline);
    confirmCall(state, 'one', [
      { ...baseline[0], status: 'ABSENT', version: 1 },
      { ...baseline[1], status: 'LATE', version: 8 }, // Someone else's server-side write.
    ]);
    expect(state.pending[0].entries[0].expectedStatus).toBeNull();
    expect(state.pending[1].entries[0].expectedVersion).toBe(1);
    expect(state.pending[2].entries[0].expectedVersion).toBeNull();
    confirmCall(state, 'two', [{ ...baseline[0], status: 'ABSENT', version: 1 }, { ...baseline[1], status: 'ABSENT', version: 9 }]);
    confirmCall(state, 'three', [{ ...baseline[0], status: 'LATE', version: 2 }, baseline[1]]);
    expect(state.pending.find(item => item.operationId === 'four')?.entries[0].expectedVersion).toBe(2);
  });
  it('blocks later sends behind a conflict, but leaves other classes independent', () => {
    const state = empty(); enqueueCall(state, call('one', 1), baseline);
    state.pending[0].issue = 'Conflict';
    enqueueCall(state, call('two', 2), baseline);
    enqueueCall(state, { ...call('other', 1), classId: 22 }, baseline);
    expect(firstForContext(state, state.pending[1])).toBe(false);
    expect(firstForContext(state, state.pending[2])).toBe(true);
    confirmCall(state, 'one', [{ ...baseline[0], status: 'ABSENT', version: 5 }, baseline[1]]);
    expect(state.pending.find(item => item.operationId === 'other')?.entries[0].expectedVersion).toBeNull();
  });
});
