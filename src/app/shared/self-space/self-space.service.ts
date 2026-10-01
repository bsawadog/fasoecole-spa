import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';
import {
  EvaluationInfo,
  EvaluationPayload,
  GradePeriod,
  GradeSheet,
  PeriodStatus,
  SaveGradesResult,
} from '../../features/dashboard-proprietaire/grades.service';

export type { EvaluationInfo, EvaluationPayload, GradePeriod, GradeSheet, SaveGradesResult };

// ------------------------------------------------------------------ enseignant

export interface TeacherSubject {
  classSubjectTeacherId: number;
  subjectId: number;
  subjectName: string;
}

export interface TeacherClass {
  classId: number;
  className: string;
  levelName: string | null;
  schoolId: number;
  schoolName: string;
  academicYearId: number;
  academicYearLabel: string;
  currentYear: boolean;
  studentCount: number;
  subjects: TeacherSubject[];
}

export interface RosterStudent {
  studentId: number;
  fullName: string;
  registrationNumber: string;
  gender: string | null;
  birthDate: string | null;
}

export interface ScheduleEntry {
  id: number;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  classId: number;
  className: string;
  schoolName: string;
  subjects: string | null;
  teacherName: string;
}

// ------------------------------------------------------------------ élève / parent

export interface StudentOverview {
  studentId: number;
  fullName: string;
  registrationNumber: string;
  birthDate: string | null;
  gender: string | null;
  relationship: string | null;
  schoolId: number;
  schoolName: string;
  classId: number | null;
  className: string | null;
  levelName: string | null;
  academicYearLabel: string | null;
  attendance: { absences: number; unjustifiedAbsences: number; lates: number };
  fees: { totalDue: number; totalPaid: number; balance: number; overdueCount: number };
}

export interface GradeItem {
  id: number;
  subjectName: string;
  title: string | null;
  type: string;
  date: string;
  value: number;
  maxValue: number;
}

export interface BulletinLine {
  subjectName: string;
  teacherName: string | null;
  coefficient: number;
  average: number | null;
  weighted: number | null;
  classAverage: number | null;
  min: number | null;
  max: number | null;
  appreciation: string | null;
}

export interface Bulletin {
  studentId: number;
  fullName: string;
  lines: BulletinLine[];
  totalCoefficients: number;
  totalWeighted: number;
  average: number | null;
  rank: number | null;
  classSize: number;
  mention: string | null;
  decision: string | null;
  comment: string | null;
  absences: number;
  unjustifiedAbsences: number;
  lates: number;
}

export interface PeriodGrades {
  periodId: number;
  periodName: string;
  status: PeriodStatus;
  startDate: string;
  endDate: string;
  published: boolean;
  grades: GradeItem[];
  bulletin: Bulletin | null;
  classAverage: number | null;
}

export interface StudentGrades {
  studentId: number;
  fullName: string;
  className: string | null;
  academicYearLabel: string | null;
  periods: PeriodGrades[];
}

export interface AttendanceItem {
  id: number;
  date: string;
  status: 'ABSENT' | 'LATE' | 'EXCUSED' | 'PRESENT';
  justification: string | null;
}

export interface InvoiceItem {
  id: number;
  feeName: string;
  dueDate: string;
  amountDue: number;
  discountAmount: number;
  paid: number;
  balance: number;
  status: 'PENDING' | 'PAID' | 'OVERDUE' | 'CANCELLED';
}

// ------------------------------------------------------------------ fiche, absences signalées, messagerie

export interface SchoolContact {
  schoolId: number;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export interface StudentProfile {
  overview: StudentOverview;
  email: string | null;
  phone: string | null;
  guardians: { fullName: string; relationship: string | null; phone: string | null; email: string | null }[];
  teachers: { fullName: string; subjects: string }[];
  school: SchoolContact;
}

export type AbsenceReportStatus = 'PENDING' | 'ACKNOWLEDGED' | 'REJECTED' | 'CANCELLED';

export interface AbsenceReport {
  id: number;
  studentId: number;
  studentName: string;
  registrationNumber: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: AbsenceReportStatus;
  reportedByName: string | null;
  reportedByPhone: string | null;
  schoolComment: string | null;
  handledByName: string | null;
  handledAt: string | null;
  createdAt: string;
  justifiedAttendances: number;
}

export interface AbsenceReportPayload {
  startDate: string;
  endDate: string;
  reason: string;
}

export interface ConversationSummary {
  id: number;
  schoolId: number;
  schoolName: string;
  parentUserId: number;
  parentName: string;
  parentPhone: string | null;
  parentEmail: string | null;
  studentId: number | null;
  studentName: string | null;
  subject: string;
  createdAt: string;
  lastMessageAt: string;
  unread: boolean;
}

export interface ConversationMessage {
  id: number;
  fromSchool: boolean;
  senderName: string | null;
  content: string;
  sentAt: string;
}

export interface ConversationThread {
  conversation: ConversationSummary;
  messages: ConversationMessage[];
}

export interface NewConversationPayload {
  schoolId: number;
  studentId: number | null;
  subject: string;
  content: string;
}

export const ABSENCE_REPORT_LABELS: Record<AbsenceReportStatus, string> = {
  PENDING: 'En attente', ACKNOWLEDGED: 'Prise en compte', REJECTED: 'Refusée', CANCELLED: 'Annulée',
};

export const DAY_LABELS: Record<number, string> = {
  1: 'Lundi', 2: 'Mardi', 3: 'Mercredi', 4: 'Jeudi', 5: 'Vendredi', 6: 'Samedi', 7: 'Dimanche',
};

/** API des espaces personnels : enseignant (/me/teacher) et élève / parent (/me/students). */
@Injectable({ providedIn: 'root' })
export class SelfSpaceService {
  private readonly http = inject(HttpClient);
  private readonly teacherUrl = `${environment.apiUrl}/me/teacher`;
  private readonly studentsUrl = `${environment.apiUrl}/me/students`;
  private readonly meUrl = `${environment.apiUrl}/me`;

