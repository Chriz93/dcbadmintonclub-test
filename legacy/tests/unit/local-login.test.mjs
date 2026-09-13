import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { fnSource, html } from './load-app.mjs';

test('local login · the scheduled domain check preserves file and localhost code entry',()=>{
  // Exercise the actual scheduled callback, not just the startup allowlist.
  const schedule=html.match(/^setInterval\(verifyLicensedDomain,30000\);$/m)?.[0];
  assert.ok(schedule,'the recurring check must share the startup policy');
  for(const url of ['file:///Users/test/club/index.html','http://localhost:8791/','http://127.0.0.1:8791/','https://chriz93.github.io/dcbadmintonclub-test/']){
    const location=new URL(url),body={innerHTML:'Email code: 123'},callbacks=[];
    const env={window:{location},document:{body},setInterval:(fn,ms)=>callbacks.push({fn,ms})};
    vm.runInNewContext(fnSource('verifyLicensedDomain')+'\nverifyLicensedDomain();\n'+schedule,env);
    assert.equal(callbacks.length,1);assert.equal(callbacks[0].ms,30000);
    for(let seconds=30;seconds<=120;seconds+=30)callbacks[0].fn();
    assert.equal(body.innerHTML,'Email code: 123',url);
  }
});

test('local login · an unlicensed host still shows a readable refusal',()=>{
  for(const url of ['https://unlicensed.example/','https://chriz93.github.io.unlicensed.example/']){
    const body={innerHTML:'Sign in'},env={window:{location:new URL(url)},document:{body}};
    vm.runInNewContext(fnSource('verifyLicensedDomain'),env);
    assert.throws(()=>env.verifyLicensedDomain(),/Domain not authorized/);
    assert.match(body.innerHTML,/<h1>Unauthorized<\/h1>/);
  }
});

test('local login · a direct file does not attempt service worker registration',()=>{
  const env={location:{protocol:'file:'},navigator:{serviceWorker:{register:()=>assert.fail('file URLs cannot register a service worker')}}};
  vm.runInNewContext(fnSource('registerServiceWorker'),env);
  env.registerServiceWorker();
});
