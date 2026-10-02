const {test}=require('node:test');
const assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const fs=require('node:fs');
// Exercise the Worker's actual SQL against SQLite, matching D1's prepared-statement API.
function database(t){
  const db=new DatabaseSync(':memory:');for(const name of ['0001_roster.sql','0002_grades.sql'])db.exec(fs.readFileSync(require.resolve('../cloudflare/migrations/'+name),'utf8'));t.after(()=>db.close());
  const prepare=sql=>{let args=[];const statement={bind(...values){args=values;return statement;},async first(){return db.prepare(sql).get(...args)||null;},async all(){return {results:db.prepare(sql).all(...args)};},async run(){const before=db.prepare('SELECT total_changes() AS n').get().n;db.prepare(sql).run(...args);return {meta:{changes:db.prepare('SELECT total_changes() AS n').get().n-before}};}};return statement;};
  return {raw:db,prepare,async batch(statements){db.exec('BEGIN');try{const results=[];for(const s of statements)results.push(await s.run());db.exec('COMMIT');return results;}catch(e){db.exec('ROLLBACK');throw e;}}};
}
const managerCode='synthetic-manager-code-never-for-deployment';
function rows(count=400){return Array.from({length:count},(_,i)=>({teacher:`Teacher ${Math.floor(i/50)}`,className:`Class ${Math.floor(i/25)}`,studentName:`Student ${i}`,studentId:String(i).padStart(6,'0'),examDate:'2027-01-12',examTime:`${String(8+Math.floor((i%50)*5/60)).padStart(2,'0')}:${String((i%50)*5%60).padStart(2,'0')}`}));}
async function fixture(t){
  const worker=(await import('../cloudflare/worker.mjs')).default,DB=database(t),env={DB,MANAGER_CODE:managerCode,ASSETS:{fetch:async()=>new Response('public asset')}};
  async function req(route,method='GET',data,cookie='',extra={}){const result=await worker.fetch(new Request('https://exam.example'+route,{method,headers:{Origin:'https://exam.example','Content-Type':'application/json','X-Exam-Request':'1',Cookie:cookie,'CF-Connecting-IP':'192.0.2.1',...extra},body:data===undefined?undefined:JSON.stringify(data)}),env);return {status:result.status,headers:result.headers,cookie:result.headers.get('set-cookie')?.split(';')[0]||'',data:result.headers.get('content-type')?.includes('json')?await result.json():await result.text()};}
  const manager=await req('/api/login','POST',{role:'manager',code:managerCode});assert.equal(manager.status,200);return {req,env,worker,manager:manager.cookie};
}
test('Cloudflare stores 400 students and isolates eight teachers with leading-zero IDs',async t=>{
  const {req,manager}=await fixture(t);const roster=rows();
  assert.equal((await req('/api/roster','PUT',{expectedRevision:0,session:'2026–27 S1',rows:roster},manager)).status,200);
  for(let i=0;i<8;i++){
    const code=await req('/api/teacher-code','POST',{teacher:`Teacher ${i}`},manager);assert.equal(code.status,200);
    const teacher=await req('/api/login','POST',{role:'teacher',code:code.data.code});assert.equal(teacher.status,200);
    const own=await req('/api/roster','GET',undefined,teacher.cookie);assert.equal(own.data.rows.length,50);assert.ok(own.data.rows.every(r=>r.teacher===`Teacher ${i}`));assert.ok(own.data.rows.every(r=>r.studentId.length===6));
    assert.equal((await req('/api/teachers','GET',undefined,teacher.cookie)).status,403);
    assert.equal((await req('/api/roster','PUT',{expectedRevision:1,session:'bad',rows:roster},teacher.cookie)).status,403);
  }
  assert.equal((await req('/api/roster','GET',undefined,manager)).data.rows.length,400);
});
test('Cloudflare rejects invalid uploads and simultaneous stale publications atomically',async t=>{
  const {req,manager}=await fixture(t),roster=rows();
  const results=await Promise.all([req('/api/roster','PUT',{expectedRevision:0,session:'A',rows:roster},manager),req('/api/roster','PUT',{expectedRevision:0,session:'B',rows:roster},manager)]);
  assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
  assert.equal((await req('/api/roster','PUT',{expectedRevision:1,session:'bad',rows:[roster[0],roster[0]]},manager)).status,400);
  assert.equal((await req('/api/roster','PUT',{expectedRevision:1,session:'too many',rows:rows(1001)},manager)).status,400);
  assert.equal((await req('/api/roster','GET',undefined,manager)).data.rows.length,400);
});
test('Cloudflare revokes teacher sessions after rotation/removal and manager sessions after secret change',async t=>{
  const {req,manager,env}=await fixture(t);await req('/api/roster','PUT',{expectedRevision:0,session:'S1',rows:rows()},manager);
  const loginTeacher=async()=>{const code=(await req('/api/teacher-code','POST',{teacher:'Teacher 0'},manager)).data.code;return (await req('/api/login','POST',{role:'teacher',code})).cookie;};
  const first=await loginTeacher(),second=await loginTeacher();assert.equal((await req('/api/me','GET',undefined,first)).status,401);assert.equal((await req('/api/me','GET',undefined,second)).status,200);
  await req('/api/roster','PUT',{expectedRevision:1,session:'S1',rows:rows().filter(r=>r.teacher!=='Teacher 0')},manager);
  assert.equal((await req('/api/me','GET',undefined,second)).status,401);
  env.MANAGER_CODE='a-different-long-secret-for-test-only';assert.equal((await req('/api/me','GET',undefined,manager)).status,401);
});
test('Cloudflare enforces authentication, origin, private-file boundaries and secure cookies',async t=>{
  const {req,manager}=await fixture(t);
  for(const file of ['/server.cjs','/.dev.vars','/cloudflare/worker.mjs','/.data/roster-private.json','/wrangler.jsonc'])assert.equal((await req(file)).status,404);
  assert.equal((await req('/api/roster')).status,401);
  assert.equal((await req('/api/logout','POST',{},manager,{Origin:'https://evil.example'})).status,403);
  const login=await req('/api/login','POST',{role:'manager',code:managerCode});assert.match(login.headers.get('set-cookie'),/HttpOnly; SameSite=Strict; Max-Age=43200; Secure/);assert.match(login.cookie,/^__Host-/);
  assert.equal(login.headers.get('cache-control'),'no-store');
  await req('/api/logout','POST',{},login.cookie);assert.equal((await req('/api/me','GET',undefined,login.cookie)).status,401);
});
test('Cloudflare session expiry, persistent hashes, rate limits and scheduled cleanup',async t=>{
  const {req,env,worker,manager}=await fixture(t);
  assert.equal(JSON.stringify(env.DB.raw.prepare('SELECT * FROM sessions').all()).includes(managerCode),false);
  env.DB.raw.prepare('UPDATE sessions SET expires = 0').run();assert.equal((await req('/api/me','GET',undefined,manager)).status,401);
  for(let i=0;i<119;i++)assert.equal((await req('/api/login','POST',{role:'teacher',code:'bad'})).status,401);
  assert.equal((await req('/api/login','POST',{role:'teacher',code:'bad'})).status,429);
  env.DB.raw.prepare('UPDATE login_limits SET expires = 0').run();let job;worker.scheduled({},env,{waitUntil(p){job=p;}});await job;
  assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM sessions').get().n,0);assert.equal(env.DB.raw.prepare('SELECT count(*) AS n FROM login_limits').get().n,0);
});

