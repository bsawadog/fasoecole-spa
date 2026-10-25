import { test, expect } from '@playwright/test';
import { mockSchool, school } from './ui-fixtures';

test('shows the monthly finance chart on desktop and mobile with keyboard-accessible values', async ({ page }, info) => {
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
    monthlyFinance: { academicYearId: 1, yearLabel: '2026-2027', startDate: '2026-10-01', endDate: '2027-07-30',
      months, receivedAmount: received, spentAmount: spent, difference: received - spent },
  } }));
  await page.goto('/proprietaire');
  const chart = page.locator('app-monthly-finance');
  await expect(chart.getByRole('heading', { name: 'Encaissements et dépenses' })).toBeVisible();
  await expect(chart.locator('svg g[role="button"]')).toHaveCount(10);
  await chart.locator('svg g[role="button"]').nth(1).focus();
  await expect(chart.locator('.monthly-finance__detail')).toContainText('novembre 2026');
  await expect(chart.locator('.monthly-finance__detail')).toContainText(/620\s000 FCFA/);
  await chart.locator('summary').click();
  await expect(chart.locator('tbody tr')).toHaveCount(10);
  await chart.locator('summary').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await chart.screenshot({ path: `test-results/monthly-finance-${info.project.name}.png` });
});
