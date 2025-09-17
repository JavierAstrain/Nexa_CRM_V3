const api = {
  async get(path) { const r = await fetch(path); if (!r.ok) throw new Error(await r.text()); return r.json(); },
  async post(path, body) { const r = await fetch(path, { method: 'POST', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await resToText(r)); return r.json(); },
  async put(path, body) { const r = await fetch(path, { method: 'PUT', headers: { 'Content-Type':'application/json' }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(await resToText(r)); return r.json(); },
  async del(path) { const r = await fetch(path, { method: 'DELETE' }); if (!r.ok) throw new Error(await resToText(r)); return r.json(); }
};
async function resToText(r){ try{ return await r.text(); }catch{ return 'Error'; } }

function showToast(message, type='info') {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = message;
  document.body.appendChild(t);
  setTimeout(()=>{ t.remove(); }, 2500);
}

// Tabs
const tabs = ['dashboard', 'contacts', 'opportunities', 'tasks', 'ai'];
function switchTo(tab) {
  tabs.forEach(t => {
    document.getElementById(`tab-${t}`).classList.toggle('hidden', t !== tab);
    const btn = document.querySelector(`button[data-tab="${t}"]`);
    if (btn) {
      if (t === tab) { btn.classList.add('bg-slate-800/60', 'text-slate-200'); btn.classList.remove('text-slate-300'); }
      else { btn.classList.remove('bg-slate-800/60', 'text-slate-200'); btn.classList.add('text-slate-300'); }
    }
  });
}
document.querySelectorAll('button[data-tab]').forEach(btn => btn.addEventListener('click', () => switchTo(btn.dataset.tab)));

// Dashboard
async function loadMetrics() {
  try {
    const m = await api.get('/api/metrics');
    document.getElementById('metric-new-contacts').textContent = String(m.newContacts);
    document.getElementById('metric-pipeline-value').textContent = `$${(m.totalPipelineValue || 0).toLocaleString()}`;
    const cont = document.getElementById('metric-by-stage');
    cont.innerHTML = '';
    Object.entries(m.byStage || {}).forEach(([stage, count]) => {
      const span = document.createElement('span');
      span.className = 'tag text-xs rounded px-2 py-1 mr-2 inline-block mb-1';
      span.textContent = `${stage}: ${count}`;
      cont.appendChild(span);
    });
    renderCharts(m);
  } catch {}
}

// Charts
let contactsChart, tasksChart;
function renderCharts(m) {
  if (!window.Chart) return;
  const ctx1 = document.getElementById('chart-contacts');
  if (ctx1) {
    if (contactsChart) contactsChart.destroy();
    contactsChart = new Chart(ctx1, {
      type: 'line',
      data: {
        labels: m.contactsSeries?.labels || [],
        datasets: [{ label: 'Contactos', data: m.contactsSeries?.data || [], borderColor: '#60a5fa', backgroundColor: 'rgba(96,165,250,0.2)', tension: 0.3, fill: true }]
      },
      options: { plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }
    });
  }
  const ctx2 = document.getElementById('chart-tasks');
  if (ctx2) {
    if (tasksChart) tasksChart.destroy();
    const labels = Object.keys(m.tasksStatus || {});
    const data = Object.values(m.tasksStatus || {});
    tasksChart = new Chart(ctx2, {
      type: 'doughnut',
      data: { labels, datasets: [{ data, backgroundColor: ['#10b981','#f59e0b','#ef4444','#3b82f6','#8b5cf6'] }] },
      options: { plugins: { legend: { labels: { color: '#cbd5e1' } } } }
    });
  }
}

// Contacts
const contactTpl = document.getElementById('contact-card');
let contactsCache = [];
let contactsShowArchived = false;
let contactsSearch = '';
let contactsSort = 'createdAt:desc';

async function loadContacts() {
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';
  const qs = contactsShowArchived ? '?includeArchived=true' : '';
  contactsCache = await api.get('/api/contacts' + qs);
  renderContacts();
}
function renderContacts() {
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';
  let items = [...contactsCache];
  const search = contactsSearch.trim().toLowerCase();
  if (search) {
    items = items.filter(c => (c.name || '').toLowerCase().includes(search) || (c.company || '').toLowerCase().includes(search));
  }
  const [field, dir] = contactsSort.split(':');
  items.sort((a,b) => {
    const av = (a[field] || '').toString().toLowerCase();
    const bv = (b[field] || '').toString().toLowerCase();
    if (av < bv) return dir === 'asc' ? -1 : 1;
    if (av > bv) return dir === 'asc' ? 1 : -1;
    return 0;
  });
  items.forEach(c => list.appendChild(renderContact(c)));
}
function renderContact(contact) {
  const node = contactTpl.content.cloneNode(true);
  const root = node.querySelector('.card');
  root.dataset.id = contact.id;
  root.querySelector('.name').textContent = contact.name || '-';
  root.querySelector('.email').textContent = contact.email || '';
  root.querySelector('.phone').textContent = contact.phone || '';
  root.querySelector('.company').textContent = contact.company || '';
  root.querySelector('.status').textContent = contact.status || '';
  const notesEl = root.querySelector('.notes');
  notesEl.value = contact.notes || '';
  const summaryEl = root.querySelector('.summary');

  root.querySelector('.delete').addEventListener('click', async () => {
    if (!confirm('¿Archivar este contacto?')) return;
    await api.del(`/api/contacts/${contact.id}`);
    showToast('Contacto archivado');
    await loadContacts();
    await loadMetrics();
  });

  root.querySelector('.save').addEventListener('click', async () => {
    const updated = {
      name: root.querySelector('.name').textContent,
      email: root.querySelector('.email').textContent,
      phone: root.querySelector('.phone').textContent,
      company: root.querySelector('.company').textContent,
      status: root.querySelector('.status').textContent,
      notes: notesEl.value
    };
    try { await api.put(`/api/contacts/${contact.id}`, updated); showToast('Contacto guardado'); }
    catch (e) { alert('Error al guardar contacto'); }
  });

  root.querySelector('.summarize').addEventListener('click', async () => {
    summaryEl.textContent = 'Generando resumen...';
    try {
      const res = await api.post('/api/ai/summarize', { notes: notesEl.value });
      summaryEl.textContent = res.summary || '';
    } catch { summaryEl.textContent = 'Error al generar resumen.'; }
  });

  if (contact.archived) {
    const badge = document.createElement('div');
    badge.className = 'text-xs text-red-300';
    badge.textContent = 'Archivado';
    root.prepend(badge);
  }

  return node;
}
document.getElementById('contacts-search').addEventListener('input', (e)=>{ contactsSearch = e.target.value; renderContacts(); });
document.getElementById('contacts-sort').addEventListener('change', (e)=>{ contactsSort = e.target.value; renderContacts(); });
document.getElementById('contacts-archived').addEventListener('change', async (e)=>{ contactsShowArchived = e.target.checked; await loadContacts(); });
document.getElementById('contacts-export').addEventListener('click', ()=> exportCsv(contactsCache,'contacts'));

document.getElementById('contact-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.name?.trim()) { showToast('Nombre es requerido'); return; }
  if (data.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { showToast('Email inválido'); return; }
  try {
    await api.post('/api/contacts', data);
    e.target.reset();
    showToast('Contacto creado');
    await loadContacts();
    await loadMetrics();
  } catch (err) {
    alert(tryParseErr(err));
  }
});

// Opportunities
const STAGES = ['Prospecto', 'Calificado', 'Propuesta', 'Negociacion', 'Cerrado/Ganado', 'Cerrado/Perdido'];
const colTpl = document.getElementById('kanban-column');
const oppTpl = document.getElementById('opportunity-card');
let oppsShowArchived = false;

async function loadOpps() {
  const kanban = document.getElementById('kanban');
  kanban.innerHTML = '';
  const qs = oppsShowArchived ? '?includeArchived=true' : '';
  const opps = await api.get('/api/opportunities' + qs);
  STAGES.forEach(stage => {
    const colNode = colTpl.content.cloneNode(true);
    const colRoot = colNode.querySelector('.kanban-col');
    colRoot.querySelector('.title').textContent = stage;
    const items = colRoot.querySelector('.items');
    opps.filter(o => o.stage === stage).forEach(o => items.appendChild(renderOpp(o)));
    kanban.appendChild(colNode);
  });
}
function renderOpp(opp) {
  const node = oppTpl.content.cloneNode(true);
  const root = node.querySelector('.card');
  root.dataset.id = opp.id;
  root.querySelector('.title').textContent = opp.title || '-';
  root.querySelector('.value').textContent = `Valor: $${(opp.value || 0).toLocaleString()}`;
  const descEl = root.querySelector('.description'); descEl.value = opp.description || '';
  const probEl = root.querySelector('.probability'); probEl.value = String(opp.probability || 0);
  const stageEl = root.querySelector('.stage'); if (stageEl) stageEl.value = opp.stage || 'Prospecto';
  root.querySelector('.id').textContent = opp.id;

  root.querySelector('.delete').addEventListener('click', async () => {
    if (!confirm('¿Archivar esta oportunidad?')) return;
    await api.del(`/api/opportunities/${opp.id}`);
    showToast('Oportunidad archivada');
    await loadOpps();
    await loadMetrics();
  });

  root.querySelector('.predict').addEventListener('click', async () => {
    try {
      const res = await api.post('/api/ai/predict', { description: descEl.value, value: opp.value });
      probEl.value = res.probability;
      await api.put(`/api/opportunities/${opp.id}`, { probability: res.probability, description: descEl.value });
      await loadMetrics();
      showToast('Probabilidad actualizada');
    } catch { alert('Error al predecir probabilidad'); }
  });

  descEl.addEventListener('blur', async () => {
    await api.put(`/api/opportunities/${opp.id}`, { description: descEl.value });
  });
  probEl.addEventListener('change', async () => {
    const p = Math.max(0, Math.min(100, Number(probEl.value || 0)));
    probEl.value = String(p);
    await api.put(`/api/opportunities/${opp.id}`, { probability: p });
    await loadMetrics();
  });

  if (stageEl) {
    stageEl.addEventListener('change', async () => {
      await api.put(`/api/opportunities/${opp.id}`, { stage: stageEl.value });
      await loadOpps();
      await loadMetrics();
    });
  }

  if (opp.archived) {
    const badge = document.createElement('div');
    badge.className = 'text-xs text-red-300';
    badge.textContent = 'Archivada';
    root.prepend(badge);
  }

  return node;
}
document.getElementById('opps-archived').addEventListener('change', async (e)=>{ oppsShowArchived = e.target.checked; await loadOpps(); });
document.getElementById('opps-export').addEventListener('click', async ()=> {
  const qs = oppsShowArchived ? '?includeArchived=true' : '';
  const opps = await api.get('/api/opportunities' + qs);
  exportCsv(opps,'opportunities');
});

document.getElementById('btn-new-opp').addEventListener('click', async () => {
  const title = prompt('Título de oportunidad'); if (!title) return;
  await api.post('/api/opportunities', { title, value: 0, stage: 'Prospecto' });
  showToast('Oportunidad creada');
  await loadOpps();
  await loadMetrics();
});

// Tasks
const taskTpl = document.getElementById('task-card');
let tasksShowArchived = false;

async function loadTasks() {
  const list = document.getElementById('tasks-list');
  list.innerHTML = '';
  const qs = tasksShowArchived ? '?includeArchived=true' : '';
  const tasks = await api.get('/api/tasks' + qs);
  tasks.forEach(t => list.appendChild(renderTask(t)));
}
function renderTask(task) {
  const node = taskTpl.content.cloneNode(true);
  const root = node.querySelector('.card');
  root.dataset.id = task.id;
  root.querySelector('.title').textContent = task.title || '-';

  const due = root.querySelector('.due');
  if (task.dueDate) {
    const today = new Date(); today.setHours(0,0,0,0);
    const dd = new Date(task.dueDate); dd.setHours(0,0,0,0);
    const cls = dd < today ? 'due-past' : ((dd - today) / (1000*60*60*24) <= 2 ? 'due-soon' : '');
    due.innerHTML = `Vence: <span class="${cls}">${task.dueDate}</span>`;
  } else {
    due.textContent = 'Sin fecha';
  }

  root.querySelector('.link').textContent = (task.linkedType && task.linkedId) ? `${task.linkedType} · ${task.linkedId}` : '';
  const notesEl = root.querySelector('.notes'); notesEl.value = task.notes || '';
  const statusEl = root.querySelector('.status'); statusEl.value = task.status || 'pending';
  root.querySelector('.id').textContent = task.id;

  root.querySelector('.delete').addEventListener('click', async () => {
    if (!confirm('¿Archivar esta tarea?')) return;
    await api.del(`/api/tasks/${task.id}`);
    showToast('Tarea archivada');
    await loadTasks();
  });
  root.querySelector('.save').addEventListener('click', async () => {
    await api.put(`/api/tasks/${task.id}`, { notes: notesEl.value, status: statusEl.value });
    showToast('Tarea guardada');
  });
  return node;
}
document.getElementById('tasks-archived').addEventListener('change', async (e)=>{ tasksShowArchived = e.target.checked; await loadTasks(); });
document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const data = Object.fromEntries(new FormData(e.target).entries());
  if (!data.title?.trim()) { showToast('Título requerido'); return; }
  await api.post('/api/tasks', data);
  e.target.reset();
  showToast('Tarea creada');
  await loadTasks();
});
document.getElementById('tasks-export').addEventListener('click', async ()=> {
  const qs = tasksShowArchived ? '?includeArchived=true' : '';
  const tasks = await api.get('/api/tasks' + qs);
  exportCsv(tasks,'tasks');
});

// Init
switchTo('dashboard');
loadMetrics();
loadContacts();
loadOpps();
loadTasks();

// AI tab
async function loadAiContacts() {
  const sel = document.getElementById('ai-contact');
  if (!sel) return;
  const contacts = await api.get('/api/contacts');
  sel.innerHTML = '<option value="">Selecciona un contacto</option>' + contacts.map(c => `<option value="${c.id}">${c.name || c.email || c.id}</option>`).join('');
}
document.getElementById('ai-advise')?.addEventListener('click', async () => {
  const sel = document.getElementById('ai-contact');
  const ctx = document.getElementById('ai-context');
  const out = document.getElementById('ai-output');
  out.textContent = 'Analizando...';
  try {
    const contacts = await api.get('/api/contacts');
    const contact = contacts.find(c => c.id === sel.value);
    const res = await api.post('/api/ai/advise', { contact, opportunityDescription: ctx.value });
    out.textContent = res.advice || '';
  } catch { out.textContent = 'Error al analizar.'; }
});
document.querySelector('button[data-tab="ai"]').addEventListener('click', loadAiContacts);

// CSV export helper
function exportCsv(rows, name) {
  if (!rows?.length) { showToast('No hay datos'); return; }
  const headers = Array.from(new Set(rows.flatMap(r => Object.keys(r))));
  const escape = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const csv = [headers.map(escape).join(','), ...rows.map(r => headers.map(h => escape(r[h])).join(','))].join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${name}.csv`; a.click();
  URL.revokeObjectURL(url);
}

function tryParseErr(err) {
  try { return JSON.parse(err.message).error || err.message; } catch { return err.message || 'Error'; }
}
