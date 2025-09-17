const api = {
  async get(path) { const r = await fetch(path); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async post(path, body) { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async put(path, body) { const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async del(path) { const r = await fetch(path, { method: 'DELETE' }); if (!r.ok) throw new Error(await r.text()); return r.json(); }
};

const tabs = ['dashboard','contacts','opportunities','tasks'];
function switchTo(tab) {
  tabs.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.querySelector(`button[data-tab="${t}"]`);
    if (btn) {
      if (t === tab) { btn.classList.add('bg-slate-800/60','text-slate-200'); btn.classList.remove('text-slate-300'); }
      else { btn.classList.remove('bg-slate-800/60','text-slate-200'); btn.classList.add('text-slate-300'); }
    }
  });
}
document.querySelectorAll('button[data-tab]').forEach(btn => btn.addEventListener('click', () => switchTo(btn.dataset.tab)));

async function loadMetrics() {
  try {
    const m = await api.get('/api/metrics');
    document.getElementById('metric-new-contacts').textContent = String(m.newContacts);
    document.getElementById('metric-pipeline-value').textContent = `$${(m.totalPipelineValue || 0).toLocaleString()}`;
    const cont = document.getElementById('metric-by-stage'); cont.innerHTML = '';
    Object.entries(m.byStage || {}).forEach(([stage, count]) => {
      const span = document.createElement('span'); span.className = 'tag text-xs rounded px-2 py-1 mr-2 inline-block mb-1';
      span.textContent = `${stage}: ${count}`; cont.appendChild(span);
    });
  } catch {}
}

// Contacts
const contactTpl = document.getElementById('contact-card');
async function loadContacts() {
  const list = document.getElementById('contacts-list'); list.innerHTML = '';
  const contacts = await api.get('/api/contacts'); contacts.forEach(c => list.appendChild(renderContact(c)));
}
function renderContact(contact) {
  const node = contactTpl.content.cloneNode(true); const root = node.querySelector('.card'); root.dataset.id = contact.id;
  root.querySelector('.name').textContent = contact.name || '-';
  root.querySelector('.email').textContent = contact.email || '';
  root.querySelector('.phone').textContent = contact.phone || '';
  root.querySelector('.company').textContent = contact.company || '';
  root.querySelector('.status').textContent = contact.status || '';
  const notesEl = root.querySelector('.notes'); notesEl.value = contact.notes || '';
  const summaryEl = root.querySelector('.summary');

  root.querySelector('.delete').addEventListener('click', async () => { await api.del(`/api/contacts/${contact.id}`); await loadContacts(); await loadMetrics(); });
  root.querySelector('.save').addEventListener('click', async () => {
    const updated = {
      name: root.querySelector('.name').textContent,
      email: root.querySelector('.email').textContent,
      phone: root.querySelector('.phone').textContent,
      company: root.querySelector('.company').textContent,
      status: root.querySelector('.status').textContent,
      notes: notesEl.value
    };
    await api.put(`/api/contacts/${contact.id}`, updated);
  });
  root.querySelector('.summarize').addEventListener('click', async () => {
    summaryEl.textContent = 'Generando resumen...';
    try { const r = await api.post('/api/ai/summarize', { notes: notesEl.value }); summaryEl.textContent = r.summary || ''; }
    catch { summaryEl.textContent = 'Error al generar resumen.'; }
  });
  return node;
}
document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries());
  await api.post('/api/contacts', data); e.target.reset(); await loadContacts(); await loadMetrics();
});

