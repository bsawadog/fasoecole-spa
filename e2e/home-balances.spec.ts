import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test('shows cash and unverified bank balances without mobile overflow', async ({ page }, info) => {
  await mockSchool(page);
  const months = Array.from({ length: 10 }, (_, i) => ({
    month: `${2026 + Math.floor((9 + i) / 12)}-${String((9 + i) % 12 + 1).padStart(2, '0')}`,
    receivedAmount: [480000, 620000, 350000, 0, 810000, 540000, 680000, 460000, 710000, 390000][i],
    spentAmount: [310000, 420000, 480000, 0, 490000, 380000, 520000, 510000, 460000, 270000][i],
  }));
  const received = months.reduce((sum, m) => sum + m.receivedAmount, 0);
  const spent = months.reduce((sum, m) => sum + m.spentAmount, 0);
  await page.route('**/api/owner/dashboard**', route => route.fulfill({ json: {
    schoolId: 1, schoolName: school.name, schoolType: school.type, generatedDate: '2026-10-17',
    students: 120, teachers: 12, classes: 6, levels: 6, parents: 100,
    pendingAccountApprovals: 0, pendingInvoices: 20, outstandingAmount: 300000, receivedAmount: received, expectedAmount: received + 300000,
    attendanceRecorded: 120, presentToday: 118, absentToday: 2, lateToday: 0, excusedToday: 0,
    validatedReportCards: 0, schoolAverage: null, averagePeriodName: null, passRate: null, rankedStudents: 0,
    unreadMessages: 0, recentPayments: [], recentNotifications: [], pendingAttendanceReports: [], handledAttendanceReports: [],
    bankPosition: {yearLabel:'2026-2027',fromDate:'2026-10-01',asOf:'2026-10-17',openingBalance:null,receipts:90000,payments:20000,balance:70000},
    classReceivables: { academicYearId: 1, yearLabel: '2026-2027', asOf: '2026-10-17', expected: 100000, received: 40000, overdue: 35000, upcoming: 25000, credit: 0, classes: [{classId:1,label:'CP1',expected:100000,received:40000,overdue:35000,upcoming:25000,credit:0}] },
    weeklyAttendance: { academicYearId: 1, yearLabel:'2026-2027', fromDate:'2026-10-05', toDate:'2026-10-17', weeks: [{fromDate:'2026-10-05',toDate:'2026-10-11',present:0,absent:0,late:0,excused:0,missing:0,observedCalls:0},{fromDate:'2026-10-12',toDate:'2026-10-17',present:40,absent:3,late:2,excused:1,missing:4,observedCalls:5}] },
    monthlyFinance: { academicYearId: 1, yearLabel: '2026-2027', startDate: '2026-10-01', endDate: '2027-07-30',
      months, receivedAmount: received, spentAmount: spent, difference: received - spent },
  } }));
  await page.route('**/api/owner/cash-book/schools/1?*', route => route.fulfill({json: {book:{openedOn:'2026-10-01',openingBalance:50000,closedOn:null},month:'2026-10',openingBalance:50000,receipts:30000,payments:10000,closingBalance:70000,closure:null,rows:[],history:[]}}));
  await page.goto('/proprietaire');
  const cards = page.getByRole('region', {name:'Caisse et banque'});
  await expect(cards.getByRole('heading',{name:'Niveau de la caisse'})).toBeVisible();
  await expect(cards.getByRole('heading',{name:'Niveau de la banque'})).toBeVisible();
  await expect(cards.getByText('Solde non vérifié',{exact:true})).toBeVisible();
  await expect(cards.getByText(/Report d’ouverture non renseigné/)).toBeVisible();
  await expect(cards.locator('.owner-dashboard__balance-value')).toHaveText([/70\s000 FCFA/,/70\s000 FCFA/]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await cards.screenshot({path:'test-results/home-balances-'+info.project.name+'.png'});
});
