import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export type EnrollmentDecision = 'PROMOTED' | 'REPEATED' | 'GRADUATED' | 'LEFT';

export interface YearInfo {
  id: number;
  label: string;
  startDate: string;
  endDate: string;
  current: boolean;
  classCount: number;
  activeStudents: number;
  completedStudents: number;
  /** Élèves encore actifs sur une année terminée (décision de fin d'année à prendre). */
  pendingDecisions: number;
}

export interface NewYearPayload {
  label: string;
  startDate: string;
  endDate: string;
  sourceYearId: number | null;
  copyClasses: boolean;
  copyTeachers: boolean;
  copyPeriods: boolean;
  makeCurrent: boolean;
}

export interface NewYearResult {
  year: YearInfo;
  classesCopied: number;
  assignmentsCopied: number;
  periodsCopied: number;
}

export interface TargetClass {
  id: number;
  name: string;
  levelId: number;
  levelName: string;
  capacity: number | null;
  enrolled: number;
}

export interface StudentPlan {
  enrollmentId: number;
  studentId: number;
  firstName: string;
  lastName: string;
  registrationNumber: string;
  annualAverage: number | null;
  passMark: number;
  suggestedDecision: EnrollmentDecision;
  suggestedClassId: number | null;
  decided: boolean;
  decision: EnrollmentDecision | null;
  targetClassId: number | null;
  targetClassName: string | null;
}

export interface ClassPlan {
  classId: number;
  className: string;
  levelId: number;
  levelName: string;
  lastLevel: boolean;
  students: StudentPlan[];
}

export interface PromotionPlan {
  fromYearId: number;
  fromYearLabel: string;
  toYearId: number;
  toYearLabel: string;
  classes: ClassPlan[];
  targetClasses: TargetClass[];
  pending: number;
  decided: number;
}

export interface DecisionItem {
  enrollmentId: number;
  decision: EnrollmentDecision;
  targetClassId: number | null;
}

export interface PromotionResult {
  applied: number;
  skipped: { enrollmentId: number; studentName: string | null; reason: string }[];
}

export const DECISION_LABELS: Record<EnrollmentDecision, string> = {
  PROMOTED: 'Admis(e)',
  REPEATED: 'Redouble',
  GRADUATED: 'Fin de cycle',
  LEFT: 'Quitte l’établissement',
};

@Injectable({ providedIn: 'root' })
export class EnrollmentService {
  private readonly http = inject(HttpClient);
  private readonly base = `${environment.apiUrl}/owner/enrollment`;

  overview(schoolId: number): Observable<{ years: YearInfo[] }> {
    return this.http.get<{ years: YearInfo[] }>(`${this.base}/schools/${schoolId}/overview`);
  }

  createYear(schoolId: number, payload: NewYearPayload): Observable<NewYearResult> {
    return this.http.post<NewYearResult>(`${this.base}/schools/${schoolId}/years`, payload);
  }

  setCurrent(yearId: number): Observable<{ years: YearInfo[] }> {
    return this.http.post<{ years: YearInfo[] }>(`${this.base}/years/${yearId}/current`, {});
  }

  plan(schoolId: number, fromYearId: number, toYearId: number): Observable<PromotionPlan> {
    return this.http.get<PromotionPlan>(`${this.base}/schools/${schoolId}/promotion`,
      { params: { fromYearId, toYearId } });
  }

  apply(schoolId: number, fromYearId: number, toYearId: number, decisions: DecisionItem[]): Observable<PromotionResult> {
    return this.http.post<PromotionResult>(`${this.base}/schools/${schoolId}/promotion`,
      { fromYearId, toYearId, decisions });
  }

  undo(enrollmentId: number): Observable<void> {
    return this.http.post<void>(`${this.base}/enrollments/${enrollmentId}/undo`, {});
  }
}
