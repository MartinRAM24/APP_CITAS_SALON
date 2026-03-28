// ── Configuración de tenants ──────────────────────────────
const TENANT_CFG = {
  salon:    { nombre: 'Salón de Belleza', emoji: '💅', color: '#7e57c2', light: '#f3e8ff' },
  podologo: { nombre: 'Podólogo',          emoji: '🦶', color: '#10b981', light: '#d1fae5' },
};

const token  = localStorage.getItem('token');
const tenant = localStorage.getItem('tenant') || 'salon';

if (!token) { window.location.href = '/'; }

const cfg     = TENANT_CFG[tenant] || TENANT_CFG.salon;
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

// ── Pintar header con colores del negocio ─────────────────
document.getElementById('tenantEmoji').textContent  = cfg.emoji;
document.getElementById('tenantLabel').textContent  = 'Panel de cliente';
document.getElementById('pageTitle').textContent    = cfg.nombre;
document.getElementById('pageTitle').style.color    = cfg.color;
document.getElementById('reservarBtn').style.background = cfg.color;
document.getElementById('logoutBtn').style.background   = cfg.color;
document.getElementById('summaryCard').style.background = cfg.light;
document.title = `Panel Cliente · ${cfg.nombre}`;

// ── Cargar nombre del usuario desde el token ──────────────
try {
  const payload = JSON.parse(atob(token.split('.')[1]));
  // el nombre no viene en el JWT; lo ocultamos si no hay
} catch {}

// ── Cargar servicios ──────────────────────────────────────
async function loadServices() {
  const res = await fetch('/api/cliente/servicios', { headers });
  if (!res.ok) return;
  const services = await res.json();
  const select = document.getElementById('servicio');
  select.innerHTML = services.length
    ? services.map(s => `<option value="${s.id}">${s.nombre} — $${s.precio} · ${s.duracion_minutos} min</option>`).join('')
    : '<option value="">No hay servicios disponibles</option>';
}

// ── Cargar citas ──────────────────────────────────────────
async function loadAppointments() {
  const res = await fetch('/api/cliente/citas', { headers });
  if (!res.ok) return;
  const rows = await res.json();
  const tbody = document.getElementById('appointmentsTable');

  const estadoColor = { agendada: 'text-green-600', cancelada: 'text-red-500', completada: 'text-slate-400' };

  tbody.innerHTML = rows.length
    ? rows.map(r => `
        <tr class="border-b hover:bg-slate-50">
          <td class="py-2">${r.servicio_nombre}</td>
          <td class="py-2">${r.fecha}</td>
          <td class="py-2">${r.hora.slice(0,5)}</td>
          <td class="py-2 font-medium ${estadoColor[r.estado] || ''}">${r.estado}</td>
        </tr>`).join('')
    : '<tr><td colspan="4" class="py-4 text-center text-slate-400">No tienes citas registradas aún</td></tr>';
}

// ── Cargar resumen ────────────────────────────────────────
async function loadSummary() {
  const res = await fetch('/api/cliente/resumen', { headers });
  if (!res.ok) return;
  const summary = await res.json();
  const next = document.getElementById('nextAppointment');
  next.textContent = summary.proxima_cita
    ? `${summary.proxima_cita.servicio} · ${summary.proxima_cita.fecha} a las ${summary.proxima_cita.hora}`
    : 'No tienes citas próximas. ¡Agenda la siguiente!';
  document.getElementById('todayCount').textContent = summary.citas_hoy;
}

// ── Agendar cita ──────────────────────────────────────────
document.getElementById('appointmentForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const msg = document.getElementById('clientMsg');
  const payload = {
    servicio_id: Number(document.getElementById('servicio').value),
    fecha: document.getElementById('fecha').value,
    hora: document.getElementById('hora').value + ':00',
  };
  const res = await fetch('/api/cliente/citas', { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  msg.textContent = res.ok ? '✓ Cita agendada con éxito.' : (data.detail || 'Error al agendar.');
  msg.style.color = res.ok ? cfg.color : '#ef4444';
  if (res.ok) { loadAppointments(); loadSummary(); }
});

// ── Logout ────────────────────────────────────────────────
document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.clear();
  window.location.href = '/';
});

// ── Inicializar ───────────────────────────────────────────
loadServices();
loadAppointments();
loadSummary();
