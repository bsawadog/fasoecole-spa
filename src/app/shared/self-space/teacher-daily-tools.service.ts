import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';
import { ScheduleEntry } from './self-space.service';
export interface Lesson { id: number; subjectId: number; subjectName: string; lessonOn: string; title: string; content: string; objectives: string; nextWork: string; shared: boolean; }
export interface PersonalNote { id: number; title: string; content: string; remindOn: string | null; done: boolean; }
export interface Support { studentId: number; studentName: string; absences: number; overdue: number; average: number | null; id: number | null; action: string; reviewOn: string | null; resolved: boolean; familyMessage: string; shared: boolean; }
export interface Availability { id: number; schoolName: string; startsAt: string; endsAt: string; reason: string; replacementRequested: boolean; conversationId: number; }
export interface FamilyLearning { lessons: Lesson[]; support: { teacherName: string; message: string; reviewOn: string | null; resolved: boolean }[]; }
export interface TeacherToday { date: string; lessons: ScheduleEntry[]; tasks: { title: string; count: number; route: string }[]; reminders: PersonalNote[]; }
@Injectable({providedIn:'root'})
export class TeacherDailyToolsService {
 private readonly http=inject(HttpClient);
 private readonly base=environment.apiUrl+'/me';
 today(){return this.http.get<TeacherToday>(this.base+'/teacher/daily/today');}
 lessons(id:number){return this.http.get<Lesson[]>(this.base+'/teacher/classes/'+id+'/lessons');}
 support(id:number){return this.http.get<Support[]>(this.base+'/teacher/classes/'+id+'/support');}
 notes(){return this.http.get<PersonalNote[]>(this.base+'/teacher/daily/notes');}
 availability(){return this.http.get<Availability[]>(this.base+'/teacher/daily/availability');}
 family(id:number){return this.http.get<FamilyLearning>(this.base+'/students/'+id+'/learning');}
 save(path:string,body:unknown,id?:number|null){return id?this.http.put<void>(this.base+'/teacher/'+path+'/'+id,body):this.http.post<void>(this.base+'/teacher/'+path,body);}
 remove(path:string,id:number){return this.http.delete<void>(this.base+'/teacher/'+path+'/'+id);}
 saveSupport(classId:number,studentId:number,body:unknown){return this.http.put<void>(this.base+'/teacher/classes/'+classId+'/support/'+studentId,body);}
}
