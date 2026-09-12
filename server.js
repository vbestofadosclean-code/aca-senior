import express from 'express';
import cookieParser from 'cookie-parser';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pg from 'pg';
import path from 'path';
import { fileURLToPath } from 'url';

const { Pool } = pg;
const app = express();
const PORT = process.env.PORT || 3000;
const DATABASE_URL = process.env.DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;
const ADMIN_EMAIL = process.env.ADMIN_EMAIL;
const ADMIN_EMAIL_ALT = process.env.ADMIN_EMAIL_ALT;
const ADMIN_PASSWORD_1 = process.env.ADMIN_PASSWORD_1;
const ADMIN_PASSWORD_2 = process.env.ADMIN_PASSWORD_2;
const CAPACITY = 150;
const FEE = 4000;
const MAX_BODY = '200kb';
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 8;
const loginAttempts = new Map();
let PASSWORD_1_HASH, PASSWORD_2_HASH;

if (!DATABASE_URL || !JWT_SECRET || !ADMIN_EMAIL || !ADMIN_EMAIL_ALT || !ADMIN_PASSWORD_1 || !ADMIN_PASSWORD_2) {
  console.error('Missing DATABASE_URL, JWT_SECRET, ADMIN_EMAIL, ADMIN_EMAIL_ALT, ADMIN_PASSWORD_1 or ADMIN_PASSWORD_2.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false' } : false });
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
app.disable('x-powered-by');
app.use((req,res,next)=>{
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  if(req.secure || req.headers['x-forwarded-proto']==='https') res.setHeader('Strict-Transport-Security','max-age=31536000; includeSubDomains');
  next();
});
app.use(express.json({ limit: MAX_BODY }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public'), { maxAge: process.env.NODE_ENV === 'production' ? '1h' : 0 }));

const normalize = v => String(v ?? '').trim();
const normalizeEmail = v => normalize(v).toLowerCase();
const isEmail = v => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const clientIp = req => String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown').split(',')[0].trim();
function rateLimitLogin(req,res){
  const key=clientIp(req); const now=Date.now();
  let entry=loginAttempts.get(key);
  if(!entry || now-entry.startedAt>LOGIN_WINDOW_MS) entry={startedAt:now,count:0};
  if(entry.count>=LOGIN_MAX_ATTEMPTS){
    const retry=Math.max(1,Math.ceil((LOGIN_WINDOW_MS-(now-entry.startedAt))/1000));
    res.setHeader('Retry-After',String(retry));
    return res.status(429).json({error:'Muitas tentativas de acesso. Tente novamente mais tarde.'});
  }
  entry.count++; loginAttempts.set(key,entry); return null;
}
function clearLoginAttempts(req){loginAttempts.delete(clientIp(req));}
setInterval(()=>{const now=Date.now();for(const [k,v] of loginAttempts)if(now-v.startedAt>LOGIN_WINDOW_MS)loginAttempts.delete(k);},LOGIN_WINDOW_MS).unref();
function requireJsonBody(req,res,next){if(!req.is('application/json'))return res.status(415).json({error:'Content-Type deve ser application/json.'});next();}

async function initDb() {
  await pool.query(`CREATE TABLE IF NOT EXISTS registrations (
    id BIGSERIAL PRIMARY KEY,
    registration_number VARCHAR(20) UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    nascimento DATE NOT NULL,
    sexo TEXT NOT NULL,
    naturalidade TEXT NOT NULL,
    bilhete TEXT NOT NULL,
    residencia TEXT NOT NULL,
    contacto TEXT NOT NULL,
    email TEXT NOT NULL,
    agrupamento TEXT NOT NULL,
    nucleo TEXT NOT NULL,
    patrulha TEXT NOT NULL,
    categoria TEXT NOT NULL,
    deficiencia TEXT NOT NULL,
    obs TEXT DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    payment_status VARCHAR(20) NOT NULL DEFAULT 'pending',
    payment_value INTEGER NOT NULL DEFAULT 4000,
    payment_confirmed_at TIMESTAMPTZ,
    payment_method TEXT
  );`);
  // Compatibilidade com bases antigas: o campo Cargo deixou de fazer parte do sistema.
  await pool.query(`DO $$ BEGIN IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='registrations' AND column_name='cargo') THEN ALTER TABLE registrations ALTER COLUMN cargo DROP NOT NULL; END IF; END $$;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS registrations_name_idx ON registrations (LOWER(nome));`);
  await pool.query(`CREATE INDEX IF NOT EXISTS registrations_group_idx ON registrations (LOWER(agrupamento));`);
  await pool.query(`CREATE TABLE IF NOT EXISTS messages (
    id BIGSERIAL PRIMARY KEY,
    nome TEXT NOT NULL,
    contacto TEXT NOT NULL,
    mensagem TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    message_type VARCHAR(20) NOT NULL DEFAULT 'contact',
    read_at TIMESTAMPTZ
  );`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS message_type VARCHAR(20) NOT NULL DEFAULT 'contact';`);
  await pool.query(`ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;`);
  await pool.query(`CREATE INDEX IF NOT EXISTS messages_created_idx ON messages (created_at DESC);`);
}

function publicRegistration(r) {
  return { registrationNumber:r.registration_number, nome:r.nome, agrupamento:r.agrupamento, categoria:r.categoria, createdAt:r.created_at, paymentStatus:r.payment_status };
}
function adminRegistration(r) {
  return { id:r.id, registrationNumber:r.registration_number, nome:r.nome, nascimento:r.nascimento, sexo:r.sexo, naturalidade:r.naturalidade, bilhete:r.bilhete, residencia:r.residencia, contacto:r.contacto, email:r.email, agrupamento:r.agrupamento, nucleo:r.nucleo, patrulha:r.patrulha, categoria:r.categoria, deficiencia:r.deficiencia, obs:r.obs, createdAt:r.created_at, paymentStatus:r.payment_status, paymentValue:r.payment_value, paymentConfirmedAt:r.payment_confirmed_at, paymentMethod:r.payment_method };
}
function adminMessage(m) {
  return { id:m.id, nome:m.nome, contacto:m.contacto, mensagem:m.mensagem, createdAt:m.created_at, type:m.message_type, readAt:m.read_at };
}
function requireAdmin(req,res,next) {
  try {
    const token=req.cookies.aca_admin;
    if(!token) return res.status(401).json({error:'Não autenticado'});
    req.admin=jwt.verify(token,JWT_SECRET);
    next();
  } catch { return res.status(401).json({error:'Sessão inválida ou expirada'}); }
}

app.get('/api/health', async (_req,res)=>{ try{ await pool.query('SELECT 1'); res.json({ok:true}); }catch{res.status(503).json({ok:false});} });
app.get('/api/registrations/count', async (_req,res)=>{
  const {rows}=await pool.query('SELECT COUNT(*)::int AS total FROM registrations');
  res.json({total:rows[0].total, remaining:Math.max(0,CAPACITY-rows[0].total), capacity:CAPACITY, fee:FEE});
});

app.post('/api/registrations', requireJsonBody, async (req,res)=>{
  const fields=['nome','nascimento','sexo','naturalidade','bilhete','residencia','contacto','email','agrupamento','nucleo','patrulha','categoria','deficiencia'];
  const data={}; for(const f of fields)data[f]=normalize(req.body[f]); data.obs=normalize(req.body.obs);
  if(fields.some(f=>!data[f])) return res.status(400).json({error:'Preencha todos os campos obrigatórios.'});
  const deadline = new Date('2026-10-25T23:59:00+01:00');
  if (new Date() > deadline) return res.status(403).json({error:'O prazo de inscrição terminou em 25/10/2026 às 23:59.'});
  const limits={nome:160,naturalidade:120,bilhete:60,residencia:220,contacto:40,email:254,agrupamento:160,nucleo:160,patrulha:160,categoria:80,deficiencia:120,obs:1000,sexo:40};
  for(const [key,max] of Object.entries(limits)) if(data[key].length>max) return res.status(400).json({error:`O campo ${key} excede o tamanho permitido.`});
  if(!isEmail(data.email)) return res.status(400).json({error:'Informe um e-mail válido.'});
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.nascimento)) return res.status(400).json({error:'Data de nascimento inválida.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(3172026)');
    const countRes=await client.query('SELECT COUNT(*)::int AS total FROM registrations');
    if(countRes.rows[0].total>=CAPACITY){await client.query('ROLLBACK');return res.status(409).json({error:'As 150 vagas já foram preenchidas.'});}
    const seq=countRes.rows[0].total+1;
    const regNo=`ACA-2026-${String(seq).padStart(4,'0')}`;
    const q=`INSERT INTO registrations (registration_number,nome,nascimento,sexo,naturalidade,bilhete,residencia,contacto,email,agrupamento,nucleo,patrulha,categoria,deficiencia,obs,payment_value) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17) RETURNING *`;
    const values=[regNo,data.nome,data.nascimento,data.sexo,data.naturalidade,data.bilhete,data.residencia,data.contacto,data.email,data.agrupamento,data.nucleo,data.patrulha,data.categoria,data.deficiencia,data.obs,FEE];
    const {rows}=await client.query(q,values);
    await client.query('COMMIT');
    res.status(201).json({registration:publicRegistration(rows[0]),registrationNumber:regNo,fee:FEE});
  }catch(e){await client.query('ROLLBACK');console.error(e);res.status(500).json({error:'Não foi possível guardar a inscrição.'});}
  finally{client.release();}
});

app.get('/api/registrations/consult', async (req,res)=>{
  const nome=normalize(req.query.nome), agrupamento=normalize(req.query.agrupamento);
  if(!nome||!agrupamento)return res.status(400).json({error:'Informe nome e agrupamento.'});
  const {rows}=await pool.query(`SELECT registration_number,nome,agrupamento,categoria,payment_status,created_at FROM registrations WHERE LOWER(nome)=LOWER($1) AND LOWER(agrupamento)=LOWER($2) LIMIT 1`,[nome,agrupamento]);
  if(!rows.length)return res.status(404).json({error:'Inscrição não encontrada'});
  res.json({registration:publicRegistration(rows[0])});
});

app.post('/api/messages', requireJsonBody, async (req,res)=>{
  const nome=normalize(req.body.nome), contacto=normalize(req.body.contacto), mensagem=normalize(req.body.mensagem);
  if(!nome||!contacto||!mensagem)return res.status(400).json({error:'Preencha nome, contacto e mensagem.'});
  if(nome.length>160||contacto.length>40||mensagem.length>2000)return res.status(400).json({error:'A mensagem excede o tamanho permitido.'});
  await pool.query('INSERT INTO messages (nome,contacto,mensagem,message_type) VALUES ($1,$2,$3,\'contact\')',[nome,contacto,mensagem]);
  res.status(201).json({ok:true});
});

app.post('/api/admin/login', requireJsonBody, async (req,res)=>{
  const limited=rateLimitLogin(req,res); if(limited) return;
  const email=normalizeEmail(req.body.email);
  const p1=String(req.body.password1||'');
  const p2=String(req.body.password2||'');
  const emailOk=email===normalizeEmail(ADMIN_EMAIL)||email===normalizeEmail(ADMIN_EMAIL_ALT);
  const [ok1,ok2]=await Promise.all([bcrypt.compare(p1,PASSWORD_1_HASH),bcrypt.compare(p2,PASSWORD_2_HASH)]);
  if(!emailOk||!ok1||!ok2){
    try{await pool.query(`INSERT INTO messages (nome,contacto,mensagem,message_type) VALUES ($1,$2,$3,'system')`,['Sistema','Segurança','Tentativa de acesso administrativo recusada em '+new Date().toLocaleString('pt-AO')]);}catch{}
    return res.status(401).json({error:'E-mail ou palavras-passe incorrectos.'});
  }
  clearLoginAttempts(req);
  const token=jwt.sign({role:'admin',email},JWT_SECRET,{expiresIn:'8h'});
  res.cookie('aca_admin',token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',maxAge:8*60*60*1000});
  await pool.query(`INSERT INTO messages (nome,contacto,mensagem,message_type) VALUES ($1,$2,$3,'system')`,['Sistema','Área Administrativa','Acesso autorizado à Área Administrativa em '+new Date().toLocaleString('pt-AO')]);
  res.json({ok:true});
});
app.post('/api/admin/logout',(req,res)=>{res.clearCookie('aca_admin',{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax'});res.json({ok:true});});
app.get('/api/admin/me',requireAdmin,(_req,res)=>res.json({authenticated:true}));

app.get('/api/admin/stats',requireAdmin,async(_req,res)=>{
  const {rows}=await pool.query(`SELECT COUNT(*)::int AS total, COUNT(*) FILTER (WHERE payment_status='paid')::int AS paid, COUNT(*) FILTER (WHERE payment_status='pending')::int AS pending FROM registrations`);
  const s=rows[0];
  const unread=await pool.query(`SELECT COUNT(*)::int AS total FROM messages WHERE read_at IS NULL`);
  res.json({total:s.total,paid:s.paid,pending:s.pending,remaining:Math.max(0,CAPACITY-s.total),received:s.paid*FEE,pendingValue:s.pending*FEE,capacity:CAPACITY,fee:FEE,unreadMessages:unread.rows[0].total});
});
app.get('/api/admin/registrations',requireAdmin,async(req,res)=>{
  const q=normalize(req.query.q); const params=[]; let where='';
  if(q){params.push(`%${q.toLowerCase()}%`);where=`WHERE LOWER(nome) LIKE $1 OR LOWER(agrupamento) LIKE $1 OR LOWER(registration_number) LIKE $1 OR LOWER(categoria) LIKE $1`;}
  const {rows}=await pool.query(`SELECT * FROM registrations ${where} ORDER BY id DESC`,params);
  res.json({registrations:rows.map(adminRegistration)});
});
app.get('/api/admin/messages',requireAdmin,async(req,res)=>{
  const q=normalize(req.query.q); const params=[]; let where='';
  if(q){params.push(`%${q.toLowerCase()}%`);where=`WHERE LOWER(nome) LIKE $1 OR LOWER(contacto) LIKE $1 OR LOWER(mensagem) LIKE $1`;}
  const {rows}=await pool.query(`SELECT * FROM messages ${where} ORDER BY id DESC`,params);
  res.json({messages:rows.map(adminMessage)});
});
app.get('/api/admin/messages/unread-count',requireAdmin,async(_req,res)=>{const {rows}=await pool.query('SELECT COUNT(*)::int AS total FROM messages WHERE read_at IS NULL');res.json({total:rows[0].total});});
app.post('/api/admin/messages/:id/read',requireAdmin,async(req,res)=>{const {rows}=await pool.query('UPDATE messages SET read_at=COALESCE(read_at,NOW()) WHERE id=$1 RETURNING *',[req.params.id]);if(!rows.length)return res.status(404).json({error:'Mensagem não encontrada'});res.json({message:adminMessage(rows[0])});});
app.post('/api/admin/messages/read-all',requireAdmin,async(_req,res)=>{await pool.query('UPDATE messages SET read_at=NOW() WHERE read_at IS NULL');res.json({ok:true});});
app.delete('/api/admin/messages/:id',requireAdmin,async(req,res)=>{const {rowCount}=await pool.query('DELETE FROM messages WHERE id=$1',[req.params.id]);if(!rowCount)return res.status(404).json({error:'Mensagem não encontrada'});res.json({ok:true});});
app.post('/api/admin/registrations/:id/payment',requireAdmin,async(req,res)=>{
  if(typeof req.body.paid!=='boolean') return res.status(400).json({error:'Estado de pagamento inválido.'});
  const paid=req.body.paid;
  const {rows}=await pool.query(`UPDATE registrations SET payment_status=$1,payment_confirmed_at=$2,payment_method=$3 WHERE id=$4 RETURNING *`,[paid?'paid':'pending',paid?new Date():null,paid?'Pagamento em mão':null,req.params.id]);
  if(!rows.length)return res.status(404).json({error:'Inscrição não encontrada'});
  res.json({registration:adminRegistration(rows[0])});
});

app.use((_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

Promise.all([bcrypt.hash(ADMIN_PASSWORD_1,12),bcrypt.hash(ADMIN_PASSWORD_2,12)]).then(async([h1,h2])=>{
  PASSWORD_1_HASH=h1; PASSWORD_2_HASH=h2;
  await initDb();
  app.listen(PORT, '0.0.0.0', ()=>console.log(`ACA-SÊNIOR online server listening on ${PORT}`));
}).catch(e=>{console.error('Startup failed',e);process.exit(1);});
