const token = localStorage.getItem('token');
if (!token) window.location.href = "/";

const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
let matchedClients = [];

function getErrorMessage(data, fallback = 'Error') {
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  if (Array.isArray(data.detail)) return data.detail.map((item) => item.msg || JSON.stringify(item)).join(' | ');
  if (typeof data.detail === 'object') return JSON.stringify(data.detail);
  return fallback;
}

function renderClientMatches(clients) {
  matchedClients = clients;
  const datalist = document.getElementById('clientMatches');
  datalist.innerHTML = clients
    .map((c) => `<option value="${c.nombre}">${c.nombre} · ${c.telefono} · ${c.email}</option>`)
    .join('');
}

async function loadClients(query = '') {
  const res = await fetch(`/api/admin/clientes?query=${encodeURIComponent(query)}`, { headers });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('adminMsg').textContent = getErrorMessage(data, 'No se pudieron cargar clientes.');
    return;
  }
  renderClientMatches(data);
}

async function loadAdminServices() {
  // Intenta con endpoint admin y si falla usa endpoint cliente como respaldo.
  let data = [];
  let lastError = null;

  for (const url of ['/api/admin/servicios', '/api/cliente/servicios']) {
    const res = await fetch(url, { headers });
    const body = await res.json();
    if (res.ok) {
      data = body;
      break;
    }
    lastError = body;
  }

  const select = document.getElementById('servicioId');
  select.innerHTML = '<option value="">Selecciona un servicio</option>' + data
    .map((s) => `<option value="${s.id}">${s.nombre} (${s.duracion_minutos} min) - $${s.precio}</option>`)
    .join('');

  if (!data.length) {
    document.getElementById('adminMsg').textContent = getErrorMessage(lastError, 'No se pudieron cargar servicios.');
  }
}

async function loadAdminAppointments() {
  const res = await fetch('/api/admin/citas', { headers });
  const data = await res.json();
  if (!res.ok) {
    document.getElementById('adminMsg').textContent = getErrorMessage(data, 'Sin permisos');
    return;
  }
  const tbody = document.getElementById('adminAppointments');
  tbody.innerHTML = data.map((c) => `<tr class="border-b">
    <td>${c.id}</td><td>${c.usuario_nombre}</td><td>${c.servicio_nombre}</td><td>${c.fecha}</td><td>${c.hora.slice(0, 5)}</td><td>${c.estado}</td>
    <td class="space-x-2"><button onclick="cancelAppointment(${c.id})" class="bg-rose-500 text-white px-2 py-1 rounded">Cancelar</button></td>
  </tr>`).join('');
}

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

window.cancelAppointment = async (id) => {
  await fetch(`/api/admin/citas/${id}`, { method: 'DELETE', headers });
  loadAdminAppointments(); // backend ya excluye canceladas
  loadAdminSummary();
};

document.getElementById('clientSearch')?.addEventListener('input', async (e) => {
  const value = e.target.value.trim();
  if (value.length < 2) {
    await loadClients('');
    return;
  }
  await loadClients(value);
});

document.getElementById('manualForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const clientSearchValue = document.getElementById('clientSearch').value.trim();
  const selectedServiceId = Number(document.getElementById('servicioId').value);

  if (!selectedServiceId) {
    document.getElementById('adminMsg').textContent = 'Selecciona un servicio para crear la cita.';
    return;
  }

  if (!clientSearchValue) {
    document.getElementById('adminMsg').textContent = 'Ingresa el nombre del cliente.';
    return;
  }

  const exactMatch = matchedClients.find((c) => (
    c.nombre.toLowerCase() === clientSearchValue.toLowerCase()
    || c.email.toLowerCase() === clientSearchValue.toLowerCase()
    || c.telefono.toLowerCase() === clientSearchValue.toLowerCase()
  ));

  const payload = {
    usuario_id: exactMatch ? exactMatch.id : null,
    cliente_nombre: exactMatch ? null : clientSearchValue,
    servicio_id: selectedServiceId,
    fecha: document.getElementById('manualFecha').value,
    hora: document.getElementById('manualHora').value,
  };

  const res = await fetch('/api/admin/citas', { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  document.getElementById('adminMsg').textContent = res.ok ? 'Cita creada' : getErrorMessage(data, 'Error al crear cita');
  if (res.ok) {
    document.getElementById('manualForm').reset();
    await loadClients('');
  }
  loadAdminAppointments();
  loadAdminSummary();
});

document.getElementById('serviceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const payload = {
    nombre: document.getElementById('nombreServicio').value,
    duracion_minutos: Number(document.getElementById('duracionServicio').value),
    precio: Number(document.getElementById('precioServicio').value),
  };
  const res = await fetch('/api/admin/servicios', { method: 'POST', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  document.getElementById('adminMsg').textContent = res.ok ? `Servicio creado (ID ${data.id})` : getErrorMessage(data, 'Error');
  if (res.ok) loadAdminServices();
});

document.getElementById('editServiceForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const id = document.getElementById('editServiceId').value;
  const payload = {};
  if (document.getElementById('editNombre').value) payload.nombre = document.getElementById('editNombre').value;
  if (document.getElementById('editDuracion').value) payload.duracion_minutos = Number(document.getElementById('editDuracion').value);
  if (document.getElementById('editPrecio').value) payload.precio = Number(document.getElementById('editPrecio').value);

  const res = await fetch(`/api/admin/servicios/${id}`, { method: 'PATCH', headers, body: JSON.stringify(payload) });
  const data = await res.json();
  document.getElementById('adminMsg').textContent = res.ok ? `Servicio ${data.nombre} actualizado` : getErrorMessage(data, 'Error');
  if (res.ok) loadAdminServices();
});

document.getElementById('logoutAdmin')?.addEventListener('click', () => {
  localStorage.removeItem('token');
  localStorage.removeItem('rol');
  window.location.href = "/";
});

loadAdminServices();
loadClients('');
loadAdminAppointments();
loadAdminSummary();
