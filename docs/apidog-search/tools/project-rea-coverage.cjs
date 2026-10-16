// Stream only JSON structure to locate normalized_result child byte ranges.
// This is a local projection helper, not a canonical REA validator.
const fs=require('fs');const root='E:/Projects/Personal/Reqora/docs/apidog-search/evidence';const p=root+'/raw/rea-tree-search.json';const fd=fs.openSync(p,'r'),buf=Buffer.alloc(1024*1024);let pos=0,depth=0,inString=false,escaped=false,strStart=0,strDepth=0,lastString=null,key=null,valueStart=null,normal=false,wantNormal=false,done=false,fields=[];
function stringAt(a,b){let out=Buffer.alloc(b-a);fs.readSync(fd,out,0,out.length,a);return JSON.parse(out.toString('utf8'))}
while(!done){const count=fs.readSync(fd,buf,0,buf.length,pos);if(!count)break;for(let j=0;j<count;j++){const ch=buf[j],at=pos+j;if(inString){if(escaped){escaped=false;continue}if(ch===92){escaped=true;continue}if(ch===34){inString=false;if(strDepth<=2)lastString={start:strStart,end:at+1,depth:strDepth};}continue}
if(valueStart===null&&key&&ch!==32&&ch!==9&&ch!==10&&ch!==13)valueStart=at;
if(ch===34){inString=true;strStart=at;strDepth=depth;continue}
if(ch===58&&lastString){if(depth===1){if(stringAt(lastString.start,lastString.end)==='normalized_result')wantNormal=true;}else if(normal&&depth===2){key=stringAt(lastString.start,lastString.end);valueStart=null;}lastString=null;continue}
if(ch===123||ch===91){depth++;if(wantNormal){normal=true;wantNormal=false;}lastString=null;continue}
if(ch===125||ch===93){if(normal&&depth===2&&ch===125){if(key&&valueStart!==null)fields.push({key,start:valueStart,end:at,size:at-valueStart});done=true;break}depth--;lastString=null;continue}
if(ch===44){if(normal&&depth===2&&key&&valueStart!==null){fields.push({key,start:valueStart,end:at,size:at-valueStart});key=null;valueStart=null;}lastString=null;}
}pos+=count;}
const projection=JSON.parse(fs.readFileSync(root+'/rea-tree-summary.json','utf8'));projection.normalized_result_field_ranges=fields;projection.normalized_result_selected={};for(const f of fields.filter(f=>['summary','statistics','coverage','limitations','semantic_coverage','analysis_coverage','unknowns'].includes(f.key))){if(f.size>1048576){projection.normalized_result_selected[f.key]={omitted:true,bytes:f.size};continue}projection.normalized_result_selected[f.key]=stringAt(f.start,f.end);}
fs.closeSync(fd);fs.writeFileSync(root+'/rea-tree-summary.json',JSON.stringify(projection,null,2));console.log(JSON.stringify({fields,selected:projection.normalized_result_selected},null,2));

