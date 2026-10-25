import { test, expect, Page } from '@playwright/test';
import { mockSchool } from './ui-fixtures';

async function select(page: Page, label: string, value: string) {
  await page.getByRole('combobox', {name:label,exact:true}).click();
  await page.getByRole('option', {name:value,exact:true}).click();
}

test('creates and updates a furniture lot and keeps its history printable separately from the form', async ({page}) => {
  await mockSchool(page);
  let assets: Record<string,unknown>[] = [];
  const events: Record<string,unknown>[] = [];
  await page.route('**/api/owner/resources/**', route => {
    const request=route.request(), url=new URL(request.url());
    if (url.pathname.endsWith('/history')) return route.fulfill({json:events});
    if (request.method()==='POST' || request.method()==='PUT') {
      const payload=request.postDataJSON();
      const asset={...payload,id:1,version:request.method()==='POST'?0:1};
      if(request.method()==='PUT') expect(payload).toMatchObject({version:0,changeReason:'Réorganisation CM2'});
      assets=[asset]; events.unshift({id:events.length+1,type:request.method()==='POST'?'CREATE':'UPDATE',reason:payload.changeReason||'Création de la fiche',snapshot:JSON.stringify(asset),actor:'Mariam Ouédraogo',createdAt:'2026-10-16T09:00:00'});
      return route.fulfill({json:asset});
    }
    return route.fulfill({json:{assets}});
  });
  await page.goto('/proprietaire/patrimoine');
  await page.getByRole('button',{name:'Ajouter un bien',exact:true}).click();
  await page.getByRole('textbox',{name:'Référence du bien',exact:true}).fill('MOB-001');
  await page.getByRole('textbox',{name:'Désignation',exact:true}).fill('Tables-bancs CM1');
  await page.getByRole('textbox',{name:'Emplacement',exact:true}).fill('Salle CM1');
  await page.getByRole('spinbutton',{name:'Quantité du lot',exact:true}).fill('20');
  await page.getByRole('spinbutton',{name:'Valeur d’acquisition unitaire (FCFA)',exact:true}).fill('15000');
  await page.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Fiche du bien enregistrée');
  await page.getByRole('button',{name:'Modifier : Tables-bancs CM1',exact:true}).click();
  await page.getByRole('textbox',{name:'Emplacement',exact:true}).fill('Salle CM2');
  await page.getByRole('textbox',{name:'Motif de modification',exact:true}).fill('Réorganisation CM2');
  await page.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();
  await expect(page.getByRole('cell',{name:/Salle CM2/})).toBeVisible();
  await page.getByRole('button',{name:'Historique : Tables-bancs CM1',exact:true}).click();
  await expect(page.getByText('Modification — Réorganisation CM2', {exact:true})).toBeVisible();
  await page.emulateMedia({media:'print'});
  await expect(page.getByRole('region',{name:'Historique de la fiche',exact:true})).toBeHidden();
  await expect(page.getByRole('cell',{name:/Salle CM2/})).toBeVisible();
  await page.emulateMedia({media:'screen'});
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('receives supplies, rejects excessive issues and records a physical count', async ({page}) => {
  await mockSchool(page);
  let item: Record<string,unknown> | null=null;
  const movements: Record<string,unknown>[]=[];
  await page.route('**/api/owner/resources/**', route=>{
    const request=route.request(),url=new URL(request.url());
    if (url.pathname.endsWith('/movements')) {
      if(request.method()==='GET') return route.fulfill({json:movements});
      const payload=request.postDataJSON(),before=Number(item?.['quantity']??0);
      const after=payload.kind==='COUNT'?payload.quantity:before+(payload.kind==='OUT'?-payload.quantity:payload.quantity);
      expect(after).toBeGreaterThanOrEqual(0);
      item={...item,quantity:after,version:Number(item?.['version']??0)+1};
      movements.unshift({...payload,id:movements.length+1,requestedQuantity:payload.quantity,quantityChange:after-before,balanceAfter:after,actor:'Mariam',createdAt:'2026-10-16T09:00:00'});
      return route.fulfill({json:item});
    }
    if(request.method()==='POST') {item={...request.postDataJSON(),id:2,quantity:0,version:0};return route.fulfill({json:item});}
    return route.fulfill({json:{items:item?[item]:[]}});
  });
  await page.goto('/proprietaire/stocks');
  await page.getByRole('button',{name:'Ajouter un article',exact:true}).click();
  await page.getByRole('textbox',{name:'Référence de l’article',exact:true}).fill('CRAIE-001');
  await page.getByRole('textbox',{name:'Désignation',exact:true}).fill('Craie blanche');
  await page.getByRole('textbox',{name:'Emplacement de stockage',exact:true}).fill('Magasin');
  await page.getByRole('spinbutton',{name:'Seuil minimum',exact:true}).fill('3');
  await page.getByRole('button',{name:'Enregistrer la fiche',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Article enregistré');
  await page.getByRole('button',{name:'Mouvement : Craie blanche',exact:true}).click();
  await page.getByRole('spinbutton',{name:'Quantité du mouvement',exact:true}).fill('10');
  await page.getByRole('textbox',{name:'Motif du mouvement',exact:true}).fill('Stock initial');
  await page.getByRole('button',{name:'Enregistrer le mouvement',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Mouvement enregistré');
  await page.getByRole('button',{name:'Mouvement : Craie blanche',exact:true}).click();
  await select(page,'Type de mouvement','Sortie / consommation');
  await page.getByRole('spinbutton',{name:'Quantité du mouvement',exact:true}).fill('15');
  await page.getByRole('textbox',{name:'Motif du mouvement',exact:true}).fill('Dotation');
  await page.getByRole('textbox',{name:'Destinataire / service',exact:true}).fill('CP1');
  await page.getByRole('button',{name:'Enregistrer le mouvement',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('Stock insuffisant'); expect(movements).toHaveLength(1);
  await page.getByRole('spinbutton',{name:'Quantité du mouvement',exact:true}).fill('8');
  await page.getByRole('button',{name:'Enregistrer le mouvement',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Mouvement enregistré');
  await expect(page.getByRole('cell',{name:'À réapprovisionner',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'Mouvement : Craie blanche',exact:true}).click();
  await select(page,'Type de mouvement','Inventaire physique');
  await page.getByRole('spinbutton',{name:'Quantité du mouvement',exact:true}).fill('0');
  await page.getByRole('textbox',{name:'Motif du mouvement',exact:true}).fill('Comptage magasin');
  await page.getByRole('button',{name:'Enregistrer le mouvement',exact:true}).click();
  await page.getByRole('button',{name:'Valider le comptage',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('Mouvement enregistré'); expect(movements).toHaveLength(3);
  await page.getByRole('button',{name:'Historique : Craie blanche',exact:true}).click();
  await expect(page.getByRole('cell',{name:'Comptage magasin',exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
});

test('delegated stock access does not grant access to property or accounting', async ({page})=>{
  await mockSchool(page,'proprietaire',[],['INVENTORY']);
  await page.route('**/api/owner/resources/**',route=>route.fulfill({json:{items:[]}}));
  await page.goto('/proprietaire');
  await expect(page).toHaveURL(/\/proprietaire\/stocks$/);
  await expect(page.locator('#modules-menu a[href="/proprietaire/stocks"]')).toBeVisible();
  await expect(page.locator('#modules-menu a[href="/proprietaire/patrimoine"]')).toHaveCount(0);
  await page.goto('/proprietaire/patrimoine');
  await expect(page).toHaveURL(/\/proprietaire\/stocks$/);
});
