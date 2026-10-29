import { endpoint } from './m04-test-support.mjs';
export async function browserProbe(browser,context,actor,samples){
  const session=await browser.newContext({viewport:{width:1280,height:900}}),errors=[];try{
    const cookie=actor.sessionCookie();if(!cookie)throw new Error('Browser observer has no session.');const [name,...parts]=cookie.split('=');await session.addCookies([...(context.protectionCookies||[]),{name,value:parts.join('='),url:context.origin,httpOnly:true,secure:context.origin.startsWith('https:'),sameSite:'Strict'}]);
    const page=await session.newPage();page.on('pageerror',()=>errors.push('Uncaught browser error'));
    await meterPage(page,context,samples);
    const start=performance.now();await page.goto(context.origin);await page.locator('.cards').waitFor();samples.push({endpoint:'browser/list-usable',method:'BROWSER',ms:performance.now()-start,status:200,timestamp:new Date().toISOString()});
    const first=page.locator('.submission-card').first();if(await first.count()){const begin=performance.now();await first.click();await page.getByRole('heading',{name:/Remarks ·/}).waitFor();samples.push({endpoint:'browser/detail-usable',method:'BROWSER',ms:performance.now()-begin,status:200,timestamp:new Date().toISOString()});}
    if(errors.length)throw new Error('Browser observer reported script errors.');
  }finally{await session.close();}
}

export async function meterPage(page,context,samples){
  await page.route('**/api/**',async route=>{const request=route.request();if(new URL(request.url()).origin!==context.origin)return route.continue();const path=new URL(request.url()).pathname.slice(5),label=endpoint(path),reservation=context.beforeRequest?.(label,request.method()==='POST',request.method()==='POST'?request.postDataJSON():undefined);const start=performance.now();context.inFlight=(context.inFlight||0)+1;context.peakInFlight=Math.max(context.peakInFlight||0,context.inFlight);try{const response=await route.fetch(),body=await response.body(),headers=response.headers();let observed={};try{observed=JSON.parse(headers['x-m04-observed-ops']||'{}');}catch{}const row={endpoint:label,method:request.method(),reservation,ms:performance.now()-start,status:response.status(),timestamp:new Date().toISOString(),bytes:body.length,observed,instance:headers['x-m04-instance'],firstObserved:headers['x-m04-first-observed']==='true',source:headers['x-m04-source'],requestId:headers['x-request-id'],serverTiming:headers['server-timing'],cpuUs:Number(headers['x-m04-cpu-us']||0),browserObserver:true};samples.push(row);context.afterRequest?.(row);await route.fulfill({response});}catch{await route.abort().catch(()=>{});}finally{context.inFlight--;}});
}
