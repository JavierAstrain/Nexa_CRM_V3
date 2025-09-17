const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, '..');
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {}
}
const DB_PATH = path.join(DATA_DIR, 'db.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(ROOT_DIR, 'public')));

// DB helpers
function loadDb() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8')); }
  catch { return { contacts: [], opportunities: [], tasks: [], interactions: [] }; }
}
function saveDb(db) { fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8'); }
if (!fs.existsSync(DB_PATH)) saveDb({ contacts: [], opportunities: [], tasks: [], interactions: [] });

// Utils
function isValidEmail(email) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim()); }
function toNumber(n, d = 0) { const v = Number(n); return Number.isFinite(v) ? v : d; }

// Contacts
app.get('/api/contacts', (req, res) => {
  const includeArchived = String(req.query.includeArchived || 'false').toLowerCase() === 'true';
  const db = loadDb();
  const list = includeArchived ? db.contacts : db.contacts.filter(c => !c.archived);
  res.json(list);
});

app.post('/api/contacts', (req, res) => {
  const db = loadDb();
  const email = (req.body.email || '').trim();
  if (email && !isValidEmail(email)) return res.status(400).json({ error: 'Email inválido' });
  if (email && db.contacts.some(c => c.email?.toLowerCase() === email.toLowerCase() && !c.archived)) {
    return res.status(409).json({ error: 'Ya existe un contacto con ese email' });
  }
  const now = new Date().toISOString();
  const contact = {
    id: uuidv4(),
    name: req.body.name || '',
    email,
    phone: req.body.phone || '',
    company: req.body.company || '',
    status: req.body.status || 'Prospect',
    notes: req.body.notes || '',
    interactionHistory: req.body.interactionHistory || [],
    createdAt: now,
    updatedAt: now,
    archived: false
  };
  db.contacts.push(contact);
  saveDb(db);
  res.status(201).json(contact);
});

app.put('/api/contacts/:id', (req, res) => {
  const db = loadDb();
  const index = db.contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Contact not found' });
  const incomingEmail = (req.body.email ?? db.contacts[index].email || '').trim();
  if (incomingEmail && !isValidEmail(incomingEmail)) return res.status(400).json({ error: 'Email inválido' });
  if (incomingEmail && incomingEmail.toLowerCase() !== (db.contacts[index].email || '').toLowerCase()) {
    if (db.contacts.some(c => c.id !== db.contacts[index].id && c.email?.toLowerCase() === incomingEmail.toLowerCase() && !c.archived)) {
      return res.status(409).json({ error: 'Ya existe un contacto con ese email' });
    }
  }
  db.contacts[index] = {
    ...db.contacts[index],
    ...req.body,
    email: incomingEmail,
    id: db.contacts[index].id,
    updatedAt: new Date().toISOString()
  };
  saveDb(db);
  res.json(db.contacts[index]);
});

// Archive instead of hard delete
app.delete('/api/contacts/:id', (req, res) => {
  const db = loadDb();
  const index = db.contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Contact not found' });
  db.contacts[index].archived = true;
  db.contacts[index].archivedAt = new Date().toISOString();
  db.contacts[index].updatedAt = new Date().toISOString();
  saveDb(db);
  res.json(db.contacts[index]);
});

// Opportunities
const DEFAULT_STAGES = ['Prospecto', 'Calificado', 'Propuesta', 'Negociacion', 'Cerrado/Ganado', 'Cerrado/Perdido'];

app.get('/api/opportunities', (req, res) => {
  const includeArchived = String(req.query.includeArchived || 'false').toLowerCase() === 'true';
  const db = loadDb();
  const list = includeArchived ? db.opportunities : db.opportunities.filter(o => !o.archived);
  res.json(list);
});

app.post('/api/opportunities', (req, res) => {
  const db = loadDb();
  const now = new Date().toISOString();
  const opportunity = {
    id: uuidv4(),
    contactId: req.body.contactId || null,
    title: req.body.title || '',
    value: toNumber(req.body.value, 0),
    probability: toNumber(req.body.probability, 0),
    estimatedCloseDate: req.body.estimatedCloseDate || null,
    description: req.body.description || '',
    stage: req.body.stage || DEFAULT_STAGES[0],
    createdAt: now,
    updatedAt: now,
    archived: false
  };
  db.opportunities.push(opportunity);
  saveDb(db);
  res.status(201).json(opportunity);
});

