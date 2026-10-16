import { Page } from '@playwright/test';

export type Profile = 'proprietaire' | 'admin' | 'enseignant' | 'etudiant' | 'parent';
const roles = { proprietaire: 'SCHOOL_ADMIN', admin: 'SUPER_ADMIN', enseignant: 'TEACHER', etudiant: 'STUDENT', parent: 'PARENT' };
export const school = { id: 1, name: 'École La Réussite', type: 'PRIMAIRE', status: 'ACTIVE', address: 'Ouagadougou', phone: '70000000', email: 'ecole@example.test' };
export const year = { id: 1, label: '2026-2027', startDate: '2026-10-01', endDate: '2027-07-30', isCurrent: true, current: true, closed: false, classCount: 1, activeStudents: 24, completedStudents: 0, pendingDecisions: 0 };
export const hostClass = { id: 11, name: 'CP1-A', schoolId: 1, levelId: 1, levelName: 'CP1', academicYearId: 1, capacity: 40, enrolled: 24 };
export const fees = [
  { id: 31, name: 'Inscription', amount: 10000, frequency: 'ONE_TIME', levelId: null, active: true, invoiceCount: 24, levelName: null, description: '' },
  { id: 32, name: 'Cotisation', amount: 5000, frequency: 'YEARLY', levelId: null, active: true, invoiceCount: 24, levelName: null, description: '' },
  { id: 33, name: 'Scolarité', amount: 50000, frequency: 'YEARLY', levelId: 1, active: true, invoiceCount: 24, levelName: 'CP1', description: '' },
];
const students = Array.from({ length: 24 }, (_, index) => ({ id: index + 1, studentId: index + 1, schoolId: 1, userId: index + 20,
  firstName: index === 0 ? 'Awa' : `Élève ${index + 1}`, lastName: 'Kaboré', registrationNumber: `MAT-2026-${String(index + 1).padStart(3, '0')}`,
  email: null, phone: null, gender: 'F', birthDate: '2018-05-10', parents: [], teacherNames: ['Issa Diallo'], className: 'CP1-A' }));
const invoices = students.map((student, index) => ({ id: index + 1, studentId: student.id, studentName: `${student.lastName} ${student.firstName}`,
  registrationNumber: student.registrationNumber, classId: 11, className: 'CP1-A', feeTypeId: 33, feeTypeName: 'Scolarité', amountDue: 50000,
  discountAmount: 0, discountReason: null, netAmount: 50000, paid: 20000, balance: 30000, dueDate: '2027-07-30', status: 'PENDING', daysOverdue: 0 }));
const finance = { schoolName: school.name, expected: 1560000, discounts: 0, collected: 480000, remaining: 1080000, overdueAmount: 0,
  collectedThisMonth: 240000, collectionRate: 31, invoiceCount: 72, unpaidCount: 48, overdueCount: 0, paidCount: 24,
  perClass: [{ classId: 11, className: 'CP1-A', students: 24, expected: 1560000, collected: 480000, remaining: 1080000, unpaidInvoices: 48 }],
  perFeeType: fees.map(fee => ({ feeTypeId: fee.id, feeTypeName: fee.name, expected: fee.amount * 24, collected: 0, remaining: fee.amount * 24 })), recentPayments: [] };

