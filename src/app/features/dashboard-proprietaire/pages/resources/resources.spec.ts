import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { of } from 'rxjs';
import { AuthService } from '../../../../core/auth';
import { ConfirmationService } from '../../../../shared/confirmation/confirmation.service';
import { Asset, StockItem } from '../../resources.service';
import { SchoolResourcesPage } from './resources';
import { environment } from '../../../../../environments/environment';

const stock: StockItem = {id: 7,code:'CRAIE-1',name:'Craie blanche',category:'TEACHING',unit:'boîte',location:'Magasin',minimumQuantity:2,quantity:5,unitCost:500,active:true,notes:'',version:2};
const asset: Asset = {id:8,code:'MOB-1',name:'Tables-bancs',category:'DESK_BENCH',location:'CM1',custodian:'Titulaire',ownership:'OWNED',condition:'GOOD',status:'IN_USE',quantity:20,unitValue:15000,acquiredOn:null,maintenanceOn:null,notes:'',version:3};

describe('SchoolResourcesPage', () => {
  function setup(mode: 'assets' | 'stock') {
    const access = vi.fn(() => of([{id:1,name:'École',status:'ACTIVE'}]));
    TestBed.configureTestingModule({imports:[SchoolResourcesPage],providers:[provideRouter([]),provideHttpClient(),provideHttpClientTesting(),
      {provide:ActivatedRoute,useValue:{snapshot:{data:{resourceKind:mode}}}},
      {provide:AuthService,useValue:{user:()=>({id:9}),getOwnedSchools:access}},
      {provide:ConfirmationService,useValue:{confirm:()=>Promise.resolve(true)}},
    ]});
    const fixture = TestBed.createComponent(SchoolResourcesPage); fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const base = `${environment.apiUrl}/owner/resources/schools/1`;
    http.expectOne(`${base}/${mode}`).flush(mode === 'assets' ? {assets:[asset]} : {items:[stock]});
    fixture.detectChanges();
    return {fixture,page:fixture.componentInstance,http,base,access};
  }
  it('loads each module with its own delegated permission', () => {
    const {page,access,http}=setup('stock');
    expect(access).toHaveBeenCalledWith(9,'INVENTORY');
    expect(page.activeItemCount()).toBe(1); http.verify();
  });
  it('rejects insufficient stock locally and retains a retry key after a network failure', async () => {
    const {page,http,base}=setup('stock');
    page.openMovement(stock);
    Object.assign(page.movementForm,{kind:'OUT',quantity:6,reason:'Dotation',recipient:'CP1'});
    await page.saveMovement();
    expect(page.error()).toContain('Stock insuffisant'); http.expectNone(`${base}/stock/7/movements`);
    page.movementForm.quantity=2;
    await page.saveMovement();
    const first=http.expectOne(`${base}/stock/7/movements`); const key=first.request.body.requestId;
    first.flush({message:'Réseau indisponible'},{status:503,statusText:'Unavailable'});
    expect(page.movementForm.quantity).toBe(2); expect(page.busy()).toBe(false);
    await page.saveMovement();
    const retry=http.expectOne(`${base}/stock/7/movements`);
    expect(retry.request.body.requestId).toBe(key);
    retry.flush({...stock,quantity:3});
    http.expectOne(`${base}/stock`).flush({items:[{...stock,quantity:3}]}); http.verify();
  });
  it('filters low stock without mixing archived articles or measurement units', () => {
    const {page,http}=setup('stock');
    page.items.set([{...stock,quantity:1},{...stock,id:9,active:false,quantity:0},{...stock,id:10,name:'Détergent',quantity:15,unit:'litre'}]);
    page.filter.set('low'); expect(page.filteredItems()).toHaveLength(1);
    expect(page.lowCount()).toBe(1); expect(page.stockValue()).toBe(8000);
    page.search.set('DETERGENT'); page.filter.set('active'); expect(page.filteredItems().map(row=>row.id)).toEqual([10]); http.verify();
  });
  it('sends an asset version and requires a reason before changing a property record', async () => {
    const {page,http,base,access}=setup('assets');
    expect(access).toHaveBeenCalledWith(9,'ASSETS');
    expect(page.assetValue()).toBe(300000);
    page.edit(asset); page.assetForm.location='Réserve';
    await page.save(); expect(page.error()).toContain('motif'); http.expectNone(`${base}/assets/8`);
    page.assetForm.changeReason='Déplacement'; await page.save();
    const update=http.expectOne(`${base}/assets/8`);
    expect(update.request.method).toBe('PUT'); expect(update.request.body).toMatchObject({version:3,changeReason:'Déplacement',location:'Réserve'});
    expect(update.request.body).not.toHaveProperty('id');
    update.flush({...asset,location:'Réserve',version:4});
    http.expectOne(`${base}/assets`).flush({assets:[{...asset,location:'Réserve',version:4}]}); http.verify();
  });
  it('changes stock metadata without sending an editable balance', async () => {
    const {page,http,base}=setup('stock');
    page.edit(stock); page.stockForm.minimumQuantity=3; await page.save();
    const request=http.expectOne(`${base}/stock/7`);
    expect(request.request.body).toMatchObject({version:2,minimumQuantity:3});
    expect(request.request.body).not.toHaveProperty('quantity'); expect(request.request.body).not.toHaveProperty('id');
    request.flush({...stock,minimumQuantity:3,version:3});
    http.expectOne(`${base}/stock`).flush({items:[{...stock,minimumQuantity:3,version:3}]}); http.verify();
  });
  it('prints all filtered records rather than just the first table page', () => {
    const {page,fixture,http}=setup('assets');
    page.assets.set(Array.from({length:30},(_,index)=>({...asset,id:index+1,code:`MOB-${index}`,name:`Lot ${index}`})));
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(25);
    page.beforePrint();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(30);
    page.afterPrint(); fixture.detectChanges();
    expect(fixture.nativeElement.querySelectorAll('tbody tr')).toHaveLength(25); http.verify();
  });
});
