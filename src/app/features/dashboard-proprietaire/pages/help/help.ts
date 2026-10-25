import { SelectField } from '../../../../shared/ui/select-field';
import { SelectOption } from '../../../../shared/ui/select-field';
import { InputTextModule } from 'primeng/inputtext';
import { ButtonModule } from 'primeng/button';
import { MessageModule } from 'primeng/message';
import { afterRenderEffect, Component, computed, effect, ElementRef, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../../core/auth';
import { HELP_MODULES } from '../../../../shared/help/module-help';
import { ACCOUNT_HELP,PROFILE_HELP_QUESTIONS } from '../../../../shared/help/profile-help-content';
import { OWNER_HELP_QUESTIONS } from './owner-help-content';

@Component({
  selector: 'app-owner-help', standalone: true, imports: [SelectField, SelectOption, InputTextModule, ButtonModule, MessageModule, RouterLink],
  templateUrl: './help.html', styleUrl: './help.scss',
})
export class OwnerHelp {
  private readonly auth = inject(AuthService);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly host:ElementRef<HTMLElement> = inject(ElementRef);
  private readonly params=toSignal(this.route.queryParamMap,{initialValue:this.route.snapshot.queryParamMap});
  private readonly fragment=toSignal(this.route.fragment,{initialValue:this.route.snapshot.fragment});
  readonly search = signal('');
  readonly category = signal('Toutes');
  readonly selected = signal<string | null>(null);
  readonly moduleFilter=signal<string|null>(null);
  private readonly focusTarget=signal<string|null>(null);
  readonly availableModules=computed(()=>HELP_MODULES.filter(module=>{
    const role=this.auth.role();
    if(module.role==='common')return true;
    if(module.role!==role && !(role==='admin'&&module.role==='proprietaire'))return false;
    if(module.role==='proprietaire'&&role!=='admin'&&!this.auth.isSchoolOwner())return !!module.access&&this.auth.ownerModules().has(module.access);
    return true;
  }));
  readonly context=computed(()=>this.availableModules().find(module=>module.key===this.moduleFilter())??null);
  private readonly articles=computed(()=>{
    const role=this.auth.role(),modules=this.availableModules(),ids=new Set(modules.flatMap(module=>module.topics));
    const owner=role==='proprietaire'||role==='admin'?OWNER_HELP_QUESTIONS.filter(item=>ids.has(item.id)).map(item=>({...item,
      category:item.category==='Finances'?'Finance et comptabilité':item.category,
      route:role==='admin'&&!this.context()?.route.startsWith('/proprietaire')?item.route.replace('/proprietaire','/admin'):item.route,
    })):[];
    return [...owner,...PROFILE_HELP_QUESTIONS.filter(item=>ids.has(item.id)),ACCOUNT_HELP];
  });
  readonly categories=computed(()=>['Toutes',...new Set(this.articles().filter(item=>!this.context()||this.context()!.topics.includes(item.id)).map(item=>item.category))]);
  readonly guideTitle=computed(()=>({proprietaire:'Guide du propriétaire et du personnel',enseignant:'Guide enseignant',parent:'Guide parent',etudiant:'Guide élève',admin:'Guide administrateur'}[this.auth.role()??'proprietaire']));
  readonly waitingApproval = computed(() => {
    if(this.auth.role()!=='proprietaire')return false;
    const schools = this.auth.ownerAccess() ?? [];
    const school = schools.find(item => item.schoolId === this.auth.schoolContextId()) ?? schools[0];
    return school && ['DRAFT', 'PENDING_APPROVAL'].includes(school.status ?? '');
  });
  readonly questions = computed(() => {
    const normalize = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    const words = normalize(this.search()).trim().split(/\s+/).filter(Boolean);
    const context=this.context();
    const questions=this.articles().filter(item => (!context||context.topics.includes(item.id)) && (this.category() === 'Toutes' || item.category === this.category())
      && words.every(word => normalize([item.question, item.category, ...item.steps, item.note ?? ''].join(' ')).includes(word)));
    const primary=this.focusTarget();
    return context?questions.sort((a,b)=>Number(b.id===primary)-Number(a.id===primary)):questions;
  });
  constructor(){
    effect(()=>{
      const requested=this.params().get('module'),fragment=this.fragment();
      const module=this.availableModules().find(item=>item.key===requested);
      this.moduleFilter.set(module?.key??null);this.search.set('');this.category.set('Toutes');
      const candidate=fragment?.startsWith('question-')?fragment.slice('question-'.length):undefined;
      const target=candidate&&(module?module.topics.includes(candidate):this.articles().some(item=>item.id===candidate))?candidate:module?.primary;
      this.selected.set(target??null);this.focusTarget.set(target??null);
    });
    afterRenderEffect(()=>{
      const target=this.focusTarget();if(!target)return;
      const heading=this.host.nativeElement.querySelector<HTMLButtonElement>(`#question-${target}`);
      if(heading){heading.focus({preventScroll:true});heading.scrollIntoView({block:'center',behavior:'instant'});}
    });
  }
  choose(id: string): void { this.selected.update(value => value === id ? null : id); }
  print(): void { window.print(); }
  reset(): void { this.search.set(''); this.category.set('Toutes'); this.selected.set(null); }
  showAll():void {
    this.moduleFilter.set(null);this.reset();this.focusTarget.set(null);
    void this.router.navigate([],{relativeTo:this.route,queryParams:{module:null},queryParamsHandling:'merge',replaceUrl:true});
  }
}
