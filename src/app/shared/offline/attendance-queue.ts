import { TeacherAttendanceItem } from '../self-space/self-space.service';
import { OfflineRead } from './offline-read-cache';
import { PendingMessage } from './message-outbox';
import { LocalPublication } from './publication-outbox';
import { PendingAction } from './action-outbox';

export interface OfflineEntry {
  studentId: number; status: NonNullable<TeacherAttendanceItem['status']>; justification: string | null;
  expectedStatus: TeacherAttendanceItem['status']; expectedJustification: string | null; expectedVersion: number | null;
}
export interface PendingCall {
  operationId: string; schoolId: number; classId: number; date: string; entries: OfflineEntry[];
  issue?: string; attempted?: boolean; className?: string; schoolName?: string;
}
export interface Snapshot { rows: TeacherAttendanceItem[]; savedAt: string; }
export interface AttendanceVault { snapshots: Record<string, Snapshot>; pending: PendingCall[]; reads?: Record<string, OfflineRead>; messages?: PendingMessage[]; publications?: LocalPublication[]; actions?: PendingAction[]; }
export const attendanceContext = (schoolId: number, classId: number, date: string) => `${schoolId}/${classId}/${date}`;
export const callContext = (call: PendingCall) => attendanceContext(call.schoolId, call.classId, call.date);

/** Display all saved local choices while keeping the server baseline intact in storage. */
export function localSnapshot(state: AttendanceVault, schoolId: number, classId: number, date: string): Snapshot | undefined {
  const id = attendanceContext(schoolId, classId, date), snapshot = state.snapshots[id];
  if (!snapshot) return undefined;
  const choices = new Map<number, OfflineEntry>();
  for (const call of state.pending) if (callContext(call) === id) for (const entry of call.entries) choices.set(entry.studentId, entry);
  return { ...snapshot, rows: snapshot.rows.map(row => {
    const entry = choices.get(row.studentId);
    return entry ? { ...row, status: entry.status, justification: entry.justification } : row;
  }) };
}
export function enqueueCall(state: AttendanceVault, call: PendingCall, rows: TeacherAttendanceItem[]): void {
  const id = callContext(call);
  if (!state.pending.some(item => callContext(item) === id)) state.snapshots[id] = { rows, savedAt: new Date().toISOString() };
  const baseline = state.snapshots[id]?.rows ?? rows;
  state.pending.push({ ...call, attempted: false, entries: call.entries.map(entry => {
    const original = baseline.find(row => row.studentId === entry.studentId);
    if (!original) throw new Error('Cet élève ne figure pas dans l’appel téléchargé.');
    return { ...entry, expectedStatus: original.status, expectedJustification: original.justification, expectedVersion: original.version ?? null };
  }) });
}
export function firstForContext(state: AttendanceVault, call: PendingCall): boolean {
  return state.pending.find(item => callContext(item) === callContext(call))?.operationId === call.operationId;
}
/** Advance only dependencies created by our confirmed writes, never unrelated server changes. */
export function confirmCall(state: AttendanceVault, operationId: string, rows: TeacherAttendanceItem[]): void {
  const index = state.pending.findIndex(call => call.operationId === operationId);
  if (index < 0) return; // Another tab already handled this receipt.
  const call = state.pending[index], id = callContext(call);
  const affected = new Set(call.entries.map(entry => entry.studentId));
  for (const next of state.pending.slice(index + 1)) {
    if (callContext(next) !== id) continue;
    for (const entry of next.entries) {
      if (!affected.has(entry.studentId)) continue;
      const current = rows.find(row => row.studentId === entry.studentId);
      if (!next.attempted && current) {
        entry.expectedStatus = current.status;
        entry.expectedJustification = current.justification;
        entry.expectedVersion = current.version ?? null;
      }
      affected.delete(entry.studentId);
    }
  }
  state.pending.splice(index, 1);
  state.snapshots[id] = { rows, savedAt: new Date().toISOString() };
}
