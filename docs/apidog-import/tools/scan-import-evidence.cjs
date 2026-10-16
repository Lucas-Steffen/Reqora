#!/usr/bin/env node
// Reproducible static scanner for the OpenAPI/Swagger import evidence ledger (docs/apidog-import/evidence.md).
// Literal scanning only: reads members out of the installed app.asar by offset, never executes Apidog code.
// Usage: node docs/apidog-import/tools/scan-import-evidence.cjs [--no-asar-hash]
// Output: docs/apidog-import/evidence/raw/import-evidence-facts.json (gitignored).
'use strict';
const fs = require('fs'), path = require('path'), crypto = require('crypto');

const root = path.resolve(__dirname, '..');
const inventoryPath = path.resolve(root, '../apidog-search/evidence/raw/asar-inventory.json');
const outDir = path.join(root, 'evidence/raw');
const outFile = path.join(outDir, 'import-evidence-facts.json');
const EXCERPT_MAX = 200;

const M = {
  R94743: 'dist/renderer/94743.05826374.async.js',
  R20401: 'dist/renderer/20401.291e096a.async.js',
  R97494: 'dist/renderer/97494.27877be7.async.js',
  R11113: 'dist/renderer/11113.3c03cee9.async.js',
  R89626: 'dist/renderer/89626.5362d10e.async.js',
  RIDX: 'dist/renderer/index.a796567fc5ca9bd8.js',
  LOC: 'dist/renderer/locale.en-US.7f650682917bf2b5.js',
  PRELOAD: 'dist/preload.main-window.js',
};

