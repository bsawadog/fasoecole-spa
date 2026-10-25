import { TestBed } from '@angular/core/testing';
import { Title, Meta } from '@angular/platform-browser';
import { RouterStateSnapshot } from '@angular/router';
import { SeoTitleStrategy } from './seo-title-strategy';
import { environment } from '../../../environments/environment';

describe('SEO navigation',()=>{
 let strategy:SeoTitleStrategy;
 const navigate=(url:string)=>strategy.updateTitle({url,root:{data:{},children:[]}} as unknown as RouterStateSnapshot);
 beforeEach(()=>{TestBed.configureTestingModule({providers:[SeoTitleStrategy]});strategy=TestBed.inject(SeoTitleStrategy);});
 afterEach(()=>{document.head.querySelectorAll('link[rel="canonical"]').forEach(link=>link.remove());TestBed.resetTestingModule();});
 it('uses the selected environment and removes tracking parameters from the canonical URL',()=>{
  navigate('/services/frais-scolaires?source=parent#details');
  expect(document.querySelector('link[rel="canonical"]')?.getAttribute('href')).toBe(environment.siteUrl+'/services/frais-scolaires');
  expect(TestBed.inject(Title).getTitle()).toContain('Gestion des frais scolaires');
  expect(TestBed.inject(Meta).getTag('name="description"')?.content).toContain('versements');
 });
 it('replaces metadata and the canonical URL when moving between public pages',()=>{
  navigate('/contact');navigate('/services/communication');
  expect(document.querySelectorAll('link[rel="canonical"]')).toHaveLength(1);
  expect(TestBed.inject(Title).getTitle()).toContain('Communication entre écoles');
  expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('index,follow');
 });
 it('removes public canonical data and disallows indexing of account and unknown pages',()=>{
  for(const url of ['/login?token=secret','/proprietaire','/services/inconnu','/etablissements/123']){
   navigate('/');navigate(url);
   expect(document.querySelector('link[rel="canonical"]')).toBeNull();
   expect(TestBed.inject(Meta).getTag('name="robots"')?.content).toBe('noindex,follow');
   expect(TestBed.inject(Title).getTitle()).not.toContain('secret');
  }
 });
});
