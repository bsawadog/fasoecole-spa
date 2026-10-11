import { appointmentGroup, nearestAppointmentFirst, pendingAppointmentCount } from './appointment-state';

describe('Appointment state', () => {
  const now = new Date('2026-10-09T10:00').getTime();
  it('counts only pending requests whose appointment time is still future', () => {
    const future = '2026-10-09T10:01';
    expect(pendingAppointmentCount([
      { status: 'PENDING', proposedAt: future },
      { status: 'ACCEPTED', proposedAt: future },
      { status: 'REJECTED', proposedAt: future },
      { status: 'CANCELLED', proposedAt: future },
      { status: 'PENDING', proposedAt: '2026-10-09T10:00' },
      { status: 'PENDING', proposedAt: '2026-10-08T10:00' },
    ], now)).toBe(1);
  });
  it('keeps rejected and cancelled requests out of the expired group', () => {
    expect(appointmentGroup({ status: 'REJECTED', proposedAt: '2020-01-01' }, now)).toBe('rejected');
    expect(appointmentGroup({ status: 'CANCELLED', proposedAt: '2020-01-01' }, now)).toBe('cancelled');
  });
  it('orders expired appointments from the most recent to the oldest', () => {
    const values = ['2026-10-01T10:00', '2026-10-08T10:00'].map(proposedAt => ({ proposedAt, status: 'PENDING' }));
    expect(values.sort((a, b) => nearestAppointmentFirst(a, b, now)).map(a => a.proposedAt)).toEqual(['2026-10-08T10:00', '2026-10-01T10:00']);
  });
});
