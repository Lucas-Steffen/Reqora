#!/usr/bin/env node
// Reproducible static scanner for Apidog "environments and variables" evidence.
// Literal scanning of packaged members only. Nothing from the artifact is executed.
//
// Usage: node docs/apidog-environments/tools/scan-environments.cjs [--no-hash]
// Output (git-ignored):
//   docs/apidog-environments/evidence/raw/environment-facts.json      probe results (offsets, module ids, excerpts)
//   docs/apidog-environments/evidence/raw/environment-locale.en-US.json  env/variable related en-US locale strings
//   docs/apidog-environments/evidence/raw/negative-scan.json          terms searched for and not found / found
//   docs/apidog-environments/evidence/extracted/facts-table.md        markdown table generated from probes
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const invPath = path.resolve(root, '../apidog-search/evidence/raw/asar-inventory.json');
const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
const rawDir = path.join(root, 'evidence/raw'), extDir = path.join(root, 'evidence/extracted');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(extDir, { recursive: true });

const fd = fs.openSync(inv.source, 'r');
const byPath = new Map(inv.files.map(f => [f.path, f]));
const cache = new Map();
function member(p) {
  if (cache.has(p)) return cache.get(p);
  const f = byPath.get(p);
  if (!f) throw new Error('member not in inventory: ' + p);
  if (f.unpacked || f.link) throw new Error('member is unpacked/link: ' + p);
  const buf = Buffer.alloc(f.size);
  fs.readSync(fd, buf, 0, f.size, inv.data_offset + Number(f.offset));
  const rec = { buf, text: buf.toString('utf8'), sha256: crypto.createHash('sha256').update(buf).digest('hex'), size: f.size, asarDataOffset: inv.data_offset + Number(f.offset) };
  cache.set(p, rec);
  return rec;
}

