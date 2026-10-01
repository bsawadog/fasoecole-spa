import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { StaffMember, StaffService } from '../../staff.service';
import { StaffPage } from './staff';

const member: StaffMember = {
  id: 3, userId: 40, firstName: 'Awa', lastName: 'Ouédraogo', email: 'awa@ecole.bf', phone: null,
  jobTitle: 'Comptable', modules: ['FINANCE', 'EXPENSES'], active: true, managedAccount: true,
  createdAt: '2026-10-01T08:00:00',
};

describe('StaffPage', () => {
  function setup() {
    const api = {
      list: vi.fn(() => of([member])),
      create: vi.fn(() => of({
        staff: { ...member, id: 4, firstName: 'Ali', email: 'ali@ecole.bf', modules: ['STUDENTS'] },
        temporaryPassword: 'Xy7kP2mQ9a', existingAccount: false, emailSent: false,
      })),
      update: vi.fn(),
      setActive: vi.fn(() => of({ ...member, active: false })),
      resetPassword: vi.fn(),
      remove: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [StaffPage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
        } },
        { provide: StaffService, useValue: api },
      ],
    });
    const fixture = TestBed.createComponent(StaffPage);
    fixture.detectChanges();
    return { fixture, api };
  }

  it('lists staff members with their delegated modules', () => {
    const { fixture, api } = setup();
    expect(api.list).toHaveBeenCalledWith(5);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ouédraogo Awa');
    expect(text).toContain('Frais & paiements');
    expect(text).toContain('Dépenses & budget');
    expect(text).toContain('Actif');
  });

  it('requires a module, then shows the temporary password once the account is created', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.openCreate();
    page.form.firstName = 'Ali';
    page.form.lastName = 'Sawadogo';
    page.form.email = 'ali@ecole.bf';
    page.form.jobTitle = 'Surveillant';
    page.save();
    expect(api.create).not.toHaveBeenCalled();
    expect(page.error()).toContain('module');

    page.applyPreset(page.presets[3]);
    page.save();
    expect(api.create).toHaveBeenCalledWith(5, expect.objectContaining({
      email: 'ali@ecole.bf', jobTitle: 'Surveillant général', modules: ['STUDENTS'],
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Xy7kP2mQ9a');
  });

  it('suspends a member after confirmation', async () => {
    const { fixture, api } = setup();
    await fixture.componentInstance.toggleActive(member);
    fixture.detectChanges();
    expect(api.setActive).toHaveBeenCalledWith(3, false);
    expect(fixture.nativeElement.textContent).toContain('Suspendu');
  });
});
