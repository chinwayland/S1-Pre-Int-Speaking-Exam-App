(() => {
  'use strict';
  const C = window.EXAM_CONTENT, K = window.EXAM_CORE, P = window.EXAM_PORTAL;
  const $ = id => document.getElementById(id);
  const RECORDS_KEY = 's1-speaking.records.v1';
  const DRAFT_KEY = 's1-speaking.draft.v1';
  const SETTINGS_KEY = 's1-speaking.settings.v1';
  let records = [], draft = null, currentView = 'setup', storageBlocked = false, unsavedRecords = false;
  let lastPersist = 0, lastPartAdvance = -Infinity, starting = false, saving = false, gradesReady = false, gradeLoad = null;
  let versions = new Map(), legacyRecords = [], gradeUser = '';
  const PENDING_KEY = 's1-speaking.pending-grade.v1';
  let pending = null;
  const userKey = () => P.user ? P.user.role + ':' + (P.user.teacher || '') : '';
  function syncStatus(text,error=false) { $('gradeSyncStatus').textContent=text; $('gradeSyncStatus').classList.toggle('error',error); $('retryGradeBtn').hidden=!pending || !P.canSeeRecord(pending.record); $('pendingBackupBtn').hidden=$('retryGradeBtn').hidden; $('discardPendingBtn').hidden=$('retryGradeBtn').hidden||!!draft; }
  const visibleRecords = () => records.filter(P.canSeeRecord);
  const el = (tag, text, cls) => { const e = document.createElement(tag); if (text !== undefined) e.textContent = text; if (cls) e.className = cls; return e; };
  const stamp = () => new Date().toISOString();
  const uid = () => crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const clock = ms => { const sec = Math.floor(ms / 1000); return `${String(Math.floor(sec / 60)).padStart(2,'0')}:${String(sec % 60).padStart(2,'0')}`; };
  function notify(text, error = false) { $('message').textContent = text; $('message').classList.toggle('error', error); $('message').hidden = !text; }
  function storageError(text) { $('storageWarning').hidden = false; if (text) $('storageWarning').textContent = text; }
  function store(key, data) {
    if (storageBlocked) return false;
    try { if (data === null) localStorage.removeItem(key); else localStorage.setItem(key, JSON.stringify(data)); return true; }
    catch { storageError(); return false; }
  }
  function read(key) { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null; }
  function elapsed() { return draft ? draft.elapsedMs + (draft.runStarted === null ? 0 : Math.max(0, Date.now() - draft.runStarted)) : 0; }
  function persistDraft() {
    if (!draft) { store(DRAFT_KEY, null); return; }
    store(DRAFT_KEY, { ...draft, elapsedMs: elapsed(), runStarted: null });
  }
  function pause() { if (draft && draft.runStarted !== null) { draft.elapsedMs = elapsed(); draft.runStarted = null; } persistDraft(); updateTimer(); }
  function show(view) {
    currentView = view;
    document.body.classList.remove('question-only'); $('teacherViewBtn').hidden = true;
    document.querySelectorAll('.view').forEach(e => e.hidden = e.id !== view);
    document.querySelectorAll('[data-view]').forEach(b => { b.disabled = !!draft; if (b.dataset.view === view) b.setAttribute('aria-current','page'); else b.removeAttribute('aria-current'); });
    $('resultCount').textContent = visibleRecords().length;
    if (view === 'results') renderResults();
    window.scrollTo(0, 0);
  }
  async function getStudent() {
    if (!$('setupForm').reportValidity()) return null;
    if(pending) throw Error('Save or resolve the pending result before starting another exam.');
    await refreshGrades();
    const s = await P.selectedFresh();
    if (records.some(r => r.session === s.session && r.studentId === s.studentId) && !confirm('This student already has a record in this session. Add another attempt? The earlier record will be kept.')) return null;
    store(SETTINGS_KEY, {partSeconds:$('partSeconds').value});
    return s;
  }
  function question() { const part = C.parts[draft.partIndex]; return part.questions.find(q => q.id === draft.order[part.id][draft.indices[draft.partIndex]]); }
  function recordQuestion() { const q = question(); draft.questions.push({part:C.parts[draft.partIndex].name,prompt:q.prompt,followUp:q.followUp}); }
  function studentLabel(d) { return [d.studentId,d.studentName,d.className].filter(Boolean).join(' · '); }
  async function startExam(event) {
    event.preventDefault(); if(draft || starting) return; starting=true;
    try {
    const student = await getStudent(); if (!student) return;
    draft = {...student,id:uid(),date:stamp(),contentVersion:C.version,phase:'exam',edit:false,partIndex:0,indices:C.parts.map(() => 0),order:K.shuffledQuestions(C.parts),elapsedMs:0,partStartedMs:0,runStarted:Date.now(),partSeconds:Number($('partSeconds').value),questions:[],scores:{},notes:''};
    recordQuestion(); notify(''); renderExam(); persistDraft(); show('exam');
    } catch(error) { notify(error.message,true); } finally {starting=false;}
  }
  function renderExam() {
    const q = question();
    $('examStudent').textContent = studentLabel(draft); $('partLabel').textContent = `Part ${draft.partIndex+1} · ${C.parts[draft.partIndex].name}`;
    $('questionText').textContent = q.prompt; $('followUpText').textContent = q.followUp;
    $('partSteps').replaceChildren(...C.parts.map((p,i) => { const li = el('li',`${i+1} ${p.name}`,i<draft.partIndex?'done':''); if(i === draft.partIndex) li.setAttribute('aria-current','step'); return li; }));
    $('replaceBtn').disabled = draft.indices[draft.partIndex] >= C.parts[draft.partIndex].questions.length-1;
    $('replaceBtn').textContent = $('replaceBtn').disabled ? 'No more replacements' : 'Replace question';
    $('nextPartBtn').textContent = draft.partIndex === C.parts.length-1 ? 'Finish and grade →' : 'Next part →';
    updateTimer();
  }
  function updateTimer() {
    if (!draft || draft.phase !== 'exam') return;
    const time = elapsed(), partTime = Math.max(0,time-draft.partStartedMs);
    $('timer').textContent = clock(time);
    $('partTime').textContent = `${draft.runStarted === null ? 'Paused · ' : ''}This part ${clock(partTime)} / ${clock(draft.partSeconds*1000)}`;
    $('timeCue').hidden = partTime < draft.partSeconds*1000;
    $('pauseBtn').textContent = draft.runStarted === null ? 'Resume timer' : 'Pause timer';
  }
  function finish() {
    if(!draft || draft.phase !== 'exam') return;
    if (draft.partIndex < C.parts.length-1 && !confirm(`Only ${draft.partIndex+1} of ${C.parts.length} parts have been reached. Finish early and grade?`)) return;
    pause(); draft.phase = 'grade'; renderGrade(); persistDraft(); show('grade');
  }
  function buildScoreFields() {
    $('scoreFields').replaceChildren(...C.criteria.map(c => {
      const f = el('fieldset',undefined,'score-card'), legend=el('legend',c.label); legend.append(el('span',`${c.weight}%`,'weight')); f.append(legend);
      c.descriptors.forEach((text,i) => { const label=el('label',undefined,'score-option'), input=el('input'); input.type='radio'; input.name=c.id; input.value=String(i); input.required=true; label.append(input,el('strong',String(i)),el('span',text)); f.append(label); });
      return f;
    }));
  }
  function renderGrade() {
    $('gradeStudent').textContent=studentLabel(draft);
    $('gradeSummary').textContent=`${draft.session}${draft.teacher?' · '+draft.teacher:''}${draft.examDate?' · Scheduled '+draft.examDate+' '+draft.examTime:''} · ${clock(draft.elapsedMs)} speaking time · ${new Set(draft.questions.map(q=>q.part)).size} of 4 parts reached · Content ${draft.contentVersion}`;
    $('gradeForm').reset();
    C.criteria.forEach(c => { const score=draft.scores[c.id]; if(Number.isInteger(score)) document.querySelector(`input[name="${c.id}"][value="${score}"]`).checked=true; });
    $('notes').value=draft.notes;
    $('returnExamBtn').hidden=!!draft.edit;
    $('cancelGradeBtn').textContent=draft.edit?'Cancel changes':'Discard this exam';
    $('saveBtn').textContent=draft.edit?'Save changes':'Save and next student →';
    updateTotal();
  }
  function updateTotal() { const total=K.calculateTotal(draft.scores,C.criteria); $('total').textContent=total===null?'—':total.toFixed(1); }
  const sameRecord = (a,b) => JSON.stringify(a) === JSON.stringify(b);
  async function refreshGrades() {
    if(!P.user) return;
    if(gradeLoad) return gradeLoad;
    const owner=userKey();
    gradeLoad=(async()=>{
      const data=await P.api('/api/grades');
      if(userKey()!==owner)return;
      records=K.validateBackup({schemaVersion:1,records:data.entries.map(e=>e.record)},C);
      versions=new Map(data.entries.map(e=>[e.record.id,e.revision])); gradesReady=true;
      $('resultCount').textContent=visibleRecords().length; P.changed();
      if(currentView==='results')renderResults();
      syncStatus(pending?'Not saved to Cloudflare. Retry the pending result.':`Shared results updated ${new Date().toLocaleTimeString()}.`,!!pending);
    })();
    try {await gradeLoad;}catch(error){syncStatus('Could not refresh shared results. '+error.message,true);throw error;}finally{gradeLoad=null;}
  }
  async function writeGrade(change) {
    pending=change; store(PENDING_KEY,pending); unsavedRecords=true;
    syncStatus('Saving to Cloudflare…');
    const data=await P.api('/api/grades/'+encodeURIComponent(change.record.id),change.method,{record:change.record,expectedRevision:change.revision,operationId:change.operationId});
    records=records.filter(r=>r.id!==data.entry.record.id);
    if(!data.entry.deleted)records.push(data.entry.record);
    versions.set(data.entry.record.id,data.entry.revision);
    pending=null;store(PENDING_KEY,null);unsavedRecords=false;
    syncStatus('Saved to Cloudflare.'); P.changed();
    return data.entry;
  }
  async function saveRecords(candidate, expectedRecord=null) {
    if(saving)return {conflict:true};
    if(!gradesReady){notify('Load shared results before saving.',true);return {conflict:true};}
    saving=true; document.querySelectorAll('#gradeForm input, #gradeForm textarea, #gradeForm button').forEach(e=>e.disabled=true);
    try {
      const validated=K.validateBackup({schemaVersion:1,records:candidate},C),changes=[];
      for(const record of validated)if(!sameRecord(record,records.find(r=>r.id===record.id)))changes.push({record,method:'PUT'});
      for(const record of records)if(!validated.some(r=>r.id===record.id))changes.push({record,method:'DELETE'});
      // A restored draft may describe an already-confirmed write. Retrying it is safe.
      if(!changes.length&&pending)changes.push({record:pending.record,method:pending.method});
      for(const change of changes){
        let revision=draft?.id===change.record.id ? (draft.edit ? draft.editRevision : 0) : (versions.get(change.record.id)||0);
        const samePending=pending&&pending.record.id===change.record.id&&pending.method===change.method&&sameRecord(pending.record,change.record);
        if(pending&&!samePending){
          if(pending.record.id!==change.record.id || pending.method!==change.method)throw Error('Resolve the pending save before making another change.');
          const confirmed=await writeGrade(pending);revision=confirmed.revision;
          if(draft){draft.edit=true;draft.editRevision=revision;draft.editBaseRecord=confirmed.record;persistDraft();}
        }
        const next=samePending?pending:{...change,revision,operationId:uid()};
        await writeGrade(next);
      }
      return {durable:true,conflict:false};
    } catch(error) {
      syncStatus('Not saved to Cloudflare. '+error.message,true);
      notify('Your work is kept on this device for retry. '+error.message,true);
      return {durable:false,conflict:true};
    } finally {saving=false;document.querySelectorAll('#gradeForm input, #gradeForm textarea, #gradeForm button').forEach(e=>e.disabled=false);}
  }
  async function retryPending() {
    if(!pending||saving||!P.canSeeRecord(pending.record))return;
    if(draft?.phase==='grade'){await saveGrade({preventDefault(){}});return;}
    saving=true;
    try {await writeGrade(pending);await refreshGrades();notify('Saved to Cloudflare.');}
    catch(error){syncStatus('Not saved to Cloudflare. '+error.message,true);}
    finally{saving=false;}
  }
  async function history(id) {
    try {
      const data=await P.api('/api/grades/'+encodeURIComponent(id)+'/history');
      $('gradeHistory').replaceChildren(el('h2','Edit history · '+(records.find(r=>r.id===id)?.studentId||id)),...data.entries.map(e=>el('p',`Revision ${e.revision} · ${new Date(e.updatedAt).toLocaleString()} · ${e.updatedBy} · ${e.deleted?'Deleted':e.record.status==='absent'?'Absent':e.record.total.toFixed(1)+' / 100'} · ${C.criteria.map(c=>c.label+': '+e.record.scores[c.id]).join(', ')}${e.record.notes?' · Note: '+e.record.notes:''}`)));
      $('gradeHistory').hidden=false;
    }catch(error){notify(error.message,true);}
  }
  async function cleanStudentInputs() { try{await P.completed();}catch(error){notify('Grade saved; roster refresh failed. '+error.message,true);} }
  async function saveGrade(event) {
    event.preventDefault(); if(!draft || draft.phase!=='grade' || saving)return; const total=K.calculateTotal(draft.scores,C.criteria); if(total===null) { notify('Select all four marks before saving.',true); return; }
    const record=Object.fromEntries(['id','session','studentId','studentName','className','teacher','examDate','examTime','date','contentVersion','notes','questions','scores'].map(k=>[k,draft[k] ?? '']));
    record.status='graded'; record.durationSeconds=Math.round(draft.elapsedMs/1000); record.total=total;
    const index=records.findIndex(r=>r.id===record.id), editing=draft.edit,candidate=records.slice();
    if(index>=0) candidate[index]=record; else candidate.push(record);
    const saved=await saveRecords(candidate,draft.edit?draft.editBaseRecord:null);if(saved.conflict)return;const durable=saved.durable;
    draft=null; persistDraft(); await cleanStudentInputs(); show(editing?'results':'setup');
    notify(`${record.studentId}: ${total.toFixed(1)} / 100. ${durable?'Saved to Cloudflare.':'Kept in memory only. Download a backup before closing.'}`,!durable);
    if(!editing) $('studentSelect').focus();
  }
  function discard() {
    if(saving)return;
    if(!draft || !confirm(draft.edit?'Discard these score changes?':'Discard this unfinished exam? No result will be saved.')) return;
    if(pending?.record.id===draft.id){pending=null;store(PENDING_KEY,null);unsavedRecords=false;}
    const editing=draft.edit; draft=null; persistDraft(); notify(''); show(editing?'results':'setup');refreshGrades().catch(()=>{});
  }
  async function markAbsent() {
    if(draft || starting)return;starting=true;
    try {
    const s=await getStudent(); if(!s || !confirm(`Record ${s.studentId} as absent with no grade?`)) return;
    const candidate=[...records,{...s,id:uid(),date:stamp(),status:'absent',durationSeconds:0,scores:Object.fromEntries(C.criteria.map(c=>[c.id,''])),total:null,notes:'',questions:[],contentVersion:C.version}];
    const saved=await saveRecords(candidate);if(saved.conflict)return;const durable=saved.durable; await cleanStudentInputs(); show('setup'); notify(`${s.studentId} marked absent. ${durable?'Saved to Cloudflare.':'Download a backup before closing.'}`,!durable);
    } catch(error) { notify(error.message,true); } finally {starting=false;}
  }
  function filteredRecords() { return visibleRecords().filter(r=>!$('sessionFilter').value || r.session===$('sessionFilter').value); }
  function renderResults() {
    const selected=$('sessionFilter').value, sessions=[...new Set(visibleRecords().map(r=>r.session))].sort();
    $('sessionFilter').replaceChildren(new Option('All sessions',''),...sessions.map(s=>new Option(s,s)));
    if(sessions.includes(selected)) $('sessionFilter').value=selected;
    const list=filteredRecords();
    $('resultsSummary').textContent=`${list.length} records · ${list.filter(r=>r.status==='graded').length} graded · ${list.filter(r=>r.status==='absent').length} absent. CSV exports this view; backup includes your ${visibleRecords().length} visible records.`;
    $('emptyResults').hidden=list.length>0; $('resultsTable').hidden=list.length===0; $('csvBtn').disabled=list.length===0; $('backupBtn').disabled=visibleRecords().length===0;
    $('resultsBody').replaceChildren(...list.slice().reverse().map(r=>{
      const row=el('tr'), student=el('td'), session=el('td'), status=el('td',r.status==='graded'?'Graded':'Absent'), total=el('td',r.total===null?'—':r.total.toFixed(1)), actions=el('td'), wrap=el('div',undefined,'row-actions');
      student.append(el('strong',r.studentId),el('span',r.studentName,'small')); session.append(el('strong',r.session),el('span',r.className,'small'),el('span',new Date(r.date).toLocaleString(),'small'));
      if(r.status==='graded') { const edit=el('button','Edit'); edit.setAttribute('aria-label',`Edit ${r.studentId}`); edit.addEventListener('click',()=>editRecord(r.id)); wrap.append(edit); }
      const remove=el('button','Delete'); remove.className='danger'; remove.setAttribute('aria-label',`Delete ${r.studentId}`); remove.addEventListener('click',async()=>{if(saving)return; if(!confirm(`Delete the record for ${r.studentId}? Download a backup first if you may need it.`)) return;const saved=await saveRecords(records.filter(x=>x.id!==r.id));if(!saved.conflict)renderResults(); }); wrap.append(remove);const log=el('button','History');log.addEventListener('click',()=>history(r.id));wrap.append(log); actions.append(wrap); row.append(student,session,status,total,actions); return row;
    }));
  }
  function editRecord(id) {
    const record=records.find(r=>r.id===id);
    if(!record || draft || saving)return;
    if(record.contentVersion!==C.version) { notify(`This result uses content version ${record.contentVersion}. Use the matching app version to edit its marks.`,true);return; }
    draft={...JSON.parse(JSON.stringify(record)),editBaseRecord:JSON.parse(JSON.stringify(record)),editRevision:versions.get(id)||0,edit:true,phase:'grade',elapsedMs:record.durationSeconds*1000,runStarted:null};
    notify(''); renderGrade(); persistDraft(); show('grade');
  }
  function download(name,text,type) { const url=URL.createObjectURL(new Blob([text],{type})),a=el('a'); a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000); }
  function renderReference() {
    $('contentVersion').textContent=C.version;
    const head=el('tr'); ['Points',...C.criteria.map(c=>`${c.label} · ${c.weight}%`)].forEach(t=>{const th=el('th',t);th.scope='col';head.append(th);}); $('rubricHead').append(head);
    for(let i=0;i<4;i++) { const row=el('tr'),th=el('th',String(i));th.scope='row';row.append(th,...C.criteria.map(c=>el('td',c.descriptors[i])));$('rubricBody').append(row); }
    C.parts.forEach((p,i)=>{const details=el('details'),summary=el('summary',`Part ${i+1} · ${p.name} · ${p.questions.length} questions`);details.append(summary);p.questions.forEach(q=>{const item=el('div',undefined,'bank-item');item.append(el('strong',q.prompt),el('p',q.followUp),el('p',`Example: ${q.example}`,'example'));details.append(item);});$('questionBank').append(details);});
  }
  function validDraft(d) {
    try {
      const plain=value=>value!==null && typeof value==='object' && !Array.isArray(value) && [null,Object.prototype].includes(Object.getPrototypeOf(value));
      const unsafe=key=>['__proto__','prototype','constructor'].includes(key);
      if(!plain(d) || Object.keys(d).some(unsafe) || !['exam','grade'].includes(d.phase) || typeof d.edit!=='boolean' || d.contentVersion!==C.version || d.runStarted!==null || !Number.isFinite(d.elapsedMs) || d.elapsedMs<0 || !plain(d.scores))return false;
      if(Object.entries(d.scores).some(([key,value])=>!C.criteria.some(c=>c.id===key) || !Number.isInteger(value) || value<0 || value>3))return false;
      const record=Object.fromEntries(['id','session','studentId','studentName','className','teacher','examDate','examTime','date','contentVersion','notes','questions'].map(key=>[key,d[key] ?? '']));
      // Validate shared fields and question shapes without requiring a finished grade.
      K.validateBackup({schemaVersion:1,records:[{...record,status:'graded',durationSeconds:d.elapsedMs/1000,scores:Object.fromEntries(C.criteria.map(c=>[c.id,0]))}]},C);
      if(d.edit) {
        if(d.phase!=='grade' || K.calculateTotal(d.scores,C.criteria)===null || !plain(d.editBaseRecord))return false;
        const original=K.validateBackup({schemaVersion:1,records:[d.editBaseRecord]},C)[0];
        return original.id===d.id && original.status==='graded' && original.contentVersion===d.contentVersion;
      }
      if(records.some(r=>r.id===d.id))return false;
      return Number.isInteger(d.partIndex) && d.partIndex>=0 && d.partIndex<C.parts.length && Number.isFinite(d.partStartedMs) && d.partStartedMs>=0 && d.partStartedMs<=d.elapsedMs && [45,60,90,120].includes(d.partSeconds) && Array.isArray(d.indices) && d.indices.length===C.parts.length && plain(d.order) && Object.keys(d.order).length===C.parts.length && Object.keys(d.order).every(key=>C.parts.some(p=>p.id===key)) && C.parts.every((p,i)=>Array.isArray(d.order[p.id]) && d.order[p.id].length===p.questions.length && new Set(d.order[p.id]).size===p.questions.length && d.order[p.id].every(id=>p.questions.some(q=>q.id===id)) && Number.isInteger(d.indices[i]) && d.indices[i]>=0 && d.indices[i]<p.questions.length);
    } catch { return false; }
  }
  $('setupForm').addEventListener('submit',startExam); $('absentBtn').addEventListener('click',markAbsent);
  document.querySelectorAll('[data-view]').forEach(b=>b.addEventListener('click',()=>{if(!draft){notify('');show(b.dataset.view);if(b.dataset.view==='results')refreshGrades().catch(()=>{});}}));
  $('brand').addEventListener('click',e=>{e.preventDefault();if(!draft){notify('');show('setup');}});
  $('pauseBtn').addEventListener('click',()=>{if(!draft || draft.phase!=='exam')return;if(draft.runStarted===null){draft.runStarted=Date.now();persistDraft();updateTimer();}else pause();});
  $('replaceBtn').addEventListener('click',()=>{if(!draft || draft.phase!=='exam' || $('replaceBtn').disabled)return;draft.indices[draft.partIndex]++;recordQuestion();renderExam();persistDraft();});
  $('nextPartBtn').addEventListener('click',()=>{if(!draft || draft.phase!=='exam')return;const now=performance.now();if(now-lastPartAdvance<500)return;lastPartAdvance=now;if(draft.partIndex===C.parts.length-1){finish();return;}draft.partIndex++;draft.partStartedMs=elapsed();recordQuestion();renderExam();persistDraft();});
  $('earlyFinishBtn').addEventListener('click',finish); $('cancelBtn').addEventListener('click',discard); $('cancelGradeBtn').addEventListener('click',discard);
  $('questionViewBtn').addEventListener('click',()=>{document.body.classList.add('question-only');$('teacherViewBtn').hidden=false;}); $('teacherViewBtn').addEventListener('click',()=>{document.body.classList.remove('question-only');$('teacherViewBtn').hidden=true;});
  $('scoreFields').addEventListener('change',e=>{if(saving || !draft || draft.phase!=='grade' || !C.criteria.some(c=>c.id===e.target.name))return;draft.scores[e.target.name]=Number(e.target.value);updateTotal();persistDraft();});
  $('notes').addEventListener('input',()=>{if(saving || !draft || draft.phase!=='grade')return;draft.notes=$('notes').value;persistDraft();}); $('gradeForm').addEventListener('submit',saveGrade);
  $('returnExamBtn').addEventListener('click',()=>{if(saving || !draft || draft.edit || draft.phase!=='grade')return;draft.phase='exam';renderExam();persistDraft();show('exam');notify('The timer is paused. Resume when you are ready.');});
  $('sessionFilter').addEventListener('change',renderResults);
  $('csvBtn').addEventListener('click',async()=>{try{await refreshGrades();download(`speaking-results-${stamp().slice(0,10)}.csv`,K.csvExport(filteredRecords(),C.criteria),'text/csv;charset=utf-8');}catch(error){notify('Export stopped because shared results could not be refreshed. '+error.message,true);}});
  $('backupBtn').addEventListener('click',async()=>{try{await refreshGrades();download(`speaking-backup-${stamp().slice(0,10)}.json`,JSON.stringify({schemaVersion:1,records:visibleRecords()},null,2),'application/json');}catch(error){notify(error.message,true);}});
  $('importBtn').addEventListener('click',()=>$('importFile').click());
  $('importFile').addEventListener('change',async e=>{
    const file=e.target.files[0]; if(!file)return;
    try{await refreshGrades();if(file.size>10*1024*1024)throw Error('The backup is larger than 10 MB.');const imported=K.validateBackup(JSON.parse(await file.text()),C);if(imported.some(r=>!P.canSeeRecord(r)))throw Error('This backup includes another teacher’s records. Ask a manager to restore it.');const known=new Set(records.map(r=>r.id)),added=imported.filter(r=>!known.has(r.id));if(records.length+added.length>10000)throw Error('The combined record limit is 10,000.');if(!confirm(`Add ${added.length} records from this backup? ${imported.length-added.length} existing record IDs will be kept unchanged.`))return;const saved=await saveRecords([...records,...added]);if(saved.conflict)return;const durable=saved.durable;renderResults();notify(`Restored ${added.length} records.${durable?'':' Browser storage failed; download a backup before closing.'}`,!durable);}catch(error){notify(`Could not restore the backup (earlier confirmed records remain saved): ${error.message}`,true);}finally{e.target.value='';}
  });
  window.addEventListener('beforeunload',event=>{if(draft)persistDraft();if(draft||unsavedRecords){event.preventDefault();event.returnValue='';}});
  document.addEventListener('visibilitychange',()=>{if(document.hidden)persistDraft();});
  buildScoreFields();renderReference();
  try { const saved=read(RECORDS_KEY);if(saved)records=K.validateBackup(saved,C);legacyRecords=records.slice();records=[]; }
  catch { storageBlocked=true;storageError('Saved browser data could not be read. It has been kept unchanged. New work will stay in memory only; download a backup before closing.'); }
  try { const s=read(SETTINGS_KEY);if(s){if(['45','60','90','120'].includes(String(s.partSeconds)))$('partSeconds').value=s.partSeconds;} }
  catch { storageError(); }
  try { const saved=read(DRAFT_KEY);if(saved){if(validDraft(saved)){draft=saved;draft.runStarted=null;if(draft.phase==='exam')renderExam();else renderGrade();notify('Your unfinished exam has been restored. The timer is paused.');}else notify('The unfinished exam could not be restored. Saved results are unchanged.',true);} }
  catch { storageError(); }
  try{pending=read(PENDING_KEY);if(pending){K.validateBackup({schemaVersion:1,records:[pending.record]},C);unsavedRecords=true;}}catch{pending=null;storageError('Pending save could not be read. Keep your backup and ask the manager for help.');}
  $('discardPendingBtn').addEventListener('click',async()=>{if(saving||draft||!pending||!P.canSeeRecord(pending.record))return;if(!confirm('Stop retrying this request and load the server result? A previously confirmed save will remain in Cloudflare.'))return;pending=null;store(PENDING_KEY,null);unsavedRecords=false;await refreshGrades().catch(()=>{});});
  $('retryGradeBtn').addEventListener('click',retryPending);
  $('refreshGradesBtn').addEventListener('click',()=>refreshGrades().catch(()=>{}));
  $('legacyBackupBtn').addEventListener('click',()=>download('previous-browser-grades.json',JSON.stringify({schemaVersion:1,records:legacyRecords.filter(P.canSeeRecord)},null,2),'application/json'));
  $('pendingBackupBtn').addEventListener('click',()=>{if(pending&&P.canSeeRecord(pending.record))download('pending-grade.json',JSON.stringify({schemaVersion:1,records:[pending.record]},null,2),'application/json');});
  show(draft?draft.phase:'setup');
  P.init({getRecords:()=>visibleRecords(),isBusy:()=>!!draft||saving,notify,canUseDraft:user=>!draft || user.role==='manager' || window.EXAM_ROSTER.normalize(draft.teacher)===window.EXAM_ROSTER.normalize(user.teacher),onChange:()=>{const key=userKey();if(key!==gradeUser){gradeUser=key;records=[];versions=new Map();gradesReady=false;$('gradeHistory').hidden=true;if(key)refreshGrades().catch(()=>{});else syncStatus('Sign in to load shared results.');}$('legacyBackupBtn').hidden=!legacyRecords.some(P.canSeeRecord);show(currentView);}});
  setInterval(()=>{if(P.user&&!draft&&!saving&&document.visibilityState==='visible')refreshGrades().catch(()=>{});},30000);
  setInterval(()=>{if(!draft||draft.phase!=='exam')return;updateTimer();if(Date.now()-lastPersist>2000){persistDraft();lastPersist=Date.now();}},250);
})();
