#!/usr/bin/env node
// Static gates for the application actually served by GitHub Pages. No database/network access.
import {readFileSync,mkdirSync,copyFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {Script} from 'node:vm';
import {createHash} from 'node:crypto';
const root=resolve(new URL('../..',import.meta.url).pathname),html=readFileSync(resolve(root,'index.html'),'utf8');
for(const [i,match]of [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].entries())new Script(match[1],{filename:'index.html script '+(i+1)});
if(/DCBC_TEST_RUNNER|runLeagueTests|id="test-panel"/.test(html))throw Error('Hosted test runner must not ship');
if(/<script[^>]+src="https?:/.test(html))throw Error('Executable dependencies must be pinned locally');
if(!html.includes("const SB='https://wgolevihkvmosajumzvl.supabase.co'"))throw Error('This build must target TEST');
if(!html.includes('migration L24'))throw Error('Database contract gate is missing');
const vendor='vendor/jspdf-4.2.1.umd.min.js',integrity='sha384-'+createHash('sha384').update(readFileSync(resolve(root,vendor))).digest('base64');
if(!html.includes(integrity))throw Error('PDF library integrity does not match');
const manifest=JSON.parse(readFileSync(resolve(root,'manifest.json')));for(const icon of manifest.icons)readFileSync(resolve(root,icon.src));
new Script(readFileSync(resolve(root,'sw.js'),'utf8'),{filename:'sw.js'});
const files=['index.html','manifest.json','sw.js','icon-192.png','icon-512.png',vendor,'vendor/jspdf-LICENSE.txt'];
const digest=createHash('sha256');for(const file of files)digest.update(file).update(readFileSync(resolve(root,file)));
const contentSha256=digest.digest('hex'),revision=process.env.GITHUB_SHA||null,buildId=(revision||contentSha256).slice(0,12);
const out=process.argv[2];if(out){for(const file of files){const dst=resolve(out,file);mkdirSync(resolve(dst,'..'),{recursive:true});copyFileSync(resolve(root,file),dst);}
writeFileSync(resolve(out,'index.html'),html.replace('TEST SITE · audit fixes 2026-09-13','TEST SITE · build '+buildId));
writeFileSync(resolve(out,'build.json'),JSON.stringify({environment:'test',buildId,revision,contentSha256,requiredSchema:'L24'},null,2)+'\n');}
console.log(`Root TEST build checked: ${Buffer.byteLength(html)} bytes HTML, pinned PDF integrity, ${files.length} delivery files. ${out?'Output: '+resolve(out):'No output written.'}`);
