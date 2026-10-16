const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const source = 'C:/Users/Lucas Steffen/AppData/Local/Programs/Apidog/resources/app.asar';
const output = 'E:/Projects/Personal/Reqora/docs/apidog-search/evidence';
const fd = fs.openSync(source, 'r');
const prefix = Buffer.alloc(16); fs.readSync(fd,prefix,0,16,0);
const headerBufferSize = prefix.readUInt32LE(4);
const headerStringSize = prefix.readUInt32LE(12);
const headerBuffer=Buffer.alloc(headerStringSize); fs.readSync(fd,headerBuffer,0,headerStringSize,16);
const header = JSON.parse(headerBuffer.toString('utf8'));
const base = 8 + headerBufferSize;
let files=[];
function walk(dir,p='') { for(const [name,entry] of Object.entries(dir.files||{})) { const member=p?`${p}/${name}`:name; if(entry.files)walk(entry,member);else files.push({path:member,size:entry.size||0,offset:entry.offset??null,unpacked:!!entry.unpacked,link:entry.link??null}); } }
walk(header);
fs.writeFileSync(path.join(output,'raw','asar-inventory.json'),JSON.stringify({source,artifact_size:fs.statSync(source).size,header_buffer_size:headerBufferSize,header_json_size:headerStringSize,data_offset:base,count:files.length,files},null,2));
const selection = process.argv.slice(2);
if(selection.length) for(const member of selection) { const f=files.find(f=>f.path===member); if(!f||f.unpacked||f.link)throw Error('Unavailable regular packed member '+member);const b=Buffer.alloc(f.size);fs.readSync(fd,b,0,b.length,base+Number(f.offset));const target=path.resolve(output,'extracted',member);const allowed=path.resolve(output,'extracted')+path.sep;if(!target.startsWith(allowed))throw Error('unsafe member');fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,b);console.log(JSON.stringify({member,size:f.size,sha256:crypto.createHash('sha256').update(b).digest('hex'),artifact_byte_offset:base+Number(f.offset),target})); }
else console.log(JSON.stringify({prefix:[...prefix],dataOffset:base,total:files.length,top:files.filter(f=>f.path.split('/').length<3),searchNamed:files.filter(f=>/search/i.test(f.path)).slice(0,100),largest:files.slice().sort((a,b)=>b.size-a.size).slice(0,20)},null,2));
fs.closeSync(fd);