/** All API calls are intercepted: UI checks never touch a school account or database. */
export async function mockSchool(page: Page, profile: Profile = 'proprietaire', additionalRoles: string[] = [], delegatedModules?: string[]) {
  const user = { id: 7, email: 'demo@example.test', firstName: 'Mariam', lastName: 'Ouédraogo', role: profile,
    approved: true, emailVerified: true, mustChangePassword: false, passwordSet: true, ownerAccount: profile === 'proprietaire' && delegatedModules === undefined,
    rawRoles: delegatedModules === undefined ? [...new Set([roles[profile], ...additionalRoles])] : ['STAFF'], requestedSchoolId: null, requestedSchoolName: null, requestedRole: null };
  await page.addInitScript(({ user }) => {
    localStorage.setItem('fasoecole_auth', JSON.stringify({ token: 'ui-test-session', user }));
    localStorage.setItem('fasoecole_owner_school', '1');
    localStorage.setItem('fasoecole_year_1', '1');
  }, { user });
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url());
    const api = url.pathname.slice(url.pathname.indexOf('/api') + 4);
    let data: unknown = [];
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (api === '/users/me') data = { ...user, roles: user.rawRoles };
    else if (api === '/academic-years/context-schools' || api.startsWith('/schools/by-owner/') || api === '/auth/registration-schools') data = [school];
    else if (api === '/owner/staff/my-access') data = [{ schoolId: 1, schoolName: school.name, schoolType: school.type, status: 'ACTIVE', owner: delegatedModules === undefined, jobTitle: 'Direction', modules: delegatedModules ?? ['DASHBOARD', 'MANAGEMENT', 'STUDENTS', 'TEACHERS', 'FINANCE', 'EXPENSES', 'GRADES', 'ENROLLMENT', 'CALENDAR', 'DISCIPLINE', 'LIBRARY', 'HOMEWORK', 'REQUESTS', 'PARENT_PORTAL', 'MESSAGES', 'CASH_BOOK', 'FINANCIAL_STATEMENTS'] }];
    else if (api === '/schools/1') data = school;
    else if (api === '/academic-years') data = [year];
    else if (api === '/levels') data = [{ id: 1, name: 'CP1', schoolId: 1, cycle: 'PRIMAIRE', sortOrder: 1 }];
    else if (api === '/classes' || /\/years\/1\/classes$/.test(api)) data = [hostClass];
    else if (api === '/students' || api === '/classes/11/roster') data = students;
    else if (api.includes('/owner/enrollment/') && api.endsWith('/overview')) data = { years: [year] };
    else if (api.includes('/owner/enrollment/') && api.endsWith('/promotion')) data = { fromYearId: 1, fromYearLabel: year.label, toYearId: 2, toYearLabel: '2027-2028', classes: [], targetClasses: [], pending: 0, decided: 0 };
    else if (api.endsWith('/fees') || api.endsWith('/fee-types')) data = fees;
    else if (api.includes('/owner/finance/') && api.endsWith('/overview')) data = finance;
    else if (api.includes('/owner/finance/') && api.endsWith('/invoices')) data = invoices;
    else if (api.includes('/opening-balances')) data = { accounts: [], receivables: [], payables: [] };
    else if (api.endsWith('/changes')) {
      if (url.searchParams.has('since')) await new Promise(resolve => setTimeout(resolve, 1000));
      if (page.isClosed()) return;
      data = { revision: 1, date: '2026-10-14T08:00:00' };
    }
    else if (api === '/owner/dashboard') data = { schoolId: 1, schoolName: school.name, schoolType: school.type, generatedDate: '2026-10-14', students: 24, teachers: 4, classes: 1, levels: 1, parents: 24,
      pendingAccountApprovals: 0, pendingInvoices: 48, outstandingAmount: 1080000, receivedAmount: 480000, expectedAmount: 1560000,
      attendanceRecorded: 24, presentToday: 23, absentToday: 1, lateToday: 0, excusedToday: 0, validatedReportCards: 0, schoolAverage: 13.5,
      averagePeriodName: 'Premier trimestre', passRate: 85, rankedStudents: 24, unreadMessages: 0, recentPayments: [], recentNotifications: [], pendingAttendanceReports: [], handledAttendanceReports: [] };
    else if (api === '/platform/schools') data = { items: [], total: 0, page: 0, size: 20 };
    else if (api.includes('/incidents')) data = { items: [], total: 0 };
    else if (/\/unread-count$/.test(api)) data = { count: 0 };
    else if (/\/(overview|summary|context|detail|balance|balances)$/.test(api)) {
      // Explicit service error exercises the existing recovery view for data not seeded here.
      return route.fulfill({ status: 503, json: { message: 'Données de démonstration indisponibles pour cette vue.' } });
    }
    return route.fulfill({ json: data });
  });
}
