import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type PeriodStatus = 'OPEN' | 'LOCKED' | 'PUBLISHED';

export interface GradePeriod {
  id: number;
  schoolId: number;
  academicYearId: number;
  academicYearLabel: string;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  passMark: number;
  status: PeriodStatus;
  publishedAt: string | null;
  evaluationCount: number;
}

export interface PeriodPayload {
  academicYearId: number;
  code: string;
  name: string;
  startDate: string;
  endDate: string;
  passMark: number | null;
}

export interface ClassSubject {
  subjectId: number;
  subjectName: string;
  coefficient: number;
  defaultCoefficient: number;
  overridden: boolean;
  assignments: { classSubjectTeacherId: number; teacherId: number; teacherName: string; active: boolean }[];
}

export interface EvaluationInfo {
  id: number;
  classSubjectTeacherId: number;
  subjectId: number;
  subjectName: string;
  teacherName: string;
  periodId: number;
  title: string;
  type: string;
  evalDate: string;
  maxValue: number;
  weight: number;
  gradedCount: number;
  studentCount: number;
  averageOn20: number | null;
}

export interface EvaluationPayload {
  classSubjectTeacherId: number;
  periodId: number;
  title: string;
  type: string;
  evalDate: string;
  maxValue: number;
  weight: number;
}

export interface SheetRow {
  studentId: number;
  fullName: string;
  registrationNumber: string;
  value: number | null;
  appreciation?: string | null;
}

export interface GradeSheet {
  evaluation: EvaluationInfo;
  period: GradePeriod;
  className: string;
  rows: SheetRow[];
}

export interface SaveGradesResult {
  created: number;
  updated: number;
  deleted: number;
  unchanged: number;
}

export interface HistoryEntry {
  id: number;
  evaluationId: number | null;
  evaluationTitle: string;
  studentId: number;
  studentName: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE';
  oldValue: number | null;
  newValue: number | null;
  reason: string | null;
  changedByName: string;
  changedAt: string;
}

export interface StudentResult {
  studentId: number;
  fullName: string;
  registrationNumber: string;
  subjectAverages: Record<string, number>;
  average: number | null;
  rank: number | null;
  mention: string | null;
  passed: boolean | null;
  comment: string | null;
  reportCardGenerated: boolean;
  validated: boolean;
}

export interface ClassStats {
  studentCount: number;
  rankedCount: number;
  classAverage: number | null;
  highest: number | null;
  lowest: number | null;
  passCount: number;
  passRate: number | null;
  mentions: Record<string, number>;
}

export interface SubjectStat {
  subjectId: number;
  subjectName: string;
  coefficient: number;
  average: number | null;
  min: number | null;
  max: number | null;
  passRate: number | null;
  gradedStudents: number;
}

export interface ClassResults {
  classId: number;
  className: string;
  levelName: string | null;
  period: GradePeriod;
  subjects: { subjectId: number; subjectName: string; coefficient: number }[];
  students: StudentResult[];
  stats: ClassStats;
  subjectStats: SubjectStat[];
}

export interface ClassSummary {
  classId: number;
  className: string;
  levelName: string | null;
  studentCount: number;
  rankedCount: number;
  average: number | null;
  passRate: number | null;
  reportCards: number;
}

export interface SchoolSummary {
  period: GradePeriod;
  classes: ClassSummary[];
  average: number | null;
  passRate: number | null;
  studentCount: number;
  rankedCount: number;
}

export interface BulletinLine {
  subjectName: string;
  teacherName: string;
  coefficient: number;
  average: number | null;
  weighted: number | null;
  classAverage: number | null;
  min: number | null;
  max: number | null;
  appreciation: string;
}

export interface Bulletin {
  studentId: number;
  fullName: string;
  registrationNumber: string;
  birthDate: string | null;
  gender: string | null;
  lines: BulletinLine[];
  totalCoefficients: number;
  totalWeighted: number;
  average: number | null;
  rank: number | null;
  classSize: number;
  mention: string | null;
  decision: string;
  comment: string | null;
  absences: number;
  unjustifiedAbsences: number;
  lates: number;
  validated: boolean;
}

export interface BulletinBatch {
  schoolName: string;
  schoolAddress: string | null;
  schoolPhone: string | null;
  schoolEmail: string | null;
  academicYearLabel: string;
  periodName: string;
  className: string;
  levelName: string | null;
  passMark: number;
  classAverage: number | null;
  highest: number | null;
  lowest: number | null;
  published: boolean;
  bulletins: Bulletin[];
}

export const PERIOD_STATUS_LABELS: Record<PeriodStatus, string> = {
  OPEN: 'Saisie ouverte',
  LOCKED: 'Verrouillée',
  PUBLISHED: 'Publiée',
};

