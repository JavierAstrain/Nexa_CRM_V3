const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { v4: uuidv4 } = require('uuid');
const OpenAI = require('openai');

dotenv.config();

const ROOT_DIR = path.resolve(__dirname, '..');
// Permite configurar un directorio de datos (Render: DATA_DIR=/data)
const DATA_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : __dirname;
if (!fs.existsSync(DATA_DIR)) {
  try { fs.mkdirSync(DATA_DIR, { recursive: true }); } catch (e) { /* ignore */ }
}
const DB_PATH = path.join(DATA_DIR, 'db.json');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// Servir frontend
app.use(express.static(path.join(ROOT_DIR, 'public')));

// --- Helpers JSON DB ---
function loadDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf-8');
    return JSON.parse(data);
  } catch (err) {
    return { contacts: [], opportunities: [], tasks: [], interactions: [] };
  }
}
function saveDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2), 'utf-8');
}
if (!fs.existsSync(DB_PATH)) {
  saveDb({ contacts: [], opportunities: [], tasks: [], interactions: [] });
}

// --- CRUD: Contacts ---
app.get('/api/contacts', (req, res) => {
  const db = loadDb();
  res.json(db.contacts);
});

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
    interactionHistory: req.body.interactionHistory || [],
    createdAt: new Date().toISOString()
  };
  db.contacts.push(contact);
  saveDb(db);
  res.status(201).json(contact);
});

app.put('/api/contacts/:id', (req, res) => {
  const db = loadDb();
  const index = db.contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Contact not found' });
  db.contacts[index] = { ...db.contacts[index], ...req.body, id: db.contacts[index].id };
  saveDb(db);
  res.json(db.contacts[index]);
});

app.delete('/api/contacts/:id', (req, res) => {
  const db = loadDb();
  const index = db.contacts.findIndex(c => c.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Contact not found' });
  const [removed] = db.contacts.splice(index, 1);
  saveDb(db);
  res.json(removed);
});

// --- CRUD: Opportunities ---
const DEFAULT_STAGES = ['Prospecto', 'Calificado', 'Propuesta', 'Negociacion', 'Cerrado/Ganado', 'Cerrado/Perdido'];

app.get('/api/opportunities', (req, res) => {
  const db = loadDb();
  res.json(db.opportunities);
});

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
  db.opportunities.push(opportunity);
  saveDb(db);
  res.status(201).json(opportunity);
});

app.put('/api/opportunities/:id', (req, res) => {
  const db = loadDb();
  const index = db.opportunities.findIndex(o => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Opportunity not found' });
  db.opportunities[index] = { ...db.opportunities[index], ...req.body, id: db.opportunities[index].id };
  saveDb(db);
  res.json(db.opportunities[index]);
});

app.delete('/api/opportunities/:id', (req, res) => {
  const db = loadDb();
  const index = db.opportunities.findIndex(o => o.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Opportunity not found' });
  const [removed] = db.opportunities.splice(index, 1);
  saveDb(db);
  res.json(removed);
});

// --- CRUD: Tasks ---
app.get('/api/tasks', (req, res) => {
  const db = loadDb();
  res.json(db.tasks);
});

app.post('/api/tasks', (req, res) => {
  const db = loadDb();
  const task = {
    id: uuidv4(),
    title: req.body.title || '',
    dueDate: req.body.dueDate || null,
    status: req.body.status || 'pending',
    assignedTo: req.body.assignedTo || 'Me',
    linkedType: req.body.linkedType || null, // 'contact' | 'opportunity' | null
    linkedId: req.body.linkedId || null,
    notes: req.body.notes || ''
  };
  db.tasks.push(task);
  saveDb(db);
  res.status(201).json(task);
});

app.put('/api/tasks/:id', (req, res) => {
  const db = loadDb();
  const index = db.tasks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Task not found' });
  db.tasks[index] = { ...db.tasks[index], ...req.body, id: db.tasks[index].id };
  saveDb(db);
  res.json(db.tasks[index]);
});

app.delete('/api/tasks/:id', (req, res) => {
  const db = loadDb();
  const index = db.tasks.findIndex(t => t.id === req.params.id);
  if (index === -1) return res.status(404).json({ error: 'Task not found' });
  const [removed] = db.tasks.splice(index, 1);
  saveDb(db);
  res.json(removed);
});

// --- Dashboard metrics (extendido) ---
app.get('/api/metrics', (req, res) => {
  const db = loadDb();
  const now = new Date();
  const last30Days = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const newContacts = db.contacts.filter(c => {
    const createdAt = c.createdAt ? new Date(c.createdAt) : null;
    return createdAt ? createdAt >= last30Days : true;
  }).length;

  const totalPipelineValue = db.opportunities
    .filter(o => o.stage !== 'Cerrado/Perdido')
    .reduce((sum, o) => sum + (Number(o.value) || 0), 0);

  const byStage = DEFAULT_STAGES.reduce((acc, stage) => {
    acc[stage] = db.opportunities.filter(o => o.stage === stage).length;
    return acc;
  }, {});

  // Series de contactos por semana (8 semanas)
  const weeks = [];
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  for (let i = 7; i >= 0; i--) {
    const start = new Date(now.getTime() - i * weekMs);
    const end = new Date(start.getTime() + weekMs);
    weeks.push({ label: `${start.getMonth() + 1}/${start.getDate()}`, start, end });
  }
  const contactsSeries = weeks.map(w => db.contacts.filter(c => {
    if (!c.createdAt) return false;
    const d = new Date(c.createdAt);
    return d >= w.start && d < w.end;
  }).length);

  const tasksStatus = db.tasks.reduce((acc, t) => {
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

// --- IA OpenAI ---
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
    const value = Number(req.body.value || 0);
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

// IA: asesoría para trabajar al cliente
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
