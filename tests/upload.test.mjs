import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink } from 'node:fs/promises';
import { resolve, relative, basename } from 'node:path';
import { auditRepository, scanText } from '../scripts/check-upload.mjs';

const project=resolve('.');
function git(root,...args) { return execFileSync('git',['-c',`safe.directory=${root}`,...args],{cwd:root,encoding:'utf8',stdio:['ignore','pipe','ignore']}); }
async function fixture(run) {
  const root=await mkdtemp(resolve(project,'.test-build-upload-'));
  try {
    git(root,'init','--initial-branch=main');
    await writeFile(resolve(root,'.gitignore'),await readFile(resolve(project,'.gitignore')));
    await writeFile(resolve(root,'README.md'),'Public project documentation.');
    await writeFile(resolve(root,'.env.example'),'SEOUL_API_KEY=\nADMIN_TOKEN=\n');
    await writeFile(resolve(root,'.env'),'SEOUL_API_KEY=synthetic-never-read');
    await run(root);
  } finally {
    assert.ok(relative(project,root).startsWith('.test-build-upload-'));
    await rm(root,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  }
}

test('upload audit leaves ignored env contents unread and accepts empty example values',async()=>fixture(async root=>{
  const reads=[];
  const result=await auditRepository(root,{read:async path=>{reads.push(basename(path));return readFile(path);}});
  assert.equal(result.ok,true);assert.equal(result.historyCommits,0);
  assert.ok(!reads.includes('.env'));assert.ok(result.files.includes('.env.example'));assert.ok(!result.files.includes('.env'));
}));

test('tracked or historical env paths stop the audit before any contents are read',async()=>fixture(async root=>{
  git(root,'add','-f','.env');
  let reads=0;
  let result=await auditRepository(root,{read:async()=>{reads++;throw new Error();}});
  assert.equal(result.ok,false);assert.equal(reads,0);assert.equal(result.findings[0].rule,'private-path');
  git(root,'-c','user.name=Upload Test','-c','user.email=upload-test@example.invalid','commit','-m','Synthetic fixture');
  git(root,'rm','--cached','.env');
  result=await auditRepository(root,{read:async()=>{reads++;throw new Error();}});
  assert.equal(result.ok,false);assert.equal(reads,0);assert.equal(result.findings[0].source,'history');
}));

test('staged secret differs from safe working copy and is reported without secret text',async()=>fixture(async root=>{
  const token='ghp_'+'A'.repeat(36);
  await writeFile(resolve(root,'README.md'),`unsafe ${token}`);git(root,'add','README.md');
  await writeFile(resolve(root,'README.md'),'Safe working copy.');
  const result=await auditRepository(root);
  assert.equal(result.ok,false);assert.ok(result.findings.some(f=>f.source==='index'&&f.rule==='provider-token'));
  assert.ok(!JSON.stringify(result).includes(token));
}));

test('a directory junction blocks the audit before any working contents are read',async()=>fixture(async root=>{
  const publicDir=resolve(root,'public'),target=resolve(root,'.generated');
  await mkdir(publicDir);await mkdir(target);
  await writeFile(resolve(publicDir,'fixture.mjs'),'Public synthetic fixture.');
  git(root,'add','public/fixture.mjs');
  assert.equal(relative(root,publicDir),'public');
  await rm(publicDir,{recursive:true,force:true,maxRetries:5,retryDelay:100});
  await writeFile(resolve(target,'fixture.mjs'),'Private synthetic fixture.');
  await symlink(target,publicDir,'junction');
  let reads=0;
  const result=await auditRepository(root,{read:async path=>{reads++;return readFile(path);}});
  assert.equal(result.ok,false);assert.equal(reads,0);
  assert.ok(result.findings.some(f=>f.source==='working'&&f.rule==='nonregular-file'));
}));

test('index and historical symlink modes stop the audit before any contents are read',async()=>fixture(async root=>{
  await mkdir(resolve(root,'.generated'));
  await writeFile(resolve(root,'.generated/link-target'),'synthetic-target');
  const sha=git(root,'hash-object','-w','--','.generated/link-target').trim();
  git(root,'update-index','--add','--cacheinfo',`120000,${sha},public/link.mjs`);
  let reads=0;
  let result=await auditRepository(root,{read:async path=>{reads++;return readFile(path);}});
  assert.equal(result.ok,false);assert.equal(reads,0);
  assert.ok(result.findings.some(f=>f.source==='index'&&f.rule==='nonregular-file'));
  git(root,'-c','user.name=Upload Test','-c','user.email=upload-test@example.invalid','commit','-m','Synthetic symlink fixture');
  git(root,'rm','--cached','public/link.mjs');
  result=await auditRepository(root,{read:async path=>{reads++;return readFile(path);}});
  assert.equal(result.ok,false);assert.equal(reads,0);
  assert.ok(result.findings.some(f=>f.source==='history'&&f.rule==='nonregular-file'));
}));

test('literal credentials and source URLs are detected while synthetic fixtures and public hashes are allowed',()=>{
  const key=['aB3dE6gH9jK2mN5p','Q8sT1vW4xY7zC0fG'].join('');
  for(const input of [`SEOUL_API_KEY = '${key}'`,`http://openapi.seoul.go.kr:8088/${key}/json/tbLnOpendataRentV/1/5/`]) {
    const findings=scanText(input,'README.md','working');assert.ok(findings.length);assert.ok(!JSON.stringify(findings).includes(key));
  }
  assert.deepEqual(scanText("SEOUL_API_KEY: 'synthetic-test-key'\n"+JSON.stringify('a'.repeat(64)),'tests/fixture.mjs','working'),[]);
  assert.ok(scanText('SEOUL_API_KEY=nonempty-example','.env.example','working').length);
});

test('documented KV namespace identifiers are public metadata only in the binding configuration',()=>{
  const id=['0123456789abcdef','0123456789abcdef'].join('');
  const binding=JSON.stringify({kv_namespaces:[{binding:'RENT_SNAPSHOTS',id}]});
  assert.deepEqual(scanText(binding,'wrangler.jsonc','working'),[]);
  assert.ok(scanText(binding,'README.md','working').length);
  assert.ok(scanText(`SEOUL_API_KEY = '${id}'`,'wrangler.jsonc','working').length);
});

test('KV identifiers in comments or other fields never exempt a matching suspicious literal',()=>{
  const id=['0123456789abcdef','0123456789abcdef'].join('');
  const comment=`// "binding":"RENT_SNAPSHOTS","id":"${id}"\n`;
  assert.ok(scanText(comment+JSON.stringify({CUSTOM_TOKEN:id}),'wrangler.jsonc','working').some(f=>f.rule==='suspicious-literal'));
  const actualBinding={kv_namespaces:[{binding:'RENT_SNAPSHOTS',id}],CUSTOM_TOKEN:id};
  assert.ok(scanText(JSON.stringify(actualBinding),'wrangler.jsonc','working').some(f=>f.rule==='suspicious-literal'));
  const wrongPath={vars:{binding:'RENT_SNAPSHOTS',id}};
  assert.ok(scanText(JSON.stringify(wrongPath),'wrangler.jsonc','working').some(f=>f.rule==='suspicious-literal'));
});
