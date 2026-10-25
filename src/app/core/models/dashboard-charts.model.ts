export interface ClassReceivable { classId: number | null; label: string; expected: number; received: number; overdue: number; upcoming: number; credit: number; }
export interface ClassReceivables { academicYearId: number; yearLabel: string; asOf: string; classes: ClassReceivable[]; expected: number; received: number; overdue: number; upcoming: number; credit: number; }
export interface AttendanceWeek { fromDate: string; toDate: string; present: number; absent: number; late: number; excused: number; missing: number; observedCalls: number; }
export interface WeeklyAttendance { academicYearId: number; yearLabel: string; fromDate: string; toDate: string; weeks: AttendanceWeek[]; }
