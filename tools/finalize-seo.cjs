// Keep the static discovery files on the same origin as the selected build.
const fs=require('node:fs');
const path=require('node:path');
const origins={dev:'https://app.dev.fasoecole.com',prod:'https://app.fasoecole.com'};
const origin=origins[process.argv[2]];
if(!origin)throw new Error('Expected dev or prod');
const root=path.resolve(__dirname,'../dist/fasoecole-front/browser');
for(const name of ['sitemap.xml','robots.txt']){
 const source=fs.readFileSync(path.resolve(__dirname,'../public',name),'utf8');
 fs.writeFileSync(path.join(root,name),source.replaceAll('https://app.dev.fasoecole.com',origin));
}
const xml=fs.readFileSync(path.join(root,'sitemap.xml'),'utf8');
for(const match of xml.matchAll(/<loc>(.*?)<\/loc>/g)){
 const url=new URL(match[1]);
 const file=path.join(root,url.pathname,'index.html');
 const html=fs.readFileSync(file,'utf8');
 if(!html.includes('lang="fr"')||!html.includes(`href="${url.href}"`)||!/<h1[\s>]/.test(html)){
  throw new Error(`Missing French content or canonical URL in ${file}`);
 }
}
console.log('SEO: sitemap, robots.txt and prerendered public pages verified for '+origin);
