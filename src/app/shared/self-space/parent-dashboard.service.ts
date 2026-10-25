import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { environment } from '../../../environments/environment';
import { StudentOverview } from './self-space.service';
export interface ParentAttendance {present:number;absent:number;late:number;excused:number;}
export interface ParentDashboard {
 child:StudentOverview;asOf:string;firstDay:string|null;lastDay:string|null;attendance:ParentAttendance;
 weeks:{start:string;end:string;attendance:ParentAttendance}[];
 periods:{id:number;name:string;published:boolean;average:number|null}[];
 subjectPeriod:string|null;subjects:{name:string;average:number|null}[];
 homework:{todo:number;submitted:number;corrected:number;overdue:number};
 dueHomework:{id:number;title:string;dueOn:string|null;overdue:boolean}[];
 evaluations:{title:string;subject:string;date:string}[];
 announcements:{id:number;title:string;createdAt:string}[];
 events:{title:string;startsOn:string;endsOn:string}[];sharedSupport:number;
}
@Injectable({providedIn:'root'})
export class ParentDashboardService {
 private readonly http=inject(HttpClient);
 load(studentId:number){return this.http.get<ParentDashboard>(environment.apiUrl+'/me/parent/dashboard',{params:{studentId}});}
}
