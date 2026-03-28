// ── Configuración de tenants ──────────────────────────────
const TENANTS = {
  salon: {
    nombre: 'Salón de Belleza',
    emoji: '💅',
    color: '#7e57c2',       // elegantPurple
    btnClass: 'bg-elegantPurple',
    badgeClass: 'bg-purple-100 text-purple-700',
  },
  podologo: {
    nombre: 'Podólogo',
    emoji: '🦶',
    color: '#10b981',       // podGreen
    btnClass: 'bg-podGreen',
    badgeClass: 'bg-green-100 text-green-700',
  },
};


let tenantActivo = null;
const msg = document.getElementById('message');

// ── Guardar/recuperar tenant en sessionStorage ────────────
function elegirNegocio(tenant) {
  tenantActivo = tenant;
  sessionStorage.setItem('tenant', tenant);
  mostrarAuthView(tenant);
}

function volverSelector() {
  tenantActivo = null;
  sessionStorage.removeItem('tenant');
  document.getElementById('selectorView').classList.remove('hidden');
  document.getElementById('authView').classList.add('hidden');
  if (msg) msg.textContent = '';
}

function mostrarAuthView(tenant) {
  const cfg = TENANTS[tenant];
  document.getElementById('selectorView').classList.add('hidden');
  document.getElementById('authView').classList.remove('hidden');

  // Badge y título
  const badge = document.getElementById('tenantBadge');
  badge.textContent = cfg.emoji + ' ' + cfg.nombre;
  badge.className = `px-3 py-1 rounded-full text-sm font-medium ${cfg.badgeClass}`;

  document.getElementById('tenantTitle').textContent = cfg.nombre;
  document.getElementById('tenantTitle').style.color = cfg.color;

  // Color de botones
  document.getElementById('registerBtn').style.background = cfg.color;
  document.getElementById('loginBtn').style.background = cfg.color;

  document.title = cfg.nombre + ' - Reserva tu cita';
}

// Si ya hay tenant guardado en sesión, mostrarlo directamente
const savedTenant = sessionStorage.getItem('tenant');
if (savedTenant && TENANTS[savedTenant]) {
  tenantActivo = savedTenant;
  mostrarAuthView(savedTenant);
}

// ── Registro ──────────────────────────────────────────────
document.getElementById('registerForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!tenantActivo) return;
  const fd = new FormData(e.target);
  const payload = { ...Object.fromEntries(fd.entries()), tenant: tenantActivo };
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  msg.textContent = res.ok
    ? 'Registro exitoso. Ahora inicia sesión.'
    : (data.detail || 'Error al registrar');
  msg.style.color = res.ok ? 'green' : 'red';
});

// ── Login ─────────────────────────────────────────────────
document.getElementById('loginForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!tenantActivo) return;
  const fd = new FormData(e.target);
  const payload = { ...Object.fromEntries(fd.entries()), tenant: tenantActivo };
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) {
    msg.textContent = data.detail || 'Credenciales inválidas';
    msg.style.color = 'red';
    return;
  }
  // Guardar token Y tenant para que cliente.js y admin.js los usen
  localStorage.setItem('token', data.access_token);
  localStorage.setItem('rol', data.rol);
  localStorage.setItem('tenant', data.tenant);

  msg.textContent = data.rol === 'admin' ? 'Login correcto. Redirigiendo al panel...' : 'Login correcto.';
  msg.style.color = 'green';
  window.location.href = data.rol === 'admin' ? '/admin' : '/cliente';
});