export const EVALUATION_TYPES: Record<string, string> = {
  DEVOIR: 'Devoir',
  INTERROGATION: 'Interrogation',
  COMPOSITION: 'Composition',
  EXAMEN: 'Examen',
  ORAL: 'Oral',
  TP: 'Travaux pratiques',
  PROJET: 'Projet',
};

@Injectable({ providedIn: 'root' })
export class GradesService {
  private readonly http = inject(HttpClient);
  private readonly api = `${environment.apiUrl}/owner/grades`;

  periods(schoolId: number): Observable<GradePeriod[]> {
    return this.http.get<GradePeriod[]>(`${this.api}/schools/${schoolId}/periods`);
  }

  savePeriod(schoolId: number, payload: PeriodPayload, id?: number): Observable<GradePeriod> {
    return id
      ? this.http.put<GradePeriod>(`${this.api}/periods/${id}`, payload)
      : this.http.post<GradePeriod>(`${this.api}/schools/${schoolId}/periods`, payload);
  }

  createDefaultPeriods(schoolId: number, academicYearId: number, scheme: 'TRIMESTRE' | 'SEMESTRE'): Observable<GradePeriod[]> {
    return this.http.post<GradePeriod[]>(`${this.api}/schools/${schoolId}/periods/defaults`, { academicYearId, scheme });
  }

  deletePeriod(id: number): Observable<void> {
    return this.http.delete<void>(`${this.api}/periods/${id}`);
  }

  changeStatus(id: number, status: PeriodStatus): Observable<GradePeriod> {
    return this.http.post<GradePeriod>(`${this.api}/periods/${id}/status`, { status });
  }

  summary(periodId: number): Observable<SchoolSummary> {
    return this.http.get<SchoolSummary>(`${this.api}/periods/${periodId}/summary`);
  }

  subjects(classId: number): Observable<ClassSubject[]> {
    return this.http.get<ClassSubject[]>(`${this.api}/classes/${classId}/subjects`);
  }

  updateCoefficient(classId: number, subjectId: number, coefficient: number): Observable<ClassSubject[]> {
    return this.http.put<ClassSubject[]>(`${this.api}/classes/${classId}/subjects/${subjectId}/coefficient`, { coefficient });
  }

  resetCoefficient(classId: number, subjectId: number): Observable<ClassSubject[]> {
    return this.http.delete<ClassSubject[]>(`${this.api}/classes/${classId}/subjects/${subjectId}/coefficient`);
  }

  evaluations(classId: number, periodId: number): Observable<EvaluationInfo[]> {
    return this.http.get<EvaluationInfo[]>(`${this.api}/classes/${classId}/evaluations`, { params: { periodId } });
  }

  saveEvaluation(classId: number, payload: EvaluationPayload, id?: number): Observable<EvaluationInfo> {
    return id
      ? this.http.put<EvaluationInfo>(`${this.api}/evaluations/${id}`, payload)
      : this.http.post<EvaluationInfo>(`${this.api}/classes/${classId}/evaluations`, payload);
  }

  deleteEvaluation(id: number, reason: string | null): Observable<void> {
    return this.http.delete<void>(`${this.api}/evaluations/${id}`, { params: reason ? { reason } : {} });
  }

  sheet(evaluationId: number): Observable<GradeSheet> {
    return this.http.get<GradeSheet>(`${this.api}/evaluations/${evaluationId}/sheet`);
  }

  saveGrades(evaluationId: number, grades: { studentId: number; value: number | null; appreciation?: string | null }[],
             reason: string | null): Observable<SaveGradesResult> {
    return this.http.put<SaveGradesResult>(`${this.api}/evaluations/${evaluationId}/grades`, { grades, reason });
  }

  history(classId: number, periodId: number): Observable<HistoryEntry[]> {
    return this.http.get<HistoryEntry[]>(`${this.api}/classes/${classId}/history`, { params: { periodId } });
  }

  results(classId: number, periodId: number): Observable<ClassResults> {
    return this.http.get<ClassResults>(`${this.api}/classes/${classId}/results`, { params: { periodId } });
  }

  generateReportCards(classId: number, periodId: number): Observable<ClassResults> {
    return this.http.post<ClassResults>(`${this.api}/classes/${classId}/report-cards`, null, { params: { periodId } });
  }

  saveComment(classId: number, periodId: number, studentId: number, comment: string): Observable<ClassResults> {
    return this.http.put<ClassResults>(`${this.api}/classes/${classId}/report-cards/${studentId}/comment`,
      { comment }, { params: { periodId } });
  }

  bulletins(classId: number, periodId: number): Observable<BulletinBatch> {
    return this.http.get<BulletinBatch>(`${this.api}/classes/${classId}/bulletins`, { params: { periodId } });
  }
}
