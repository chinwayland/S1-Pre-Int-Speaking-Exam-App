import R from '../roster.js';
import {gradesAPI} from './grades.mjs';

const encoder = new TextEncoder();
const MAX_BODY = 1024 * 1024;
const MAX_STUDENTS = 1000;
const publicFiles = new Set(['/', '/index.html', '/styles.css', '/content.js', '/core.js', '/roster.js', '/roster-ui.js', '/app.js', '/vendor/xlsx.full.min.js', '/vendor/SHEETJS-LICENSE.txt']);
const securityHeaders = {
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'"
};
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
const token = () => [...crypto.getRandomValues(new Uint8Array(32))].map(b => b.toString(16).padStart(2, '0')).join('');
function equal(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0; for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function fail(status, message) { throw Object.assign(new Error(message), { status }); }
async function readBody(request) {
  if (Number(request.headers.get('content-length')) > MAX_BODY) fail(413, 'Roster request must be smaller than 1 MB.');
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'Invalid JSON request.');
  const chunks = []; let size = 0;
  while (true) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.length;
    if (size > MAX_BODY) { await reader.cancel(); fail(413, 'Roster request must be smaller than 1 MB.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(bytes)); } catch { fail(400, 'Invalid JSON request.'); }
}
async function cleanup(env) {
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM sessions WHERE expires <= ?').bind(now),
    env.DB.prepare('DELETE FROM login_limits WHERE expires <= ?').bind(now)
  ]);
}
async function handle(request, env) {
  const url = new URL(request.url), secure = url.protocol === 'https:';
  const headers = { ...securityHeaders };
  if (secure) headers['Strict-Transport-Security'] = 'max-age=31536000';
  const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...headers, 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
  const cookieName = secure ? '__Host-exam-session' : 'exam-session';
  const cookie = value => { headers['Set-Cookie'] = `${cookieName}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${value ? 43200 : 0}${secure ? '; Secure' : ''}`; };
  try {
    if (!url.pathname.startsWith('/api/')) {
      if (!['GET', 'HEAD'].includes(request.method)) return json(405, { error: 'Method not allowed.' });
      if (!publicFiles.has(url.pathname)) return json(404, { error: 'Not found.' });
      const asset = await env.ASSETS.fetch(request);
      const response = new Response(asset.body, asset);
      for (const [key, value] of Object.entries(headers)) response.headers.set(key, value);
      response.headers.set('Cache-Control', 'no-cache');
      return response;
    }
    if (typeof env.MANAGER_CODE !== 'string' || env.MANAGER_CODE.length < 24) fail(503, 'Manager access has not been configured.');
    if (request.method !== 'GET' && (request.headers.get('origin') !== url.origin || request.headers.get('x-exam-request') !== '1' || !request.headers.get('content-type')?.startsWith('application/json'))) fail(403, 'This request must come from the exam app.');
    const now = Date.now(), managerHash = await digest(env.MANAGER_CODE);
    const stored = await env.DB.prepare('SELECT version, payload FROM exam_state WHERE id = 1').first();
    if (!stored) fail(503, 'The roster database has not been initialized.');
    const state = JSON.parse(stored.payload);
    const save = async next => {
      const payload = JSON.stringify(next);
      if (encoder.encode(payload).length > MAX_BODY) fail(413, 'Roster exceeds the 1 MB storage limit.');
      const result = await env.DB.prepare('UPDATE exam_state SET version = version + 1, payload = ? WHERE id = 1 AND version = ?').bind(payload, stored.version).run();
      if (result.meta.changes !== 1) fail(409, 'Another manager changed the roster or access codes. Refresh and try again.');
    };
    const sessionId = (request.headers.get('cookie') || '').split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const sessionHash = sessionId && sessionId.length <= 128 ? await digest(sessionId) : '';
    let user = sessionHash ? await env.DB.prepare('SELECT role, teacher_key, credential_hash, expires FROM sessions WHERE hash = ? AND expires > ?').bind(sessionHash, now).first() : null;
    if (user && !equal(user.credential_hash, user.role === 'manager' ? managerHash : state.teacherCodes[user.teacher_key])) user = null;
    if (user?.role === 'teacher' && !state.rows.some(row => R.normalize(row.teacher) === user.teacher_key)) user = null;
    const teacherName = key => state.rows.find(row => R.normalize(row.teacher) === key)?.teacher || '';
    if (url.pathname === '/api/login' && request.method === 'POST') {
      const input = await readBody(request);
      if (!input || !['manager', 'teacher'].includes(input.role) || typeof input.code !== 'string' || input.code.length > 256) fail(400, 'Enter your access code.');
      // Cloudflare overwrites this header at its edge. Do not trust arbitrary forwarded headers.
      const ip = request.headers.get('CF-Connecting-IP') || 'local';
      const key = await digest(`${ip}:${Math.floor(now / 600000)}`);
      const rate = await env.DB.prepare('INSERT INTO login_limits(key, count, expires) VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count').bind(key, now + 1200000).first();
      if (rate.count > 120) fail(429, 'Too many sign-in attempts from this network. Try again in 10 minutes.');
      const hash = await digest(input.code.trim());
      const teacherKey = input.role === 'teacher' ? Object.keys(state.teacherCodes).find(k => equal(state.teacherCodes[k], hash)) : '';
      if (!(input.role === 'manager' ? equal(hash, managerHash) : teacherKey && teacherName(teacherKey))) fail(401, 'The access code is not correct.');
      const secret = token();
      await env.DB.prepare('INSERT INTO sessions(hash, role, teacher_key, credential_hash, expires) VALUES (?, ?, ?, ?, ?)').bind(await digest(secret), input.role, teacherKey || '', hash, now + 43200000).run();
      cookie(secret);
      return json(200, { role: input.role, teacher: teacherName(teacherKey) });
    }
    if (!user) fail(401, 'Sign in to access the shared roster.');
    if (url.pathname === '/api/me' && request.method === 'GET') return json(200, { role: user.role, teacher: teacherName(user.teacher_key) });
    if (url.pathname === '/api/logout' && request.method === 'POST') {
      await env.DB.prepare('DELETE FROM sessions WHERE hash = ?').bind(sessionHash).run(); cookie(''); return json(200, { ok: true });
    }
    if (url.pathname === '/api/roster' && request.method === 'GET') return json(200, { revision: state.revision, session: state.session, updatedAt: state.updatedAt, rows: user.role === 'manager' ? state.rows : state.rows.filter(row => R.normalize(row.teacher) === user.teacher_key) });
    if (url.pathname === '/api/grades' || url.pathname.startsWith('/api/grades/')) return await gradesAPI({request,env,user,state,readBody,json});
    if (user.role !== 'manager') fail(403, 'Only a manager can change the roster or teacher access codes.');
    if (url.pathname === '/api/roster' && request.method === 'PUT') {
      const input = await readBody(request);
      if (input?.expectedRevision !== state.revision) fail(409, 'Another manager changed the roster. Refresh and review before publishing again.');
      if (typeof input.session !== 'string' || !input.session.trim() || input.session.length > 100) fail(400, 'Enter an exam session name of 1–100 characters.');
      if (!Array.isArray(input.rows) || input.rows.length > MAX_STUDENTS) fail(400, 'Upload up to 1,000 students per exam session.');
      let checked; try { checked = R.validateRows(input.rows); } catch (error) { fail(400, error.message); }
      if (checked.issues.length) fail(400, checked.issues.slice(0, 10).join('\n'));
      const keys = new Set(checked.rows.map(row => R.normalize(row.teacher)));
      const next = { revision: state.revision + 1, session: input.session.trim(), updatedAt: new Date().toISOString(), rows: checked.rows, teacherCodes: Object.fromEntries(Object.entries(state.teacherCodes).filter(([key]) => keys.has(key))) };
      await save(next);
      return json(200, { revision: next.revision, session: next.session, updatedAt: next.updatedAt, rows: next.rows });
    }
    if (url.pathname === '/api/teachers' && request.method === 'GET') return json(200, { teachers: [...new Map(state.rows.map(row => [R.normalize(row.teacher), row.teacher])).entries()].map(([key, teacher]) => ({ teacher, hasCode: !!state.teacherCodes[key] })) });
    if (url.pathname === '/api/teacher-code' && request.method === 'POST') {
      const input = await readBody(request), key = R.normalize(input?.teacher);
      if (!teacherName(key)) fail(400, 'Choose a teacher from the published roster.');
      const code = token(); await save({ ...state, teacherCodes: { ...state.teacherCodes, [key]: await digest(code) } });
      return json(200, { teacher: teacherName(key), code });
    }
    return json(404, { error: 'Not found.' });
  } catch (error) {
    return json(error.status || 500, { error: error.status ? error.message : 'The server could not complete this request. No successful save was confirmed.' });
  }
}
export default { fetch: handle, scheduled: (_event, env, ctx) => ctx.waitUntil(cleanup(env)) };
