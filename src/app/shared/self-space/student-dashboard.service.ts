import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ParentDashboard } from './parent-dashboard.service';
import { ScheduleEntry } from './self-space.service';
export interface StudyProfile {studentId:number;fullName:string;schoolId:number;schoolName:string;classId:number|null;className:string|null;academicYearLabel:string|null;}
export interface StudyTask {id:number;title:string;details:string;dueOn:string|null;done:boolean;}
export interface StudentDashboard extends Pick<ParentDashboard,'asOf'|'attendance'|'weeks'|'periods'|'subjectPeriod'|'subjects'|'homework'|'dueHomework'|'evaluations'|'announcements'|'events'|'sharedSupport'> {
 profile:StudyProfile;courses:ScheduleEntry[];tasks:StudyTask[];pendingTasks:number;overdueTasks:number;
 subjectSuccess:{subjectId:number;name:string;percentage:number;gradeCount:number}[];
}
@Injectable({providedIn:'root'})
export class StudentDashboardService {
 private readonly http=inject(HttpClient);private readonly base=environment.apiUrl+'/me/student';
 profiles(){return this.http.get<StudyProfile[]>(this.base+'/profiles');}
 load(studentId:number){return this.http.get<StudentDashboard>(this.base+'/dashboard',{params:{studentId}});}
 tasks(id:number){return this.http.get<StudyTask[]>(this.base+'/profiles/'+id+'/tasks');}
 saveTask(studentId:number,body:Omit<StudyTask,'id'>,id?:number|null){const url=this.base+'/profiles/'+studentId+'/tasks';return id?this.http.put<void>(url+'/'+id,body):this.http.post<void>(url,body);}
 deleteTask(studentId:number,id:number){return this.http.delete<void>(this.base+'/profiles/'+studentId+'/tasks/'+id);}
}
