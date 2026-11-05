import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--enable-unsafe-swiftshader','--use-gl=angle','--use-angle=swiftshader']});
const page=await browser.newPage({viewport:{width:640,height:480}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
const snap=()=>page.evaluate(()=>window.__nexus.snapshot());const records=[];
try{
 await page.goto(process.env.NEXUS_URL||'http://127.0.0.1:5173/?test=1');await page.waitForFunction(()=>window.__nexus);await page.selectOption('#quality','low');await page.click('#start');
 for(const keys of [['KeyW'],['KeyA'],['KeyS'],['KeyD'],['KeyW','KeyA']]){
  await page.evaluate(()=>window.__nexus.place(0,5));const a=await snap();
  for(const key of keys)await page.keyboard.down(key);await page.waitForTimeout(2000);for(const key of keys)await page.keyboard.up(key);
  const b=await snap(), dx=b.player.x-a.player.x,dz=b.player.z-a.player.z;
  const screenX=dx*.8192319-dz*.5734623,screenY=dx*.5734623+dz*.8192319;
  assert.ok(Math.hypot(dx,dz)>3,JSON.stringify({keys,a,b}));assert.equal(b.mode,'playing');
  if(keys.length===1){if(keys[0]==='KeyW')assert.ok(screenY< -3);if(keys[0]==='KeyS')assert.ok(screenY>3);if(keys[0]==='KeyA')assert.ok(screenX< -3);if(keys[0]==='KeyD')assert.ok(screenX>3);}
  records.push({keys,distance:Math.hypot(dx,dz),screenX,screenY,simulationSeconds:b.time-a.time});console.log('PASS movement',keys,records.at(-1));
 }
 assert.ok(records.at(-1).distance<records[3].distance*1.22,'diagonal speed must not exceed single-axis speed');
 await page.evaluate(()=>window.__nexus.place(13,0));await page.keyboard.down('KeyD');await page.waitForTimeout(2000);await page.keyboard.up('KeyD');let s=await snap();assert.ok(Math.hypot(s.player.x,s.player.z)<=13.8201);
 // Radial column at (0,-12.8): drive W/S along screen-aligned world axes via diagonal keys.
 await page.evaluate(()=>window.__nexus.place(0,-10.5));await page.keyboard.down('KeyW');await page.waitForTimeout(1000);await page.keyboard.up('KeyW');s=await snap();assert.ok(Math.hypot(s.player.x,s.player.z+12.8)>=1.39);
 await page.keyboard.press('Escape');await page.click('#resume');assert.equal((await snap()).focus,'CANVAS');
 await page.evaluate(()=>{window.dispatchEvent(new KeyboardEvent('keydown',{key:'d',code:'',bubbles:true}));});const start=await snap();await page.waitForTimeout(500);await page.evaluate(()=>window.dispatchEvent(new KeyboardEvent('keyup',{key:'d',code:'',bubbles:true})));s=await snap();assert.ok(Math.hypot(s.player.x-start.player.x,s.player.z-start.player.z)>.3,'event.key fallback');
 assert.deepEqual(errors,[]);await writeFile('docs/1.1/movement-results.json',JSON.stringify({records,collision:true,focus:true,keyFallback:true,errors},null,2));
}finally{await browser.close();}
