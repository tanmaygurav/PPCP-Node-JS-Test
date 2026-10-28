import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { loadM04Env, m04Config } from '../src/m04/config.mjs';
import { services } from '../src/m04/auth.mjs';
if (!process.argv.includes('--write')) throw new Error('Synthetic live writes require --write.');
loadM04Env(); const config = m04Config();
const origin = process.argv.find(arg => arg.startsWith('--target='))?.slice(9) || config.origin;
const allowed = origin === 'https://ppcp-m04-event-poc.vercel.app' || origin === 'https://ppcp-m04-event-poc-git-codex-m-b84ac9-tanmays-projects-8434e035.vercel.app';
if (!allowed || config.projectId !== 'ppcp-m04-redesign') throw new Error('Approved M04 targets only.');
const pool = JSON.parse(readFileSync('.local/m04-accounts.json', 'utf8'));
if (pool.projectId !== config.projectId) throw new Error('Fixture project mismatch.');
const { db } = services(config), browser = await chromium.launch({ headless: true }), checks = [], errors = [];
const title = `M04 routing ${randomUUID().slice(0,8)}`;
const reference = await db.collection('submissions').where('displayId','==','PP039').limit(1).get();
const referenceBefore = JSON.stringify(reference.docs[0]?.data());
const contexts = [];
function checked(value) { checks.push(value); console.log('Passed: ' + value); }
async function session(account, path='/') {
  const context = await browser.newContext({ viewport: { width:1280, height:900 } }); contexts.push(context);
  const page = await context.newPage(); page.on('pageerror',()=>errors.push('Uncaught browser error'));
  if (origin.includes('-git-')) { const access=JSON.parse(readFileSync('.local/m04-preview-access.json','utf8')); await page.goto(access.url); }
  await page.goto(origin+path);
  await page.getByLabel('Institutional email').fill(account.email); await page.getByLabel('Password',{exact:true}).fill(account.password); await page.getByRole('button',{name:'Sign in',exact:true}).click();
  await page.getByRole('button',{name:'Sign out',exact:true}).waitFor(); await page.waitForFunction(()=>!document.querySelector('nav[inert]'));
  return {context,page};
}
try {
  const {page,context}=await session(pool.students[0],'/submissions/new');
  await page.getByLabel('Title',{exact:true}).fill(title); await page.getByLabel('Domain',{exact:true}).selectOption('Education'); await page.getByLabel('Description',{exact:true}).fill('Synthetic URL routing acceptance.');
  const theme=await page.evaluate(()=>document.documentElement.dataset.theme);
  await page.getByLabel('Add attachments').setInputFiles({name:'m04-routing-check.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jZQAAAABJRU5ErkJggg==','base64')});
  await page.getByRole('link',{name:'My submissions',exact:true}).click(); await page.getByRole('button',{name:'Keep editing',exact:true}).click(); assert.equal(await page.getByLabel('Title',{exact:true}).inputValue(),title); assert.equal(await page.getByLabel('Add attachments').evaluate(el=>el.files.length),1);
  let dropped=false;
  await page.route('**/api/submissions',async route=>{ if (!dropped && route.request().method()==='POST') {const response=await route.fetch(); if(response.ok()){dropped=true;await route.abort('failed');}else await route.fulfill({response});}else await route.continue(); });
  await page.getByRole('button',{name:'Save submission',exact:true}).click(); await page.getByRole('button',{name:'Retry same save',exact:true}).waitFor({timeout:65000});
  await page.getByRole('link',{name:'My submissions',exact:true}).click(); await page.getByRole('heading',{name:'Finish this operation before leaving',exact:true}).waitFor(); await page.getByRole('button',{name:'Stay on this page',exact:true}).click(); await page.getByRole('button',{name:'Retry same save',exact:true}).click(); await page.getByRole('heading',{name:title,exact:true}).waitFor();
  const detailUrl=page.url(), records=await db.collection('submissions').where('title','==',title).limit(2).get(); assert.equal(records.size,1); const record=records.docs[0].data(); assert.equal(record.ownerUid,pool.students[0].uid);
  checked('direct new URL survives sign-in; cancelled navigation retains selected file; unresolved save blocks navigation and reconciles once');
  const historyLength=await page.evaluate(()=>history.length); await page.getByRole('button',{name:'Refresh saved version',exact:true}).click(); await page.getByRole('button',{name:'Refresh saved version',exact:true}).waitFor({state:'visible'}); assert.equal(await page.evaluate(()=>history.length),historyLength);
  await page.reload(); await page.getByRole('heading',{name:title,exact:true}).waitFor(); const tab=await context.newPage(); await tab.goto(detailUrl); await tab.getByRole('heading',{name:title,exact:true}).waitFor(); await tab.close();
  const drive=page.getByRole('link',{name:/m04-routing-check.png/}); assert.equal(await drive.getAttribute('target'),'_blank'); const href=await drive.getAttribute('href'); assert.equal(new URL(href).hostname,'drive.google.com');
  const anon=await browser.newContext(), drivePage=await anon.newPage(); await drivePage.goto(href); await drivePage.waitForLoadState('domcontentloaded'); assert(!drivePage.url().includes('accounts.google.com')); await drivePage.getByText('m04-routing-check.png',{exact:false}).first().waitFor({timeout:30000}); await anon.close(); checked('deep-link refresh/new tab and anonymous direct Drive viewing');
  await page.getByRole('link',{name:'Edit submission',exact:true}).click(); await page.getByLabel('Title',{exact:true}).fill(title+' edited'); await page.getByRole('button',{name:'Save submission',exact:true}).click(); await page.getByRole('heading',{name:title+' edited',exact:true}).waitFor(); assert.equal(page.url(),detailUrl);
  await page.getByRole('button',{name:'Lock submission',exact:true}).click(); await page.getByRole('link',{name:'Edit submission',exact:true}).waitFor({state:'detached'}); await page.goto(detailUrl+'/edit'); await page.waitForURL(detailUrl); await page.getByText('This submission is locked.',{exact:true}).waitFor();
  const faculty=await session(pool.faculty,new URL(detailUrl).pathname+'/edit'); await faculty.page.waitForURL(detailUrl); await faculty.page.getByLabel('Add a remark',{exact:true}).fill('Synthetic routing review.'); await faculty.page.getByRole('button',{name:'Add remark',exact:true}).click(); await faculty.page.getByText('Synthetic routing review.',{exact:true}).waitFor(); await faculty.page.getByRole('button',{name:'Unlock submission',exact:true}).click(); await faculty.page.getByRole('button',{name:'Lock submission',exact:true}).waitFor();
  await page.getByRole('button',{name:'Refresh saved version',exact:true}).click(); await page.getByRole('link',{name:'Edit submission',exact:true}).waitFor(); assert.equal(await page.evaluate(()=>document.documentElement.dataset.theme),theme);
  checked('create/edit/lock/remark/unlock regression retains attachment and event theme; locked/staff edit redirects');
  await faculty.page.goto(origin+'/?domain=Education&sort=id&limit=10'); await faculty.page.getByText('Page 1',{exact:true}).waitFor(); await faculty.page.getByRole('button',{name:'Next',exact:true}).click(); await faculty.page.getByText('Page 2',{exact:true}).waitFor(); const listUrl=faculty.page.url(); await faculty.page.evaluate(()=>scrollTo(0,650)); await faculty.page.locator('.submission-card').first().click(); await faculty.page.getByRole('heading',{name:/Remarks ·/}).waitFor(); await faculty.page.goBack(); await faculty.page.getByText('Page 2',{exact:true}).waitFor(); await faculty.page.waitForFunction(()=>scrollY>200); assert.equal(faculty.page.url(),listUrl); await faculty.page.goForward(); await faculty.page.getByRole('heading',{name:/Remarks ·/}).waitFor();
  const copy=await faculty.context.newPage(); await copy.goto(listUrl); await copy.getByText('Page 1',{exact:true}).waitFor(); await copy.close(); checked('hosted indexed pagination preserves query/page/scroll through Back/Forward; copied query starts page one');
  await page.goto(origin+'/admin/event-theme'); await page.getByRole('heading',{name:'Access unavailable',exact:true}).waitFor(); const admin=await session(pool.admin,'/admin/users'); await admin.page.getByRole('heading',{name:'Manage institutional users',exact:true}).waitFor(); await admin.page.getByRole('link',{name:'Event theme',exact:true}).click(); await admin.page.getByRole('heading',{name:'One event. One shared look.',exact:true}).waitFor(); checked('administrator route access and student rejection');
  assert.equal(JSON.stringify((await reference.docs[0].ref.get()).data()),referenceBefore); checked('PP039 unchanged (read-only comparison)'); assert.deepEqual(errors,[]);
  mkdirSync('output/m04',{recursive:true}); await page.screenshot({path:'output/m04/routing-live.png',fullPage:true});
  const report={passed:true,origin,title,displayId:record.displayId,checks,browserErrors:errors.length}; const path=`output/m04/routing-live-${Date.now()}.json`; writeFileSync(path,JSON.stringify(report,null,2)); console.log(JSON.stringify({report:path,...report}));
} catch(error) {
  for(const [i,context] of contexts.entries()) for(const page of context.pages()) await page.screenshot({path:`output/m04/routing-live-failure-${i}.png`,fullPage:true}).catch(()=>{});
  console.error(error.message.replace(/_vercel_share=[^\s&]+/g,'_vercel_share=[redacted]')); process.exitCode=1;
} finally { await browser.close(); await db.terminate(); }