// Nearest enclosing webpack module id: last "<digits>:function(" or "<digits>(e,t,n){" before the offset.
function moduleIdAt(text, off) {
  const head = text.slice(Math.max(0, off - 400000), off);
  const re = /[,{](\d{2,7})(?::function\(|\([a-z],[a-z],[a-z]\)\{|:\([a-z],[a-z],[a-z]\)=>)/g;
  let m, last = null;
  while ((m = re.exec(head))) last = m[1];
  return last;
}

const R = 'dist/renderer/';
const LOC = R + 'locale.en-US.7f650682917bf2b5.js';
// Each probe: id, file, needle (literal), optional nth occurrence (0-based), len (excerpt chars), statement.
const probes = [
  // ---- locale (UI strings) ----
  ['L01', LOC, '"environment.title.parameterInitialValue":', 'Variable columns are labelled "Shared Value" (initialValue) and "Local Value" (current value).', 0, 130],
  ['L02', LOC, '"environmentSetting.remoteValueTips":', 'Shared value is synced to the server; local value is saved locally and used when sending.', 0, 200],
  ['L03', LOC, '"environmentSetting.localValueConnectPlaceholder":', 'When a local value is bound to the initial value the cell shows "Follows initial value".', 0, 90],
  ['L04', LOC, '"environment.tooltip.securityType":', 'Secret type: masked in UI, excluded when exporting data or publishing docs.', 0, 200],
  ['L05', LOC, '"environment.securityType.option.default":', 'Variable type options are Default and Secret.', 0, 110],
  ['L06', LOC, '"environment.tooltip.require":', '"Required" flag: prompt on the Run page if no current value is set.', 0, 160],
  ['L07', LOC, '"environment.createNew":', 'UI strings for New Environment / Environments management.', 0, 110],
  ['L08', LOC, '"createAsCopy":', 'Duplicate action label.', 0, 60],
  ['L09', LOC, '"environment.envName.development":', 'Default environment names: Develop Env, Testing Env, Prod Env.', 0, 140],
  ['L10', LOC, '"environment.manageModal.tips":', 'Definition of an environment as a set of variables to switch request context.', 0, 200],
  ['L11', LOC, '"environment.server.default":', 'Per-environment services/servers: Default, Default Server, protocol.', 0, 150],
  ['L12', LOC, '"environment.popConfirm.deleteService.deleteTips":', 'Deleting a service removes it from all environments.', 0, 170],
  ['L13', LOC, '"environmentSetting.preFixTips":', 'Multiple services discouraged in favour of modules.', 0, 200],
  ['L14', LOC, '"variable.environment":', 'Variable scopes named in UI: Environment, Module, Global variables.', 0, 140],
  ['L15', LOC, '"variable.local":', 'Local (temporary) variables scope label.', 0, 40],
  ['L16', LOC, '"variable.shareScope":', 'Global variable effective scope: Project or Team.', 0, 130],
  ['L17', LOC, '"templatePreviewer.variables.unresolved.tips":', 'Unresolved-variable hover text.', 0, 200],
  ['L18', LOC, '"vaultProvider.select.type.awsSecretsManager.label":', 'Vault providers: AWS Secrets Manager, Azure Key Vault, HashiCorp Vault.', 0, 200],
  ['L19', LOC, '"organization.enterprisePolicies.authSecurity.requireLocalOnlySecretRef.description":', 'Enterprise policy: Auth sensitive fields may only reference local-valued variables or Vault Secret.', 0, 200],
  ['L20', LOC, '"message.notSelectEnvironment":', 'Message when an action needs an environment.', 0, 80],
  ['L21', LOC, '"environment.tokenTips":', 'Inputs advertise {{token}} syntax.', 0, 80],
  ['L22', LOC, '"environment.title.baseUrl":', 'Base URL label.', 0, 50],
  // ---- data model ----
  ['M01', R + '61509.d12b6bd5.async.js', 'class a{name;value;initialValue;isFixedValue;description;isBindInitial;isSync;securityType;', 'Variable class fields.', 0, 170],
  ['M02', R + '6874.a29ed692.async.js', 'class n{id;name;projectId;variables;parameters;baseUrls;', 'Environment class fields.', 0, 200],
  ['M03', R + '6874.a29ed692.async.js', 'let r=["cookie","query","header","body"]', 'Environment-level extra parameters by location.', 0, 60],
  ['M04', R + '6874.a29ed692.async.js', 'static mergeVariables(e,t){', 'Server (shared) variables merged with local overlay: initialValue=remote value, value=local value ?? remote, isBindInitial default true, local-only (isSync false) vars appended.', 0, 200],
  ['M05', R + '6874.a29ed692.async.js', 'getInitialEnvironment(){return{', 'Synced representation carries initialValue only.', 0, 120],
  ['M06', R + '6874.a29ed692.async.js', 'getLocalEnvironment(e){return{id:this.id', 'Local representation carries value (current) only.', 0, 200],
  ['M07', R + '6874.a29ed692.async.js', 'this.type=d??"normal",this.visibility=c??"protected"', 'Defaults: type "normal", visibility "protected".', 0, 120],
  ['M08', R + '34640.485e5d43.async.js', 'securityType:"default",value:"",initialValue:"",description:"",isBindInitial:!0', 'New variable row defaults.', 0, 90],
  ['M09', R + '34640.485e5d43.async.js', '{name:"BASE_URL",value:"https://api.example.com"', 'Sample variable record shape (incl. isSync).', 0, 200],
  ['M10', R + '11113.3c03cee9.async.js', 'id:"environment.title.require"})} [isFixedValue]', '"Required" column maps to isFixedValue.', 0, 60],
  ['M11', R + 'index.a796567fc5ca9bd8.js', 'm=new i("localEnvironment"),g=new i("localGlobalVariables")', 'Local storage namespaces for local values.', 0, 200],
  ['M12', R + 'index.a796567fc5ca9bd8.js', 'C=new i("localTeamVariables"),w=new i("localModuleVariables")', 'Local storage namespaces (team/module).', 0, 70],
  // ---- operations ----
  ['O01', R + 'index.a796567fc5ca9bd8.js', 'M="duplicate",D="importData",R=-1', 'Environment model action names; R=-1 sentinel for no current environment.', 0, 50],
  ['O02', R + 'index.a796567fc5ca9bd8.js', '*create({payload:e},{call:t}){let a=e.getInitialEnvironment()', 'Create: server gets initial env; local values stored under "<projectId>.<envId>".', 0, 200],
  ['O03', R + 'index.a796567fc5ca9bd8.js', 'e===(0,c.I7)()&&G(R)', 'Deleting the current environment switches current to -1.', 0, 40],
  ['O04', R + 'index.a796567fc5ca9bd8.js', '*[M]({payload:e},{call:t}){let{id:a,projectId:n}=e', 'Duplicate: server clone, then local values copied to the new id.', 0, 200],
  ['O05', R + 'index.a796567fc5ca9bd8.js', 'else if(!o&&1===n.length)', 'Auto-select when no current env and exactly one env exists.', 0, 120],
  ['O06', R + 'index.a796567fc5ca9bd8.js', '[T](e,t){if(e&&void 0!==e.list){(0,c.YP)(t.payload)', 'changeCurrentEnvironment: unknown id -> currentEnvironment undefined.', 0, 200],
  ['O07', R + 'index.a796567fc5ca9bd8.js', '[C]:e=>e?.currentEnvironment?.type==="mock"?((0,c.YP)(R)', 'ensureNotMockEnvironment resets current to -1.', 0, 100],
  ['O08', R + 'index.a796567fc5ca9bd8.js', '[w](e=X,t){let{collections:{VariableList:a,Variable:i}}', 'updateBySdk: script-set values overwrite local value, keep stored initialValue, persist to localEnvironment.', 0, 200],
  ['O09', R + '2082.76700b8f.async.js', 'x.C8.includes(m.type)||"system"===m.type', 'Mock/system environments cannot be copied or deleted.', 0, 120],
  // ---- precedence / rendering ----
  ['P01', R + '79064.22ac529e.async.js', 'C.push(B),C.push(A),C.push(j),C.push(R),C.push($),C.push(f),C.push(T)', 'Render context concat order: vault, team, global, module, environment, test data, temp.', 0, 70],
  ['P02', R + '79064.22ac529e.async.js', 'R=m?.reduce((e,t)=>(e[t.name]=t.isBindInitial?t.initialValue||"":t.value,e),{})', 'Effective value = isBindInitial ? initialValue : value.', 0, 90],
  ['P03', R + '79064.22ac529e.async.js', 'm&&D(R??{},"","MODULE_GLOBALS_VARIABLE_LABEL",x)', 'Per-key source labels and secret flags recorded for the render context.', 0, 200],
  ['P04', R + '79064.22ac529e.async.js', 'i=e[r].match(`{{ ?${r}[ |][^}]*}}`)', 'Merge: later layer overwrites; self-referencing value rendered against lower layers.', 0, 150],
  ['P05', R + '79064.22ac529e.async.js', 'for(let e=0;e<3;e+=1)for(let e of l)', 'Up to 3 passes resolving variables that reference other variables.', 0, 140],
  ['P06', R + '41230.9a4e1179.async.js', 'u=[t._variables.values,t.data,t.environment.values,t.collectionVariables.values,t.globals.values,t.teamGlobals.values]', 'Script runtime substitution list (first match wins).', 0, 120],
  ['P07', 'node_modules/@tarslib/collection/lib/superstring/index.js', 'value = value.isBindInitial ? value.initialValue : value.valueOf();', 'Substitutor honours isBindInitial; first variable list containing the key wins; disabled skipped.', 0, 80],
  ['P08', R + '21275.2151e353.async.js', 'if(u&&Object.prototype.hasOwnProperty.call(u,r))return', 'Hover preview lookup order: test data, environment, module, global, vault, team.', 0, 140],
  ['P09', R + '25513.872d3996.async.js', 'let l=[];return i&&l.push(i),a&&l.push(a.variable.values)', 'Code-gen concat order: vault, team, module, global, module, environment.', 0, 200],
  ['P10', R + '27475.7dbee2fb.async.js', 'pm.globals.set(formattedName, value, "TEAM")', 'Extractor targets: environment, globals (project/TEAM), moduleVariables, local.', 0, 160],
  // ---- substitution ----
  ['S01', 'node_modules/@tarslib/collection/lib/superstring/index.js', 'REGEX_EXTRACT_VARS: /\\{\\{([^{}]*?)}}/g', 'Runtime variable regex.', 0, 40],
  ['S02', 'node_modules/@tarslib/collection/lib/superstring/index.js', 'VARS_SUBREPLACE_LIMIT: 19', 'Recursion limit 19.', 0, 30],
  ['S03', 'node_modules/@tarslib/collection/lib/superstring/index.js', 'return Substitutor.NATIVETYPES[(typeof r)] ? r : match;', 'Unresolved token left as the literal match.', 0, 60],
  ['S04', 'node_modules/@tarslib/collection/lib/json_variable.js', 'let keyMatch = key.match(/^([^.\\[]+)([.\\[])(.+)$/);', 'Path access: {{obj.a.b}} / {{arr[0]}} split into key + JSONPath.', 0, 60],
  ['S05', 'node_modules/@tarslib/base/lib/templating/variables/index.cjs', 'if (context.hasOwnProperty(variableName)) {', 'Exact full-name match (incl. dots) is also accepted.', 0, 50],
  ['S06', R + '80318.76475b49.async.js', 'throwOnUndefined:!0,tags:{blockStart:"{%",blockEnd:"%}",variableStart:"{{",variableEnd:"}}"', 'Nunjucks templating, strict undefined.', 0, 130],
  ['S07', R + '80318.76475b49.async.js', 'if(!e?.match(/\\{(\\{|%)(.+?)(%|\\})\\}/gim))return e;', 'Strings without {{ }} / {% %} skip rendering.', 0, 60],
  ['S08', R + '80318.76475b49.async.js', 'r&&(i.l?.loggerDebug?.(`error msg${u}`,r),a=u)', 'On template error the original text is kept.', 0, 70],
  ['S09', R + '80318.76475b49.async.js', 'let f=[{name:"md5",run:', 'Built-in filters (md5, sha, base64, ...).', 0, 40],
  ['S10', R + '79064.22ac529e.async.js', 'if(/\\{\\{[^{}]*\\{\\{/.test(t)){let e=/\\{\\{[^{}]+\\}\\}/g', 'Nested {{a{{b}}}}: innermost tokens rendered right-to-left, loop until stable or 19.', 0, 110],
  ['S11', R + '79064.22ac529e.async.js', 'console.error("templating error",e)', 'KEEP_ON_ERROR mode logs and keeps the value.', 0, 40],
  ['S12', R + '79064.22ac529e.async.js', 'if(e.disabled)return e;', 'Disabled request items are not rendered; ignore regex (e.g. /^body.*/) can skip paths.', 0, 30],
  ['S13', R + '79064.22ac529e.async.js', 'l?/^body.*/:null', 'Body rendering can be disabled by setting.', 0, 20],
  // ---- secrets ----
  ['X01', R + '22744.0fb136d0.async.js', 'p="secret"===d.original.securityType&&!d.original.eye', 'Secret value cell rendered as password unless eye toggled.', 0, 60],
  ['X02', R + '22744.0fb136d0.async.js', '("secret"===e.securityType?[e.name]:[e.name,e.initialValue,e.value])', 'Variable table search ignores secret values.', 0, 80],
  ['X03', R + '51692.4ab3308f.async.js', 'function G(e){let t="secret"===e.securityType', 'CLI/export: secret value emitted as empty string.', 0, 150],
  ['X04', R + '35282.65aad2b0.async.js', 'let o={apikey:["value"],bearer:["token"]', 'Auth sensitive field map.', 0, 200],
  ['X05', R + '35282.65aad2b0.async.js', 'return!!n(t)||t.startsWith("vault:")', 'A sensitive field counts as a reference if it is exactly {{var}} or starts with vault:.', 0, 50],
  ['X06', R + '8195.9830cfb2.async.js', 'e.vault?.[`vault:${t}`]', 'Vault secrets keyed as "vault:<name>".', 0, 30],
  ['X07', R + '79064.22ac529e.async.js', 'V.getKeysContext=()=>({keyContext:k,variableSecretContext:N,vaultSecretVariableContext:I})', 'Render context exposes per-key secret flags.', 0, 100],
  // ---- base URL ----
  ['B01', R + '18375.66daf0bc.async.js', 'if(!l||u&&(u.startsWith("{{")||u.startsWith("http://")||u.startsWith("https://")))return""', 'No base URL if no env or path already absolute / starts with {{.', 0, 200],
  ['B02', R + '18375.66daf0bc.async.js', 'if(n&&i.some(e=>e.id===String(n)))return String(n);else return"default"', 'Folder inheritance fallback: module-id server, else "default".', 0, 80],
  ['B03', R + '18375.66daf0bc.async.js', 's=(e,t)=>!(""!==e&&i(e,t))||!1', 'Empty or deleted serverId means inherit from parent folder.', 0, 40],
  ['B04', R + '73427.2a071a7d.async.js', 'if(/^https?:\\/\\//.test(A)||this.proto', 'Request builder: absolute URL kept; else baseUrl + path by plain concatenation.', 0, 200],
  ['B05', R + '73427.2a071a7d.async.js', 'let{disabled:h}=t[o];!0===h&&(t[o]=n)', 'Environment parameters only fill missing (or disabled) request params.', 0, 40],
  ['B06', R + '82290.6566f5fc.async.js', 'this.url=`${r||"<BASE_URL>"}${h}`', 'Code export: placeholder when no base URL.', 0, 40],
  ['B07', R + '94743.05826374.async.js', 'baseUrls:{default:e.url},name:e.description||e.url', 'OpenAPI servers import -> one environment per server with baseUrls.default.', 0, 90],
];

const facts = [], missing = [];
for (const [id, file, needle, statement, nth = 0, len = 160] of probes) {
  let rec;
  try { rec = member(file); } catch (e) { missing.push({ id, file, needle, error: e.message }); continue; }
  let at = -1, from = 0, count = 0, n = -1;
  while ((at = rec.text.indexOf(needle, from)) !== -1) { count++; if (count - 1 === nth) n = at; from = at + needle.length; }
  if (n === -1) { missing.push({ id, file, needle }); continue; }
  const excerpt = rec.text.slice(n, n + Math.max(len, Math.min(needle.length, 200))).replace(/\s+/g, ' ');
  const byteOffset = Buffer.byteLength(rec.text.slice(0, n), 'utf8');
  facts.push({
    id, statement, member: file, member_sha256: rec.sha256, member_size: rec.size,
    utf16_offset: n, member_byte_offset: byteOffset, asar_byte_offset: rec.asarDataOffset + byteOffset,
    webpack_module: file.startsWith('dist/') && !file.includes('locale.') ? moduleIdAt(rec.text, n) : null,
    occurrences_in_member: count, needle, excerpt,
  });
}

// Locale dump: en-US strings for environment / variable / vault keys.
const locText = member(LOC).text;
const locRe = /"((?:[^"\\]|\\.){1,160})":"((?:[^"\\]|\\.){0,600})"/g;
const keyRe = /^(environment|environmentSetting|environmentDetail|variable|vaultSecret|vaultProvider|templatePreviewer\.variables|createNewEnvironment|createAsCopy|message\.notSelectEnvironment|organization\.enterprisePolicies\.authSecurity)\b/;
const locale = [];
let m;
while ((m = locRe.exec(locText))) if (keyRe.test(m[1])) locale.push({ key: m[1], value: m[2], utf16_offset: m.index });

// Negative scan across every packed member (any type), ASCII and UTF-16LE.
const negTerms = ['safeStorage', 'encryptString', 'decryptString', 'isEncryptionAvailable', 'keytar', 'setPassword('];
const neg = Object.fromEntries(negTerms.map(t => [t, []]));
let scanned = 0;
for (const f of inv.files) {
  if (f.unpacked || f.link || !f.size) continue;
  const buf = Buffer.alloc(f.size);
  fs.readSync(fd, buf, 0, f.size, inv.data_offset + Number(f.offset));
  scanned++;
  for (const t of negTerms) {
    if (buf.indexOf(t) !== -1) neg[t].push(f.path);
    else if (buf.indexOf(Buffer.from(t, 'utf16le')) !== -1) neg[t].push(f.path + ' (utf16le)');
  }
}

let asarSha = null;
if (!process.argv.includes('--no-hash')) {
  const h = crypto.createHash('sha256'), b = Buffer.alloc(8 << 20); let pos = 0, r;
  while ((r = fs.readSync(fd, b, 0, b.length, pos)) > 0) { h.update(b.subarray(0, r)); pos += r; }
  asarSha = h.digest('hex');
}
fs.closeSync(fd);

const meta = { tool: 'scan-environments.cjs', scope: 'literal scan of packed members, no execution', source: inv.source, asar_size: fs.statSync(inv.source).size, asar_sha256: asarSha, offsets: 'utf16_offset is zero-based UTF-16 index in the UTF-8-decoded member' };
fs.writeFileSync(path.join(rawDir, 'environment-facts.json'), JSON.stringify({ ...meta, facts, missing }, null, 2));
fs.writeFileSync(path.join(rawDir, 'environment-locale.en-US.json'), JSON.stringify({ ...meta, member: LOC, count: locale.length, strings: locale }, null, 2));
fs.writeFileSync(path.join(rawDir, 'negative-scan.json'), JSON.stringify({ ...meta, members_scanned: scanned, terms: neg }, null, 2));

const esc = s => s.replace(/\|/g, '\\|').replace(/`/g, "'");
const md = ['| ID | Statement | Member | UTF-16 offset (module) | Excerpt |', '| --- | --- | --- | --- | --- |']
  .concat(facts.map(f => `| ${f.id} | ${esc(f.statement)} | \`${f.member}\` | ${f.utf16_offset}${f.webpack_module ? ` (${f.webpack_module})` : ''} | \`${esc(f.excerpt)}\` |`));
fs.writeFileSync(path.join(extDir, 'facts-table.md'), md.join('\n') + '\n');

console.log(JSON.stringify({ asar_sha256: asarSha, facts: facts.length, missing, locale: locale.length, members_scanned: scanned, negative: Object.fromEntries(Object.entries(neg).map(([k, v]) => [k, v.length])) }, null, 2));
