// ── Configuración de tenants ──────────────────────────────
const TENANT_CFG = {
  salon:    { nombre: 'Salón de Belleza', emoji: '💅', color: '#7e57c2', light: '#f3e8ff', badge: 'bg-purple-100 text-purple-700' },
  podologo: { nombre: 'Podólogo',          emoji: '🦶', color: '#10b981', light: '#d1fae5', badge: 'bg-green-100 text-green-700' },
};

const token  = localStorage.getItem('token');
const tenant = localStorage.getItem('tenant') || 'salon';
if (!token) window.location.href = '/';

const cfg     = TENANT_CFG[tenant] || TENANT_CFG.salon;
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
let matchedClients = [];

// ── Pintar header con colores del negocio ─────────────────
document.getElementById('tenantEmoji').textContent   = cfg.emoji;
document.getElementById('tenantLabel').textContent   = 'Panel de administración';
document.getElementById('pageTitle').textContent     = cfg.nombre;
document.getElementById('pageTitle').style.color     = cfg.color;
document.getElementById('crearCitaBtn').style.background = cfg.color;
document.getElementById('logoutAdmin').style.background  = cfg.color;
document.getElementById('summaryCard').style.background  = cfg.light;

const badge = document.getElementById('adminBadge');
badge.textContent = 'Admin · ' + cfg.nombre;
badge.className   = `text-xs px-2 py-1 rounded-full font-medium ${cfg.badge}`;
document.title    = `Panel Admin · ${cfg.nombre}`;

// ── Helpers ───────────────────────────────────────────────
function getErrorMessage(data, fallback = 'Error') {
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map(i => i.msg || JSON.stringify(i)).join(' | ');
  if (typeof data.detail === 'object') return JSON.stringify(data.detail);
  return fallback;
}

const estadoColor = { agendada: 'text-green-600', cancelada: 'text-red-400', completada: 'text-slate-400' };

// ── Clientes ──────────────────────────────────────────────
function renderClientMatches(clients) {
  matchedClients = clients;
  const datalist = document.getElementById('clientMatches');
  datalist.innerHTML = clients
    .map(c => `<option value="${c.nombre}">${c.nombre} · ${c.telefono} · ${c.email}</option>`)
    .join('');
}

async function loadClients(query = '') {
  const res  = await fetch(`/api/admin/clientes?query=${encodeURIComponent(query)}`, { headers });
  const data = await res.json();
  if (!res.ok) { document.getElementById('adminMsg').textContent = getErrorMessage(data, 'No se pudieron cargar clientes.'); return; }
  renderClientMatches(data);
}

// ── Servicios ─────────────────────────────────────────────
async function loadAdminServices() {
  let data = [], lastError = null;
  for (const url of ['/api/admin/servicios', '/api/cliente/servicios']) {
    const res  = await fetch(url, { headers });
    const body = await res.json();
    if (res.ok) { data = body; break; }
    lastError = body;
  }
  const select = document.getElementById('servicioId');
  select.innerHTML = '<option value="">Selecciona un servicio</option>'
    + data.map(s => `<option value="${s.id}">${s.nombre} (${s.duracion_minutos} min) — $${s.precio}</option>`).join('');
  if (!data.length)
    document.getElementById('adminMsg').textContent = getErrorMessage(lastError, 'No se pudieron cargar servicios.');
}

// ── Citas ─────────────────────────────────────────────────
async function loadAdminAppointments() {
  const res  = await fetch('/api/admin/citas', { headers });
  const data = await res.json();
  if (!res.ok) { document.getElementById('adminMsg').textContent = getErrorMessage(data, 'Sin permisos'); return; }

  const tbody = document.getElementById('adminAppointments');
  tbody.innerHTML = data.length
    ? data.map(c => `
        <tr class="border-b hover:bg-slate-50">
          <td class="py-2 text-slate-400">${c.id}</td>
          <td class="py-2 font-medium">${c.usuario_nombre}</td>
          <td class="py-2">${c.servicio_nombre}</td>
          <td class="py-2">${c.fecha}</td>
          <td class="py-2">${c.hora.slice(0,5)}</td>
          <td class="py-2 font-medium ${estadoColor[c.estado] || ''}">${c.estado}</td>
          <td class="py-2">
            <button onclick="cancelAppointment(${c.id})"
              class="bg-rose-500 text-white px-2 py-1 rounded text-xs hover:opacity-80 transition">
              Cancelar
            </button>
          </td>
        </tr>`).join('')
    : '<tr><td colspan="7" class="py-4 text-center text-slate-400">No hay citas registradas</td></tr>';
}