// [id, topic, memberKey, anchor (literal), excerptLength, statement]
// The excerpt starts at the anchor and is capped at EXCERPT_MAX characters.
const FACTS = [
  // --- Q1 format detection and parsing order
  ['F01', 'format', 'R94743', 'o=e=>{let t=e.trim();if(!t)return;let r=(0,a.kL)(t);if(r.parsed){for(let[e,t]of i)if(t(r.value))return e;return}', 200,
    'Source-format auto-detection tries JSON.parse first and runs an ordered detector list (OpenAPI first); only if JSON fails does it try SoapUI XML, then YAML when the text contains "openapi"/"swagger".'],
  ['F02', 'format', 'R94743', 'l=e=>!!a(e)&&("string"==typeof e.openapi||"string"==typeof e.swagger||"string"==typeof e.swaggerVersion)', 120,
    'A parsed document counts as OpenAPI/Swagger when openapi, swagger, or swaggerVersion is a string.'],
  ['F03', 'format', 'R94743', 'r=function(e){try{return JSON.parse(e)}catch(r){try{var t=e.replace(/[\\n|^] +/g,"");return JSON.parse(t)}', 160, //  : the packed regex contains a literal NBSP
    'Converter parse step: JSON.parse, then a retry after removing newline-plus-U+00A0 (non-breaking space) runs, before other formats.'],
  ['F04', 'format', 'R94743', 'p().parseStringPromise(t,{tagNameProcessors:[p().processors.stripPrefix]', 110,
    'After JSON fails, the converter tries XML (xml2js-style parseStringPromise) and then YAML.'],
  ['F05', 'format', 'R94743', 'throw(0,f.oV)(SyntaxError("Specification is not a valid YAML. ".concat(e)),i.hW.PARSE_ERROR)', 110,
    'YAML parse failures surface as "Specification is not a valid YAML." with PARSE_ERROR cause.'],
  ['F06', 'format', 'R94743', 'var n="Invalid format. Input must be in JSON YAML or XML format."', 140,
    'Final parse failure message when JSON, XML and YAML all fail.'],
  ['F07', 'format', 'R94743', 'for(var t=["post","patch","put","delete"],n=0;n<t.length;n++)', 170,
    'JSON input: empty requestBody objects on post/patch/put/delete are deleted before conversion.'],
  ['F08', 'format', 'R94743', 'if(!(n=r.openapi||r.swagger||r.swaggerVersion)){e.next=13;break}if(!(s()(n,"3.0")>=0))', 200,
    'Version classification uses a version comparison on openapi||swagger||swaggerVersion: >=3.0 openapi_3, >=2.0 swagger_2, >=1.0 swagger_1.'],
  ['F09', 'format', 'R94743', 'p.convertObj(o,{appNameLower:(0,n.fj)(),warnOnly:!0,patch:!0})', 140,
    'Swagger 2.0 is upgraded to OpenAPI 3 with a swagger2openapi-style convertObj (warnOnly, patch); a non-root basePath is kept as x-basePath without trailing slash.'],
  ['F10', 'format', 'R94743', 'v.convert({from:s,to:"openapi_3",source:o})', 80,
    'Other legacy versions (e.g. swagger_1) go through a generic converter to openapi_3.'],
  ['F11', 'format', 'R94743', 'this.contentVersion=(null==(i=a)?void 0:i.openapi)', 200,
    'After conversion, a document with no version field and no paths is rejected as an invalid converted document.'],
  ['F12', 'format', 'R94743', 'if(r)return!("openapi"in r)&&!("swagger"in r)&&!("swaggerVersion"in r)&&!("paths"in r);', 200,
    'Pre-validation: content lacking openapi/swagger/swaggerVersion/paths (JSON keys or YAML top-level keys) is reported as not an OpenAPI document.'],
  ['F13', 'format', 'R94743', 'let c=[".html",".htm"],d=[".json",".yaml",".yml"]', 60,
    'Accepted OpenAPI file extensions are .json/.yaml/.yml; .html/.htm are rejected.'],
  ['F14', 'format', 'R94743', 'if(i.includes("text/html")||c.some(e=>n.endsWith(e))', 200,
    'HTML files (MIME, extension, or leading doctype/html/body tag) are rejected with the invalidOpenApiHtmlFile message.'],
  ['F15', 'format', 'R94743', 'kind:"reroute",detectedFormatLabel:e,targetImportFormat:n', 120,
    'If the content is detected as another supported format (Postman, HAR, ...), the OpenAPI flow offers a reroute instead of failing.'],
  // --- Q2 $ref resolution
  ['F20', 'ref', 'R94743', '{key:"getRefObject",value:function(e,t){if(!e||"string"!=typeof e)return null;var r=e.split("/").slice(1).map(function(e){return decodeURIComponent(e.replace(/~1/g,"/").replace(/~0/g,"~"))});', 200,
    'Internal refs are resolved by a local JSON-pointer walk with ~1/~0 unescaping and URI decoding.'],
  ['F21', 'ref', 'R94743', 'Error reading ".concat(e,". Can only use references from components and paths")', 120,
    'Internal pointer lookup only accepts refs under components or paths; others log a warning and resolve to null.'],
  ['F22', 'ref', 'R94743', 'return n?n.$ref?this.getRefObject(n.$ref):n:(console.warn("ref ".concat(e," not found.")),null)', 110,
    'Chained refs are followed recursively; missing targets warn "ref ... not found." and yield null (no visible cycle guard in this helper).'],
  ['F23', 'ref', 'R94743', 'id:"#/components/".concat(r,"/").concat(e),jsonSchema:a', 70,
    'components.schemas and requestBodies become stored data schemas keyed by their JSON-pointer id; the schema JSON is kept as-is (refs are not inlined).'],
  ['F24', 'ref', 'R94743', 'var l=function(e,t){var r=arguments.length>2&&void 0!==arguments[2]?arguments[2]:[],n=t[e];return!r.includes(n)', 170,
    'requestBody ref aliases are collapsed through a visited list that stops on cycles.'],
  ['F25', 'ref', 'R94743', 'async replaceRefs(e,t,r){', 200,
    'YAML-URL imports use a ref replacer that fetches non-# $ref targets relative to the document URL.'],
  ['F26', 'ref', 'R94743', '(this.isSchemasUrl(e)||this.isSchemaObject(t))&&r?(n[s]={$ref:`${"#/components/schemas/"+r}`},this.schemas[r]=t):n[s]=t', 130,
    'Fetched external schema files are hoisted into components.schemas under the file name and replaced by an internal ref; other targets are inlined.'],
  ['F27', 'ref', 'R94743', 'return await this.concurrencyLimit(a,2),n', 50,
    'External ref fetches in the YAML-URL replacer run with concurrency 2.'],
  ['F28', 'ref', 'R94743', 'let t=e.match(/https:\\/\\/github\\.com\\/([^/]+\\/[^/]+)\\/blob\\/(.+)/);', 200,
    'GitHub blob URLs are rewritten to raw.githubusercontent.com before fetching.'],
  ['F29', 'ref', 'R94743', 'let i={maxDocuments:200,maxTotalBytes:0x6400000,requestTimeoutMs:3e4,totalTimeoutMs:3e5}', 160,
    'External-ref resolution budget: 200 documents, 0x6400000 bytes (100 MiB), 30 s per request, 300 s total; overridable from localStorage key openApiExternalRefResolutionLimits.'],
  ['F30', 'ref', 'R94743', 'super({message:`OpenAPI external reference resolution failed: ${e.reason}`,type:"externalRefResolutionFailed"', 140,
    'Budget violations raise ExternalRefResolutionError with reasons documentLimitExceeded/totalBytesExceeded/requestTimeout/totalTimeout/cancelled.'],
  ['F31', 'ref', 'R20401', '"$ref"!==e||"string"!=typeof t||t.startsWith("#")?m(t):d.push(t)', 120,
    'The source-preparation walker collects only non-fragment $ref strings, using a WeakSet to avoid revisiting objects.'],
  ['F32', 'ref', 'R20401', 'throw iB(a,Error("Only same-origin HTTP(S) external refs are supported"))', 100,
    'External refs must be HTTP(S) and same-origin as the root URL; each URL is fetched once (Set of visited hrefs).'],
  ['F33', 'ref', 'R20401', 'if(t.origin!==o)throw Error("External ref redirected to a different origin")', 90,
    'A redirect that leaves the root origin fails the external ref.'],
  // --- Q3 tags/paths -> folders
  ['F40', 'folders', 'RIDX', 'b="Apidog",A="apidog"', 40,
    'Build constants: appName "Apidog", appNameLower "apidog".'],
  ['F41', 'folders', 'R94743', 'expandFolderName:"x-".concat(e,"-folder")', 60,
    'Vendor extension keys are derived from the app name: x-<app>-folder, x-<app>-status, x-<app>-name, etc.'],
  ['F42', 'folders', 'R94743', 'appName:u.A3,appRegion:u.Gi', 60,
    'The converter context receives appNameLower, so the folder extension is x-apidog-folder in this build (default fallback in the library is "apifox").'],
  ['F43', 'folders', 'R94743', 'h=d[N.AppExpendKeys.folder],y=function(){var e=h||N.getFolderName(d.tags);return e?String(e):e}()', 110,
    'Endpoint folder = operation x-apidog-folder if present, else derived from tags.'],
  ['F44', 'folders', 'R94743', '{key:"getFolderName",value:function(e){if(e&&e.length>0&&"string"==typeof e[0])return e[0]=e[0].split("/").map(function(e){return e.trim()}).join("/"),e[0]}}', 170,
    'Tag-derived folder uses only the first tag, trimming each slash-separated segment.'],
  ['F45', 'folders', 'R94743', '(g=y.split("/")).forEach(function(e,t){var n=t>0?$(g,0,t+1).join("/"):e;', 200,
    'Folder strings split on "/" create every ancestor folder (cumulative prefixes); folders are matched by full path name.'],
  ['F46', 'folders', 'R94743', 'u=new r({name:(0,n.hw)({id:"defaultFolder"}),auth:(0,h.Vu)(t.security)', 120,
    'A root default folder is created with auth derived from the document-level security.'],
  ['F47', 'folders', 'R94743', '}else u.addItem(v.apiDetail);', 30,
    'Operations with no folder (no extension, no tags) go into the default root folder.'],
  ['F48', 'folders', 'R94743', 'if(f=n.toLowerCase(),!p.has(f)){e.next=5;break}', 60,
    'Methods are lowercased and de-duplicated per path item.'],
  ['F49', 'folders', 'R94743', '[OpenAPI] Unsupported HTTP method "', 140,
    'additionalOperations (OAS 3.2) are imported only for known methods; others warn and are skipped.'],
  ['F50', 'folders', 'R94743', 'o=t.paths,s=t.webhooks', 30,
    'Both paths and webhooks are converted (webhooks flagged as type webhook).'],
  ['F51', 'folders', 'R94743', '{key:"formatFolderName",value:function(e){var t=this;e.forEach(function(e){var r=e.name.split("/");r.length>1&&(e.name=r.pop())', 160,
    'After tree building, each folder keeps only its last path segment as display name.'],
  ['F52', 'folders', 'R94743', '{key:"handleApiName",value:function(e,t){var r,n,i=e.summary,o=e.operationId,s=e.description', 200,
    'Endpoint name = summary, then operationId / description first line / path depending on apiNameExtractMethod; truncated to 255 chars.'],
  ['F53', 'folders', 'R94743', 'P.tags=e.tags,P.status=e.deprecated?s.pQ.deprecated:e[d.expansionKeys.expandStatusName],P.operationId=e.operationId', 120,
    'All operation tags are kept as endpoint tags; deprecated maps to status; operationId is retained.'],
  ['F54', 'folders', 'R94743', 'switch(r){case"schemas":default:l="Schemas";break;case"responses":l="Response";break;case"requestBodies":l="RequestBodies"}', 120,
    'Schemas default to a "Schemas" folder unless the schema carries x-apidog-folder.'],
  ['F55', 'folders', 'R94743', 'e.url&&r.push(new t({baseUrls:{default:e.url},name:e.description||e.url', 80,
    'Each servers[] entry becomes an environment candidate named by description or URL.'],
  ['F56', 'folders', 'R94743', 'name:(null==(t=n)||null==(t=t.info)?void 0:t.title)||""', 70,
    'info.title becomes the module/import title.'],
  // --- Q4 URL import transport
  ['F60', 'url', 'R94743', 'a=n.xl?await (0,l.A)(e,t,{...r,requestAttemptTransport:"desktop"}):await (0,u.A)(e,t,r)', 110,
    'URL fetch transport is chosen in the renderer: desktop builds use the in-renderer HTTP client; web uses another path.'],
  ['F61', 'url', 'R94743', 'o.defaults.validateStatus=e=>e>=200&&e<300||401===e,o.defaults.headers.common={"Cache-Control":"no-cache"', 140,
    'The desktop client is an axios-style instance created in the renderer: accepts 2xx and 401, sends no-cache headers, no timeout configured in this module.'],
  ['F62', 'url', 'R94743', 't=e.replace(/\\/swagger-ui\\.html([#|?].*)?$/,"/v2/api-docs")', 90,
    'For OpenAPI URL imports a swagger-ui.html URL is rewritten to /v2/api-docs.'],
  ['F63', 'url', 'R94743', 'let r=new URL(e).origin,n=`${r}/openapi.json`,a=`${r}/v2/swagger.json`;', 80,
    'If an OpenAPI URL returns HTML, the first body a[href] is followed; otherwise origin/openapi.json and origin/v2/swagger.json are probed.'],
  ['F64', 'url', 'R94743', 'if(401===l.status||403===l.status)throw new d.Yw({message:(0,a.hw)({id:"import.message.authorizeError"})', 150,
    '401/403 map to an authorization error; >=400 to "Request failed with status N".'],
  ['F65', 'url', 'R94743', 'let M=r;m&&n.xl&&(r+=`${r.includes("?")?"&":"?"}needIgnoreCertificate=${m}`);try{b(x),l=await g(M,r,_)}', 120,
    'Desktop builds derive a second URL with needIgnoreCertificate=<type>; the fetch helper tries the original URL first and the processed URL only after a failure.'],
  ['F66', 'url', 'R94743', 'throw new d.Yw({message:(0,a.hw)({id:"import.message.localFileNotSupportedInWeb"})', 110,
    'file:// URLs and local paths in the URL field are rejected (file import must be used).'],
  ['F67', 'url', 'R94743', 'if(!/^https?:\\/\\//i.test(n))return u((0,a.hw)({id:"import.message.invalidOpenApiUrlProtocol"})', 120,
    'OpenAPI URL precheck requires http(s); URLs ending in .html/.htm (except swagger-ui.html) are rejected.'],
  ['F68', 'url', 'R20401', 'x=/(?:swagger|openapi|api-docs)|\\.ya?ml(?:[?#]|$)/i.test(y)', 70,
    'The import dialog treats URLs containing swagger/openapi/api-docs or ending .yaml/.yml as OpenAPI (YAML URLs use the ref replacer).'],
  ['F69', 'url', 'R94743', 'g.includes("timeout")?`${(0,i.hw)({id:"import.message.networkTimeout"})}', 120,
    'Network errors whose message contains "timeout" are reported as networkTimeout plus checkUrlAccessError.'],
  ['F70', 'url', 'R94743', 'if("number"==typeof t&&void 0!==n&&n>t)return n;', 120,
    'Response-size guard compares content-length (and measured body) against an optional maxResponseBytes.'],
  ['F71', 'url', 'PRELOAD', 'd="electronAPI:dialog:showOpen"', 40,
    'The only file-related preload channel observed is a generic dialog invoke (electronAPI.dialog.showOpenDialog); no import/fetch-specific channel was found.'],
  // --- Q7 file ingress
  ['F75', 'ingress', 'R20401', 'let i=e.filter(e=>!e.name.startsWith("."));if(!t&&i.length>1)', 90,
    'Dropped/selected files: dot-files are ignored; more than one file (outside folder mode) is rejected.'],
  ['F76', 'ingress', 'R20401', 'tC=0xc800000', 20,
    'Local file import size cap is 0xc800000 bytes (200 MiB); the message is rendered with maxSize:200.'],
  ['F77', 'ingress', 'R20401', 'let i=new FileReader;i.onload=()=>e("string"==typeof i.result?i.result:"")', 110,
    'Files are read in the renderer with FileReader.readAsText.'],
  ['F78', 'ingress', 'R20401', 'webkitdirectory:"",directory:""', 40,
    'The import dialog has a hidden file input and a hidden folder input (webkitdirectory).'],
  ['F79', 'ingress', 'R20401', 'let t=e.webkitGetAsEntry?.();return t?[t]:[]', 60,
    'Drop handling walks DataTransfer entries (directories via createReader/readEntries).'],
  ['F80', 'ingress', 'R94743', 'label:"OpenAPI/Swagger",value:c.b.OpenApi.valueOf(),Convertor:sM(c.b.OpenApi.valueOf()),supportUrlImport:!0,supportBasicAuth:!0,supportGitImport:!0', 160,
    'OpenAPI/Swagger format supports URL import, basic auth, and Git import; it does not declare folder import.'],
  ['F81', 'ingress', 'R94743', 'case"openapi":return new nG(t,r);', 40,
    'Conversion is dispatched in-process in the renderer by format name.'],
  ['F82', 'ingress', 'R97494', '"data-testid":"openapi-import-dragger"', 60,
    'Spec-mode OpenAPI import uses a drag-and-drop dragger with a select-file button.'],
  ['F83', 'ingress', 'R97494', 'function p(e){try{return JSON.parse(e)}catch{return i.Ay.load(e)}}', 70,
    'Spec-mode import parses JSON then YAML and stores the raw file (versions 2.0 / 3.0.x / 3.1.x recognized).'],
  // --- Q5 re-import / preview / commit
  ['F90', 'reimport', 'R20401', '(0,i.jsx)(rs,{value:"methodAndPath",children:(0,o.hw)({id:"importData.api.overwriteMode.cover"})})', 200,
    'Endpoint overwrite mode options: methodAndPath (Overwrite), merge, OVERWRITE_SELECTED_FIELDS (OpenAPI only), ignore, both; importAsEndpointCase is Postman-only.'],
  ['F91', 'reimport', 'R20401', 'let ro="methodAndPath";function rl({currentBranchId:e,importFormat:t}){if(e!==(0,f.sI)())return ro;', 150,
    'Default endpoint overwrite mode is methodAndPath; the last used mode is remembered; OVERWRITE_SELECTED_FIELDS falls back for non-OpenAPI formats.'],
  ['F92', 'reimport', 'R20401', 'deleteUnmatchedResources:!1,apiOverwriteMode:rl(', 60,
    'Manual import defaults: deleteUnmatchedResources false; docOverwriteMode name; apiNameExtractMethod OPERATION_ID.'],
  ['F93', 'reimport', 'R20401', 'importSecurityScheme:!0,setProjectAuthAsRootSecurity:', 60,
    'Security import defaults: importSecurityScheme true; securityAuthMode "security"; noSecurityAuthMode "inherit".'],
  ['F94', 'reimport', 'R20401', '{value:"methodAndPathAndFolder",label:', 120,
    'Folder-level identity UI offers methodAndPath, methodAndPathAndFolder, ignore, and (for importData) both; labels depend on the identity pattern type (methodAndPath, operationId, query, header, body).'],
  ['F95', 'reimport', 'R20401', 'checkable:!0,checkStrictly:!0,autoExpandParent:!0', 80,
    'Preview is a checkable virtual tree; only checked keys are kept in the submitted specification.'],
  ['F96', 'reimport', 'R20401', 'return t/1048576<100', 30,
    'The converted import payload must be under 100 MB (JSON blob size) unless a build flag disables the check.'],
  ['F97', 'reimport', 'R20401', 'tI({importFormat:V,importFullPath:w,importEnvironment:te(e,Q),basePath:C?eR:void 0', 120,
    'Commit sends the converted specification plus all mode options (overwrite modes, folders, syncApiFolder, deleteUnmatchedResources, security options) in one request.'],
  ['F98', 'reimport', 'RIDX', 'n.Ay.post("/api/v1/import-data",{...s,data:e,getResponse:!0', 80,
    'The commit endpoint is POST /api/v1/import-data on the Apidog backend.'],
  ['F99', 'reimport', 'R89626', '{title:(0,o.hw)({id:"importData.result.create"}),dataIndex:"createCount"', 140,
    'Result table columns: Type, Created, Updated, plus No Change and Ignored only when non-zero.'],
  ['F100', 'reimport', 'R11113', 'apiOverwriteMode:(t=(0,J.$c)(),t?t:"methodAndPath"),schemaOverwriteMode:(i=(0,J.uQ)(),i?i:"name")', 140,
    'Scheduled auto-import (data source binding) has the same mode fields plus interval 180 and deleteUnmatchedResources false by default.'],
  // --- Q6 security
  ['F110', 'security', 'R94743', '{key:"convertSecurityScheme",value:function(e){', 120,
    'components.securitySchemes are converted into security-scheme records (default folder unless x-apidog-folder).'],
  ['F111', 'security', 'R94743', 'authType:t.formatAuthType(r),oasAuthType:r.type,authConfigs:r', 70,
    'Each scheme keeps the original OAS object (authConfigs) and type, plus a derived authType (apikey, bearer, awsv4, hawk, edgegrid, ...).'],
  // --- Locale strings (en-US)
  ['L01', 'locale', 'LOC', '"importData.overwriteMode.cover":"', 140, 'Overwrite mode labels: Overwrite, Merge, Ignore, Keep Both.'],
  ['L02', 'locale', 'LOC', '"importData.api.overwriteMode.mergeTip":"', 120, 'Merge keeps modified Mock, Description, Request/Response Examples.'],
  ['L03', 'locale', 'LOC', '"importData.overwriteMode.overwriteSelectedFields":"', 140, 'Overwrite Selected Fields option and tip.'],
  ['L04', 'locale', 'LOC', '"importData.api.overwriteMode.methodAndPath.ignore":"', 200, 'method & path matching phrasing (ignore / overwrite / keep both / and folder).'],
  ['L05', 'locale', 'LOC', '"importData.api.syncFolder.title":"', 200, 'Folder sync choice when the same endpoint lives in a different folder.'],
  ['L06', 'locale', 'LOC', '"importData.deleteUnmatchedResources.title":"', 200, 'Delete-unmatched choice text.'],
  ['L07', 'locale', 'LOC', '"importData.result.create":"', 120, 'Result labels Created / Updated / No Change / Ignored.'],
  ['L08', 'locale', 'LOC', '"import.importFormatDetailModal.title":"', 150, 'Preview modal title and tab.'],
  ['L09', 'locale', 'LOC', '"manualImport.OpenAPITips":"', 90, 'Supported OpenAPI versions statement.'],
  ['L10', 'locale', 'LOC', '"importV2.error.fileTooLarge":"', 120, 'File size error text.'],
  ['L11', 'locale', 'LOC', '"import.message.notOpenApiDocument":"', 170, 'Not-an-OpenAPI-document error text.'],
  ['L12', 'locale', 'LOC', '"projectImport.maintenanceMode.sourcePreparation.documentLimit.description":"', 160, 'External-ref document limit text.'],
  ['L13', 'locale', 'LOC', '"importData.securityScheme.securityAuthMode":"', 120, 'Security import option text.'],
  ['L14', 'locale', 'LOC', '"importData.api.name.extract.method":"', 130, 'Endpoint name extraction option text.'],
  ['L15', 'locale', 'LOC', '"importData.api.importBasePath.openapi":"', 130, 'basePath-from-servers option text.'],
  ['L16', 'locale', 'LOC', '"importV2.error.http":"', 100, 'HTTP error text for URL import.'],
  ['L17', 'locale', 'LOC', '"importData.api.overwriteMode.operationId.name":"', 80, 'operationId identity phrasing.'],
];

