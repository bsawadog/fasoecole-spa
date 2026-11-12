import { OfflineDiagnosticsService } from './offline-diagnostics.service';

describe('Offline diagnostics metadata',()=>{
  it('keeps request paths and technical context without credentials or query values',()=>{
    const service=new OfflineDiagnosticsService();
    service.record('https://name:password@example.test/api/classes/11/roster?token=secret&search=student-name','offline-cache-miss',{school:'1',year:'2'});
    const text=JSON.stringify(service.snapshot());
    expect(text).toContain('/api/classes/11/roster');expect(text).toContain('offline-cache-miss');
    for(const secret of ['password','secret','student-name','example.test'])expect(text).not.toContain(secret);
  });
  it('bounds the memory log and returns an independent snapshot',()=>{
    const service=new OfflineDiagnosticsService();
    for(let i=0;i<40;i++)service.record('/api/classes/'+i,'request-failed',{status:504});
    const events=service.snapshot();expect(events).toHaveLength(30);expect(events[0].path).toBe('/api/classes/10');
    events.splice(0);expect(service.snapshot()).toHaveLength(30);
  });
});
