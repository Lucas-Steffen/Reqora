#!/usr/bin/env node
/*
 * Reproducible static scanner for Apidog pre/post-processor script evidence.
 *
 * - Reads members of resources/app.asar (packed) or resources/app.asar.unpacked (unpacked)
 *   using the inventory produced for the search investigation.
 * - Literal string search only. Nothing from the artifact is executed, required or evaluated.
 * - Offsets are UTF-16 code-unit offsets in the decoded member text (JS string index).
 *   UTF-8 decoding is used for text members; latin1 for V8 bytecode (*.jsc), where offsets
 *   are therefore byte offsets.
 *
 * Output (gitignored):
 *   evidence/raw/script-facts.json        located facts with excerpts and module ids
 *   evidence/raw/script-term-counts.json  sandbox-library term counts across main/renderer JS
 *   evidence/raw/sandbox-require-modules.json  module names in the sandbox bundler require config
 *   evidence/raw/unpacked-members.json    app.asar.unpacked listing (native modules etc.)
 *   evidence/extracted/facts-table.md     table fragment used to author evidence.md
 *
 * Usage: node docs/apidog-scripts/tools/scan-scripts.cjs
 */
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const invPath = path.resolve(root, '../apidog-search/evidence/raw/asar-inventory.json');
const inv = JSON.parse(fs.readFileSync(invPath, 'utf8'));
const rawDir = path.join(root, 'evidence/raw');
const extDir = path.join(root, 'evidence/extracted');
fs.mkdirSync(rawDir, { recursive: true });
fs.mkdirSync(extDir, { recursive: true });

const byPath = new Map(inv.files.map((f) => [f.path, f]));
const fd = fs.openSync(inv.source, 'r');
const cache = new Map();

function readMember(p) {
  if (cache.has(p)) return cache.get(p);
  const f = byPath.get(p);
  if (!f) throw new Error('member not in inventory: ' + p);
  let buf;
  if (f.unpacked) {
    buf = fs.readFileSync(inv.source + '.unpacked/' + p);
  } else {
    buf = Buffer.alloc(f.size);
    fs.readSync(fd, buf, 0, f.size, inv.data_offset + Number(f.offset));
  }
  const text = buf.toString(p.endsWith('.jsc') ? 'latin1' : 'utf8');
  cache.set(p, text);
  return text;
}