// ── Resumen ───────────────────────────────────────────────
async function loadAdminSummary() {
  const res = await fetch('/api/admin/resumen', { headers });
  if (!res.ok) return;
  const summary = await res.json();
  const next = document.getElementById('adminNext');
  next.textContent = summary.proxima_cita
    ? `${summary.proxima_cita.cliente} · ${summary.proxima_cita.servicio} · ${summary.proxima_cita.fecha} ${summary.proxima_cita.hora}`
    : 'No hay citas próximas.';
  document.getElementById('adminTodayCount').textContent = summary.citas_hoy;
}

// ── Cancelar cita ─────────────────────────────────────────
window.cancelAppointment = async (id) => {
  await fetch(`/api/admin/citas/${id}`, { method: 'DELETE', headers });
  loadAdminAppointments();
  loadAdminSummary();
};

// ── Buscar clientes al escribir ───────────────────────────
document.getElementById('clientSearch')?.addEventListener('input', async (e) => {
  const val = e.target.value.trim();
  await loadClients(val.length >= 2 ? val : '');
});

// ── Crear cita manual ─────────────────────────────────────
document.getElementById('manualForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const clientVal       = document.getElementById('clientSearch').value.trim();
  const selectedService = Number(document.getElementById('servicioId').value);
  const adminMsg        = document.getElementById('adminMsg');

  if (!selectedService) { adminMsg.textContent = 'Selecciona un servicio.'; return; }
  if (!clientVal)        { adminMsg.textContent = 'Ingresa el nombre del cliente.'; return; }

  const exactMatch = matchedClients.find(c =>
    c.nombre.toLowerCase() === clientVal.toLowerCase()
    || c.email.toLowerCase() === clientVal.toLowerCase()
    || c.telefono.toLowerCase() === clientVal.toLowerCase()
  );

  const payload = {
    usuario_id:     exactMatch ? exactMatch.id : null,
    cliente_nombre: exactMatch ? null : clientVal,
    servicio_id:    selectedService,
    fecha:          document.getElementById('manualFecha').value,
    hora:           document.getElementById('manualHora').value,
  };

  const res  = await fetch('/api/admin/citas', { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  adminMsg.textContent = res.ok ? '✓ Cita creada.' : getErrorMessage(data, 'Error al crear cita');
  adminMsg.style.color = res.ok ? cfg.color : '#ef4444';
  if (res.ok) { document.getElementById('manualForm').reset(); await loadClients(''); }
  loadAdminAppointments();
  loadAdminSummary();
});

// ── Crear servicio ────────────────────────────────────────
document.getElementById('serviceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre:           document.getElementById('nombreServicio').value,
    duracion_minutos: Number(document.getElementById('duracionServicio').value),
    precio:           Number(document.getElementById('precioServicio').value),
  };
  const res  = await fetch('/api/admin/servicios', { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  const msg  = document.getElementById('serviceMsg');
  msg.textContent = res.ok ? `✓ Servicio creado (ID ${data.id})` : getErrorMessage(data, 'Error');
  msg.style.color = res.ok ? cfg.color : '#ef4444';
  if (res.ok) loadAdminServices();
});

// ── Editar servicio ───────────────────────────────────────
document.getElementById('editServiceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id      = document.getElementById('editServiceId').value;
  const payload = {};
  if (document.getElementById('editNombre').value)   payload.nombre           = document.getElementById('editNombre').value;
  if (document.getElementById('editDuracion').value) payload.duracion_minutos = Number(document.getElementById('editDuracion').value);
  if (document.getElementById('editPrecio').value)   payload.precio           = Number(document.getElementById('editPrecio').value);

  const res  = await fetch(`/api/admin/servicios/${id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  const msg  = document.getElementById('editServiceMsg');
  msg.textContent = res.ok ? `✓ Servicio "${data.nombre}" actualizado` : getErrorMessage(data, 'Error');
  msg.style.color = res.ok ? cfg.color : '#ef4444';
  if (res.ok) loadAdminServices();
});

// ── Logout ────────────────────────────────────────────────
document.getElementById('logoutAdmin')?.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/';
});

// ── Inicializar ───────────────────────────────────────────
loadAdminServices();
loadClients('');
loadAdminAppointments();
loadAdminSummary();
