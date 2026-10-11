import { Injectable, inject } from '@angular/core';
import { forkJoin, from, map, mergeMap, of, switchMap, toArray } from 'rxjs';
import { AuthService } from '../../core/auth';
import { SelfSpaceService } from '../self-space/self-space.service';
import { ParentPortalService } from '../self-space/parent-portal.service';
import { AppointmentsService } from './appointments.service';
import { DatedAppointment } from './appointment-state';

export type AppointmentProfile = 'parent' | 'teacher' | 'personal' | 'owner';
@Injectable({ providedIn: 'root' })
export class AppointmentOverviewService {
  private readonly api = inject(AppointmentsService);
  private readonly portal = inject(ParentPortalService);
  private readonly self = inject(SelfSpaceService);
  private readonly auth = inject(AuthService);
  load(profile: AppointmentProfile) {
    const legacy = profile === 'parent' ? this.self.myStudents().pipe(
      switchMap(children => from(children).pipe(mergeMap(child => this.portal.appointments(child.studentId), 4), toArray())),
      map(rows => [...new Map(rows.flat().map(a => [a.id, a])).values()]),
    ) : profile === 'teacher' ? this.self.teacherClasses().pipe(
      switchMap(classes => from(classes).pipe(mergeMap(c => this.portal.teacherAppointments(c.classId), 4), toArray())),
      map(rows => [...new Map(rows.flat().map(a => [a.id, a])).values()]),
    ) : of([]);
    if (profile === 'owner') {
      const userId = this.auth.user()?.id;
      if (!userId) return of([] as DatedAppointment[]);
      return this.auth.getOwnedSchools(userId, 'STUDENTS').pipe(switchMap(schools => {
        const selected = schools.find(s => s.id === Number(localStorage.getItem('fasoecole_owner_school'))) ?? schools[0];
        if (!selected) return of([] as DatedAppointment[]);
        return forkJoin({ received: this.api.received(), sent: this.api.sent(selected.id), parents: this.portal.schoolAppointments(selected.id) }).pipe(
          map(data => [...data.received.filter(a => a.schoolId === selected.id), ...data.sent, ...data.parents]),
        );
      }));
    }
    return forkJoin({ received: this.api.received(), legacy }).pipe(map(data => [...data.received, ...data.legacy] as DatedAppointment[]));
  }
}