const grade = (row,id='grade-001')=>({...row,id,session:'S1',contentVersion:'2.1',date:'2027-01-12T00:00:00Z',status:'graded',durationSeconds:240,scores:{fluency:2,pronunciation:3,contribution:3,accuracy:3},total:999,notes:'',questions:[]});
async function gradeFixture(t){const f=await fixture(t);await f.req('/api/roster','PUT',{expectedRevision:0,session:'S1',rows:rows()},f.manager);const code=(await f.req('/api/teacher-code','POST',{teacher:'Teacher 0'},f.manager)).data.code;f.teacher=(await f.req('/api/login','POST',{role:'teacher',code})).cookie;return f;}
test('shared grades recalculate totals, appear on another device, and stay private by teacher',async t=>{
 const {req,manager,teacher}=await gradeFixture(t),record=grade(rows()[0]);
 const saved=await req('/api/grades/'+record.id,'PUT',{record,expectedRevision:0,operationId:'save-operation-0001'},teacher);assert.equal(saved.status,200);assert.equal(saved.data.entry.record.total,93.3);
 assert.equal((await req('/api/grades','GET',undefined,manager)).data.entries.length,1);
 const code=(await req('/api/teacher-code','POST',{teacher:'Teacher 1'},manager)).data.code,other=(await req('/api/login','POST',{role:'teacher',code})).cookie;
 assert.equal((await req('/api/grades','GET',undefined,other)).data.entries.length,0);
 assert.equal((await req('/api/grades/'+record.id+'/history','GET',undefined,other)).status,404);
 assert.equal((await req('/api/grades/'+record.id,'PUT',{record,expectedRevision:1,operationId:'save-operation-0002'},other)).status,404);
 assert.equal((await req('/api/grades/'+record.id,'DELETE',{expectedRevision:1,operationId:'delete-operation-01'},other)).status,404);
 assert.equal((await req('/api/grades')).status,401);
});
test('grade retry is idempotent and stale edits preserve audit history',async t=>{
 const {req,manager,teacher}=await gradeFixture(t),record=grade(rows()[0]);
 const input={record,expectedRevision:0,operationId:'save-operation-0001'};
 assert.equal((await req('/api/grades/'+record.id,'PUT',input,teacher)).status,200);
 assert.equal((await req('/api/grades/'+record.id,'PUT',input,teacher)).status,200);
 const updated={...record,scores:{fluency:3,pronunciation:3,contribution:3,accuracy:3}};
 const attempts=await Promise.all(['concurrent-edit-001','concurrent-edit-002'].map(operationId=>req('/api/grades/'+record.id,'PUT',{record:updated,expectedRevision:1,operationId},manager)));
 assert.deepEqual(attempts.map(r=>r.status).sort(),[200,409]);
 const history=(await req('/api/grades/'+record.id+'/history','GET',undefined,teacher)).data.entries;assert.equal(history.length,2);assert.equal(history[0].updatedBy,'Manager');assert.equal(history[0].record.total,100);assert.equal(history[1].updatedBy,'Teacher 0');assert.equal(history[1].record.total,93.3);
 assert.equal((await req('/api/grades/'+record.id,'PUT',input,teacher)).status,409);
});
test('grade validation rejects forged identity, bad marks and roster changes',async t=>{
 const {req,teacher}=await gradeFixture(t),record=grade(rows()[0]);
 const save=r=>req('/api/grades/'+r.id,'PUT',{record:r,expectedRevision:0,operationId:'save-operation-0001'},teacher);
 assert.equal((await save({...record,teacher:'Teacher 1'})).status,403);
 assert.equal((await save({...record,studentName:'Changed name'})).status,409);
 assert.equal((await save({...record,session:'Wrong year'})).status,409);
 assert.equal((await save({...record,scores:{fluency:9}})).status,400);
 assert.equal((await req('/api/grades','GET',undefined,teacher)).data.entries.length,0);
});
test('absence and deletion are shared and deletion retains its audit snapshots',async t=>{
 const {req,manager,teacher}=await gradeFixture(t),record={...grade(rows()[0]),status:'absent',scores:{fluency:'',pronunciation:'',contribution:'',accuracy:''},total:null};
 assert.equal((await req('/api/grades/'+record.id,'PUT',{record,expectedRevision:0,operationId:'save-operation-0001'},teacher)).status,200);
 const remove={expectedRevision:1,operationId:'delete-operation-01'};
 assert.equal((await req('/api/grades/'+record.id,'DELETE',remove,manager)).status,200);
 assert.equal((await req('/api/grades/'+record.id,'DELETE',remove,manager)).status,200);
 assert.equal((await req('/api/grades','GET',undefined,manager)).data.entries.length,0);
 const history=(await req('/api/grades/'+record.id+'/history','GET',undefined,manager)).data.entries;
 assert.equal(history.length,2);assert.equal(history[0].deleted,true);assert.equal(history[1].record.total,null);
});
