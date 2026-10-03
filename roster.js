(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;root.EXAM_ROSTER=api;})(typeof globalThis!=='undefined'?globalThis:this,()=>{
  'use strict';
  const headers=['Teacher','Class','Student','Student ID','Exam Date','Exam Time'];
  const keys=['teacher','className','studentName','studentId','examDate','examTime'];
  const normalize=value=>String(value??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLowerCase();
  function dateText(value){
    let text=String(value??'').normalize('NFKC').trim(),weekday=null;
    const days=['sunday','monday','tuesday','wednesday','thursday','friday','saturday'];
    const prefix=text.match(/^(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sun|Mon|Tue|Wed|Thu|Fri|Sat),?\s+/i);
    if(prefix){weekday=days.findIndex(day=>day.startsWith(prefix[1].toLowerCase()));text=text.slice(prefix[0].length);}
    const months=['january','february','march','april','may','june','july','august','september','october','november','december'];
    const named=text.match(/^([a-z]+)\.?[\s-]+(\d{1,2})(?:st|nd|rd|th)?[,]?[\s-]+(\d{4})$/i);
    const reverse=text.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s-]+([a-z]+)\.?[,]?[\s-]+(\d{4})$/i);
    if(named||reverse){const name=(named?named[1]:reverse[2]).toLowerCase(),month=months.findIndex(m=>m===name||m.slice(0,3)===name);if(month>=0)text=`${(named||reverse)[3]}-${month+1}-${named?named[2]:reverse[1]}`;}
    const numeric=text.match(/^(\d{1,2})[/. -](\d{1,2})[/. -](\d{4})$/);
    if(numeric){const a=Number(numeric[1]),b=Number(numeric[2]);if(a<=12&&b<=12&&a!==b)throw Error('Ambiguous Exam Date: use a month name or YYYY-MM-DD so day and month cannot be confused.');text=`${numeric[3]}-${a>12?b:a}-${a>12?a:b}`;}
    const match=text.match(/^(\d{4})[-/.年](\d{1,2})[-/.月](\d{1,2})日?$/);
    if(!match)throw Error('Use a real Excel date, a month name (June 25, 2026), or YYYY-MM-DD for Exam Date.');
    const [,y,m,d]=match.map(Number),test=new Date(Date.UTC(y,m-1,d));
    if(y<1900||y>2200||test.getUTCFullYear()!==y||test.getUTCMonth()!==m-1||test.getUTCDate()!==d)throw Error('Exam Date is not a valid calendar date.');
    if(weekday!==null&&test.getUTCDay()!==weekday)throw Error('The weekday does not match the Exam Date. Check the timetable.');
    return `${y}-${String(m).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
  }
  function timeText(value){
    const match=String(value??'').trim().match(/^(\d{1,2}):(\d{2})(?::00)?\s*(am|pm)?$/i);
    if(!match)throw Error('Use HH:MM (24-hour time), an AM/PM time, or a real Excel time.');
    let h=Number(match[1]),m=Number(match[2]);if(m>59||h>23||(match[3]&&(h<1||h>12)))throw Error('Exam Time is not a valid time.');
    if(match[3])h=h%12+(match[3].toLowerCase()==='pm'?12:0);
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }
  function validateRows(input){
    if(!Array.isArray(input)||input.length===0||input.length>1000)throw Error('The roster must contain 1 to 1,000 students.');
    const issues=[],rows=[],ids=new Map(),slots=new Map();
    input.forEach((raw,index)=>{
      const rowNo=raw?.sourceRow||index+2;
      try{
        if(!raw||typeof raw!=='object'||Array.isArray(raw))throw Error('Invalid student row.');
        const row={};keys.forEach((key,i)=>{if(typeof raw[key]!=='string'||!raw[key].trim())throw Error(`${headers[i]} is missing.`);row[key]=raw[key].trim();if(row[key].length>200)throw Error(`${headers[i]} is too long (maximum 200 characters).`);});
        row.examDate=dateText(row.examDate);row.examTime=timeText(row.examTime);
        const id=normalize(row.studentId),slot=JSON.stringify([normalize(row.teacher),row.examDate,row.examTime]);
        if(ids.has(id))throw Error(`Student ID ${row.studentId} is duplicated (also row ${ids.get(id)}).`);
        if(slots.has(slot))throw Error(`This teacher has two students at the same date and time (also row ${slots.get(slot)}).`);
        ids.set(id,rowNo);slots.set(slot,rowNo);rows.push(row);
      }catch(error){issues.push(`Row ${rowNo}: ${error.message}`);}
    });
    return {rows:issues.length?[]:rows.sort((a,b)=>(a.examDate+' '+a.examTime).localeCompare(b.examDate+' '+b.examTime)||a.studentName.localeCompare(b.studentName)),issues};
  }
  function sheetColumns(book,sheetName,XLSX){
    const sheet=book.Sheets[sheetName];if(!sheet||!sheet['!ref'])throw Error('This worksheet is empty.');
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
    if(range.e.r>1000||range.e.c>49)throw Error('Use at most 1,000 student rows and 50 columns. Put headers in row 1.');
    return Array.from({length:range.e.c+1},(_,index)=>({index,label:String(sheet[XLSX.utils.encode_cell({r:0,c:index})]?.v??'').trim(),letter:XLSX.utils.encode_col(index)}));
  }
  function suggestMapping(columns){
    const aliases=[['teacher','teacher name','examiner'],['class','class name'],['student','student name','name'],['student id','student number','student no','id'],['exam date','date','test date'],['exam time','time','test time']];
    const result={};keys.forEach((key,i)=>{const matches=columns.filter(c=>aliases[i].includes(normalize(c.label)));if(matches.length===1)result[key]=matches[0].index;});return result;
  }
  function parseSheet(book,sheetName,XLSX,mapping){
    const sheet=book.Sheets[sheetName];if(!sheet||!sheet['!ref'])throw Error('This worksheet is empty.');
    const range=XLSX.utils.decode_range(sheet['!fullref']||sheet['!ref']);
    if(range.e.r>1000||range.e.c>49)throw Error('Use at most 1,000 student rows and 50 columns. Put headers in row 1.');
    const columns=sheetColumns(book,sheetName,XLSX);
    let selected;
    if(mapping){
      selected=keys.map(key=>mapping[key]);
      if(selected.some(col=>!Number.isInteger(col)||col<0||col>=columns.length))throw Error('Choose a spreadsheet column for each of the six app fields.');
      if(new Set(selected).size!==keys.length)throw Error('Choose a different spreadsheet column for each app field.');
    }else{
      const positions=new Map();for(const col of columns){const name=normalize(col.label);if(name){if(positions.has(name))throw Error(`Duplicate header: ${col.label}.`);positions.set(name,col.index);}}
      const missing=headers.filter(h=>!positions.has(normalize(h)));if(missing.length)throw Error(`Missing headers in row 1: ${missing.join(', ')}.`);
      selected=headers.map(h=>positions.get(normalize(h)));
    }
    const issues=[],rawRows=[],notices=[];
    const usedIds=new Set();for(let r=1;r<=range.e.r;r++){const cell=sheet[XLSX.utils.encode_cell({r,c:selected[3]})];if(cell?.v!==undefined)usedIds.add(normalize(cell.v));}
    for(let r=1;r<=range.e.r;r++){
      const cells=selected.map(c=>sheet[XLSX.utils.encode_cell({r,c})]);
      if(cells.every(c=>!c||String(c.v??'').trim()===''))continue;
      const row={sourceRow:r+1};
      try{cells.forEach((cell,i)=>{
        if(cell?.f)throw Error(`${headers[i]} contains a formula. Paste values before uploading.`);
        if(cell?.t==='e')throw Error(`${headers[i]} contains an Excel error.`);
        if(!cell||cell.v===undefined||cell.v===null){row[keys[i]]='';return;}
        if(i===3&&cell.t==='n'){
          if(!Number.isSafeInteger(cell.v)||cell.v<0||String(cell.v).length>15)throw Error('Student ID may have been rounded by Excel. Restore the correct ID and format it as Text.');
          row.studentId=/^0+$/.test(cell.z||'')?XLSX.utils.format_cell(cell):String(cell.v);return;
        }
        if(i===4&&cell.t==='n'){
          if(!Number.isFinite(cell.v)||!Number.isInteger(cell.v))throw Error('Exam Date must be a date without a time.');
          const d=XLSX.SSF.parse_date_code(cell.v,{date1904:!!book.Workbook?.WBProps?.date1904});
          if(!d)throw Error('Exam Date is invalid.');row.examDate=dateText(`${d.y}-${d.m}-${d.d}`);return;
        }
        if(i===5&&cell.t==='n'){
          if(!Number.isFinite(cell.v)||cell.v<0||cell.v>=1)throw Error('Exam Time must be a time of day, not a date or duration.');
          const minutes=Math.round(cell.v*1440);if(minutes>=1440||Math.abs(cell.v*1440-minutes)>0.001)throw Error('Exam Time must be specified to the minute.');
          row.examTime=timeText(`${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`);return;
        }
        row[keys[i]]=String(cell.v).trim();
        if(i===4){const original=row.examDate;row.examDate=dateText(original);if(row.examDate!==original)notices.push(`Row ${r+1}: ${original} → ${row.examDate}`);}
      });if(!row.studentId){const base=`Missing Student ID — row ${r+1}`;row.studentId=base;let suffix=2;while(usedIds.has(normalize(row.studentId)))row.studentId=`${base} (${suffix++})`;usedIds.add(normalize(row.studentId));notices.push(`Row ${r+1}: blank Student ID → ${row.studentId}`);}rawRows.push(row);}catch(error){issues.push(`Row ${r+1}: ${error.message}`);}
    }
    if(!rawRows.length&&!issues.length)throw Error('No student rows were found.');
    const checked=rawRows.length?validateRows(rawRows):{rows:[],issues:[]};issues.push(...checked.issues);
    return {rows:issues.length?[]:checked.rows,issues,notices};
  }
  function studentKey(row){return normalize(row.studentId);}
  return Object.freeze({headers,keys,normalize,dateText,timeText,validateRows,sheetColumns,suggestMapping,parseSheet,studentKey});
});
