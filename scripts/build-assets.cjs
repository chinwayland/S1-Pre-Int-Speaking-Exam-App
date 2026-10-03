const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'),out=path.join(root,'dist');
fs.mkdirSync(path.join(out,'vendor'),{recursive:true});
// Explicit allowlist: never publish database files, environment secrets or server code.
const files=['index.html','styles.css','content.js','core.js','roster.js','roster-ui.js','app.js','student.html','student.js','paper.html','paper.js','vendor/xlsx.full.min.js','vendor/SHEETJS-LICENSE.txt'];
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(out,file));
console.log(`Prepared ${files.length} public assets.`);
