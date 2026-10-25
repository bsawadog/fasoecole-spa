import { HELP_MODULES,helpModuleForRoute } from './module-help';
import { OWNER_HELP_QUESTIONS } from '../../features/dashboard-proprietaire/pages/help/owner-help-content';
import { PROFILE_HELP_QUESTIONS,ACCOUNT_HELP } from './profile-help-content';

describe('Module help registry',()=>{
  it('links every module to existing, unique explanations',()=>{
    const questions=[...OWNER_HELP_QUESTIONS,...PROFILE_HELP_QUESTIONS,ACCOUNT_HELP];
    expect(new Set(questions.map(q=>q.id)).size).toBe(questions.length);
    expect(new Set(HELP_MODULES.map(m=>m.key)).size).toBe(HELP_MODULES.length);
    for(const module of HELP_MODULES){
      expect(module.topics).toContain(module.primary);
      for(const id of module.topics)expect(questions.some(q=>q.id===id),`${module.key}: ${id}`).toBe(true);
    }
  });
  it('selects the detailed student or teacher explanation without losing module scope',()=>{
    expect(helpModuleForRoute('/proprietaire/eleves/25?tab=fees')).toMatchObject({key:'proprietaire:eleves',primary:'student-file'});
    expect(helpModuleForRoute('/proprietaire/enseignants/9')).toMatchObject({key:'proprietaire:enseignants',primary:'teacher-file'});
    expect(helpModuleForRoute('/admin/enseignants/9')).toMatchObject({key:'admin:enseignants',primary:'teacher-file'});
    expect(helpModuleForRoute('/parent/enfants/25')).toMatchObject({key:'parent:enfants',primary:'parent-enfants'});
  });
  it('does not show a recursive help button on the help pages',()=>{
    expect(helpModuleForRoute('/proprietaire/aide?module=proprietaire:salaires')).toBeUndefined();
    expect(helpModuleForRoute('/aide')).toBeUndefined();expect(helpModuleForRoute('/unknown')).toBeUndefined();
    expect(helpModuleForRoute('/profil')?.key).toBe('common:profile');
  });
});