app.put('/api/opportunities/:id', (req, res) => {
  const db = loadDb();
  const index = db.opportunities.findIndex(o => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Opportunity not found' });
  db.opportunities[index] = {
    ...db.opportunities[index],
    ...req.body,
    value: req.body.value !== undefined ? toNumber(req.body.value, db.opportunities[index].value) : db.opportunities[index].value,
    probability: req.body.probability !== undefined ? toNumber(req.body.probability, db.opportunities[index].probability) : db.opportunities[index].probability,
    id: db.opportunities[index].id,
    updatedAt: new Date().toISOString()
  };
  saveDb(db);
  res.json(db.opportunities[index]);
});

app.delete('/api/opportunities/:id', (req, res) => {
  const db = loadDb();
  const index = db.opportunities.findIndex(o => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Opportunity not found' });
  db.opportunities[index].archived = true;
  db.opportunities[index].archivedAt = new Date().toISOString();
  db.opportunities[index].updatedAt = new Date().toISOString();
  saveDb(db);
  res.json(db.opportunities[index]);
});

// Tasks
app.get('/api/tasks', (req, res) => {
  const includeArchived = String(req.query.includeArchived || 'false').toLowerCase() === 'true';
  const db = loadDb();
  const list = includeArchived ? db.tasks : db.tasks.filter(t => !t.archived);
  res.json(list);
});

app.post('/api/tasks', (req, res) => {
  const db = loadDb();
  const now = new Date().toISOString();
  const task = {
    id: uuidv4(),
    title: req.body.title || '',
    dueDate: req.body.dueDate || null,
    status: req.body.status || 'pending',
    assignedTo: req.body.assignedTo || 'Me',
    linkedType: req.body.linkedType || null, // 'contact'|'opportunity'|null
    linkedId: req.body.linkedId || null,
    notes: req.body.notes || '',
    createdAt: now,
    updatedAt: now,
    archived: false
  };
  db.tasks.push(task);
  saveDb(db);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const db = loadDb();
  const index = db.tasks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Task not found' });
  db.tasks[index] = {
    ...db.tasks[index],
    ...req.body,
    id: db.tasks[index].id,
    updatedAt: new Date().toISOString()
  };
  saveDb(db);
  res.json(db.tasks[index]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const db = loadDb();
  const index = db.tasks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Task not found' });
  db.tasks[index].archived = true;
  db.tasks[index].archivedAt = new Date().toISOString();
  db.tasks[index].updatedAt = new Date().toISOString();
  saveDb(db);
  res.json(db.tasks[index]);
});

// Metrics extended
app.get('/api/metrics', (req, res) => {
  const db = loadDb();
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const activeContacts = db.contacts.filter(c => !c.archived);
  const activeOpps = db.opportunities.filter(o => !o.archived);
  const activeTasks = db.tasks.filter(t => !t.archived);

  const newContacts = activeContacts.filter(c => {
    const createdAt = c.createdAt ? new Date(c.createdAt) : null;
    return createdAt ? createdAt >= last30Days : false;
  }).length;

  const totalPipelineValue = activeOpps
    .filter(o => o.stage !== 'Cerrado/Perdido')
    .reduce((sum, o) => sum + (toNumber(o.value, 0)), 0);

  const byStage = DEFAULT_STAGES.reduce((acc, stage) => {
    acc[stage] = activeOpps.filter(o => o.stage === stage).length;
    return acc;
  }, {});

  // Contacts per week (last 8 weeks)
  const weeks = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now.getTime() - i * weekMs);
    const end = new Date(start.getTime() + weekMs);
    weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, end });
  }
  const contactsSeries = weeks.map(w => activeContacts.filter(c => {
    if (!c.createdAt) return false;
    const d = new Date(c.createdAt);
    return d >= w.start && d < w.end;
  }).length);

  const tasksStatus = activeTasks.reduce((acc, t) => {
    acc[t.status || 'pending'] = (acc[t.status || 'pending'] || 0) + 1;
    return acc;
  }, {});

  res.json({
    newContacts,
    totalPipelineValue,
    byStage,
    contactsSeries: { labels: weeks.map(w => w.label), data: contactsSeries },
    tasksStatus
  });
});

// AI
const openaiApiKey = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY_HERE';
const openai = new OpenAI({ apiKey: openaiApiKey });

app.post('/api/ai/summarize', async (req, res) => {
  try {
    const notes = String(req.body.notes || '').slice(0, 6000);
    const systemPrompt = 'Eres un asistente para CRM. Resume de forma clara y concisa (3-5 oraciones) el siguiente historial de interacciones para contexto de ventas. Responde en español con tono profesional.';
    const userPrompt = `Notas del historial:\n${notes}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 220
    });
    const summary = completion.choices?.[0]?.message?.content?.trim() || '';
    res.json({ summary });
  } catch (err) {
    res.status(500).json({ error: 'AI summarize failed', details: String(err.message || err) });
  }
});

app.post('/api/ai/predict', async (req, res) => {
  try {
    const description = String(req.body.description || '').slice(0, 4000);
    const value = toNumber(req.body.value, 0);
    const systemPrompt = 'Eres un analista de ventas. Estima la probabilidad de cierre (0-100%) basándote en la descripción y señales.\nDevuelve solo un número entero entre 0 y 100.';
    const userPrompt = `Descripcion: ${description}\nValor: ${value}\nPregunta: Analiza esta oportunidad y devuelve SOLO el porcentaje estimado (0-100).`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.2,
      max_tokens: 10
    });
    let content = completion.choices?.[0]?.message?.content?.trim() || '0';
    const match = content.match(/\d{1,3}/);
    let probability = match ? Math.min(100, Math.max(0, parseInt(match[0], 10))) : 0;
    res.json({ probability });
  } catch (err) {
    res.status(500).json({ error: 'AI prediction failed', details: String(err.message || err) });
  }
});

app.post('/api/ai/advise', async (req, res) => {
  try {
    const { contact, opportunityDescription } = req.body || {};
    const name = contact?.name || 'cliente';
    const notes = String(contact?.notes || '').slice(0, 4000);
    const extra = String(opportunityDescription || '').slice(0, 2000);
    const systemPrompt = 'Eres un asesor comercial experto. Analiza el perfil y notas de un cliente y propone próximos pasos accionables (3-7 bullets), riesgos y tono recomendado. Responde en español, conciso.';
    const userPrompt = `Cliente: ${name}\nEmpresa: ${contact?.company || ''}\nEstado: ${contact?.status || ''}\nNotas:\n${notes}\nContexto adicional:\n${extra}`;
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.4,
      max_tokens: 400
    });
    const advice = completion.choices?.[0]?.message?.content?.trim() || '';
    res.json({ advice });
  } catch (err) {
    res.status(500).json({ error: 'AI advise failed', details: String(err.message || err) });
  }
});

// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(ROOT_DIR, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`NEXA server running on http://localhost:${PORT}`);
});
