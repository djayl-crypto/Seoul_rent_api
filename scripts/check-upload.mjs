import { execFileSync } from 'node:child_process';
import { readFile, lstat, realpath } from 'node:fs/promises';
import { resolve, dirname, relative, isAbsolute, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const roots=new Set(['.gitignore','.env.example','.node-version','README.md','package.json','package-lock.json','wrangler.jsonc']);
const privateFolders=new Set(['.generated','.wrangler','.npm-cache','.check-output','node_modules','dist','data']);
const allowedFolders=new Set(['public','functions','scripts','src','tests','docs']);
const split=value=>value.split('\0').filter(Boolean);
const regularModes=new Set(['100644','100755']);
const within=(root,path)=>{const part=relative(root,path);return part!==''&&part!=='..'&&!part.startsWith(`..${sep}`)&&!isAbsolute(part);};
const privatePath=path=>/^docs\/collection-report-.*\.json$/.test(path)||(path!=='.env.example' && path.split('/').some(part=>/^\.env(?:\.|$)|^\.dev\.vars(?:\.|$)|^\.git-credentials$|^id_(?:rsa|ed25519)$|\.(?:pem|key|p12|pfx)$/i.test(part)));
const safeValue=value=>/^(?:synthetic(?:[-_a-z0-9]*)|placeholder|your[-_a-z0-9]*|<[^>]+>|\$\{[^}]+\})$/i.test(value);
function entropy(value) {const counts=new Map();for(const c of value)counts.set(c,(counts.get(c)??0)+1);return [...counts.values()].reduce((sum,n)=>sum-(n/value.length)*Math.log2(n/value.length),0);}

