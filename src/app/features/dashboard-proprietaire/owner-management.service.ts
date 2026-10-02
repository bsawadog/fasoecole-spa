import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { map, Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface SchoolRecord {
  id: number;
  name: string;
  type: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  ownerId: number;
  status: string;
}

export interface AcademicYearRecord {
  id: number;
  schoolId: number;
  label: string;
  startDate: string;
  endDate: string;
  isCurrent: boolean;
}

export interface LevelRecord {
  id: number;
  schoolId: number;
  name: string;
  cycle: string;
  orderIndex: number;
}

export interface ClassRecord {
  id: number;
  schoolId: number;
  academicYearId: number;
  levelId: number;
  name: string;
  capacity: number;
}

export interface SubjectRecord {
  id: number;
  schoolId: number;
  name: string;
  code: string;
  coefficient?: number;
}

export interface FeeTypeRecord {
  id: number;
  schoolId: number;
  name: string;
  amount: number;
  frequency: 'ONE_TIME' | 'MONTHLY' | 'TERM' | 'YEARLY';
  levelId?: number | null;
  description?: string | null;
  active?: boolean;
}

export interface StudentRecord {
  id: number;
  userId: number;
  schoolId: number;
  registrationNumber: string;
  birthDate: string | null;
  gender: string | null;
}

export interface TeacherRecord {
  id: number;
  userId: number;
  schoolId: number;
  specialty: string | null;
  hireDate: string | null;
}

export interface RosterParent {
  parentId: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  relationship: string | null;
}

export interface ClassRosterRow {
  studentId: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  registrationNumber: string;
  birthDate: string | null;
  gender: string | null;
  parents: RosterParent[];
  teacherNames: string[];
}

export interface UpdateStudentProfilePayload {
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  registrationNumber: string;
  birthDate: string | null;
  gender: string | null;
}

export interface UpdateParentProfilePayload {
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
}

export interface CreateRosterStudentPayload {
  firstName: string;
  lastName: string;
  email: string;
  password: string;
  phone: string | null;
  /** Laisser vide pour un matricule généré automatiquement (MAT-AAAA-NNN). */
  registrationNumber: string | null;
  birthDate: string | null;
  gender: string | null;
}

export interface StudentGradeInfo {
  id: number;
  subjectName: string;
  teacherName: string;
  term: string;
  type: string;
  value: number;
  maxValue: number;
  gradeDate: string | null;
}

export interface StudentAttendanceSummary {
  totalRecords: number;
  presentCount: number;
  absentCount: number;
  lateCount: number;
  justifiedAbsences: number;
  unjustifiedAbsences: number;
  attendanceRate: number;
}

export interface StudentAttendanceInfo {
  id: number;
  attendanceDate: string;
  status: string;
  justification: string | null;
}

export interface StudentPaymentInfo {
  id: number;
  amount: number;
  paymentDate: string;
  method: CreateStudentPaymentPayload['method'];
  reference: string | null;
}

export interface StudentInvoiceInfo {
  id: number;
  feeTypeId: number;
  feeTypeName: string;
  amountDue: number;
  dueDate: string;
  status: string;
  totalPaid: number;
  balance: number;
  payments: StudentPaymentInfo[];
}

export interface StudentBillingSummary {
  totalDue: number;
  totalPaid: number;
  totalBalance: number;
}

export interface StudentDetail {
  studentId: number;
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  registrationNumber: string;
  birthDate: string | null;
  gender: string | null;
  schoolName: string;
  schoolId: number;
  className: string | null;
  parents: RosterParent[];
  grades: StudentGradeInfo[];
  overallAverage: number | null;
  attendanceSummary: StudentAttendanceSummary;
  recentAttendance: StudentAttendanceInfo[];
  invoices: StudentInvoiceInfo[];
  billingSummary: StudentBillingSummary;
}

export interface UpsertAttendancePayload {
  attendanceDate: string;
  status: 'PRESENT' | 'ABSENT' | 'LATE' | 'EXCUSED';
  justification: string | null;
}

export interface CreateStudentInvoicePayload {
  feeTypeId: number;
  amountDue: number | null;
  dueDate: string;
  academicYearId: number | null;
}

export interface CreateStudentPaymentPayload {
  amount: number;
  paymentDate: string | null;
  method: 'CASH' | 'MOBILE_MONEY' | 'BANK_TRANSFER' | 'CARD';
  reference: string | null;
}


@Injectable({ providedIn: 'root' })
export class OwnerManagementService {
  createSchool(payload: Omit<SchoolRecord, 'id'>): Observable<SchoolRecord> {
    return this.http.post<SchoolRecord>(`${environment.apiUrl}/schools`, payload);
  }
  private readonly http = inject(HttpClient);
  private readonly apiUrl = environment.apiUrl;

  getSchool(id: number): Observable<SchoolRecord> {
    return this.http.get<SchoolRecord>(`${this.apiUrl}/schools/${id}`);
  }

  updateSchool(school: SchoolRecord): Observable<SchoolRecord> {
    return this.http.put<SchoolRecord>(`${this.apiUrl}/schools/${school.id}`, school);
  }

  getAcademicYears(schoolId: number): Observable<AcademicYearRecord[]> {
    return this.http.get<AcademicYearRecord[]>(`${this.apiUrl}/academic-years`, { params: { schoolId } });
  }

  saveAcademicYear(year: Omit<AcademicYearRecord, 'id'>, id?: number): Observable<AcademicYearRecord> {
    return id
      ? this.http.put<AcademicYearRecord>(`${this.apiUrl}/academic-years/${id}`, { ...year, id })
      : this.http.post<AcademicYearRecord>(`${this.apiUrl}/academic-years`, year);
  }

  deleteAcademicYear(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/academic-years/${id}`);
  }

  getLevels(schoolId: number): Observable<LevelRecord[]> {
    return this.http.get<LevelRecord[]>(`${this.apiUrl}/levels`, { params: { schoolId } });
  }

  saveLevel(level: Omit<LevelRecord, 'id'>, id?: number): Observable<LevelRecord> {
    return id
      ? this.http.put<LevelRecord>(`${this.apiUrl}/levels/${id}`, { ...level, id })
      : this.http.post<LevelRecord>(`${this.apiUrl}/levels`, level);
  }

  deleteLevel(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/levels/${id}`);
  }

  getClasses(schoolId: number): Observable<ClassRecord[]> {
    return this.http.get<ClassRecord[]>(`${this.apiUrl}/classes`, { params: { schoolId } });
  }

  saveClass(schoolClass: Omit<ClassRecord, 'id'>, id?: number): Observable<ClassRecord> {
    return id
      ? this.http.put<ClassRecord>(`${this.apiUrl}/classes/${id}`, { ...schoolClass, id })
      : this.http.post<ClassRecord>(`${this.apiUrl}/classes`, schoolClass);
  }

  deleteClass(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/classes/${id}`);
  }

  getSubjects(schoolId: number): Observable<SubjectRecord[]> {
    return this.http.get<SubjectRecord[]>(`${this.apiUrl}/subjects`, { params: { schoolId } });
  }

  saveSubject(subject: Omit<SubjectRecord, 'id'>, id?: number): Observable<SubjectRecord> {
    return id
      ? this.http.put<SubjectRecord>(`${this.apiUrl}/subjects/${id}`, { ...subject, id })
      : this.http.post<SubjectRecord>(`${this.apiUrl}/subjects`, subject);
  }

  deleteSubject(id: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/subjects/${id}`);
  }

  getFeeTypes(schoolId: number): Observable<FeeTypeRecord[]> {
    return this.http.get<Omit<FeeTypeRecord, 'schoolId'>[]>(`${this.apiUrl}/owner/finance/schools/${schoolId}/fee-types`)
      .pipe(map(fees => fees.map(fee => ({ ...fee, schoolId }))));
  }

  saveFeeType(fee: Omit<FeeTypeRecord, 'id'>, id?: number): Observable<FeeTypeRecord> {
    const payload = { name: fee.name, amount: fee.amount, frequency: fee.frequency,
      levelId: fee.levelId ?? null, description: fee.description ?? null };
    return id
      ? this.http.put<FeeTypeRecord>(`${this.apiUrl}/owner/finance/fee-types/${id}`, payload)
      : this.http.post<FeeTypeRecord>(`${this.apiUrl}/owner/finance/schools/${fee.schoolId}/fee-types`, payload);
  }

  deleteFeeType(id: number): Observable<{ deleted: boolean }> {
    return this.http.delete<{ deleted: boolean }>(`${this.apiUrl}/owner/finance/fee-types/${id}`);
  }

  getStudents(schoolId: number): Observable<StudentRecord[]> {
    return this.http.get<StudentRecord[]>(`${this.apiUrl}/students`, { params: { schoolId } });
  }

  getTeachers(schoolId: number): Observable<TeacherRecord[]> {
    return this.http.get<TeacherRecord[]>(`${this.apiUrl}/teachers`, { params: { schoolId } });
  }

  getClassRoster(classId: number): Observable<ClassRosterRow[]> {
    return this.http.get<ClassRosterRow[]>(`${this.apiUrl}/classes/${classId}/roster`);
  }

  createRosterStudent(classId: number, payload: CreateRosterStudentPayload): Observable<ClassRosterRow> {
    return this.http.post<ClassRosterRow>(`${this.apiUrl}/classes/${classId}/roster/students`, payload);
  }

  removeRosterStudent(classId: number, studentId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/classes/${classId}/roster/students/${studentId}`);
  }

  transferRosterStudent(classId: number, studentId: number, targetClassId: number): Observable<ClassRosterRow> {
    return this.http.post<ClassRosterRow>(
      `${this.apiUrl}/classes/${classId}/roster/students/${studentId}/transfer`,
      { targetClassId },
    );
  }

  updateRosterStudent(classId: number, studentId: number, payload: UpdateStudentProfilePayload): Observable<ClassRosterRow> {
    return this.http.put<ClassRosterRow>(`${this.apiUrl}/classes/${classId}/roster/students/${studentId}`, payload);
  }

  updateRosterParent(classId: number, parentId: number, payload: UpdateParentProfilePayload): Observable<ClassRosterRow> {
    return this.http.put<ClassRosterRow>(`${this.apiUrl}/classes/${classId}/roster/parents/${parentId}`, payload);
  }

  getStudentDetail(studentId: number): Observable<StudentDetail> {
    return this.http.get<StudentDetail>(`${this.apiUrl}/students/${studentId}/detail`);
  }

  addStudentAttendance(studentId: number, payload: UpsertAttendancePayload): Observable<StudentAttendanceInfo> {
    return this.http.post<StudentAttendanceInfo>(`${this.apiUrl}/students/${studentId}/attendance`, payload);
  }

  updateStudentAttendance(studentId: number, attendanceId: number, payload: UpsertAttendancePayload): Observable<StudentAttendanceInfo> {
    return this.http.put<StudentAttendanceInfo>(`${this.apiUrl}/students/${studentId}/attendance/${attendanceId}`, payload);
  }

  deleteStudentAttendance(studentId: number, attendanceId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/students/${studentId}/attendance/${attendanceId}`);
  }

  createStudentInvoice(studentId: number, payload: CreateStudentInvoicePayload): Observable<StudentInvoiceInfo> {
    return this.http.post<StudentInvoiceInfo>(`${this.apiUrl}/students/${studentId}/invoices`, payload);
  }

  addStudentPayment(studentId: number, invoiceId: number, payload: CreateStudentPaymentPayload): Observable<StudentInvoiceInfo> {
    return this.http.post<StudentInvoiceInfo>(`${this.apiUrl}/students/${studentId}/invoices/${invoiceId}/payments`, payload);
  }

  updateStudentPayment(studentId: number, invoiceId: number, paymentId: number, payload: CreateStudentPaymentPayload): Observable<StudentInvoiceInfo> {
    return this.http.put<StudentInvoiceInfo>(`${this.apiUrl}/students/${studentId}/invoices/${invoiceId}/payments/${paymentId}`, payload);
  }

  deleteStudentPayment(studentId: number, invoiceId: number, paymentId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/students/${studentId}/invoices/${invoiceId}/payments/${paymentId}`);
  }

  deleteStudentInvoice(studentId: number, invoiceId: number): Observable<void> {
    return this.http.delete<void>(`${this.apiUrl}/students/${studentId}/invoices/${invoiceId}`);
  }

  cancelStudentInvoice(studentId: number, invoiceId: number): Observable<StudentInvoiceInfo> {
    return this.http.put<StudentInvoiceInfo>(`${this.apiUrl}/students/${studentId}/invoices/${invoiceId}/cancel`, {});
  }
}
