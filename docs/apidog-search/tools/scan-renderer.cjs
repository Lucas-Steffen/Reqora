const fs=require('fs'),path=require('path');
const root='E:/Projects/Personal/Reqora/docs/apidog-search';
const inv=JSON.parse(fs.readFileSync(root+'/evidence/raw/asar-inventory.json','utf8'));
const fd=fs.openSync(inv.source,'r');
const files=inv.files.filter(f=>!f.unpacked&&!f.link&&/^dist\/renderer\/.+\.js$/.test(f.path));
const terms=['GlobalSearch','globalSearch','searchApi','SearchApi','searchHistory','searchSetting','search-setting','fullText','fulltext','matchCase','caseSensitive','searchAll','searchKeyword'];
let report=[];
for(const f of files){const b=Buffer.alloc(f.size);fs.readSync(fd,b,0,b.length,inv.data_offset+Number(f.offset));const text=b.toString('utf8'); const hits=[];for(const term of terms){let at=text.indexOf(term),count=0;while(at!==-1){count++;if(count<=8)hits.push({term,utf16_offset:at,snippet:text.slice(Math.max(0,at-140),Math.min(text.length,at+300))});at=text.indexOf(term,at+term.length);}if(count>8)hits.push({term,total_count:count});} if(hits.length)report.push({path:f.path,size:f.size,hits});}
fs.closeSync(fd);fs.writeFileSync(root+'/evidence/raw/renderer-search-string-hits.json',JSON.stringify({scope:'all packed JavaScript directly or below dist/renderer; literal string scan, no execution',files_scanned:files.length,byte_count:files.reduce((n,f)=>n+f.size,0),terms,files:report},null,2));
console.log(JSON.stringify(report.map(f=>({path:f.path,size:f.size,terms:[...new Set(f.hits.map(h=>h.term))]})),null,2));
