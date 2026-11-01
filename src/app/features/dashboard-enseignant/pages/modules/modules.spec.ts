import {TestBed} from '@angular/core/testing';
import {signal} from '@angular/core';
import {ActivatedRoute,convertToParamMap} from '@angular/router';
import {of,Subject,throwError} from 'rxjs';
import {TeacherModule} from './modules';
import {SelfSpaceService,TeacherAttendanceItem} from '../../../../shared/self-space/self-space.service';
import {ParentPortalService} from '../../../../shared/self-space/parent-portal.service';
import {SchoolDataSyncService} from '../../../../shared/school-data-sync.service';
import {ConfirmationService} from '../../../../shared/confirmation/confirmation.service';
import {OfflineAttendanceService} from '../../../../shared/offline/offline-attendance.service';
import {AuthService} from '../../../../core/auth';
describe('Teacher attendance call',()=>{
 function setup(offlineOverrides: Record<string, unknown> = {}){
  let rows:TeacherAttendanceItem[]=[{studentId:1,fullName:'Awa',registrationNumber:'1',status:null,justification:null},{studentId:2,fullName:'Issa',registrationNumber:'2',status:'ABSENT',justification:'Malade'},{studentId:3,fullName:'Ali',registrationNumber:'3',status:'LATE',justification:null},{studentId:4,fullName:'Fati',registrationNumber:'4',status:'EXCUSED',justification:'Motif'}];
  const updates=new Subject<void>();
  const api={teacherClasses:vi.fn(()=>of([{classId:11,schoolId:1,className:'CP1'}])),teacherAttendance:vi.fn(()=>of(structuredClone(rows))),saveTeacherAttendanceBatch:vi.fn(()=>of(rows))};
  TestBed.configureTestingModule({imports:[TeacherModule],providers:[{provide:SelfSpaceService,useValue:api},{provide:ParentPortalService,useValue:{teacherPosts:()=>of([])}},{provide:SchoolDataSyncService,useValue:{watch:()=>updates}},{provide:ConfirmationService,useValue:{}},{provide:ActivatedRoute,useValue:{data:of({module:'presences'}),queryParamMap:of(convertToParamMap({})),snapshot:{queryParamMap:{get:()=>null}}}}]});
  TestBed.overrideComponent(TeacherModule,{set:{template:''}});
  TestBed.overrideProvider(AuthService,{useValue:{user:()=>({id:7})}});
  TestBed.overrideProvider(OfflineAttendanceService,{useValue:{enabled:()=>false,unlocked:()=>false,pending:()=>[],revision:()=>0,rememberClasses:vi.fn(),cachedClasses:()=>[],rememberView:vi.fn(),cachedView:()=>null,...offlineOverrides}});
  const fixture=TestBed.createComponent(TeacherModule);fixture.detectChanges();return {fixture,page:fixture.componentInstance,api,updates,rows};
 }
 it('keeps the form when saving a publication locally fails',async()=>{
  const savePublication=vi.fn(async()=>{throw new Error('Stockage plein');});
  const {fixture,page}=setup({enabled:()=>true,unlocked:()=>true,online:()=>false,snapshot:()=>undefined,publications:()=>[],publicationConfirmed:()=>false,savePublication});
  page.module.set('devoirs');page.postTitle='Exercices';page.content='Page 12';page.dueDate='2099-11-30';
  await page.publish();
  expect(savePublication).toHaveBeenCalledOnce();expect(page.postTitle).toBe('Exercices');
  expect(page.content).toBe('Page 12');expect(page.success()).toBeNull();expect(page.error()).toBeTruthy();
  page.postTitle='';page.content='';page.dueDate='';fixture.destroy();
 });
 it('automatically saves an unfinished homework as a draft without sending it',async()=>{
  const savePublication=vi.fn(async()=>{});
  const {fixture,page}=setup({enabled:()=>true,unlocked:()=>true,online:()=>false,snapshot:()=>undefined,publications:()=>[],savePublication});
  page.module.set('devoirs');page.postTitle='Travail en préparation';page.content='Consignes à compléter';page.draftChanged();
  await vi.waitFor(()=>expect(savePublication).toHaveBeenCalledOnce(),{timeout:2000});
  expect(savePublication).toHaveBeenCalledWith(expect.objectContaining({draft:true,payload:expect.objectContaining({kind:'HOMEWORK',classId:11,dueDate:null})}));
  expect(page.draftStatus()).toContain('non publié');expect(page.postTitle).toBe('Travail en préparation');fixture.destroy();
 });
 it('queues new homework without announcing it as published or losing its attachments',async()=>{
  const savePublication=vi.fn(async()=>{});
  const {fixture,page}=setup({enabled:()=>true,unlocked:()=>true,online:()=>false,snapshot:()=>undefined,publications:()=>[],publicationConfirmed:()=>false,savePublication});
  page.module.set('devoirs');page.postTitle='Exercices';page.content='Page 12';page.dueDate='2099-11-30';
  page.files=[new File(['Cours'],'cours.txt',{type:'text/plain'})];
  await page.publish();
  expect(savePublication).toHaveBeenCalledWith(expect.objectContaining({draft:false,userId:7,payload:expect.objectContaining({classId:11,kind:'HOMEWORK'}),files:[expect.objectContaining({name:'cours.txt'})]}));
  expect(page.postTitle).toBe('');expect(page.success()).toContain('en attente');expect(page.posts()).toEqual([]);fixture.destroy();
 });
 it('releases the class picker after local saving while synchronization is still waiting for the network',async()=>{
  let finishSync!:()=>void;
  const synchronize=vi.fn(()=>new Promise<void>(resolve=>{finishSync=resolve;}));
  const {fixture,page}=setup({enabled:()=>true,unlocked:()=>true,online:()=>true,snapshot:()=>undefined,remember:vi.fn(async()=>{}),
   publications:()=>[],publicationConfirmed:()=>true,savePublication:vi.fn(async()=>{}),synchronize});
  page.module.set('devoirs');page.classes.update(classes=>[...classes,{...classes[0],classId:12,className:'CP2'}]);
  page.postTitle='Devoir CP1';page.content='Exercices';page.dueDate='2099-11-30';
  await page.publish();expect(page.saving()).toBe(false);expect(synchronize).toHaveBeenCalledOnce();
  page.choose('12');expect(page.classId()).toBe(12);finishSync();await Promise.resolve();
  expect(page.classId()).toBe(12);expect(page.success()).toBeNull();fixture.destroy();
 });
 it('prefills missing statuses without writing or replacing recorded absences, lates and excuses',()=>{
  const {fixture,page,api}=setup();expect(page.title()).toBe('Présences et retards');
  expect([1,2,3,4].map(id=>page.attendanceDrafts[id].status)).toEqual(['PRESENT','ABSENT','LATE','EXCUSED']);
  expect(api.saveTeacherAttendanceBatch).not.toHaveBeenCalled();fixture.destroy();
 });
 it('queues attendance with the original status and justification before any network write',async()=>{
  const queue=vi.fn(async()=>{});
  const {fixture,page,api}=setup({enabled:()=>true,unlocked:()=>true,online:()=>true,snapshot:()=>undefined,remember:vi.fn(async()=>{}),queue});
  page.attendanceDrafts[2].status='PRESENT';page.saveCall();await fixture.whenStable();
  expect(queue).toHaveBeenCalledWith(1,11,page.date(),expect.any(Array),[
   {studentId:1,status:'PRESENT',justification:null,expectedStatus:null,expectedJustification:null,expectedVersion:null},
   {studentId:2,status:'PRESENT',justification:'Malade',expectedStatus:'ABSENT',expectedJustification:'Malade',expectedVersion:null},
  ],expect.any(Object));
  expect(api.saveTeacherAttendanceBatch).not.toHaveBeenCalled();fixture.destroy();
 });
 it('preserves unsaved edits on background refresh while accepting newly recorded statuses',()=>{
  const {fixture,page,rows,updates}=setup();page.attendanceDrafts[1].status='LATE';rows[1].status='EXCUSED';updates.next();
  expect(page.attendanceDrafts[1].status).toBe('LATE');expect(page.attendanceDrafts[2].status).toBe('EXCUSED');fixture.destroy();
 });
 it('saves all missing and changed rows independently of the search filter',()=>{
  const {fixture,page,api}=setup();page.filter.set('Awa');page.attendanceDrafts[2].status='PRESENT';page.saveCall();
  expect(api.saveTeacherAttendanceBatch).toHaveBeenCalledWith(11,{date:page.date(),entries:[{studentId:1,status:'PRESENT',justification:null,expectedStatus:null},{studentId:2,status:'PRESENT',justification:'Malade',expectedStatus:'ABSENT'}]});fixture.destroy();
 });
 it('keeps edited drafts when the server refuses the call',()=>{
  const {fixture,page,api}=setup();api.saveTeacherAttendanceBatch.mockReturnValue(throwError(()=>({error:{message:'Appel indisponible'}})));page.attendanceDrafts[1].status='ABSENT';page.saveCall();
  expect(page.attendanceDrafts[1].status).toBe('ABSENT');expect(page.saving()).toBe(false);expect(page.error()).toBeTruthy();expect(page.success()).toBeNull();fixture.destroy();
 });
 it('refuses to queue an offline call outside the class academic year',()=>{
  const queue=vi.fn();
  const {fixture,page,api}=setup({enabled:()=>true,unlocked:()=>true,online:()=>true,snapshot:()=>undefined,remember:vi.fn(async()=>{}),queue});
  page.classes.update(classes=>classes.map(cls=>({...cls,academicYearStartDate:'2020-09-01',academicYearEndDate:'2021-07-31',academicYearLabel:'2020-2021'})));
  page.date.set('2021-08-01');page.saveCall();
  expect(queue).not.toHaveBeenCalled();expect(api.saveTeacherAttendanceBatch).not.toHaveBeenCalled();
  expect(page.error()).toContain('2020-09-01');expect(page.error()).toContain('2021-07-31');fixture.destroy();
 });
 it('refuses a future date before queuing an individual attendance',()=>{
  const queue=vi.fn();
  const {fixture,page}=setup({enabled:()=>true,unlocked:()=>true,online:()=>true,snapshot:()=>undefined,remember:vi.fn(async()=>{}),queue});
  page.date.set('2999-01-01');page.saveAttendance(page.attendance()[0]);
  expect(queue).not.toHaveBeenCalled();expect(page.error()).toContain('passée ou actuelle');fixture.destroy();
 });
 it('restores the selected class, date and saved choices when returning to attendance offline',()=>{
  const rows:TeacherAttendanceItem[]=[{studentId:2,fullName:'Issa',registrationNumber:'2',status:'ABSENT',justification:'Malade'}];
  const {fixture,page,api}=setup({enabled:()=>true,unlocked:()=>true,online:()=>false,
   cachedClasses:()=>[{classId:12,schoolId:1,className:'CE1'}],cachedView:()=>({classId:12,date:'2026-10-15'}),
   snapshot:()=>({rows,savedAt:new Date().toISOString()}),remember:vi.fn(async()=>{})});
  expect(api.teacherClasses).not.toHaveBeenCalled();expect(api.teacherAttendance).not.toHaveBeenCalled();
  expect(page.classId()).toBe(12);expect(page.date()).toBe('2026-10-15');
  expect(page.attendance()).toEqual(rows);expect(page.attendanceDrafts[2].status).toBe('ABSENT');fixture.destroy();
 });
 it('keeps the roster while temporarily opening another module in the same offline component',()=>{
  const online=signal(true);
  const rows:TeacherAttendanceItem[]=[{studentId:1,fullName:'Awa',registrationNumber:'1',status:'LATE',justification:null}];
  const {fixture,page}=setup({enabled:()=>true,unlocked:()=>true,online,snapshot:()=>({rows,savedAt:new Date().toISOString()}),remember:vi.fn(async()=>{})});
  online.set(false);page.module.set('documents');page.reload();
  page.module.set('presences');page.reload();
  expect(page.error()).toBeNull();expect(page.attendance()).toEqual(rows);fixture.destroy();
 });
});
