'use strict';
const http=require('node:http');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const R=require('./roster.js');
const digest=value=>crypto.createHash('sha256').update(value).digest('hex');
const token=()=>crypto.randomBytes(24).toString('base64url');
const safeEqual=(a,b)=>typeof a==='string'&&typeof b==='string'&&a.length===b.length&&crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
function createExamServer({dataDir,managerCode,publicOrigin,trustProxy=false}={}){
  if(typeof managerCode!=='string'||managerCode.length<24)throw Error('Set MANAGER_CODE to a random secret of at least 24 characters.');
  if(publicOrigin&&!/^https?:\/\/[^/]+$/.test(publicOrigin))throw Error('PUBLIC_ORIGIN must be an origin without a trailing slash.');
  const directory=path.resolve(dataDir||path.join(__dirname,'.data'));
  fs.mkdirSync(directory,{recursive:true,mode:0o700});
  const dataFile=path.join(directory,'roster-private.json'),sessions=new Map(),failures=new Map();
  let state={revision:0,session:'',updatedAt:null,rows:[],teacherCodes:{}};
  if(fs.existsSync(dataFile)){
    state=JSON.parse(fs.readFileSync(dataFile,'utf8'));
    if(!Number.isSafeInteger(state.revision)||state.revision<0||typeof state.session!=='string'||!state.teacherCodes||!Array.isArray(state.rows))throw Error('Stored roster is invalid. Restore a known backup before starting.');
    if(state.rows.length){const checked=R.validateRows(state.rows);if(checked.issues.length)throw Error('Stored roster has invalid rows.');state.rows=checked.rows;}
  }
  function persist(next){
    const temp=dataFile+'.'+crypto.randomUUID()+'.tmp';
    try{const fd=fs.openSync(temp,'wx',0o600);try{fs.writeFileSync(fd,JSON.stringify(next));fs.fsyncSync(fd);}finally{fs.closeSync(fd);}fs.renameSync(temp,dataFile);state=next;}
    finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}
  }
  const types={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.txt':'text/plain; charset=utf-8'};
  const files=new Set(['index.html','styles.css','content.js','core.js','roster.js','roster-ui.js','app.js','vendor/xlsx.full.min.js','vendor/SHEETJS-LICENSE.txt']);
  function json(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
  function body(req){return new Promise((resolve,reject)=>{let size=0,parts=[];req.on('data',chunk=>{size+=chunk.length;if(size>6*1024*1024){parts=[];reject(Object.assign(Error('Request too large.'),{status:413}));}else parts.push(chunk);});req.on('end',()=>{if(size>6*1024*1024)return;try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch{reject(Object.assign(Error('Invalid JSON request.'),{status:400}));}});req.on('error',reject);});}
  const server=http.createServer(async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('X-Frame-Options','DENY');
    res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    const origin=publicOrigin||`http://${req.headers.host}`,secure=origin.startsWith('https:');
    if(secure)res.setHeader('Strict-Transport-Security','max-age=31536000');
    const cookieName=secure?'__Host-exam-session':'exam-session';
    const setCookie=value=>res.setHeader('Set-Cookie',`${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value?43200:0}${secure?'; Secure':''}`);
    try{
      const url=new URL(req.url,origin),api=url.pathname.startsWith('/api/');
      if(!api){
        if(!['GET','HEAD'].includes(req.method))return json(res,405,{error:'Method not allowed.'});
        const file=url.pathname==='/'?'index.html':decodeURIComponent(url.pathname.slice(1));
        if(!files.has(file))return json(res,404,{error:'Not found.'});
        res.writeHead(200,{'Content-Type':types[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});
        return res.end(req.method==='HEAD'?undefined:fs.readFileSync(path.join(__dirname,file)));
      }
      const now=Date.now();
      for(const [id,s] of sessions)if(s.expires<=now)sessions.delete(id);
      for(const [ip,f] of failures)if(f.until<=now)failures.delete(ip);
      if(req.method!=='GET'){
        if(req.headers.origin!==origin||req.headers['x-exam-request']!=='1'||!String(req.headers['content-type']||'').startsWith('application/json'))return json(res,403,{error:'This request must come from the exam app.'});
      }
      const sessionId=(req.headers.cookie||'').split(';').map(x=>x.trim()).find(x=>x.startsWith(cookieName+'='))?.slice(cookieName.length+1);
      let user=sessionId?sessions.get(digest(sessionId)):null;
      if(user?.role==='teacher'&&!state.rows.some(r=>R.normalize(r.teacher)===user.teacherKey))user=null;
      if(url.pathname==='/api/login'&&req.method==='POST'){
        const ip=trustProxy?String(req.headers['x-forwarded-for']||req.socket.remoteAddress).split(',').at(-1).trim():req.socket.remoteAddress;
        if((failures.get(ip)?.count||0)>=20)return json(res,429,{error:'Too many unsuccessful sign-ins. Try again in 10 minutes.'});
        const input=await body(req);if(!input||!['manager','teacher'].includes(input.role)||typeof input.code!=='string'||input.code.length>256)return json(res,400,{error:'Enter your access code.'});
        const hash=digest(input.code.trim());let teacherKey;
        const valid=input.role==='manager'?safeEqual(hash,digest(managerCode)):(teacherKey=Object.keys(state.teacherCodes).find(k=>safeEqual(state.teacherCodes[k],hash)));
        if(!valid){if(failures.size>=10000)failures.delete(failures.keys().next().value);const old=failures.get(ip);failures.set(ip,{count:(old?.count||0)+1,until:old?.until||now+600000});return json(res,401,{error:'The access code is not correct.'});}
        if(input.role==='teacher'&&!state.rows.some(r=>R.normalize(r.teacher)===teacherKey))return json(res,403,{error:'No roster is currently assigned to this teacher.'});
        if(sessions.size>=10000)return json(res,503,{error:'Too many active sessions. Try again later.'});
        const secret=token();user={role:input.role,teacherKey:teacherKey||'',expires:now+43200000};sessions.set(digest(secret),user);setCookie(secret);return json(res,200,{role:user.role,teacher:state.rows.find(r=>R.normalize(r.teacher)===teacherKey)?.teacher||''});
      }
      if(!user)return json(res,401,{error:'Sign in to access the shared roster.'});
      if(url.pathname==='/api/me'&&req.method==='GET')return json(res,200,{role:user.role,teacher:state.rows.find(r=>R.normalize(r.teacher)===user.teacherKey)?.teacher||''});
      if(url.pathname==='/api/logout'&&req.method==='POST'){sessions.delete(digest(sessionId));setCookie('');return json(res,200,{ok:true});}
      if(url.pathname==='/api/roster'&&req.method==='GET')return json(res,200,{revision:state.revision,session:state.session,updatedAt:state.updatedAt,rows:user.role==='manager'?state.rows:state.rows.filter(r=>R.normalize(r.teacher)===user.teacherKey)});
      if(user.role!=='manager')return json(res,403,{error:'Only a manager can change the roster or teacher access codes.'});
      if(url.pathname==='/api/roster'&&req.method==='PUT'){
        const input=await body(req);if(input?.expectedRevision!==state.revision)return json(res,409,{error:'Another manager changed the roster. Refresh and review before publishing again.'});
        if(typeof input.session!=='string'||!input.session.trim()||input.session.length>100)return json(res,400,{error:'Enter an exam session name of 1–100 characters.'});
        let checked;try{checked=R.validateRows(input.rows);}catch(error){return json(res,400,{error:error.message});}
        if(checked.issues.length)return json(res,400,{error:checked.issues.slice(0,10).join('\n')});
        const teacherKeys=new Set(checked.rows.map(r=>R.normalize(r.teacher))),teacherCodes=Object.fromEntries(Object.entries(state.teacherCodes).filter(([k])=>teacherKeys.has(k)));
        persist({revision:state.revision+1,session:input.session.trim(),updatedAt:new Date().toISOString(),rows:checked.rows,teacherCodes});
        for(const [id,s] of sessions)if(s.role==='teacher'&&!teacherKeys.has(s.teacherKey))sessions.delete(id);
        return json(res,200,{revision:state.revision,session:state.session,updatedAt:state.updatedAt,rows:state.rows});
      }
      if(url.pathname==='/api/teachers'&&req.method==='GET')return json(res,200,{teachers:[...new Map(state.rows.map(r=>[R.normalize(r.teacher),r.teacher])).entries()].map(([key,teacher])=>({teacher,hasCode:!!state.teacherCodes[key]}))});
      if(url.pathname==='/api/teacher-code'&&req.method==='POST'){
        const input=await body(req),key=R.normalize(input?.teacher);
        if(!state.rows.some(r=>R.normalize(r.teacher)===key))return json(res,400,{error:'Choose a teacher from the published roster.'});
        const code=token();persist({...state,teacherCodes:{...state.teacherCodes,[key]:digest(code)}});
        for(const [id,s] of sessions)if(s.role==='teacher'&&s.teacherKey===key)sessions.delete(id);
        return json(res,200,{teacher:state.rows.find(r=>R.normalize(r.teacher)===key).teacher,code});
      }
      return json(res,404,{error:'Not found.'});
    }catch(error){json(res,error.status||500,{error:error.status?error.message:'The server could not complete this request. No successful save was confirmed.'});}
  });
  server.requestTimeout=30000;server.headersTimeout=10000;
  return server;
}
module.exports={createExamServer};
if(require.main===module){
  const port=Number(process.env.PORT||8766),host=process.env.HOST||'127.0.0.1';
  const publicOrigin=process.env.PUBLIC_ORIGIN||process.env.RENDER_EXTERNAL_URL;
  if(process.env.NODE_ENV==='production'&&!publicOrigin?.startsWith('https://'))throw Error('Production requires an HTTPS PUBLIC_ORIGIN.');
  const server=createExamServer({dataDir:process.env.DATA_DIR,managerCode:process.env.MANAGER_CODE,publicOrigin,trustProxy:process.env.TRUST_PROXY==='1'});
  server.listen(port,host,()=>console.log(`Speaking exam server listening on ${host}:${port}`));
}
