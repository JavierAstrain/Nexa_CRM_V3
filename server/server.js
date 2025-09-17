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
if (!fs.existsSync(DATA_DIR)) { try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) {} }
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

// Contacts
app.get('/api/contacts', (req, res) => res.json(loadDb().contacts));
app.post('/api/contacts', (req, res) => {
  const db = loadDb();
  const contact = {
    id: uuidv4(),
    name: req.body.name || '',
    email: req.body.email || '',
    phone: req.body.phone || '',
    company: req.body.company || '',
    status: req.body.status || 'Prospect',
    notes: req.body.notes || '',
    interactionHistory: req.body.interactionHistory || []
  };
  db.contacts.push(contact); saveDb(db); res.status(201).json(contact);
});
app.put('/api/contacts/:id', (req, res) => {
  const db = loadDb(); const i = db.contacts.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Contact not found' });
  db.contacts[i] = { ...db.contacts[i], ...req.body, id: db.contacts[i].id }; saveDb(db); res.json(db.contacts[i]);
});
app.delete('/api/contacts/:id', (req, res) => {
  const db = loadDb(); const i = db.contacts.findIndex(c => c.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Contact not found' });
  const [removed] = db.contacts.splice(i, 1); saveDb(db); res.json(removed);
});

// Opportunities
const DEFAULT_STAGES = ['Prospecto', 'Calificado', 'Propuesta', 'Negociacion', 'Cerrado/Ganado', 'Cerrado/Perdido'];
app.get('/api/opportunities', (req, res) => res.json(loadDb().opportunities));
app.post('/api/opportunities', (req, res) => {
  const db = loadDb();
  const opportunity = {
    id: uuidv4(),
    contactId: req.body.contactId || null,
    title: req.body.title || '',
    value: Number(req.body.value || 0),
    probability: Number(req.body.probability || 0),
    estimatedCloseDate: req.body.estimatedCloseDate || null,
    description: req.body.description || '',
    stage: req.body.stage || DEFAULT_STAGES[0]
  };
  db.opportunities.push(opportunity); saveDb(db); res.status(201).json(opportunity);
});
app.put('/api/opportunities/:id', (req, res) => {
  const db = loadDb(); const i = db.opportunities.findIndex(o => o.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Opportunity not found' });
  db.opportunities[i] = { ...db.opportunities[i], ...req.body, id: db.opportunities[i].id }; saveDb(db); res.json(db.opportunities[i]);
});
app.delete('/api/opportunities/:id', (req, res) => {
  const db = loadDb(); const i = db.opportunities.findIndex(o => o.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Opportunity not found' });
  const [removed] = db.opportunities.splice(i, 1); saveDb(db); res.json(removed);
});

// Tasks
app.get('/api/tasks', (req, res) => res.json(loadDb().tasks));
app.post('/api/tasks', (req, res) => {
  const db = loadDb();
  const task = {
    id: uuidv4(),
    title: req.body.title || '',
    dueDate: req.body.dueDate || null,
    status: req.body.status || 'pending',
    assignedTo: req.body.assignedTo || 'Me',
    linkedType: req.body.linkedType || null,
    linkedId: req.body.linkedId || null,
    notes: req.body.notes || ''
  };
  db.tasks.push(task); saveDb(db); res.status(201).json(task);
});
app.put('/api/tasks/:id', (req, res) => {
  const db = loadDb(); const i = db.tasks.findIndex(t => t.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Task not found' });
  db.tasks[i] = { ...db.tasks[i], ...req.body, id: db.tasks[i].id }; saveDb(db); res.json(db.tasks[i]);
});
app.delete('/api/tasks/:id', (req, res) => {
  const db = loadDb(); const i = db.tasks.findIndex(t => t.id === req.params.id);
  if (i === -1) return res.status(404).json({ error: 'Task not found' });
  const [removed] = db.tasks.splice(i, 1); saveDb(db); res.json(removed);
});

// Metrics
app.get('/api/metrics', (req, res) => {
  const db = loadDb(); const now = new Date(); const last30 = new Date(now.getTime() - 30*24*60*60*1000);
  const newContacts = db.contacts.filter(c => (c.createdAt ? new Date(c.createdAt) >= last30 : true)).length;
  const totalPipelineValue = db.opportunities.filter(o => o.stage !== 'Cerrado/Perdido').reduce((s,o)=>s+(Number(o.value)||0),0);
  const byStage = DEFAULT_STAGES.reduce((acc, s)=>{ acc[s] = db.opportunities.filter(o=>o.stage===s).length; return acc; },{});
  res.json({ newContacts, totalPipelineValue, byStage });
});

// AI
const openaiApiKey = process.env.OPENAI_API_KEY || 'YOUR_OPENAI_API_KEY_HERE';
const openai = new OpenAI({ apiKey: openaiApiKey });

app.post('/api/ai/summarize', async (req, res) => {
  try {
    const notes = String(req.body.notes || '').slice(0, 6000);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres un asistente para CRM. Resume en 3-5 oraciones, tono profesional, español.' },
        { role: 'user', content: `Notas del historial:\n${notes}` }
      ],
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
    const value = Number(req.body.value || 0);
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Eres analista de ventas. Devuelve solo un número entero 0-100.' },
        { role: 'user', content: `Descripcion: ${description}\nValor: ${value}\nDevuelve SOLO el porcentaje estimado (0-100).` }
      ],
    });
    let content = completion.choices?.[0]?.message?.content?.trim() || '0';
    const match = content.match(/\d{1,3}/);
    const probability = match ? Math.min(100, Math.max(0, parseInt(match[0], 10))) : 0;
    res.json({ probability });
  } catch (err) {
    res.status(500).json({ error: 'AI prediction failed', details: String(err.message || err) });
  }
});

app.get('*', (req, res) => { res.sendFile(path.join(ROOT_DIR, 'public', 'index.html')); });
app.listen(PORT, () => { console.log(`NEXA server running on http://localhost:${PORT}`); });