// Diagnostics contain only a path, line number, rule and snapshot kind. Never a match or snippet.
export function scanText(text,path,source) {
  const findings=[];
  const add=(rule,index)=>findings.push({path,source,rule,line:text.slice(0,index).split('\n').length});
  if(path==='.env.example') {
    let index=0;
    for(const line of text.split('\n')) {
      const trimmed=line.trim();
      if(trimmed&&!trimmed.startsWith('#')&&!/^[A-Z][A-Z0-9_]*=\s*(?:#.*)?$/.test(trimmed))add('nonempty-env-example',index);
      index+=line.length+1;
    }
  }
  const patterns=[
    ['provider-token',/\b(?:gh[pousr]_[A-Za-z0-9_]{20,}|github_pat_[A-Za-z0-9_]{40,}|(?:AKIA|ASIA)[A-Z0-9]{16})\b/g],
    ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
    ['signed-token',/\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
    ['credential-assignment',/\b(?:[A-Z_]*API_KEY|ADMIN_TOKEN|SYNC_ADMIN_TOKEN|CLOUDFLARE_API_TOKEN|GITHUB_TOKEN|GH_TOKEN|ACCESS_TOKEN|SECRET_KEY|PASSWORD)\b["']?\s*[:=]\s*["']([^"'\r\n]{8,})["']/gi],
    ['seoul-key-url',/https?:\/\/openapi\.seoul\.go\.kr:8088\/([A-Za-z0-9]{15,})\//g],
    ['bearer-token',/\bBearer\s+([A-Za-z0-9._~+/-]{24,})/g],
  ];
  for(const [rule,pattern] of patterns)for(const match of text.matchAll(pattern)) {
    const value=match[1]??match[0];
    if(!safeValue(value))add(rule,match.index);
  }
  for(const match of text.matchAll(/["']([A-Za-z0-9]{28,64})["']/g)) {
    const value=match[1];
    if(!/^[a-f0-9]{64}$/i.test(value)&&!safeValue(value)&&entropy(value)>3.6)add('suspicious-literal',match.index);
  }
  return findings;
}

export async function auditRepository(root=ROOT,{read=readFile}={}) {
  root=resolve(root);
  const git=(args,input,binary=false)=>execFileSync('git',['-c',`safe.directory=${root}`,...args],{cwd:root,encoding:binary?undefined:'utf8',input,stdio:[input===undefined?'ignore':'pipe','pipe','ignore'],maxBuffer:32*1024*1024});
  const result={ok:false,envExists:false,historyCommits:0,stagedFiles:0,files:[],findings:[],scope:'Known patterns and suspicious literals; no comparison with .env values.'};
  const stop=()=>result;
  try {
    if((await lstat(root)).isSymbolicLink()||resolve(git(['rev-parse','--show-toplevel']).trim())!==root)throw new Error();
    try {await lstat(resolve(root,'.env'));result.envExists=true;}catch(error){if(error.code!=='ENOENT')throw error;}
    const canonicalRoot=await realpath(root);
    const indexEntries=split(git(['ls-files','--stage','-z'])).map(entry=>{
      const tab=entry.indexOf('\t'),[mode,sha,stage]=entry.slice(0,tab).split(' ');
      return {path:entry.slice(tab+1),mode,sha,stage};
    });
    const index=indexEntries.map(entry=>entry.path);
    result.stagedFiles=index.length;
    const files=[...new Set([...index,...split(git(['ls-files','--others','--exclude-standard','-z']))])].sort();
    result.files=files;
    const commits=git(['rev-list','--all']).trim().split('\n').filter(Boolean);
    result.historyCommits=commits.length;
    if(commits.length>5000){result.findings.push({rule:'history-too-large',source:'history'});return stop();}
    const history=new Map();
    for(const commit of commits)for(const entry of split(git(['ls-tree','-rz',commit]))) {
      const tab=entry.indexOf('\t'),path=entry.slice(tab+1),[mode,type,sha]=entry.slice(0,tab).split(' ');
      if(type!=='tree')history.set(`${sha}:${path}`,{mode,sha,path});
    }
    // Check every protected filename in worktree, index and history before reading ANY file contents.
    for(const [source,paths] of [['index',index],['working',files],['history',[...history.values()].map(entry=>entry.path)]]) {
      for(const path of paths)if(privatePath(path)||path.split('/').some(part=>privateFolders.has(part)))result.findings.push({path,source,rule:'private-path'});
    }
    if(result.findings.length)return stop();
    for(const path of files)if(!(roots.has(path)||allowedFolders.has(path.split('/')[0]))||/[\\:\x00-\x1f]/.test(path)||path.split('/').some(part=>part==='..'||part==='.'))result.findings.push({path,source:'working',rule:'unexpected-upload-path'});
    for(const [source,entries] of [['index',indexEntries],['history',history.values()]]) {
      for(const {path,mode,stage} of entries)if(!regularModes.has(mode)||(source==='index'&&stage!=='0'))result.findings.push({path,source,rule:'nonregular-file'});
    }
    for(const path of ['.env','.env.local','.dev.vars','.wrangler/private','.generated/private','node_modules/private','dist/private','data/private.csv']) {
      try {git(['check-ignore','--quiet','--no-index','--',path]);}catch {result.findings.push({path,source:'ignore',rule:'not-ignored'});}
    }
    if(result.findings.length)return stop();
    // Validate every ancestor and resolved target for all paths before reading any body.
    const working=[];
    for(const path of files) {
      const parts=path.split('/');
      let missing=false,unsafe=false;
      for(let i=0;i<parts.length;i++) {
        const target=resolve(root,...parts.slice(0,i+1));
        if(!within(root,target)){unsafe=true;break;}
        let entry;
        try {entry=await lstat(target);}catch(error){if(error.code==='ENOENT'){missing=true;break;}throw error;}
        if(entry.isSymbolicLink()||(i===parts.length-1?!entry.isFile():!entry.isDirectory())){unsafe=true;break;}
      }
      if(!missing&&!unsafe&&!within(canonicalRoot,await realpath(resolve(root,path))))unsafe=true;
      if(unsafe)result.findings.push({path,source:'working',rule:'nonregular-file'});
      else if(!missing)working.push(path);
    }
    if(result.findings.length)return stop();
    const scan=(body,path,source)=>{
      if(path==='public/PretendardVariable.woff2') {if(body.subarray(0,4).toString()!=='wOF2')result.findings.push({path,source,rule:'invalid-font'});return;}
      if(body.includes(0)){result.findings.push({path,source,rule:'unexpected-binary'});return;}
      result.findings.push(...scanText(body.toString('utf8'),path,source));
    };
    for(const path of working)scan(await read(resolve(root,path)),path,'working');
    for(const {path,sha} of indexEntries)scan(git(['cat-file','blob',sha],undefined,true),path,'index');
    for(const {path,sha} of history.values())scan(git(['cat-file','blob',sha],undefined,true),path,'history');
    result.ok=result.findings.length===0;
  } catch {result.findings.push({source:'audit',rule:'audit-unavailable'});}
  return result;
}

if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const result=await auditRepository();
  console.log(JSON.stringify(result,null,2));
  if(!result.ok)process.exitCode=1;
}
