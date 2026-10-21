import { Component } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../core/auth';
import { SupportIncidents } from './support-incidents';

@Component({ standalone: true, template: '' })
class EmptyPage {}

describe('Support incident deep link', () => {
  it('opens the form from an error link even when already on the incidents page, without posting an incident', async () => {
    TestBed.configureTestingModule({ providers: [
      provideRouter([{ path: 'proprietaire/incidents', component: EmptyPage }]),
      provideHttpClient(), provideHttpClientTesting(),
      { provide: AuthService, useValue: {
        user: () => ({ id: 7, rawRoles: ['SCHOOL_OWNER'] }),
        schoolContextId: () => 5,
        getOwnedSchools: () => of([{ id: 5, name: 'École' }]),
      } },
    ] });
    const router = TestBed.inject(Router);
    await router.navigateByUrl('/proprietaire/incidents');
    const fixture = TestBed.createComponent(SupportIncidents);
    fixture.detectChanges();
    expect(fixture.componentInstance.creating).toBe(false);
    await router.navigateByUrl('/proprietaire/incidents?nouveau=1&source=%2Fproprietaire%2Feleves');
    fixture.detectChanges();
    expect(fixture.componentInstance.creating).toBe(true);
    expect(fixture.componentInstance.pageTitle).toBe('/proprietaire/eleves');
    expect(fixture.nativeElement.querySelector('form')).not.toBeNull();
    const http = TestBed.inject(HttpTestingController);
    const requests = http.match(() => true);
    expect(requests.every(request => request.request.method === 'GET')).toBe(true);
    requests.forEach(request => request.flush([]));
    fixture.destroy();
    http.verify();
  });
});
