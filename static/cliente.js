const token = localStorage.getItem('token');
if (!token) window.location.href = "/";

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };

async function loadServices() {
  const res = await fetch('/api/cliente/servicios', { headers });
  if (!res.ok) return;
  const services = await res.json();
  const select = document.getElementById('servicio');
  select.innerHTML = services.map(s => `<option value="${s.id}">${s.nombre} - $${s.precio}</option>`).join('');
}

async function loadAppointments() {
  const res = await fetch('/api/cliente/citas', { headers });
  if (!res.ok) return;
  const rows = await res.json();
  const table = document.getElementById('appointmentsTable');
  table.innerHTML = rows.map(r => `<tr class="border-b"><td>${r.servicio_nombre}</td><td>${r.fecha}</td><td>${r.hora.slice(0,5)}</td><td>${r.estado}</td></tr>`).join('');
}

async function loadSummary() {
  const res = await fetch('/api/cliente/resumen', { headers });
  if (!res.ok) return;
  const summary = await res.json();
  const next = document.getElementById('nextAppointment');
  if (summary.proxima_cita) {
    next.textContent = `${summary.proxima_cita.servicio} · ${summary.proxima_cita.fecha} ${summary.proxima_cita.hora}`;
  } else {
    next.textContent = 'No tienes citas próximas. ¡Agenda la siguiente!';
  }
  document.getElementById('todayCount').textContent = summary.citas_hoy;
}

document.getElementById('appointmentForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    servicio_id: Number(document.getElementById('servicio').value),
    fecha: document.getElementById('fecha').value,
    hora: document.getElementById('hora').value,
  };
  const res = await fetch('/api/cliente/citas', {
    method: 'POST', headers, body: JSON.stringify(payload)
  });
  const data = await res.json();
  document.getElementById('clientMsg').textContent = res.ok ? 'Cita agendada con éxito' : (data.detail || 'Error');
  if (res.ok) {
    loadAppointments();
    loadSummary();
  }
});

document.getElementById('logoutBtn')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  window.location.href = "/";
});

loadServices();
loadAppointments();
loadSummary();
