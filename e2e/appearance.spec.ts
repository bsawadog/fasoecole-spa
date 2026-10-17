import {test,expect} from '@playwright/test';
import {mockSchool} from './ui-fixtures';

function contrast(foreground:string,background:string):number {
  const luminance=(color:string)=>{
    const rgb=color.match(/[\d.]+/g)!.slice(0,3).map(value=>{const n=+value/255;return n<=.04045?n/12.92:((n+.055)/1.055)**2.4;});
    return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  };
  const a=luminance(foreground), b=luminance(background);
  return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
}

test('seven profile themes apply immediately, persist and keep controls readable',async({page},testInfo)=>{
  await mockSchool(page,'proprietaire',['PARENT']); await page.goto('/profil');
  const choices=page.getByRole('group',{name:'Thème de l’application'});
  await expect(choices.getByRole('button')).toHaveCount(7);
  const themes=[['Violet nuit','night-violet'],['Vert nuit','night-green'],['Noir bleuté','blue-black'],['Bleu classique','classic-blue'],['Gris clair','light-gray'],['Noir brillant','glossy-black'],['Blanc','white']];
  for(const [label,id] of themes){
    await choices.getByRole('button',{name:label,exact:true}).click();
    await expect(choices.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
    await expect(page.locator('body')).toHaveAttribute('data-app-theme',id);
    await page.locator('[aria-controls="account-profile"]').click();
    const panel=page.locator('#account-profile');
    await expect(panel).toBeVisible();
    const triggerColors=await page.locator('[aria-controls="account-profile"]').evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));
    expect(contrast(triggerColors.color,triggerColors.background),`${label}: expanded account button contrast`).toBeGreaterThanOrEqual(4.5);
    const accountColors=await panel.evaluate(node=>({color:getComputedStyle(node.querySelector('a')!).color,background:getComputedStyle(node).backgroundColor}));
    expect(contrast(accountColors.color,accountColors.background),`${label}: profile link contrast`).toBeGreaterThanOrEqual(4.5);
    const role=panel.locator('.account-spaces button').last();
    const roleColors=await role.evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node.closest('.account-panel')!).backgroundColor}));
    expect(contrast(roleColors.color,roleColors.background),`${label}: role switch contrast`).toBeGreaterThanOrEqual(4.5);
    await panel.locator('a').first().hover();
    const hovered=await panel.locator('a').first().evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));
    expect(contrast(hovered.color,hovered.background),`${label}: profile hover contrast`).toBeGreaterThanOrEqual(4.5);
    if(id === 'classic-blue' || id === 'night-violet' || id === 'white') await page.screenshot({path:testInfo.outputPath(`account-${id}.png`)});
    await page.keyboard.press('Escape');
    expect(await page.evaluate(()=>localStorage.getItem('fasoecole_theme_7'))).toBe(id);
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)).toBe(true);
    await page.goto('/proprietaire/classes');
    await expect(page.locator('.class-roster__student').first()).toBeVisible();
    const headerColors=await page.locator('.shell__school-context label').first().evaluate(node=>({
      color:getComputedStyle(node).color,background:getComputedStyle(node.closest('.shell__topbar')!).backgroundColor,
    }));
    expect(contrast(headerColors.color,headerColors.background),`${label}: header label contrast`).toBeGreaterThanOrEqual(4.5);
    const colors=await page.locator('.class-roster__card').first().evaluate(node=>{
      const style=getComputedStyle(node);return {background:style.backgroundColor,color:style.color};
    });
    expect(contrast(colors.color,colors.background),`${label}: panel text contrast`).toBeGreaterThanOrEqual(4.5);
    const remove=page.locator('.class-roster .ui-row-action--danger').first();
    await remove.hover();
    const actionColors=await remove.evaluate(node=>({color:getComputedStyle(node).color,background:getComputedStyle(node).backgroundColor}));
    expect(contrast(actionColors.color,actionColors.background),`${label}: destructive action hover contrast`).toBeGreaterThanOrEqual(4.5);
    await page.locator('.class-roster__class-picker [role="combobox"]').click();
    await expect(page.getByRole('listbox')).toBeVisible();
    const optionColors=await page.getByRole('option').first().evaluate(node=>{
      const option=getComputedStyle(node),panel=getComputedStyle(node.closest('.p-select-overlay')!);
      const background=option.backgroundColor === 'rgba(0, 0, 0, 0)' ? panel.backgroundColor : option.backgroundColor;
      return {color:option.color,background};
    });
    expect(contrast(optionColors.color,optionColors.background),`${label}: select option contrast`).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press('Escape');
    await page.screenshot({path:testInfo.outputPath(`${id}.png`),fullPage:true});
    await page.reload(); await expect(page.locator('body')).toHaveAttribute('data-app-theme',id);
    await page.goto('/profil');
    await expect(choices.getByRole('button',{name:label,exact:true})).toHaveAttribute('aria-pressed','true');
  }
  await page.emulateMedia({media:'print'});
  await expect(choices).toBeHidden();
});
