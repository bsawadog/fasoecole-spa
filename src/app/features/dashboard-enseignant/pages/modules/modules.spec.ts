import {TestBed} from '@angular/core/testing';
import {ActivatedRoute} from '@angular/router';
import {of,Subject,throwError} from 'rxjs';
import {TeacherModule} from './modules';
import {SelfSpaceService,TeacherAttendanceItem} from '../../../../shared/self-space/self-space.service';
import {ParentPortalService} from '../../../../shared/self-space/parent-portal.service';
import {SchoolDataSyncService} from '../../../../shared/school-data-sync.service';
import {ConfirmationService} from '../../../../shared/confirmation/confirmation.service';
describe('Teacher attendance call',()=>{
 function setup(){
  let rows:TeacherAttendanceItem[]=[{studentId:1,fullName:'Awa',registrationNumber:'1',status:null,justification:null},{studentId:2,fullName:'Issa',registrationNumber:'2',status:'ABSENT',justification:'Malade'},{studentId:3,fullName:'Ali',registrationNumber:'3',status:'LATE',justification:null},{studentId:4,fullName:'Fati',registrationNumber:'4',status:'EXCUSED',justification:'Motif'}];
  const updates=new Subject<void>();
  const api={teacherClasses:vi.fn(()=>of([{classId:11,schoolId:1,className:'CP1'}])),teacherAttendance:vi.fn(()=>of(structuredClone(rows))),saveTeacherAttendanceBatch:vi.fn(()=>of(rows))};
  TestBed.configureTestingModule({imports:[TeacherModule],providers:[{provide:SelfSpaceService,useValue:api},{provide:ParentPortalService,useValue:{}},{provide:SchoolDataSyncService,useValue:{watch:()=>updates}},{provide:ConfirmationService,useValue:{}},{provide:ActivatedRoute,useValue:{data:of({module:'presences'}),snapshot:{queryParamMap:{get:()=>null}}}}]});
  TestBed.overrideComponent(TeacherModule,{set:{template:''}});
  const fixture=TestBed.createComponent(TeacherModule);fixture.detectChanges();return {fixture,page:fixture.componentInstance,api,updates,rows};
 }
 it('prefills missing statuses without writing or replacing recorded absences, lates and excuses',()=>{
  const {fixture,page,api}=setup();expect(page.title()).toBe('Présences et retards');
  expect([1,2,3,4].map(id=>page.attendanceDrafts[id].status)).toEqual(['PRESENT','ABSENT','LATE','EXCUSED']);
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
});
