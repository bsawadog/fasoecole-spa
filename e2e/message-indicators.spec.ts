import {test,expect} from '@playwright/test';
import {mockSchool,school} from './ui-fixtures';
for(const caseName of ['proprietaire','enseignant','parent','etudiant','personnel'] as const){
 const profile = caseName === 'personnel' ? 'proprietaire' : caseName;
 test(caseName+' message badge follows reception and reading',async({page})=>{
  await mockSchool(page,profile,caseName==='personnel'?['MESSAGES','DASHBOARD']:undefined);let unread=1;
  const summary=()=>({id:77,schoolId:1,schoolName:school.name,parentUserId:null,parentName:null,parentPhone:null,parentEmail:null,studentId:null,studentName:null,subject:'Message de test reçu',createdAt:'2026-10-18T10:00:00',lastMessageAt:'2026-10-18T10:00:00',unread:unread>0,recipientNames:['Enseignant','Direction'],recipientCount:2});
  await page.route('**/api/conversations**',route=>{
   const path=new URL(route.request().url()).pathname;
   if(path.endsWith('/unread-count'))return route.fulfill({json:unread});
   if(path.endsWith('/77')){unread=0;return route.fulfill({json:{conversation:summary(),messages:[{id:1,fromSchool:false,senderId:99,mine:false,senderName:'Enseignant',content:'Bonjour, voici le message.',sentAt:'2026-10-18T10:00:00',attachments:[]}]}});}
   if(path.endsWith('/conversations'))return route.fulfill({json:[summary()]});
   return route.fulfill({json:[]});
  });
  await page.route('**/api/owner/family/schools/1/summary',route=>route.fulfill({json:{unreadMessages:unread,pendingAbsenceReports:0}}));
  await page.route('**/api/owner/dashboard**',route=>route.fulfill({json:{schoolId:1,schoolName:school.name,schoolType:school.type,generatedDate:'2026-10-18',students:1,teachers:1,classes:1,levels:1,parents:1,pendingAccountApprovals:0,pendingInvoices:0,outstandingAmount:0,receivedAmount:0,expectedAmount:0,attendanceRecorded:0,presentToday:0,absentToday:0,lateToday:0,excusedToday:0,validatedReportCards:0,schoolAverage:null,averagePeriodName:null,passRate:null,rankedStudents:0,unreadMessages:unread,recentPayments:[],recentNotifications:[],pendingAttendanceReports:[],handledAttendanceReports:[]}}));
  await page.goto(profile==='proprietaire'?'/proprietaire':'/'+profile+'/messages');
  await expect(page.locator('.shell__messages')).toHaveAttribute('aria-label','Messages, 1 non lu(s)');
  if(profile==='proprietaire'){
   await expect(page.locator('#communication .owner-dashboard__unread strong')).toHaveText('1');
   await page.locator('.shell__messages').click();
  }
  await expect(page.locator('.ss__conv--unread')).toHaveCount(1);
  await page.locator('.ss__conv').first().click();
  await expect(page.getByText('Bonjour, voici le message.')).toBeVisible();
  await expect(page.locator('.shell__messages')).toHaveAttribute('aria-label','Messages');
  await expect(page.locator('.shell__message-count')).toHaveCount(0);
  unread=2;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.locator('.shell__messages')).toHaveAttribute('aria-label','Messages, 2 non lu(s)');
  if(profile==='proprietaire'){
   await page.goto('/proprietaire');
   await expect(page.locator('#communication .owner-dashboard__unread strong')).toHaveText('2');
   unread=3;await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
   await expect(page.locator('#communication .owner-dashboard__unread strong')).toHaveText('3');
   await expect(page.locator('.shell__messages')).toHaveAttribute('aria-label','Messages, 3 non lu(s)');
  }
 });
}
