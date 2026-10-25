import { Component,computed,inject } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { NavigationEnd,Router,RouterLink } from '@angular/router';
import { TooltipModule } from 'primeng/tooltip';
import { filter,map,of } from 'rxjs';
import { helpModuleForRoute } from './module-help';

@Component({
  selector:'app-module-help',standalone:true,imports:[RouterLink,TooltipModule],
  template:`@if(help();as help){
    <button type="button" class="help-button" [routerLink]="help.route" [queryParams]="{module:help.module.key}"
      [fragment]="'question-'+help.module.primary" aria-label="Centre d’aide" title="Centre d’aide"
      [pTooltip]="'Étapes et fonctionnement : '+help.module.title" tooltipPosition="top" tooltipEvent="both" appendTo="body" [showDelay]="500">
      <img src="assets/images/bouton_aide.png" alt="" aria-hidden="true" width="44" height="44" decoding="async" />
    </button>
  }`,
  styles:[`:host{display:flex} .help-button{display:inline-flex;align-items:center;justify-content:center;box-sizing:border-box;width:2.75rem;height:2.75rem;padding:0;border:0;border-radius:50%;background:transparent;cursor:pointer;transition:background-color 160ms ease} .help-button:hover{background:rgb(255 255 255 / 12%)}.help-button:focus-visible{outline:3px solid var(--theme-focus, #93c5fd);outline-offset:3px}.help-button img{display:block;width:100%;height:100%;object-fit:contain;flex:none}@media print{:host{display:none!important}}`],
})
export class ModuleHelpButton {
  private readonly router=inject(Router,{optional:true});
  private readonly url=toSignal(this.router?.events?.pipe(filter(e=>e instanceof NavigationEnd),map(()=>this.router!.url))??of(''),{initialValue:this.router?.url??''});
  readonly help=computed(()=>{
    const module=helpModuleForRoute(this.url());
    return module?{module,route:module.role==='proprietaire'?'/proprietaire/aide':module.role==='admin'?'/admin/aide':'/aide'}:null;
  });
}
