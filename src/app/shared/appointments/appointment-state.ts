export interface DatedAppointment { proposedAt: string; status: string; }
export type AppointmentGroup = 'active' | 'expired' | 'rejected' | 'cancelled';

export function appointmentGroup(appointment: DatedAppointment, now: number): AppointmentGroup {
  if (appointment.status === 'REJECTED') return 'rejected';
  if (appointment.status === 'CANCELLED') return 'cancelled';
  return new Date(appointment.proposedAt).getTime() > now ? 'active' : 'expired';
}
export function pendingAppointmentCount(appointments: DatedAppointment[], now: number): number {
  return appointments.filter(a => a.status === 'PENDING' && appointmentGroup(a, now) === 'active').length;
}
export function nearestAppointmentFirst(a: DatedAppointment, b: DatedAppointment, now: number): number {
  return Math.abs(new Date(a.proposedAt).getTime() - now) - Math.abs(new Date(b.proposedAt).getTime() - now);
}