/** Find the id of the enclosing webpack module ("123456:function(") before `at`. */
function enclosingId(text, at, marker) {
  let i = at + 16; // allow a module header that starts at the needle itself
  for (let guard = 0; guard < 20000; guard++) {
    i = text.lastIndexOf(marker, i - 1);
    if (i <= 0) return null;
    let j = i;
    while (j > 0 && text.charCodeAt(j - 1) >= 48 && text.charCodeAt(j - 1) <= 57) j--;
    if (j < i && /[,{\[]/.test(text[j - 1] || '')) return text.slice(j, i);
  }
  return null;
}

const clean = (s) => s.replace(/[\x00-\x08\x0b-\x1f\x7f-\x9f]/g, '.').replace(/\n/g, '\\n');

/*
 * Fact definitions. `needle` may be a string or an array of alternatives (first hit wins).
 * `nth` selects the n-th occurrence (0-based). `pre`/`len` shape the excerpt (len capped at 200).
 */
const V = 'dist/main/vendors.js';
const G = 'dist/main/worker.groupRunner.js';
const C = 'dist/main/context-extend-factory.js';
const L = 'dist/renderer/locale.en-US.7f650682917bf2b5.js';
const D = 'dist/renderer/36379.f04befee.async.js';
const SN = 'dist/renderer/15505.833337cc.async.js';
const CG = 'dist/renderer/96271.20a4f71f.async.js';
const PT = 'dist/renderer/21172.473501a0.async.js';
const IDX = 'dist/renderer/index.a796567fc5ca9bd8.js';
const CON = 'dist/renderer/58688.b772290c.async.js';
const RJ = 'dist/main/worker.runner.jsc';
const MJ = 'dist/main/main.jsc';
const COL = 'node_modules/@tarslib/collection/lib/collection/';

const facts = [
  // --- Engine / sandbox identity
  ['S01', V, '{"name":"@tarslib/runtime","version":"3.1.6","originalVersion":"7.29.0"', 0, 0, 120, 'Embedded runtime package metadata: @tarslib/runtime 3.1.6, fork of postman-runtime 7.29.0.'],
  ['S02', V, '"@tarslib/sandbox":"6.2.4"', 0, 0, 80, 'The runtime depends on @tarslib/sandbox 6.2.4 (postman-sandbox fork; not shipped as a separate node_modules package).'],
  ['S03', 'node_modules/@tarslib/uvm/package.json', '"originalVersion": "4.0.0"', 0, 60, 160, '@tarslib/uvm 4.0.7 ships in node_modules; it is a fork of postmanlabs/uvm 4.0.0.'],
  ['S04', V, '"function"==typeof e.sandboxContext.apiExtend?o:i', 0, 60, 140, 'uvm chooses the in-process vm bridge when sandboxContext.apiExtend is a function, otherwise the worker bridge.'],
  ['S05', V, 'u=3e5,d="",p="error",h="dispatchQueued"', 0, 0, 120, 'uvm default bootTimeout constant is 3e5 ms (300000), applied when the caller supplies none.'],
  ['S06', V, 'context=options._sandbox||vm.createContext(Object.create({require:eval("require")', 0, 0, 120, 'The vm bridge creates a node:vm context (Object.create prototype with require, crypto, URL, TextEncoder, etc.).'],
  ['S07', V, 'vm.runInContext(code,context,{timeout:options.bootTimeout})', 0, 0, 90, 'Boot code is run with vm.runInContext and timeout = bootTimeout.'],
  ['S08', V, 'context,{timeout:options.bootTimeout})}catch(e){this.emit(ERROR,e)}finally{context&&(delete context[e]', 0, 40, 140, 'Every bridge dispatch (incl. "execute") is also a vm.runInContext call bounded by bootTimeout.'],
  ['S09', G, '869154:function(e){"use strict";e.exports=require("vm")}', 0, 0, 70, 'Webpack module 869154 used by the vm bridge is Node\'s built-in "vm".'],
  ['S10', V, 'execArgv:["--experimental-global-webcrypto"]})}static __self=\'require("worker_threads").parentPort\'', 0, 0, 110, 'Fallback bridge spawns a worker_threads Worker (eval:true, --experimental-global-webcrypto).'],
  ['S11', C, 'appScriptMainObjects:"$$",apiExtend:await lZ(', 0, 60, 120, 'getSandboxContext() returns appScriptMainObjects "$$", an apiExtend function and apiExtendOnlyInNode.require.'],
  ['S12', C, 'dataSource:t=>new lW({...t,assetsPath:r},e,', 0, 20, 200, 'apiExtend adds pm.dataSource, pm.execute, pm.executeAsync, pm.__json5Parse and pm.liveRequire (npm registry).'],
  ['S13', V, 'async function ____main()', 0, 30, 120, 'User script is wrapped in an async ____main(), so top-level await works; sync throws are rethrown via setImmediate.'],
  ['S14', V, 'const g={Buffer:e("buffer").Buffer,console:l,pm:d,setTimeout:p.setTimeout', 0, 0, 200, 'Sandbox globals imported per execution: Buffer, console, pm and wrapped timers.'],
  ['S15', V, 'c.split(",").forEach((e=>{e&&(g[e]=d)}))', 0, 0, 60, 'Each name in appScriptMainObjects is bound to the same pm object (so "$$" is an alias of pm).'],
  ['S16', V, '"use sandbox2"', 0, 10, 160, 'A script starting with "use sandbox2" tears down the legacy (Postman v1) globals.'],
  ['S17', V, '" script execution timeout"', 0, 70, 130, 'Per-execution timer terminates with "sandbox: (a)synchronous script execution timeout" when timeout is finite.'],
  ['S18', V, 'timeout:l(t.options.timeout).pick(["script","global"]).values().min()', 0, 30, 110, 'Runtime creates the sandbox with timeout = min(options.timeout.script, options.timeout.global).'],
  ['S19', G, 'k.timeout={global:f?.request===0?5994e4:Math.max(("temp"===this.options.id?a8:1440)*6e4,f?.request??0),...f}', 0, 0, 120, 'Apidog runner sets only timeout.global: 59940000 ms if request timeout is 0, else max(N min, request) with N = a8 for "temp" runs, 1440 otherwise.'],
  ['S20', G, 'let a8=5;', 0, 0, 20, 'a8 = 5, i.e. "temp" runs get a 5-minute global (and therefore script) timeout.'],
  ['S21', V, 'e("uniscope/lib/allowed-globals").concat(["require","eval","console","bridge"', 0, 0, 200, 'Boot code ("purse") deletes every global not in uniscope allowed-globals plus a short allow-list.'],
  ['S22', V, 's.create({eval:!0,ignore:v,block:["bridge"]})', 0, 0, 60, 'Scripts execute through uniscope scopes (eval enabled, "bridge" blocked).'],
  ['S23', V, '592827:function(e){e.exports={bundler:{noParse:["jquery"]},require:{', 0, 0, 200, 'Sandbox bundler require config: the module names that require() can resolve inside scripts (see sandbox-require-modules.json).'],
  ['S24', V, 'JSON:e("liquid-json"),_:e("lodash3").noConflict(),CryptoJS:e("crypto-js"),tv4:e("tv4")', 0, 0, 170, 'Legacy globals: JSON (liquid-json), _ (lodash3), CryptoJS, tv4, xml2Json, Backbone, cheerio, atob, btoa.'],
  ['S25', RJ, 'Loading npm packages at runtime bypasses the sandbox environment', 0, 0, 140, 'Runtime npm loading, DB connections/SSH tunnels and local external programs require a per-project security confirmation.'],
  ['S27', 'dist/renderer/41230.9a4e1179.async.js', '" script execution timeout"', 0, 70, 130, 'A renderer chunk embeds a second copy of the sandbox boot code (not traced further; likely the browser/web variant).'],
  ['S26', G, 'let ij=process.parentPort', 0, 0, 60, 'The group runner talks to its parent over process.parentPort (Electron utilityProcess API).'],

  // --- pm API surface (runtime object)
  ['P01', V, 'info:g({},{eventName:e.target,iteration:e.cursor.iteration,iterationCount:e.cursor.cycles,requestName:e.legacy._itemName,requestId:e.legacy._itemId})', 0, 0, 160, 'pm.info = {eventName, iteration, iterationCount, requestName, requestId}.'],
  ['P02', V, 'teamGlobals:e.teamGlobals,globals:e.globals,environment:e.environment,collectionVariables:e.collectionVariables,moduleVariables:e.collectionVariables,variables:e._variables,vault:{},iterationData:w', 0, 0, 200, 'pm exposes teamGlobals, globals, environment, collectionVariables, moduleVariables (same scope as collectionVariables), variables, vault, iterationData.'],
  ['P03', V, 'e._variables.addLayer(w.values),e._variables.addLayer(e.environment.values)', 0, 0, 200, 'pm.variables resolution layers: local -> iterationData -> environment -> collection/module -> globals -> teamGlobals.'],
  ['P04', V, 'sendRequest:function(e,n){var a=this;return e?(t(l.isRequest(e)?e:new l(e)', 0, 0, 200, 'pm.sendRequest(req, callback(err, response, history)); string or Request; returns pm (no Promise form).'],
  ['P05', V, 'visualizer:{set(t,n,r){if("string"!=typeof t)', 0, 0, 120, 'pm.visualizer.set(template, data, options) and pm.visualizer.clear().'],
  ['P06', V, 'Object.defineProperty(this.response,"setBody",{value:function(e)', 0, 0, 200, 'Apidog additions on pm.response: originalJson(), originalText(), setData(), setBody(any) (mutates returned body).'],
  ['P07', V, 'Object.defineProperty(this.response,"to",{get(){return f.expect(this).to},configurable:!0})', 0, 0, 100, 'pm.response.to / pm.request.to are chai expect(...).to getters.'],
  ['P08', V, 'Object.defineProperty(this.variables,"replaceInAsync",{value:e=>_("variablesReplaceInAsync",e)})', 0, 0, 160, 'pm.variables.replaceInAsync() and pm.vault.get() are async host functions over the bridge.'],
  ['P09', V, 'T="PROJECT",N="TEAM";Object.defineProperties(this.globals,{get:{value:(e,t)=>t===N?this.teamGlobals.get(e):S(e)}', 0, 0, 160, 'pm.globals.get/set/has/replaceIn/toObject/unset/clear accept an extra scope argument "TEAM" or "PROJECT".'],
  ['P10', V, 'Postman.prototype.expect=f.expect,Postman.prototype.expectWithKey=h,f.use(e("chai-postman")(o,r,a))', 0, 0, 110, 'pm.expect is chai.expect (with chai-postman plugin); Apidog adds pm.expectWithKey.'],
  ['P11', V, 'if("function"==typeof apiExtend){const e=apiExtend(j);Object.keys(e).forEach(', 0, 0, 140, 'apiExtend() result keys are mounted directly onto pm.'],
  ['P12', V, 'name:String(e),async:!1,skipped:Boolean(t),passed:!0,error:null,index:n++', 0, 40, 160, 'pm.test result record {name, async, skipped, passed, error, index}; pm.test.skip and pm.test.index exist.'],
  ['P13', V, 'o=["log","warn","debug","info","error","clear"]', 0, 0, 200, 'Sandbox console methods log/warn/debug/info/error/clear dispatch "execution.console" with teleport-serialized args.'],
  ['P14', V, 'o=["tests","globals","environment","data","request","responseTime","iteration","postman","_","CryptoJS"', 0, 0, 140, 'Legacy globals removed on teardown (tests, globals, environment, data, request, responseTime, iteration, postman, ...).'],
  ['P15', V, 'PostmanCookieJar{constructor(e){this.store=e', 0, 10, 120, 'pm.cookies.jar() returns a cookie jar with get/getAll/set/unset/clear (callback style).'],
  ['P16', COL + 'variable-scope.js', 'replaceIn: function (template)', 0, 0, 50, 'VariableScope (postman-collection fork) defines has/get/set/unset/clear/replaceIn/toObject.'],
  ['P17', COL + 'response.js', 'json: function (reviver, strict)', 0, 0, 50, 'Response (postman-collection fork) defines text(), json(), reason(), size() etc.; sdk HttpResponse extends it.'],
  ['P18', COL + 'request.js', 'upsertHeader: function (header)', 0, 0, 50, 'Request (postman-collection fork) defines addHeader/removeHeader/upsertHeader/addQueryParams/removeQueryParams/getBaseUrl.'],
  ['P19', 'node_modules/@tarslib/sdk/lib/http/HttpResponse.cjs', 'responseTime: this.responseTime,', 0, 60, 80, '@tarslib/sdk HttpResponse (used by the sandbox) extends the collection Response and carries code/status/responseTime.'],

  // --- Editor typings and snippets (renderer)
  ['T01', D, '// Type definitions for postman-sandbox 4.6.0', 0, 0, 80, 'Script editor registers a Monaco extra lib derived from postman-sandbox 4.6.0 typings.'],
  ['T02', D, "// collectionVariables: import('postman-collection').VariableScope;", 0, 0, 130, 'Typings comment out pm.collectionVariables and declare pm.moduleVariables instead.'],
  ['T03', D, 'declare interface Execution {', 0, 0, 100, 'Typings declare pm.execution (skipRequest/setNextRequest/location) and pm.require(); no runtime assignment found for them in the pm constructor.'],
  ['T04', D, 'executeAsync: (\\n    filePath: string,', 0, 0, 80, 'Typings declare pm.executeAsync(filePath, args, options) for external programs.'],
  ['T05', SN, 'es={preProcessors:[[V,\'pm.environment.get("variable_key");\']', 0, 0, 120, 'Built-in snippet list for pre/post processors.'],
  ['T06', SN, '[G,"pm.response.setBody({});"]', 0, 0, 40, 'Snippet: pm.response.setBody({}).'],
  ['T07', SN, '[et,"var jsonObject = xml2Json(responseBody);"]', 0, 0, 50, 'Snippet uses legacy xml2Json(responseBody); another uses tv4.validate.'],

  // --- Visual processors compiled to pm scripts (renderer + main copies)
  ['C01', CG, 'const value = pm.globals.get(expression, "TEAM")', 0, 0, 60, 'Assertion/extractor sources compile to pm calls: pm.globals.get(expr,"TEAM"), pm.moduleVariables.get, pm.cookies.get, pm.response.headers.get, pm.response.responseTime.'],
  ['C02', CG, "const JSONPath = require('jsonpath-plus').JSONPath;", 0, 0, 60, 'Generated scripts require jsonpath-plus, xml2js, xpath and xmldom.'],
  ['C03', CG, 'pm.test(formattedName, async function(done) {', 0, 0, 60, 'Each visual assertion becomes one async pm.test with done callback.'],
  ['C04', CG, 'pm.expectWithKey({key:', 0, 0, 80, 'exists/notExist comparisons use pm.expectWithKey.'],
  ['C05', CG, 'pm.dataSource(config)[method](...args, async (error, results) => {', 0, 0, 70, 'Database operation processors compile to pm.dataSource(config).query(...) / Mongo methods.'],

  // --- Processor model, inheritance and order
  ['O01', G, 'buildEvent(e,t){let r,{type:a,data:n,enable:o}=e;if(!o||void 0===n)return null;', 0, 0, 200, 'Processor types handled by the event builder: assertion, extractor, httpApiExtractor, database, commonScript, customScript, delay.'],
  ['O02', G, 'case"delay":"number"==typeof n&&n>=0&&(l=(r=`setTimeout(()=>{}, ${n});`)', 0, 0, 90, 'The "delay"/wait processor is compiled to a script that only keeps a timer alive for n ms.'],
  ['O03', G, 'if("placeholder"===e.type)return;let i=this.buildEvent(e,0)', 0, 0, 200, 'Pre-processors become events listen=executionTiming (default prerequest), id preProcessors.<i>.<type>; placeholder skipped.'],
  ['O04', G, 'r.push({listen:"test",script:{id:`postProcessors.${t}.${e.type}`', 0, 0, 120, 'Post-processors become "test" events, id postProcessors.<i>.<type>.'],
  ['O05', G, 'r.unshift({listen:"prerequest",script:{id:"commonScript.assertion"', 0, 0, 110, 'Shared helper scripts for assertions/extractors are unshifted as first prerequest events.'],
  ['O06', G, 'l=[...s,...r,...e.filter(e=>e.enable)];return{preProcessors:l,postProcessors:[...n,...a,...t.filter(e=>e.enable),...o]}', 0, 0, 130, 'Final order: pre = [test-scenario pre, inherited, own enabled]; post = [test-scenario post, inherited, own enabled, metaInfo post].'],
  ['O07', G, 'name:"commonPreProcessors",Processors:t,type:i.e3.ApiRootFolder', 0, 0, 70, 'Inherited set starts with the module root folder processors (or project commonProcessors) as id 0 "Root".'],
  ['O17', G, 'this.httpRootFolderMap?.[this.httpApi.moduleId]', 0, 0, 140, 'Root processors come from the endpoint\'s module root folder when present, else the project-level commonProcessors.'],
  ['O08', G, 'for(;e;)c.unshift({id:e.id,name:e.name,Processors:e[n]??[],type:a.e3.ApiFolder', 0, 0, 200, 'collectParentProcessors walks folder parents upward with unshift, yielding top-down (outermost folder first) order.'],
  ['O09', G, 'void 0!==r.defaultEnable&&(s[e].defaultEnable=r.defaultEnable,s[e].enable=!!s[e].defaultEnable)', 0, 0, 120, 'calcProcessors: each inherited processor is enabled by defaultEnable; descendants may override defaultEnable via inheritProcessor maps.'],
  ['O10', G, 'void 0!==r.enable&&(s[t].enable=r.enable)', 0, 0, 60, 'The current item\'s inheritPreProcessors/inheritPostProcessors map has the final say on enable.'],
  ['O11', G, 'a=this.httpApiDebugMode?i.e3.ApiFolder:i.e3.HttpApi', 0, 0, 80, 'Endpoint debug runs inherit from folder chain; test cases also inherit from their endpoint (HttpApi) first.'],
  ['O12', PT, 'e.executionTiming=t>s?"presend":"prerequest"', 0, 0, 60, 'Processors before the placeholder get executionTiming "prerequest", after it "presend".'],
  ['O13', IDX, '{id:"dynamicValueDivider",type:"placeholder",renderType:"dynamicValueDivider"', 0, 0, 110, 'The placeholder is the built-in "Variable Substitution" divider item.'],
  ['O14', V, 'f.immediate("event",{name:"presend",item:o', 0, 0, 80, 'Runtime fires the "presend" event after variable resolution, just before sending.'],
  ['O15', V, 'this.queue("event",{name:"prerequest",item:y', 0, 0, 80, 'Runtime fires "prerequest" before variable resolution.'],
  ['O18', V, 'h=["url","method","headers","body"];i=function(e,t)', 0, 0, 50, 'After prerequest, script changes to request url/method/headers/body are copied back onto the item before sending.'],
  ['O19', V, 'u=["url","method","headers","body"],d=["url","headers"],p=function(e,t)', 0, 0, 80, 'Presend path copies the same HTTP fields back (url/headers for WebSocket).'],
  ['O16', G, 'this.enableYAPICompatScript&&r&&1===t&&(r=S(n))', 0, 0, 60, 'Optional YAPI compatibility prelude for custom post-scripts.'],

  // --- Result surfacing
  ['U01', G, 'console:(e,r,...a)=>{t.emit("console",null,{cursor:e,level:r,logs:a})', 0, 0, 80, 'Runner forwards sandbox console as {cursor, level, logs}.'],
  ['U02', G, 't.emit("assertion",i.passed?null:{name:s,index:i.index,test:i.name,message:n,expected:o,actual:l,stack:', 0, 0, 120, 'Assertion events carry {name,index,test,message,expected,actual,stack} on failure plus {passed,skipped,error}.'],
  ['U03', G, 'exception:(e,r)=>{t.emit("step",null,{cursor:e,error:r})}', 0, 0, 70, 'Uncaught script exceptions are emitted as a step error.'],
  ['U04', CON, 'PROCESSOR_IN="___label_placeholder__processor__in___"', 0, 0, 70, 'Console entries use label placeholders for processor in/out and external script output.'],
  ['U05', RJ, 'timings.preProcessorsStarted', 0, 0, 30, 'Bytecode runner records pre/post processor timing marks.'],
  ['U06', MJ, 'worker.groupRunner', 0, 0, 30, 'Main-process bytecode references worker.groupRunner (runner process entry).'],

  // --- UI strings (en-US)
  ['L01', L, '"console":"Console"', 0, 0, 30, 'Console tab label.'],
  ['L02', L, '"processor.label.assertionResult":"Assertion Results"', 0, 0, 60, 'Assertion results label.'],
  ['L03', L, '"socket.label.preScriptError":"PreProcessor Error: "', 0, 0, 60, 'Pre-script error label.'],
  ['L04', L, '"socket.label.postScriptError":"PostProcessor Script Error: "', 0, 0, 70, 'Post-script error label.'],
  ['L05', L, '"socket.label.publicPreScriptErrorWithName":"Library Script PreProcessor {name} Error: "', 0, 0, 100, 'Library (common) script error label.'],
  ['L06', L, '"apiCase.preRequestScript.description":"PreProcessor scripts are the JavaScript code running before sending the request.', 0, 0, 160, 'PreProcessor description claims Postman syntax compatibility.'],
  ['L07', L, '"overView.globalPreScriptTips":"Global PreProcessor Script: all endpoints in the project will run', 0, 0, 120, 'Project-global pre-processor scripts apply to every endpoint.'],
  ['L08', L, '"processor.label.InheritedFromFolder":"Inherited from Folder"', 0, 0, 60, 'Inherited processor badge.'],
  ['L09', L, '"processor.label.defaultEnable":"ON in children"', 0, 0, 50, 'defaultEnable is shown as "ON in children".'],
  ['L10', L, '"processor.content.DynamicValueDivider":"', 0, 0, 200, 'Variable Substitution divider explanation (place signing after, set-variable before).'],
  ['L11', L, '"processor.label.CustomScript":"Scripts"', 0, 0, 40, 'Processor type labels: Scripts, Assertion, Store Variable, Database Operation, Wait, Library Script.'],
  ['L12', L, '"processor.label.moveToParents":"Move to Parents"', 0, 0, 50, 'Processors can be moved to parent level.'],
];

const located = [];
for (const [id, member, needle, nth, pre, lenRaw, statement] of facts) {
  const text = readMember(member);
  const alts = Array.isArray(needle) ? needle : [needle];
  let at = -1, used = null;
  for (const n of alts) {
    let i = text.indexOf(n), k = 0;
    while (i !== -1 && k < nth) { i = text.indexOf(n, i + 1); k++; }
    if (i !== -1) { at = i; used = n; break; }
  }
  const len = Math.min(lenRaw || 120, 200);
  const rec = { id, statement, member, needle: alts[0], found: at !== -1 };
  if (at !== -1) {
    let occurrences = 0;
    for (let i = text.indexOf(used); i !== -1; i = text.indexOf(used, i + 1)) occurrences++;
    const exStart = Math.max(0, at - Math.min(pre || 0, 120));
    rec.utf16_offset = at;
    rec.occurrences = occurrences;
    rec.webpack_module = member.endsWith('.jsc') ? null : enclosingId(text, at, ':function(');
    rec.browserify_module = rec.webpack_module === '429849' ? enclosingId(text, at, ':[function(') : null;
    rec.excerpt = clean(text.slice(exStart, exStart + len));
    rec.context = clean(text.slice(Math.max(0, at - 400), at + 600));
  }
  located.push(rec);
}

// Sandbox require() allow-list: keys of the bundler "require" object (literal parse, no eval).
const vText = readMember(V);
const reqStart = vText.indexOf('592827:function(e){e.exports={bundler:');
const reqObjStart = vText.indexOf('require:{', reqStart) + 'require:'.length;
let depth = 0, k = reqObjStart;
for (; k < vText.length; k++) {
  if (vText[k] === '{') depth++;
  else if (vText[k] === '}') { depth--; if (depth === 0) break; }
}
const reqBody = vText.slice(reqObjStart, k + 1);
const requireModules = [];
{
  let d = 0; let token = '';
  for (let i = 1; i < reqBody.length - 1; i++) {
    const ch = reqBody[i];
    if (ch === '{') { if (d === 0) { requireModules.push(token.replace(/[:,\s"]/g, '')); token = ''; } d++; continue; }
    if (ch === '}') { d--; continue; }
    if (d === 0) token += ch;
  }
}
const exposeRe = /expose:"([^"]+)"/g;
const exposes = [...reqBody.matchAll(exposeRe)].map((m) => m[1]);
fs.writeFileSync(path.join(rawDir, 'sandbox-require-modules.json'), JSON.stringify({
  member: V, utf16_offset: reqStart, modules: requireModules, exposed_as: exposes,
  note: 'Keys of the sandbox bundler "require" map; expose renames the require() id (e.g. liquid-json -> json, @tarslib/collection -> postman-collection).',
}, null, 2));

// Term counts for sandbox technology across main + renderer JS (and jsc as latin1).
const terms = ['uvm', 'uniscope', 'postman-sandbox', '@tarslib/sandbox', 'vm2', 'isolated-vm', 'quickjs', 'worker_threads', 'runInContext', 'createContext', 'script execution timeout', 'pm.sendRequest', 'pm.expect', 'apiExtend'];
const counts = [];
for (const f of inv.files) {
  if (f.link || !/^dist\/(main|renderer)\/[^/]+\.(js|jsc)$/.test(f.path)) continue;
  const t = readMember(f.path);
  const c = {};
  for (const term of terms) { let n = 0; for (let i = t.indexOf(term); i !== -1; i = t.indexOf(term, i + 1)) n++; if (n) c[term] = n; }
  if (Object.keys(c).length) counts.push({ path: f.path, size: f.size, unpacked: !!f.unpacked, counts: c });
  cache.delete(f.path);
}
fs.writeFileSync(path.join(rawDir, 'script-term-counts.json'), JSON.stringify({
  scope: 'dist/main/*.js|jsc and dist/renderer/*.js, literal counts, no execution',
  caveat: 'vm2 hits in vendors.js/697.js fall inside timezone data strings (false positives).',
  terms, files: counts,
}, null, 2));

// Unpacked listing.
const unpacked = inv.files.filter((f) => f.unpacked).map((f) => ({ path: f.path, size: f.size }));
fs.writeFileSync(path.join(rawDir, 'unpacked-members.json'), JSON.stringify({
  count: unpacked.length,
  native_modules: unpacked.filter((f) => /\.node$/.test(f.path)),
  dist: unpacked.filter((f) => f.path.startsWith('dist/')),
}, null, 2));

fs.writeFileSync(path.join(rawDir, 'script-facts.json'), JSON.stringify({
  source: inv.source, inventory: path.relative(root, invPath).replace(/\\/g, '/'),
  method: 'literal indexOf over decoded member text; offsets are UTF-16 code units (latin1 bytes for .jsc)',
  facts: located,
}, null, 2));

const esc = (s) => String(s).replace(/\|/g, '\\|').replace(/`/g, "'");
const rows = located.map((r) => `| ${r.id} | ${esc(r.statement)} | \`${r.member}\` | ${r.found ? r.utf16_offset : 'NOT FOUND'}${r.webpack_module ? ` (m ${r.webpack_module}${r.browserify_module ? ` / bundle ${r.browserify_module}` : ''})` : ''} | \`${esc(r.excerpt || '')}\` |`);
fs.writeFileSync(path.join(extDir, 'facts-table.md'), '| ID | Statement | Member | UTF-16 offset (module) | Excerpt |\n|---|---|---|---|---|\n' + rows.join('\n') + '\n');

fs.closeSync(fd);
const missing = located.filter((r) => !r.found).map((r) => r.id);
console.log(JSON.stringify({ facts: located.length, missing, requireModules, termFiles: counts.length, unpacked: unpacked.length }, null, 2));
