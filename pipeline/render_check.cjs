// Render the six site pages from a folder (repo layout) and print headline, errors, text hash.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const crypto=require('crypto');
const root=process.argv[2]||path.join(__dirname,'..');
const pages={'/':'daily/index.html','/es/':'daily/index.html','/ru/':'daily/index.html','/terminal/':'index.html','/es/terminal/':'index.html','/ru/terminal/':'index.html','/it/':'daily/index.html','/it/terminal/':'index.html'};
(async()=>{const b=await chromium.launch();
for (const [p,f] of Object.entries(pages)){const pg=await b.newPage({viewport:{width:400,height:900}});const errs=[];pg.on('pageerror',e=>errs.push(e.message));
await pg.route('**/*',r=>{const u=new URL(r.request().url()); if(u.hostname==='site.test'){
  if(pages[u.pathname]) return r.fulfill({contentType:'text/html; charset=utf-8',body:fs.readFileSync(path.join(root,pages[u.pathname]))});
  if(u.pathname.startsWith('/data/')){const fp=path.join(root,u.pathname); if(fs.existsSync(fp)) return r.fulfill({contentType:'application/javascript; charset=utf-8',body:fs.readFileSync(fp)});}
  return r.fulfill({status:404,body:''});} return r.continue();});
await pg.goto('http://site.test'+p);await pg.waitForTimeout(900);
const info=await pg.evaluate(()=>({lang:document.documentElement.lang,n:(typeof DATA!=='undefined'&&DATA.stories)?DATA.stories.length:-1,r:(typeof DATA!=='undefined'&&DATA.rumors)?DATA.rumors.length:-1,h:(document.querySelector('#c2 h1')||document.querySelector('.rh')||{}).innerText,t:document.body.innerText.replace(/\d{1,2}:\d{2}(:\d{2})?/g,'')}));
console.log(p.padEnd(14),'stories',info.n,'rumors',info.r,'errors',errs.length,errs.slice(0,1).join(''),'text',crypto.createHash('md5').update(info.t).digest('hex').slice(0,8),'|',(info.h||'').slice(0,60));
await pg.close();}
await b.close();})();
