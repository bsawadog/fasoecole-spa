import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { AuthService, OWNER_MODULES } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { EmployeeMember, StaffService } from '../../staff.service';
import { StaffPage } from './staff';

const member: EmployeeMember = {
  id: 3, userId: 40, firstName: 'Awa', lastName: 'Ouédraogo', email: 'awa@ecole.bf', phone: null,
  jobTitle: 'Comptable', modules: ['FINANCE', 'EXPENSES'], active: true, managedAccount: true,
  createdAt: '2026-10-01T08:00:00',teacher:null,administrativeEmployment:true,owner:false,identityEditable:true,emailEditable:true,accountActive:true,
};

describe('StaffPage', () => {
  function setup() {
    const api = {
      directory: vi.fn(() => of([member])),
      create: vi.fn(() => of({
        staff: { ...member, id: 4, firstName: 'Ali', email: 'ali@ecole.bf', modules: ['STUDENTS'] },
        temporaryPassword: null, existingAccount: false, emailSent: false,
      })),
      updateEmployee: vi.fn(),
      setActive: vi.fn(() => of({ ...member, active: false })),
      sendEmployeeLink: vi.fn(),
      remove: vi.fn(),
    };
    TestBed.configureTestingModule({
      imports: [StaffPage],
      providers: [
        provideRouter([]),
        { provide: ConfirmationService, useValue: { confirm: () => Promise.resolve(true) } },
        { provide: AuthService, useValue: {
          user: () => ({ id: 7 }),
          selectSchoolContext: vi.fn(), selectedSchoolType: () => 'PRIMAIRE', getOwnedSchools: () => of([{ id: 5, name: 'École', type: 'SECONDAIRE' }]),
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
    expect(api.directory).toHaveBeenCalledWith(5);
    const text = fixture.nativeElement.textContent;
    expect(text).toContain('Ouédraogo Awa');
    expect(text).toContain('Recouvrement');
    expect(text).toContain('Dépenses & budget');
    expect(text).toContain('Actif');
  });

  it('reports a failed invitation without showing a password', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.openCreate();
    page.form.firstName = 'Ali';
    page.form.lastName = 'Sawadogo';
    page.form.email = 'ali@ecole.bf';
    page.form.jobTitle = 'Surveillant';
    page.form.monthlySalary = 75000;
    page.applyPreset(page.presets[3]);
    page.save();
    expect(api.create).toHaveBeenCalledWith(5, expect.objectContaining({
      email: 'ali@ecole.bf', jobTitle: 'Surveillant général', monthlySalary: 75000, modules: ['STUDENTS', 'DISCIPLINE', 'HOMEWORK', 'MESSAGES'],
    }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('L’envoi du courriel a échoué');
    expect(fixture.nativeElement.textContent).not.toContain('Mot de passe provisoire');
  });

  it('creates an employee without delegated application modules', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.openCreate();
    Object.assign(page.form, { firstName: 'Ali', lastName: 'Sawadogo', email: '', phone: '', jobTitle: 'Gardien' });
    page.save();
    expect(api.create).toHaveBeenCalledWith(5, expect.objectContaining({ jobTitle: 'Gardien', email: '', phone: null, modules: [] }));
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Aucune invitation envoyée');
  });

  it('offers all delegated modules and saves library access without granting student records', () => {
    const { fixture, api } = setup();
    const page = fixture.componentInstance;
    page.openCreate(); fixture.detectChanges();
    const options=Array.from(fixture.nativeElement.querySelectorAll('.stf__module')) as HTMLElement[];
    expect(options).toHaveLength(OWNER_MODULES.length);
    for(const module of OWNER_MODULES){
      expect(options.filter(option=>option.textContent?.includes(module.label))).toHaveLength(1);
    }
    expect(fixture.nativeElement.querySelectorAll('.stf__module-group').length).toBe(3);
    Object.assign(page.form, { firstName: 'Ali', lastName: 'Sawadogo', jobTitle: 'Bibliothécaire' });
    page.toggleModule('LIBRARY', true);
    page.save();
    expect(api.create).toHaveBeenCalledWith(5, expect.objectContaining({ modules: ['LIBRARY'] }));
  });

  it('suspends a member after confirmation', async () => {
    const { fixture, api } = setup();
    await fixture.componentInstance.toggleActive(member);
    fixture.detectChanges();
    expect(api.setActive).toHaveBeenCalledWith(3, false);
    expect(fixture.nativeElement.textContent).toContain('Suspendu');
  });

  it('edits identity, email and individual modules for a shared employee account',()=>{
    const {fixture,api}=setup(),page=fixture.componentInstance;
    page.openEdit({...member,managedAccount:false});fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[name="email"]').disabled).toBe(false);
    expect(fixture.nativeElement.querySelector('[name="firstName"]').disabled).toBe(false);
    page.form.firstName='Awa corrigée';page.form.email='awa.nouveau@ecole.bf';page.toggleModule('FINANCE',false);page.toggleModule('LIBRARY',true);
    api.updateEmployee.mockReturnValue(of({...member,firstName:'Awa corrigée',email:page.form.email,modules:['EXPENSES','LIBRARY']}));
    page.save();
    expect(api.updateEmployee).toHaveBeenCalledWith(5,40,expect.objectContaining({profile:expect.objectContaining({firstName:'Awa corrigée',email:'awa.nouveau@ecole.bf',modules:['EXPENSES','LIBRARY']})}));
    expect(page.staff()[0].firstName).toBe('Awa corrigée');
  });

  it('removes all module access while retaining the employee and remuneration',async()=>{
    const {fixture,api}=setup(),page=fixture.componentInstance;
    api.updateEmployee.mockReturnValue(of({...member,modules:[]}));
    await page.remove(member);
    expect(api.updateEmployee).toHaveBeenCalledWith(5,40,expect.objectContaining({profile:expect.objectContaining({modules:[]}),administrativeEmployment:true}));
    expect(api.remove).not.toHaveBeenCalled();expect(page.staff()).toHaveLength(1);expect(page.staff()[0].modules).toEqual([]);
    page.accessFilter.set('WITHOUT_ACCESS');expect(page.filteredStaff()).toHaveLength(1);
  });

  it('grants teacher modules without an additional administrative salary',()=>{
    const {fixture,api}=setup(),page=fixture.componentInstance;
    const teacher={...member,id:null,teacher:{id:9,employeeNumber:'EMP-9',specialty:'Mathématiques',hireDate:'2026-09-01',rateType:'HOURLY',rate:2500,rateEffectiveFrom:'2026-09-01'},administrativeEmployment:false,modules:[]};
    page.staff.set([teacher]);page.openEdit(teacher);page.toggleModule('GRADES',true);
    api.updateEmployee.mockReturnValue(of({...teacher,modules:['GRADES']}));page.save();
    expect(api.updateEmployee).toHaveBeenCalledWith(5,40,expect.objectContaining({profile:expect.objectContaining({monthlySalary:null,modules:['GRADES']}),employeeNumber:'EMP-9',specialty:'Mathématiques',hireDate:'2026-09-01',administrativeEmployment:false,teacherRate:null}));
    expect(page.staff()).toHaveLength(1);
  });

  it('keeps protected account identity and owner modules read-only',async()=>{
    const {fixture}=setup(),page=fixture.componentInstance;
    page.openEdit({...member,owner:true,identityEditable:false,emailEditable:false});fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[name="email"]').disabled).toBe(true);
    expect(fixture.nativeElement.querySelector('[name="firstName"]').disabled).toBe(true);
    const previous=[...page.form.modules];page.setAllModules(false);expect([...page.form.modules]).toEqual(previous);
    expect([...fixture.nativeElement.querySelectorAll('.stf__module input')].every((e:any)=>e.disabled)).toBe(true);
  });
});