function sha256File(file) {
  const h = crypto.createHash('sha256'); const fd = fs.openSync(file, 'r'); const buf = Buffer.alloc(8 << 20);
  let n; while ((n = fs.readSync(fd, buf, 0, buf.length, null)) > 0) h.update(buf.subarray(0, n));
  fs.closeSync(fd); return h.digest('hex');
}

function moduleIdAt(text, offset) {
  const re = /[,{](\d{1,7}):function\(\w,\w,\w\)\{/g; let m, last = null;
  while ((m = re.exec(text)) && m.index < offset) last = m[1];
  return last;
}

function main() {
  const inv = JSON.parse(fs.readFileSync(inventoryPath, 'utf8'));
  const stat = fs.statSync(inv.source);
  const fd = fs.openSync(inv.source, 'r');
  const members = {};
  for (const [key, p] of Object.entries(M)) {
    const f = inv.files.find(x => x.path === p && !x.unpacked && !x.link);
    if (!f) throw new Error(`member not in inventory: ${p}`);
    const buf = Buffer.alloc(f.size); fs.readSync(fd, buf, 0, f.size, inv.data_offset + Number(f.offset));
    members[key] = { path: p, size: f.size, asar_offset: inv.data_offset + Number(f.offset), sha256: crypto.createHash('sha256').update(buf).digest('hex'), buf, text: buf.toString('utf8') };
  }
  fs.closeSync(fd);

  const facts = []; const missing = [];
  for (const [id, topic, key, anchor, len, statement] of FACTS) {
    const mem = members[key]; const t = mem.text; const at = t.indexOf(anchor);
    if (at < 0) { missing.push({ id, member: mem.path, anchor }); continue; }
    let occurrences = 0; for (let i = t.indexOf(anchor); i >= 0; i = t.indexOf(anchor, i + 1)) occurrences++;
    const excerpt = t.slice(at, at + Math.min(len, EXCERPT_MAX));
    const byteOffset = Buffer.byteLength(t.slice(0, at), 'utf8');
    facts.push({
      id, topic, statement, member: mem.path, utf16_offset: at, member_byte_offset: byteOffset,
      asar_byte_offset: mem.asar_offset + byteOffset, webpack_module: key === 'LOC' || key === 'PRELOAD' ? null : moduleIdAt(t, at),
      anchor_occurrences: occurrences, excerpt,
    });
  }

  const report = {
    scope: 'literal scan of selected packed members; no execution of Apidog code',
    generated_at: new Date().toISOString(),
    asar: { path: inv.source, size: stat.size, sha256: process.argv.includes('--no-asar-hash') ? null : sha256File(inv.source) },
    members: Object.fromEntries(Object.entries(members).map(([k, m]) => [k, { path: m.path, size: m.size, asar_offset: m.asar_offset, sha256: m.sha256 }])),
    excerpt_max_chars: EXCERPT_MAX, facts, missing,
  };
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2));
  console.log(`facts: ${facts.length}, missing anchors: ${missing.length} -> ${path.relative(process.cwd(), outFile)}`);
  for (const x of missing) console.log('MISSING', x.id, x.member, x.anchor.slice(0, 80));
  if (missing.length) process.exitCode = 1;
}

main();
