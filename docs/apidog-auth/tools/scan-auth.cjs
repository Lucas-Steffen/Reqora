// Reproducible, literal-only scanner for Apidog request-authentication evidence.
// Reads members from the packed app.asar (via the shared inventory) and from
// app.asar.unpacked/ for main-process plain-JS files. Never executes Apidog code.
// Output: docs/apidog-auth/evidence/raw/auth-facts.json (+ auth-term-hits.json)
//         docs/apidog-auth/evidence/extracted/<member path> (copies, gitignored)
// Usage: node docs/apidog-auth/tools/scan-auth.cjs
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.resolve(__dirname, '..');
const inv = JSON.parse(fs.readFileSync(path.resolve(root, '../apidog-search/evidence/raw/asar-inventory.json'), 'utf8'));
fs.mkdirSync(root + '/evidence/raw', { recursive: true });
fs.mkdirSync(root + '/evidence/extracted', { recursive: true });
const byPath = new Map(inv.files.map(f => [f.path, f]));
const fd = fs.openSync(inv.source, 'r');
const cache = new Map();
function member(p) {
  if (cache.has(p)) return cache.get(p);
  const f = byPath.get(p);
  if (!f) throw new Error('member not in inventory: ' + p);
  let buf;
  if (f.unpacked) buf = fs.readFileSync(inv.source + '.unpacked/' + p);
  else { buf = Buffer.alloc(f.size); fs.readSync(fd, buf, 0, f.size, inv.data_offset + Number(f.offset)); }
  const rec = { path: p, size: buf.length, unpacked: !!f.unpacked, sha256: crypto.createHash('sha256').update(buf).digest('hex'), text: buf.toString('utf8') };
  cache.set(p, rec);
  return rec;
}
// Nearest preceding webpack module id ("123456:function(" or "123456:(") before offset.
function moduleId(text, at) {
  const re = /[,{](\d{2,7}):(?:function\(|\()/g; let m, last = null;
  re.lastIndex = Math.max(0, at - 600000);
  while ((m = re.exec(text)) && m.index < at) last = m[1];
  return last;
}
const R = 'dist/renderer/', M = 'dist/main/';
// [id, member, needle, excerptLength]
const probes = [
  ['F01', R + '55189.e1f13d88.async.js', '(o={}).InHerit="inherit",o.NoAuth="noauth"', 200],
  ['F02', R + '55189.e1f13d88.async.js', 'o.JWT="jwt",o.Kerberos="kerberos1",o.SecurityScheme="securityscheme"', 110],
  ['F03', R + '55189.e1f13d88.async.js', 'let r={inherit:"Inherit Parent",noauth:"No Auth"', 200],
  ['F04', R + '55189.e1f13d88.async.js', 'n={apikey:{key:"Key",value:"Value"},bearer:{token:"Token"}', 200],
  ['F05', R + '55189.e1f13d88.async.js', 'awsv4:{accessKey:"AccessKey"', 200],
  ['F06', R + '55189.e1f13d88.async.js', 'g={authorization_code:"Authorization Code"', 200],
  ['F07', R + '55189.e1f13d88.async.js', 'f={header:"Send as Basic Auth header",body:"Send client credentials in body"}', 90],
  ['F08', R + '55189.e1f13d88.async.js', 'P={access_token:"Access token",id_token:"ID token"}', 60],
  ['F09', R + '55189.e1f13d88.async.js', 'y={header:"Header",queryParams:"Query Params"}', 50],
  ['F10', R + '55189.e1f13d88.async.js', 'function z(e){return!e||!!e&&"inherit"===e.type||0===Object.keys(e).length}', 80],
  ['F11', R + '55189.e1f13d88.async.js', 'auth:i||{type:"noauth"},securityScheme:r}', 50],
  ['F12', R + '55189.e1f13d88.async.js', 'let e=o?.inherit?.[l.auth.type];e&&(l.auth=', 120],
  ['F13', R + '55189.e1f13d88.async.js', 'return{definitionInheritFrom:{name:s.name,id:s.id},auth:o.type&&"noauth"===o.type?{type:"noauth"}:o', 120],
  ['F14', R + '83756.46a85f18.async.js', 'case"folder":t=o?.[e.parentId||""]?.parentId;break;case"project":t=0;break', 80],
  ['F15', R + '83756.46a85f18.async.js', 'type:g?.auth?.type===s.Z8?"securityscheme":g?.auth?.type||"noauth"', 70],
  ['F16', R + '85652.e1c386d0.async.js', 'case"apikey":case"awsv4":return{in:"header"}', 50],
  ['F17', R + '31766.1320bb70.async.js', '(0,i.jsx)(h,{value:"header",children:(0,n.hw)({id:"header"})}),(0,i.jsx)(h,{value:"query",children:"Query Params"})', 115],
  ['F18', M + 'vendors.js', 'name:"apikey",version:"0.0.1"', 60],
  ['F19', R + '85652.e1c386d0.async.js', 'aV=e=>({useTokenType:r.uC,challengeAlgorithm:"S256",client_authentication:"header"', 200],
  ['F20', R + '31766.1320bb70.async.js', 'label:"Callback URL",name:[...t,"redirect_uri"]', 50],
  ['F21', R + '24879.dc18cda7.async.js', 'switch(this.id=(0,N.A)(),this.params=e,this.params.grant_type){case"authorization_code":', 200],
  ['F22', R + '24879.dc18cda7.async.js', 'sendAuthorizationLoginRequest(e,t,r,n){i.xl?l.gc.send(t.useBrowserAuthorization?"OAuth2.StartExternalBrowserLogin":"OAuth2.StartLogin"', 200],
  ['F23', R + '24879.dc18cda7.async.js', 'handleAuthFromBrowser(e){', 200],
  ['F24', R + '24879.dc18cda7.async.js', '"authorization_code_with_pkce"===t.grant_type){var o,s;t.code_verifier=t.code_verifier||', 160],
  ['F25', R + '24879.dc18cda7.async.js', 'addClientAuthentication(e,t){', 200],
  ['F26', R + '24879.dc18cda7.async.js', 'getOAuth2RefreshTokenRequest(){', 200],
  ['F27', R + '24879.dc18cda7.async.js', 'let t=n.f3?"oauth2-browser-callback-ee.html":"oauth2-browser-callback.html";return localStorage.getItem("oAuthBrowserCallbackUrl")', 160],
  ['F28', R + '24879.dc18cda7.async.js', 'let n={refresh_token:', 200],
  ['F29', R + '24879.dc18cda7.async.js', 'static async create(e){let t=new u,r=(0,n.kx)()', 160],
  ['F30', R + '94743.05826374.async.js', 'static{f.gc.on("TestCase.RunnerResult",j.handleRunnerResult())}abort=()=>{this.status="end",this.ipc.send("TestCase.RunnerAction"', 120],
  ['F31', M + 'context-extend-factory.js', 'e.StartLogin="OAuth2.StartLogin"', 200],
  ['F32', M + 'preload.main-window.js', '"OAuth2.StartLogin","OAuth2.ClearCookies"', 50],
  ['F33', M + 'worker.groupRunner.js', 'let rg=60;', 12],
  ['F34', M + 'worker.groupRunner.js', 'return!!e.refresh_token&&void 0!==r&&void 0!==a&&t>=a+r-rg}function rw(e)', 190],
  ['F35', R + '8195.9830cfb2.async.js', 'N={[l]:String(y),[`${l}:metadata`]:v}', 60],
  ['F36', R + '31766.1320bb70.async.js', '{...e,name:`${e.name}:metadata`,value:e.tokenDetailString,valueType:"CurrentValue"}', 90],
  ['F37', R + '75216.3545b66e.async.js', 'n?`{{${n}:metadata}}`:void 0', 40],
  ['F38', M + 'vendors.js', 'name:"oauth2",version:"1.0.0"', 200],
  ['F39', R + '24879.dc18cda7.async.js', 'let r=/{{\\s*([^ }]+)\\s*[^}]*\\s*}}/g', 50],
  ['F40', R + 'locale.en-US.7f650682917bf2b5.js', '"api.label.authorization.oauth2.tokenPopover.description"', 180],
  ['F41', R + 'locale.en-US.7f650682917bf2b5.js', '"organization.enterprisePolicies.authSecurity.requireLocalOnlySecretRef.description"', 200],
  ['F42', R + '71476.c42c1b1e.async.js', '"forbidRawValueInAuth"===e.policy', 160],
  ['F43', R + '21519.0dc2cc63.async.js', 's={bearer:["token"],jwt:["payload"', 200],
  ['F44', R + '94743.05826374.async.js', 'T=function(e){if(void 0!==e){if(Array.isArray(e)){if(0===e.length)return{};', 200],
  ['F45', R + '94743.05826374.async.js', 'var b={schemeGroups:[],required:!0,use:{id:"",configs:{}}}', 80],
  ['F46', R + '94743.05826374.async.js', 'u=["Combination".concat(h>0?h:"")]', 160],
  ['F47', R + '94743.05826374.async.js', 'u=new r({name:(0,n.hw)({id:"defaultFolder"}),auth:(0,h.Vu)(t.security)', 130],
  ['F48', R + '94743.05826374.async.js', 'P.auth=(0,u.Vu)(e.security),P.securityScheme=(0,u.k6)({securities:e.security', 110],
  ['F49', R + '94743.05826374.async.js', 'type:l.XN.SecurityScheme,authType:t.formatAuthType(r),oasAuthType:r.type,authConfigs:r', 90],
  ['F50', R + '94743.05826374.async.js', 'switch(String(null!=(t=s({authConfigs:e},d))?t:"").toLowerCase()){case"apikey":', 200],
  ['F51', R + '94743.05826374.async.js', 'case"http":switch(String(s({authConfigs:e},c)||"").toLowerCase()){case"bearer":', 200],
  ['F52', R + '94743.05826374.async.js', 'case"oauth2":return"oauth2";default:return"customize"}}(e)}', 60],
  ['F53', R + '94743.05826374.async.js', 'p.convertObj(o,{appNameLower:', 70],
  ['F54', R + '85652.e1c386d0.async.js', 'function ag(e,t){switch(e){case"authorizationCode":if(t)return"authorization_code_with_pkce"', 200],
  ['F55', R + '85652.e1c386d0.async.js', 'h="Authorization",u="authConfigs",c="authType",d="type",l="in",N="scheme",P="flows"', 140],
  ['F56', R + '85652.e1c386d0.async.js', 'function tV(e){return[...tJ(e),"authorizationUrl"]}', 140],
  ['F57', R + '71476.c42c1b1e.async.js', 'c=((i={}).API_KEY="apiKey",i.HTTP="http",i.MUTUAL_TLS="mutualTLS"', 200],
  ['F58', R + '94743.05826374.async.js', 'var j={authorization_code:"authorization_code",authorizationCode:"authorization_code"', 200],
  ['F59', R + '94743.05826374.async.js', 'w=["apikey","awsv4","basic","bearer","digest","edgegrid","hawk","inherit","ntlm","noauth","oauth1","oauth2","jwt"]', 120],
  ['F60', R + '37191.cf4ef583.async.js', 'let u={apikey:[["apikey","key"],["apikey","value"]],bearer:[["bearer","token"]]', 200],
  ['F61', R + '1605.1daae3a9.async.js', 'case"apikey":{let e=s.apikey?.key,t=s.apikey?.value||"<api-key>";s.apikey?.in==="query"', 120],
  ['F62', R + '31766.1320bb70.async.js', 'let ez=e=>{let t=e.authType;return"noauth"===t?', 140],
  ['F63', R + 'locale.en-US.7f650682917bf2b5.js', '"api.auth.authCredential.inherit.title"', 160],
  ['F64', R + '26304.0510abdd.async.js', 'if(!(0,I.Mo)(e?.auth))return{auth:e?.auth,securityScheme:e?.securityScheme};let n=(0,I.E7)(t?.folderId||0,a||{},r?.auth,r?.securityScheme)', 200],
  ['F65', R + '94743.05826374.async.js', 'iP=((l={}).INHERIT="inherit",l.BEARER="bearer"', 200],
];
const facts = [];
const copied = new Set();
for (const [id, p, needle, len] of probes) {
  const m = member(p);
  const at = m.text.indexOf(needle);
  let count = 0; for (let i = m.text.indexOf(needle); i !== -1; i = m.text.indexOf(needle, i + 1)) count++;
  facts.push({ id, member: p, needle, found: at !== -1, utf16_offset: at === -1 ? null : at, occurrences: count,
    webpack_module: at === -1 ? null : moduleId(m.text, at),
    excerpt: at === -1 ? null : m.text.slice(at, at + Math.max(len, Math.min(needle.length, 200))) });
  if (!copied.has(p)) { copied.add(p); const out = path.join(root, 'evidence/extracted', p); fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, m.text); }
}
// Broad term census across all packed renderer/main JS + unpacked main plain JS.
const terms = ['"noauth"', '"inherit"', '"securityscheme"', '"combination"', '"customize"', 'authorization_code_with_pkce', 'password_credentials', 'client_credentials', 'useBrowserAuthorization', 'OAuth2.StartLogin', 'OAuth2.StartExternalBrowserLogin', ':metadata', 'tokenDetail', 'refreshOAuth2Token', 'forbidRawValueInAuth', 'requireLocalOnlySecretRef', 'openIdConnect', 'mutualTLS', 'vaultSecret'];
const census = [];
for (const f of inv.files) {
  if (f.link || !/^dist\/(renderer|main)\/[^/]+\.js$/.test(f.path)) continue;
  let text; try { text = member(f.path).text; } catch { continue; }
  const hits = {}; for (const t of terms) { let c = 0; for (let i = text.indexOf(t); i !== -1; i = text.indexOf(t, i + t.length)) c++; if (c) hits[t] = c; }
  if (Object.keys(hits).length) census.push({ path: f.path, unpacked: !!f.unpacked, hits });
  if (!probes.some(pr => pr[1] === f.path)) cache.delete(f.path);
}
fs.closeSync(fd);
const members = [...copied].map(p => { const m = cache.get(p) || member(p); return { path: p, size: m.size, unpacked: m.unpacked, sha256: m.sha256 }; });
fs.writeFileSync(root + '/evidence/raw/auth-facts.json', JSON.stringify({ scope: 'literal scan, no execution', source: inv.source, members, facts }, null, 2));
fs.writeFileSync(root + '/evidence/raw/auth-term-hits.json', JSON.stringify({ terms, files: census }, null, 2));
const missing = facts.filter(f => !f.found).map(f => f.id);
console.log(`facts: ${facts.length}, found: ${facts.length - missing.length}, missing: ${missing.join(',') || 'none'}; census files: ${census.length}`);