// Opportunities
const STAGES = ['Prospecto','Calificado','Propuesta','Negociacion','Cerrado/Ganado','Cerrado/Perdido'];
const colTpl = document.getElementById('kanban-column'); const oppTpl = document.getElementById('opportunity-card');
async function loadOpps() {
  const kanban = document.getElementById('kanban'); kanban.innerHTML = '';
  const opps = await api.get('/api/opportunities');
  STAGES.forEach(stage => {
    const colNode = colTpl.content.cloneNode(true); const colRoot = colNode.querySelector('.kanban-col');
    colRoot.querySelector('.title').textContent = stage; const items = colRoot.querySelector('.items');
    opps.filter(o => o.stage === stage).forEach(o => items.appendChild(renderOpp(o))); kanban.appendChild(colNode);
  });
}
function renderOpp(opp) {
  const node = oppTpl.content.cloneNode(true); const root = node.querySelector('.card'); root.dataset.id = opp.id;
  root.querySelector('.title').textContent = opp.title || '-';
  root.querySelector('.value').textContent = `Valor: $${(opp.value || 0).toLocaleString()}`;
  const descEl = root.querySelector('.description'); descEl.value = opp.description || '';
  const probEl = root.querySelector('.probability'); probEl.value = String(opp.probability || 0);
  const stageEl = root.querySelector('.stage'); if (stageEl) stageEl.value = opp.stage || 'Prospecto';
  root.querySelector('.id').textContent = opp.id;

  root.querySelector('.delete').addEventListener('click', async () => { await api.del(`/api/opportunities/${opp.id}`); await loadOpps(); await loadMetrics(); });
  root.querySelector('.predict').addEventListener('click', async () => {
    try {
      const r = await api.post('/api/ai/predict', { description: descEl.value, value: opp.value });
      probEl.value = r.probability; await api.put(`/api/opportunities/${opp.id}`, { probability: r.probability, description: descEl.value }); await loadMetrics();
    } catch { alert('Error al predecir probabilidad'); }
  });
  descEl.addEventListener('blur', async () => { await api.put(`/api/opportunities/${opp.id}`, { description: descEl.value }); });
  probEl.addEventListener('change', async () => {
    const p = Math.max(0, Math.min(100, Number(probEl.value || 0))); probEl.value = String(p);
    await api.put(`/api/opportunities/${opp.id}`, { probability: p }); await loadMetrics();
  });
  if (stageEl) stageEl.addEventListener('change', async () => { await api.put(`/api/opportunities/${opp.id}`, { stage: stageEl.value }); await loadOpps(); await loadMetrics(); });
  return node;
}
document.getElementById('btn-new-opp').addEventListener('click', async () => {
  const title = prompt('Título de oportunidad'); if (!title) return;
  await api.post('/api/opportunities', { title, value: 0, stage: 'Prospecto' }); await loadOpps(); await loadMetrics();
});

// Tasks
const taskTpl = document.getElementById('task-card');
async function loadTasks() {
  const list = document.getElementById('tasks-list'); list.innerHTML = '';
  const tasks = await api.get('/api/tasks'); tasks.forEach(t => list.appendChild(renderTask(t)));
}
function renderTask(task) {
  const node = taskTpl.content.cloneNode(true); const root = node.querySelector('.card'); root.dataset.id = task.id;
  root.querySelector('.title').textContent = task.title || '-';
  root.querySelector('.due').textContent = task.dueDate ? `Vence: ${task.dueDate}` : 'Sin fecha';
  root.querySelector('.link').textContent = (task.linkedType && task.linkedId) ? `${task.linkedType} · ${task.linkedId}` : '';
  const notesEl = root.querySelector('.notes'); notesEl.value = task.notes || '';
  const statusEl = root.querySelector('.status'); statusEl.value = task.status || 'pending';
  root.querySelector('.id').textContent = task.id;
  root.querySelector('.delete').addEventListener('click', async () => { await api.del(`/api/tasks/${task.id}`); await loadTasks(); });
  root.querySelector('.save').addEventListener('click', async () => { await api.put(`/api/tasks/${task.id}`, { notes: notesEl.value, status: statusEl.value }); });
  return node;
}
document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault(); const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.title) return; await api.post('/api/tasks', data); e.target.reset(); await loadTasks();
});

switchTo('dashboard'); loadMetrics(); loadContacts(); loadOpps(); loadTasks();
