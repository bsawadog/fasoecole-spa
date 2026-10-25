import { DOCUMENT } from '@angular/common';
import { inject, Injectable } from '@angular/core';
import { Meta, Title } from '@angular/platform-browser';
import { RouterStateSnapshot, TitleStrategy } from '@angular/router';
import { environment } from '../../../environments/environment';
import { PUBLIC_PAGES } from './public-pages';

@Injectable()
export class SeoTitleStrategy extends TitleStrategy {
 private readonly document=inject(DOCUMENT);
 private readonly title=inject(Title);
 private readonly meta=inject(Meta);
 override updateTitle(snapshot:RouterStateSnapshot):void {
  const path=snapshot.url.split(/[?#]/)[0].replace(/\/+$/,'')||'/';
  const page=PUBLIC_PAGES[path];
  const title=page ? `${page.title} | FasoÉcole` : (this.buildTitle(snapshot)||'Mon espace | FasoÉcole');
  this.title.setTitle(title);
  this.meta.updateTag({name:'description',content:page?.description??'Accédez à votre espace personnel FasoÉcole.'});
  this.meta.updateTag({name:'robots',content:page?'index,follow':'noindex,follow'});
  this.document.head.querySelectorAll('link[rel="canonical"]').forEach(link=>link.remove());
  if(page){
   const canonical=this.document.createElement('link');
   canonical.rel='canonical';canonical.href=environment.siteUrl+path;
   this.document.head.appendChild(canonical);
  }
 }
}
