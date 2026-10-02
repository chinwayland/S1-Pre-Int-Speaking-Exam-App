import K from '../core.js';
import C from '../content.js';
import R from '../roster.js';
const entry = row => ({record:JSON.parse(row.record),revision:row.revision,deleted:!!row.deleted,updatedAt:row.updated_at,updatedBy:row.actor});
const problem = (status,message) => {throw Object.assign(new Error(message),{status});};
export async function gradesAPI({request,env,user,state,readBody,json}) {
 const path=new URL(request.url).pathname,manager=user.role==='manager';
 const allowed=row=>manager || row.teacher_key===user.teacher_key;
 if(path==='/api/grades' && request.method==='GET') {
  const query=manager?env.DB.prepare('SELECT * FROM grades WHERE deleted = 0 ORDER BY updated_at, id LIMIT 10001'):env.DB.prepare('SELECT * FROM grades WHERE teacher_key = ? AND deleted = 0 ORDER BY updated_at, id LIMIT 10001').bind(user.teacher_key);
  const result=await query.all();
  if(result.results.length>10000)problem(413,'Too many results to load. Contact your manager to archive old sessions.');
  return json(200,{entries:result.results.map(entry)});
 }
 const match=path.match(/^\/api\/grades\/([^/]+)(\/history)?$/);
 if(!match) return json(404,{error:'Not found.'});
 let id;try{id=decodeURIComponent(match[1]);}catch{problem(400,'Invalid result ID.');}
 if(!id || id.length>200)problem(400,'Invalid result ID.');
 const old=await env.DB.prepare('SELECT * FROM grades WHERE id = ?').bind(id).first();
 if(old&&!allowed(old))problem(404,'Result not found.');
 if(match[2] && request.method==='GET') {
  if(!old)problem(404,'Result not found.');
  const history=await env.DB.prepare('SELECT * FROM grade_history WHERE grade_id = ? ORDER BY revision DESC LIMIT 100').bind(id).all();
  return json(200,{entries:history.results.map(entry)});
 }
 if(match[2] || !['PUT','DELETE'].includes(request.method))return json(405,{error:'Method not allowed.'});
 const input=await readBody(request);
 if(!input || !Number.isInteger(input.expectedRevision)||input.expectedRevision<0||typeof input.operationId!=='string'||!/^[a-zA-Z0-9-]{16,100}$/.test(input.operationId))problem(400,'Invalid save version or operation ID.');
 const deleting=request.method==='DELETE';
 let record;
 if(deleting){if(!old)problem(404,'Result not found.');record=JSON.parse(old.record);}
 else {
  try{record=K.validateBackup({schemaVersion:1,records:[input.record]},C)[0];}catch(error){problem(400,error.message);}
  if(record.id!==id)problem(400,'Result ID does not match.');
  if(!record.teacher || !record.examDate || !record.examTime)problem(400,'This result needs teacher and scheduled exam details.');
  if(!['2.0','2.1'].includes(record.contentVersion))problem(400,'Unsupported assessment version.');
  if(!manager&&R.normalize(record.teacher)!==user.teacher_key)problem(403,'You can save only your assigned students.');
  if(old){
   const before=JSON.parse(old.record);
   for(const key of ['session','studentId','studentName','className','teacher','examDate','examTime','date','contentVersion'])if(record[key]!==before[key])problem(400,'Student identity and schedule cannot be changed while editing grades.');
  }else{
   const student=state.rows.find(row=>R.studentKey(row)===R.normalize(record.studentId));
   if(state.session!==record.session||!student||['studentId','studentName','className','teacher','examDate','examTime'].some(key=>student[key]!==record[key]))problem(409,'The student or schedule has changed. Review the current roster before saving.');
  }
 }
 const serialized=JSON.stringify(record),deleted=deleting?1:0;
 // Retry after a lost response returns the confirmed write, without another audit entry.
 if(old?.operation_id===input.operationId){
  if(old.record===serialized&&old.deleted===deleted)return json(200,{entry:entry(old)});
  problem(409,'This save attempt was already used. Refresh before editing again.');
 }
 if((old?.revision||0)!==input.expectedRevision||old?.deleted)problem(409,'This result changed on another device. Your draft is kept. Cancel changes and refresh results before editing again.');
 const actor=manager?'Manager':state.rows.find(row=>R.normalize(row.teacher)===user.teacher_key)?.teacher||user.teacher_key;
 const updatedAt=new Date().toISOString(),teacherKey=R.normalize(record.teacher);
 let result;
 if(old)result=await env.DB.prepare('UPDATE grades SET record = ?, revision = revision + 1, deleted = ?, updated_at = ?, actor = ?, operation_id = ? WHERE id = ? AND revision = ? AND deleted = 0').bind(serialized,deleted,updatedAt,actor,input.operationId,id,input.expectedRevision).run();
 else result=await env.DB.prepare('INSERT INTO grades(id, teacher_key, record, revision, deleted, updated_at, actor, operation_id) VALUES (?, ?, ?, 1, 0, ?, ?, ?) ON CONFLICT(id) DO NOTHING').bind(id,teacherKey,serialized,updatedAt,actor,input.operationId).run();
 if(result.meta.changes<1)problem(409,'This result changed on another device. Refresh before trying again.');
 return json(200,{entry:entry({record:serialized,revision:input.expectedRevision+1,deleted,updated_at:updatedAt,actor})});
}
