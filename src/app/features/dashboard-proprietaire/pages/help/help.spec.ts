import { TestBed } from '@angular/core/testing';
import { ActivatedRoute,convertToParamMap,provideRouter,Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { OwnerHelp } from './help';

describe('Contextual help',()=>{
  async function setup(module:string|null,role='proprietaire',owner=true,permissions:string[]=[]){
    HTMLElement.prototype.scrollIntoView=vi.fn();
    const params=new BehaviorSubject(convertToParamMap(module?{module}:{})),fragment=new BehaviorSubject<string|null>(null);
    TestBed.configureTestingModule({imports:[OwnerHelp],providers:[provideRouter([]),
      {provide:AuthService,useValue:{role:()=>role,isSchoolOwner:()=>owner,ownerModules:()=>new Set(permissions),ownerAccess:()=>[],schoolContextId:()=>1}},
      {provide:ActivatedRoute,useValue:{queryParamMap:params,fragment,snapshot:{queryParamMap:params.value,fragment:null}}},
    ]});
    const fixture=TestBed.createComponent(OwnerHelp);fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    return {fixture,page:fixture.componentInstance,params,fragment};
  }
  it('opens the main explanation and limits the questions to the source module',async()=>{
    const {page,fixture}=await setup('proprietaire:salaires');
    expect(page.selected()).toBe('payroll');expect(page.questions().map(q=>q.id)).toEqual(expect.arrayContaining(['payroll','payroll-taxes','payroll-documents']));
    expect(page.questions()).toHaveLength(3);expect(fixture.nativeElement.querySelector('#answer-payroll').hidden).toBe(false);
  });
  it('updates the explanation when navigating between help links without recreating the page',async()=>{
    const {page,fixture,params,fragment}=await setup('proprietaire:salaires');page.search.set('no result');
    params.next(convertToParamMap({module:'proprietaire:impots-taxes'}));fragment.next('question-tax-obligations');fixture.detectChanges();await fixture.whenStable();fixture.detectChanges();
    expect(page.selected()).toBe('tax-obligations');expect(page.search()).toBe('');expect(page.questions()).toHaveLength(1);
  });
  it('keeps staff help limited to their delegated modules',async()=>{
    const {page}=await setup('proprietaire:salaires','proprietaire',false,['TAXES']);
    expect(page.context()).toBeNull();expect(page.questions().map(q=>q.id)).toEqual(['tax-obligations','account-profile']);
  });
  it('provides parent instructions rather than school administration instructions',async()=>{
    const {page}=await setup('parent:notes','parent');
    expect(page.selected()).toBe('parent-notes');expect(page.questions()).toHaveLength(1);expect(page.questions()[0].steps.join(' ')).toContain('résultats publiés');
    expect(page.questions()[0].route).toBe('/parent/notes');
  });
  it('falls back to the module explanation for unknown fragments',async()=>{
    const {page,fixture,fragment}=await setup('proprietaire:caisse');fragment.next('question-nonexistent');fixture.detectChanges();await fixture.whenStable();
    expect(page.selected()).toBe('cash-book');
    const navigate=vi.spyOn(TestBed.inject(Router),'navigate').mockResolvedValue(true);page.showAll();expect(page.context()).toBeNull();expect(page.questions().length).toBeGreaterThan(25);expect(navigate).toHaveBeenCalled();
  });
});