  teacherClasses(): Observable<TeacherClass[]> {
    return this.http.get<TeacherClass[]>(`${this.teacherUrl}/classes`);
  }

  classStudents(classId: number): Observable<RosterStudent[]> {
    return this.http.get<RosterStudent[]>(`${this.teacherUrl}/classes/${classId}/students`);
  }

  teacherSchedule(): Observable<ScheduleEntry[]> {
    return this.http.get<ScheduleEntry[]>(`${this.teacherUrl}/schedule`);
  }

  classPeriods(classId: number): Observable<GradePeriod[]> {
    return this.http.get<GradePeriod[]>(`${this.teacherUrl}/classes/${classId}/periods`);
  }

  evaluations(classId: number, periodId: number): Observable<EvaluationInfo[]> {
    return this.http.get<EvaluationInfo[]>(`${this.teacherUrl}/classes/${classId}/evaluations`, {
      params: { periodId },
    });
  }

  createEvaluation(classId: number, payload: EvaluationPayload): Observable<EvaluationInfo> {
    return this.http.post<EvaluationInfo>(`${this.teacherUrl}/classes/${classId}/evaluations`, payload);
  }

  deleteEvaluation(evaluationId: number, reason?: string): Observable<void> {
    return this.http.delete<void>(`${this.teacherUrl}/evaluations/${evaluationId}`, {
      params: reason ? { reason } : {},
    });
  }

  gradeSheet(evaluationId: number): Observable<GradeSheet> {
    return this.http.get<GradeSheet>(`${this.teacherUrl}/evaluations/${evaluationId}/sheet`);
  }

  saveGrades(evaluationId: number, grades: { studentId: number; value: number | null }[], reason: string | null)
    : Observable<SaveGradesResult> {
    return this.http.put<SaveGradesResult>(`${this.teacherUrl}/evaluations/${evaluationId}/grades`, { grades, reason });
  }

  myStudents(): Observable<StudentOverview[]> {
    return this.http.get<StudentOverview[]>(this.studentsUrl);
  }

  student(studentId: number): Observable<StudentOverview> {
    return this.http.get<StudentOverview>(`${this.studentsUrl}/${studentId}`);
  }

  studentGrades(studentId: number): Observable<StudentGrades> {
    return this.http.get<StudentGrades>(`${this.studentsUrl}/${studentId}/grades`);
  }

  studentSchedule(studentId: number): Observable<ScheduleEntry[]> {
    return this.http.get<ScheduleEntry[]>(`${this.studentsUrl}/${studentId}/schedule`);
  }

  studentAttendance(studentId: number): Observable<AttendanceItem[]> {
    return this.http.get<AttendanceItem[]>(`${this.studentsUrl}/${studentId}/attendance`);
  }

  studentInvoices(studentId: number): Observable<InvoiceItem[]> {
    return this.http.get<InvoiceItem[]>(`${this.studentsUrl}/${studentId}/invoices`);
  }

  studentProfile(studentId: number): Observable<StudentProfile> {
    return this.http.get<StudentProfile>(`${this.studentsUrl}/${studentId}/profile`);
  }

  absenceReports(studentId: number): Observable<AbsenceReport[]> {
    return this.http.get<AbsenceReport[]>(`${this.studentsUrl}/${studentId}/absence-reports`);
  }

  reportAbsence(studentId: number, payload: AbsenceReportPayload): Observable<AbsenceReport> {
    return this.http.post<AbsenceReport>(`${this.studentsUrl}/${studentId}/absence-reports`, payload);
  }

  cancelAbsenceReport(reportId: number): Observable<AbsenceReport> {
    return this.http.post<AbsenceReport>(`${this.meUrl}/absence-reports/${reportId}/cancel`, {});
  }

  contactSchools(): Observable<SchoolContact[]> {
    return this.http.get<SchoolContact[]>(`${this.meUrl}/schools`);
  }

  conversations(): Observable<ConversationSummary[]> {
    return this.http.get<ConversationSummary[]>(`${this.meUrl}/conversations`);
  }

  startConversation(payload: NewConversationPayload): Observable<ConversationThread> {
    return this.http.post<ConversationThread>(`${this.meUrl}/conversations`, payload);
  }

  conversation(conversationId: number): Observable<ConversationThread> {
    return this.http.get<ConversationThread>(`${this.meUrl}/conversations/${conversationId}`);
  }

  replyToConversation(conversationId: number, content: string): Observable<ConversationThread> {
    return this.http.post<ConversationThread>(`${this.meUrl}/conversations/${conversationId}/messages`, { content });
  }
}

/** Message d'erreur lisible renvoyé par l'API (ou message par défaut). */
export function apiError(error: unknown, fallback: string): string {
  const message = (error as { error?: { message?: unknown } } | null)?.error?.message;
  return typeof message === 'string' && message ? message : fallback;
}
