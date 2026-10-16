const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const inv = JSON.parse(fs.readFileSync(path.resolve(root,'../apidog-search/evidence/raw/asar-inventory.json'),'utf8'));
fs.mkdirSync(root+'/evidence/raw',{recursive:true});
fs.mkdirSync(root+'/evidence/extracted',{recursive:true});
const fd=fs.openSync(inv.source,'r');
const files=inv.files.filter(f=>!f.unpacked&&!f.link&&/^dist\/(renderer|main)\/.+\.(js|json)$/.test(f.path));
const terms=['resolveRefs','resolveRef','importSwagger','swaggerImport','importOpenapi','importOpenApi','Swagger 2.0','OpenAPI 3','importByUrl','importFromUrl','importType','openapi','overwrite','x-apidog-folder'];
const report=[];
for(const f of files){const b=Buffer.alloc(f.size);fs.readSync(fd,b,0,b.length,inv.data_offset+Number(f.offset));const text=b.toString('utf8'),hits=[];for(const term of terms){let at=text.indexOf(term),count=0;while(at!==-1){count++;if(count<=5)hits.push({term,utf16_offset:at,snippet:text.slice(Math.max(0,at-160),Math.min(text.length,at+350))});at=text.indexOf(term,at+term.length);}if(count>5)hits.push({term,total_count:count});}if(hits.length)report.push({path:f.path,size:f.size,hits});}
fs.closeSync(fd);
fs.writeFileSync(root+'/evidence/raw/import-string-hits.json',JSON.stringify({scope:'packed dist/renderer and dist/main JS and JSON, literal scan, no execution',source:inv.source,terms,files_scanned:files.length,byte_count:files.reduce((n,f)=>n+f.size,0),files:report},null,2));
console.log(JSON.stringify(report.map(f=>({path:f.path,size:f.size,terms:[...new Set(f.hits.map(h=>h.term))]})),null,2));
