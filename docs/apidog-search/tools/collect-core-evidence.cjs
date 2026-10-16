const fs=require('fs'),path=require('path'),crypto=require('crypto');
const root='E:/Projects/Personal/Reqora/docs/apidog-search', evidence=root+'/evidence';
const inv=JSON.parse(fs.readFileSync(evidence+'/raw/asar-inventory.json','utf8'));
const fd=fs.openSync(inv.source,'r'),prefix=Buffer.alloc(16);fs.readSync(fd,prefix,0,16,0);const hb=Buffer.alloc(prefix.readUInt32LE(12));fs.readSync(fd,hb,0,hb.length,16);const header=JSON.parse(hb.toString('utf8'));fs.closeSync(fd);
function memberHeader(member){return member.split('/').reduce((p,k)=>p.files[k],header)}
function source(member){let b=fs.readFileSync(evidence+'/extracted/'+member);const f=inv.files.find(f=>f.path===member),h=memberHeader(member);return{member,bytes:b,text:b.toString('utf8'),artifact_offset:inv.data_offset+Number(f.offset),size:f.size,sha256:crypto.createHash('sha256').update(b).digest('hex'),declared_integrity:h.integrity||null};}
let cache=new Map;function s(m){if(!cache.has(m))cache.set(m,source(m));return cache.get(m)}
const main='dist/renderer/90387.c69ddba9.async.js',state='dist/renderer/20401.291e096a.async.js';
const specs=[
['A01',main,'464114:function','function d(){',0,'Metadata filter predicates'],
['A02',main,'let u=function(){let e=(0,s.A)(e=>e.search)','}},273666:function',2,'Trimmed case-insensitive substring and endpoint path fallback; all filters'],
['A03',main,'829323:function','},688592:function',1,'Folder ancestry names with cycle guard'],
['A04',main,'let A=function(){let e=(0,m.Hi)()',';var x=n(454155)',0,'HTTP endpoint searchable field assembly'],
['A05',main,'apiDetailFolder:function','},socketService:function',1,'HTTP folders prune; endpoint ID allow-list; cases remain children'],
['A06',main,'let b=function(){let e=(0,S.fnZ)("httpRequest"','},P=function',1,'Ad hoc request fields include method'],
['A07',state,'699516:function','},345199:function',1,'Search state and filtering flag'],
['A08',state,'505671:function','},699516:function',1,'Expansion recording, expand while filtering, restoration'],
['A09',main,'let k=(e,t,n)=>','var I=n(169508)',0,'Tree filtering assembly; bounded full module excerpt'],
];
let records=[];
for(const [id,member,start,end,extra,label] of specs){const f=s(member);const at=f.text.indexOf(start);if(at<0)throw Error('start missing '+id);const stop=f.text.indexOf(end,at+start.length);if(stop<0)throw Error('end missing '+id);const snippet=f.text.slice(at,stop+extra);const before=f.text.slice(0,at),line=before.split('\n').length,column=at-(before.lastIndexOf('\n')+1)+1;const utf8=Buffer.byteLength(before);records.push({id,type:'static-code',label,member,member_sha256:f.sha256,member_utf16_start:at,member_utf16_end_exclusive:stop+extra,line,column,member_utf8_byte_start:utf8,artifact_byte_start:f.artifact_offset+utf8,snippet});}
fs.writeFileSync(evidence+'/core-search-excerpts.json',JSON.stringify({provenance:'Ordinary Node filesystem/ASAR parser extraction, not REA Evidence. No target code executed. Offsets zero based; column/line one based; snippets exact UTF-8 decoded source.',source:inv.source,records},null,2));
const manifest=[...cache.values()].map(({member,size,sha256,artifact_offset,declared_integrity})=>({member,size,sha256,artifact_offset,declared_integrity,declared_hash_matches:declared_integrity?.algorithm==='SHA256'?declared_integrity.hash===sha256:null}));
for(const f of manifest)if(f.declared_hash_matches===false)throw Error('ASAR declared member hash mismatch: '+f.member);
fs.writeFileSync(evidence+'/core-search-provenance.json',JSON.stringify({source:inv.source,artifact_size:inv.artifact_size,members:manifest},null,2));
console.log(JSON.stringify(records.map(({id,label,member,member_utf16_start,snippet})=>({id,label,member,member_utf16_start,length:snippet.length})),null,2));

