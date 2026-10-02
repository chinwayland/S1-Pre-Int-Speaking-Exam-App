(() => {
  'use strict';
  const R=window.EXAM_ROSTER,$=id=>document.getElementById(id);
  let user=null,roster={revision:0,session:'',rows:[]},book=null,preview=null,hooks={},refreshJob=null;
  const element=(tag,text)=>{const e=document.createElement(tag);e.textContent=text;return e;};
  async function api(url,method='GET',payload){
    const response=await fetch(url,{method,credentials:'same-origin',cache:'no-store',headers:method==='GET'?{}:{'Content-Type':'application/json','X-Exam-Request':'1'},body:payload===undefined?undefined:JSON.stringify(payload),signal:AbortSignal.timeout(15000)});
    if(!response.headers.get('content-type')?.includes('application/json'))throw Error('This address is the static preview. Open the shared server version to sign in.');
    const data=await response.json();if(!response.ok){if(response.status===401&&url!=='/api/login')setUser(null);throw Object.assign(Error(data.error||'The server could not complete the request.'),{status:response.status});}return data;
  }
  function setUser(next){
    user=next;hooks.notify?.('');$('accessPanel').hidden=!!user;$('signedInBar').hidden=!user;$('rosterManager').hidden=user?.role!=='manager';
    $('signedInName').textContent=user?(user.role==='manager'?'Manager':`Teacher: ${user.teacher}`):'';
    const allowed=user&&(!hooks.canUseDraft||hooks.canUseDraft(user));
    document.body.classList.toggle('signed-in',!!allowed);
    $('authNotice').hidden=!user||allowed;
    $('authNotice').textContent='An unfinished exam in this browser belongs to another teacher. Sign out and use that teacher’s code to finish it. A manager can also finish it.';
    if(!user){roster={revision:0,session:'',rows:[]};$('newTeacherCode').value='';$('newCodeLabel').hidden=true;}
    hooks.onChange?.();
  }
  function optionList(id,values,placeholder){
    const old=$(id).value;$(id).replaceChildren(...(values.length?values.map(x=>new Option(x,x)):[new Option(placeholder,'')]));
    if(values.includes(old))$(id).value=old;
  }
  function status(row){const matches=(hooks.getRecords?.()||[]).filter(r=>r.session===roster.session&&R.normalize(r.studentId)===R.studentKey(row));return matches.some(r=>r.status==='graded')?'Graded':matches.some(r=>r.status==='absent')?'Absent':'Not tested';}
  function selected(){return roster.rows.find(r=>r.studentId===$('studentSelect').value&&r.teacher===$('teacherSelect').value&&r.className===$('classSelect').value&&r.examDate===$('dateSelect').value);}
  function renderSelection(){
    const row=selected();$('selectedStudent').replaceChildren();
    if(row){[['Student','studentName'],['Student ID','studentId'],['Exam time','examTime']].forEach(([label,key])=>$('selectedStudent').append(element('dt',label),element('dd',row[key])));}
    $('startExamBtn').disabled=!row;$('absentBtn').disabled=!row;
  }
  function renderStudents(advance=false){
    const old=$('studentSelect').value,rows=roster.rows.filter(r=>r.teacher===$('teacherSelect').value&&r.className===$('classSelect').value&&r.examDate===$('dateSelect').value);
    $('studentSelect').replaceChildren(...(rows.length?rows.map(r=>new Option(`${r.examTime} · ${r.studentName} · ${r.studentId} · ${status(r)}`,r.studentId)):[new Option('No students for this selection','')]));
    if(!advance&&rows.some(r=>r.studentId===old))$('studentSelect').value=old;
    else if(rows.some(r=>status(r)==='Not tested'))$('studentSelect').value=rows.find(r=>status(r)==='Not tested').studentId;
    renderSelection();
  }
  function renderDates(){optionList('dateSelect',[...new Set(roster.rows.filter(r=>r.teacher===$('teacherSelect').value&&r.className===$('classSelect').value).map(r=>r.examDate))].sort(),'No exam dates');renderStudents();}
  function renderClasses(){optionList('classSelect',[...new Set(roster.rows.filter(r=>r.teacher===$('teacherSelect').value).map(r=>r.className))].sort(),'No classes');renderDates();}
  function render(){
    optionList('teacherSelect',[...new Set(roster.rows.map(r=>r.teacher))].sort(),'No teachers');$('teacherSelect').disabled=user?.role==='teacher';
    renderClasses();$('rosterStatus').textContent=roster.rows.length?`${roster.session} · ${roster.rows.length} assigned students. Dates and times use your school’s local time. Completion labels reflect the latest shared results loaded.`:'No roster has been published yet. Ask your manager to upload it.';
  }
  function refresh(){
    if(!user||hooks.isBusy?.())return Promise.resolve();
    if(refreshJob)return refreshJob;
    const requestedUser=user;$('refreshRosterBtn').disabled=true;
    refreshJob=(async()=>{
      try{const latest=await api('/api/roster');if(user!==requestedUser)return;roster=latest;render();if(user.role==='manager')await teacherList();}
      finally{refreshJob=null;$('refreshRosterBtn').disabled=false;}
    })();
    return refreshJob;
  }
  async function teacherList(){const data=await api('/api/teachers'),old=$('codeTeacher').value;$('codeTeacher').replaceChildren(...data.teachers.map(t=>new Option(`${t.teacher}${t.hasCode?' — code exists':''}`,t.teacher)));if(data.teachers.some(t=>t.teacher===old))$('codeTeacher').value=old;$('createCodeBtn').disabled=!data.teachers.length;}
  async function selectedFresh(){
    if(!user)throw Error('Sign in first.');
    const before=selected();if(!before)throw Error('Choose a student from the shared roster.');
    const previous=JSON.stringify({session:roster.session,...before});await refresh();const row=selected();
    if(!user||!row||JSON.stringify({session:roster.session,...row})!==previous)throw Error('The roster changed. Check the selected student’s details, then start again.');
    return {session:roster.session,...row};
  }
  function clearPreview(){preview=null;$('publishRosterBtn').disabled=true;$('rosterPreview').replaceChildren();$('rosterIssues').replaceChildren();}
  function mapSheet(){
    clearPreview();$('fieldMapping').replaceChildren();$('reviewMappingBtn').disabled=true;
    try{
      const columns=R.sheetColumns(book,$('worksheetSelect').value,window.XLSX),suggested=R.suggestMapping(columns);
      R.keys.forEach((key,i)=>{
        const label=element('label',R.headers[i]),select=document.createElement('select');select.id=`map-${key}`;
        select.append(new Option('Choose a column…',''),...columns.map(c=>new Option(`${c.letter}: ${c.label||'(no header)'}`,String(c.index))));
        if(suggested[key]!==undefined)select.value=String(suggested[key]);
        select.addEventListener('change',()=>{clearPreview();$('uploadSummary').textContent='Mapping changed. Review the mapped rows before publishing.';});
        label.append(select);$('fieldMapping').append(label);
      });
      $('reviewMappingBtn').disabled=false;$('uploadSummary').textContent='Match each app field to a spreadsheet column. Check the suggested matches, then review the rows. Row 1 is treated as headers.';
    }catch(error){$('uploadSummary').textContent=error.message;}
  }
  function reviewSheet(){
    preview=null;$('publishRosterBtn').disabled=true;$('rosterPreview').replaceChildren();$('rosterIssues').replaceChildren();
    try{
      const mapping=Object.fromEntries(R.keys.map(key=>[key,$(`map-${key}`).value===''?null:Number($(`map-${key}`).value)]));
      preview=R.parseSheet(book,$('worksheetSelect').value,window.XLSX,mapping);
      $('rosterIssues').replaceChildren(...preview.issues.slice(0,30).map(x=>element('li',x)));
      $('uploadSummary').textContent=preview.issues.length?`${preview.issues.length} issues found. Check the mapping or correct the spreadsheet and upload it again. Nothing has been published.`:`${preview.rows.length} students across ${new Set(preview.rows.map(r=>R.normalize(r.teacher))).size} teachers. Review before publishing.`;
      preview.rows.slice(0,10).forEach(row=>{const tr=element('tr','');tr.append(...R.keys.map(key=>element('td',row[key])));$('rosterPreview').append(tr);});
      if(!preview.issues.length&&!$('rosterSession').value){const date=preview.rows[0].examDate,year=Number(date.slice(0,4))-(Number(date.slice(5,7))<9?1:0);$('rosterSession').value=roster.session||`${year}–${String(year+1).slice(-2)} S1`;}
      $('publishRosterBtn').disabled=preview.issues.length>0;
    }catch(error){$('uploadSummary').textContent=error.message;}
  }
  async function init(callbacks){
    hooks=callbacks;
    $('loginForm').addEventListener('submit',async event=>{event.preventDefault();const submit=$('loginForm').querySelector('button');submit.disabled=true;$('accessNotice').textContent='Signing in…';try{setUser(await api('/api/login','POST',{role:$('loginRole').value,code:$('accessCode').value}));$('accessCode').value='';await refresh();$('accessNotice').textContent='';}catch(error){$('accessNotice').textContent=error.message;}finally{submit.disabled=false;}});
    $('logoutBtn').addEventListener('click',async()=>{if(hooks.isBusy?.()&&hooks.canUseDraft?.(user)){hooks.notify('Finish or discard the current exam before signing out.',true);return;}try{await api('/api/logout','POST',{});setUser(null);}catch(error){hooks.notify(error.message,true);}});
    $('refreshRosterBtn').addEventListener('click',()=>refresh().catch(error=>hooks.notify(error.message,true)));
    $('teacherSelect').addEventListener('change',renderClasses);$('classSelect').addEventListener('change',renderDates);$('dateSelect').addEventListener('change',()=>renderStudents());$('studentSelect').addEventListener('change',renderSelection);
    $('rosterFile').addEventListener('change',async event=>{
      const file=event.target.files[0];if(!file)return;
      $('rosterReview').hidden=false;$('publishRosterBtn').disabled=true;$('uploadSummary').textContent='Reading spreadsheet…';$('rosterPreview').replaceChildren();$('rosterIssues').replaceChildren();preview=null;book=null;
      try{if(file.size>5*1024*1024)throw Error('Use a spreadsheet smaller than 5 MB.');if(!/\.(xlsx|xls|csv)$/i.test(file.name))throw Error('Choose an .xlsx, .xls, or .csv file.');
        book=window.XLSX.read(await file.arrayBuffer(),{type:'array',raw:true,cellDates:false,cellNF:true,sheetRows:1002});
        const names=book.SheetNames.filter((name,i)=>!book.Workbook?.Sheets?.[i]?.Hidden);if(!names.length)throw Error('No visible worksheets were found.');
        $('worksheetSelect').replaceChildren(...names.map(name=>new Option(name,name)));mapSheet();
      }catch(error){$('uploadSummary').textContent=`Could not read this file: ${error.message}`;}finally{event.target.value='';}
    });
    $('worksheetSelect').addEventListener('change',mapSheet);
    $('reviewMappingBtn').addEventListener('click',reviewSheet);
    $('publishRosterBtn').addEventListener('click',async()=>{
      if(!preview||preview.issues.length||!$('rosterSession').value.trim()){$('uploadSummary').textContent='Enter an exam session name and correct all upload errors.';return;}
      $('publishRosterBtn').disabled=true;
      try{roster=await api('/api/roster','PUT',{expectedRevision:roster.revision,session:$('rosterSession').value.trim(),rows:preview.rows});render();await teacherList();preview=null;book=null;$('rosterReview').hidden=true;hooks.notify(`Published ${roster.rows.length} students. Teachers will receive the updated roster when they refresh or start the next exam.`);}
      catch(error){$('uploadSummary').textContent=error.message;$('publishRosterBtn').disabled=false;}
    });
    $('createCodeBtn').addEventListener('click',async()=>{
      const button=$('createCodeBtn');button.disabled=true;
      try{const result=await api('/api/teacher-code','POST',{teacher:$('codeTeacher').value});$('newTeacherCode').value=result.code;$('newCodeLabel').hidden=false;$('codeNotice').textContent=`New access code for ${result.teacher}. This code is shown only now. Share it privately with that teacher. Any old code has stopped working.`;await teacherList();}
      catch(error){$('codeNotice').textContent=error.message;}finally{button.disabled=false;}
    });
    try{setUser(await api('/api/me'));await refresh();}catch(error){setUser(null);$('accessNotice').textContent=error.message==='Sign in to access the shared roster.'?'Use the access code provided by your manager.':error.message;}
    setInterval(()=>{if(user&&!hooks.isBusy?.()&&document.visibilityState==='visible')refresh().catch(error=>hooks.notify(`Could not refresh the roster: ${error.message}`,true));},30000);
  }
  window.EXAM_PORTAL=Object.freeze({init,api,get user(){return user;},selectedFresh,completed:async()=>{await refresh();renderStudents(true);},changed:()=>renderStudents(),canSeeRecord:record=>user?.role==='manager'||(user?.role==='teacher'&&R.normalize(record.teacher)===R.normalize(user.teacher))});
})();
