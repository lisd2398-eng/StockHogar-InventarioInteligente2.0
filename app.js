// ============================================================
// STOCKHOGAR - app.js
// ============================================================

const DIAS_ALERTA = 3;
let escanerActivo = false;
let html5QrCode = null;
let productoEnEdicion = null;
let filtroInventario = 'todos';
let categoriaActual = null;
let pantallaRetorno = 'pantalla-inventario';

// --- 0. INICIALIZACIÓN ---
document.addEventListener('DOMContentLoaded', function() {
    const modoOscuro = localStorage.getItem('modoOscuro') === 'true';
    if (modoOscuro) {
        document.body.classList.add('modo-oscuro');
        document.body.classList.remove('modo-claro');
    }
    const sesion = getSesion();
    if (sesion) irA('pantalla-home');
});

// --- HELPERS: inventario por usuario ---
function getSesion() { return JSON.parse(localStorage.getItem('sesionActiva')); }
function getInventarioKey() {
    const s = getSesion();
    return (!s || !s.correo) ? 'inventario_anonimo' : 'inventario_' + s.correo;
}
function getInventario() { return JSON.parse(localStorage.getItem(getInventarioKey())) || []; }
function setInventario(inv) { localStorage.setItem(getInventarioKey(), JSON.stringify(inv)); }

// --- 1. NAVEGACIÓN ---
function irA(idPantalla) {
    if (escanerActivo && idPantalla !== 'pantalla-agregar') detenerEscaner();
    document.querySelectorAll('.pantalla').forEach(p => p.classList.remove('activa'));
    const p = document.getElementById(idPantalla);
    if (p) p.classList.add('activa');

    const nav = document.getElementById('barra-nav');
    const conNav = ['pantalla-home','pantalla-inventario','pantalla-categorias','pantalla-ajustes'];
    if (nav) nav.style.display = conNav.includes(idPantalla) ? 'flex' : 'none';

    if (idPantalla === 'pantalla-home')                 actualizarHome();
    if (idPantalla === 'pantalla-inventario')           cargarInventario();
    if (idPantalla === 'pantalla-categorias')           cargarCategorias();
    if (idPantalla === 'pantalla-ajustes')              cargarAjustes();
    if (idPantalla === 'pantalla-notificaciones')       cargarNotificaciones();
    if (idPantalla === 'pantalla-detalle-categoria')    cargarDetalleCategoria();
    window.scrollTo(0, 0);
}

function toggleAuth() {
    const login = document.getElementById('form-login');
    const reg = document.getElementById('form-registro');
    if (login.style.display === 'none') { login.style.display = 'block'; reg.style.display = 'none'; }
    else { login.style.display = 'none'; reg.style.display = 'block'; }
}

// --- 2. LOGIN / REGISTRO / INVITADO ---
function registrarUsuario() {
    const nombre = document.getElementById('reg-nombre').value;
    const correo = document.getElementById('reg-correo').value;
    const pass = document.getElementById('reg-pass').value;
    const pass2 = document.getElementById('reg-pass2').value;
    if (!nombre || !correo || !pass) { alert("Completa todos los campos."); return; }
    if (pass !== pass2) { alert("Las contraseñas no coinciden."); return; }
    localStorage.setItem('usuarioStockhogar', JSON.stringify({ nombre, correo, pass }));
    alert("¡Registro exitoso!");
    toggleAuth();
}

function iniciarSesion() {
    const correoInput = document.getElementById('login-correo').value;
    const passInput = document.getElementById('login-pass').value;
    const u = JSON.parse(localStorage.getItem('usuarioStockhogar'));
    if (u && u.correo === correoInput && u.pass === passInput) {
        localStorage.setItem('sesionActiva', JSON.stringify({
            correo: u.correo, nombre: u.nombre, esInvitado: false
        }));
        irA('pantalla-home');
        pedirPermisoNotificaciones();
    } else {
        alert("Datos incorrectos.");
    }
}

function entrarComoInvitado() {
    localStorage.setItem('sesionActiva', JSON.stringify({
        correo: 'invitado', nombre: 'Invitado', esInvitado: true
    }));
    irA('pantalla-home');
    pedirPermisoNotificaciones();
}

function cerrarSesion() {
    if (!confirm('¿Estás seguro que querés cerrar sesión?')) return;
    localStorage.removeItem('sesionActiva');
    document.getElementById('barra-nav').style.display = 'none';
    irA('pantalla-auth');
}

// --- 3. HOME ---
function diasHasta(fechaStr) {
    if (!fechaStr) return 9999;
    const [y, m, d] = fechaStr.split('-').map(Number);
    const f = new Date(y, m - 1, d);
    const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
    return Math.round((f - hoy) / 86400000);
}

function actualizarHome() {
    const s = getSesion();
    if (s) document.getElementById('saludo-usuario').innerText = `¡Hola, ${s.nombre}!`;

    const inv = getInventario();
    let porVencer = 0;
    const cats = new Set();

    inv.forEach(p => {
        if (p.categoria) cats.add(p.categoria);
        if (p.fecha) {
            const dias = diasHasta(p.fecha);
            if (dias >= 0 && dias <= DIAS_ALERTA) porVencer++;
        }
    });

    document.getElementById('total-productos').innerText = inv.length;
    document.getElementById('total-por-vencer').innerText = porVencer;
    document.getElementById('total-categorias').innerText = cats.size;
    document.getElementById('badge-alertas').innerText = porVencer;

    const alertasActivas = localStorage.getItem('alertasActivas') !== 'false';
    if (porVencer > 0 && alertasActivas && !sessionStorage.getItem('notifEnviada')) {
        lanzarNotificacion(`¡Atención! Tenés ${porVencer} producto(s) por vencer.`);
        sessionStorage.setItem('notifEnviada', 'true');
    }
}

function pedirPermisoNotificaciones() {
    if ("Notification" in window && Notification.permission === 'default') Notification.requestPermission();
}
function lanzarNotificacion(msg) {
    if ("Notification" in window && Notification.permission === "granted") {
        new Notification("StockHogar", { body: msg });
    }
}

function cargarNotificaciones() {
    const lista = document.getElementById('lista-notificaciones');
    lista.innerHTML = '';
    const inv = getInventario();
    const alertas = inv.filter(p => p.fecha && diasHasta(p.fecha) <= DIAS_ALERTA);

    if (alertas.length === 0) {
        const li = document.createElement('li');
        li.className = 'vacio';
        li.innerHTML = '¡Todo en orden! 🎉<br><small>No hay productos próximos a vencer.</small>';
        lista.appendChild(li);
        return;
    }
    alertas.sort((a, b) => diasHasta(a.fecha) - diasHasta(b.fecha));

    alertas.forEach(prod => {
        const dias = diasHasta(prod.fecha);
        const li = document.createElement('li');
        if (dias < 0) {
            li.style.background = '#ffebee';
            li.style.borderLeft = '4px solid #E74C3C';
            li.textContent = `❌ "${prod.nombre}" ya venció (${prod.fecha})`;
        } else if (dias === 0) {
            li.style.background = '#ffebee';
            li.style.borderLeft = '4px solid #E74C3C';
            li.textContent = `⚠️ "${prod.nombre}" vence HOY`;
        } else {
            li.style.background = '#fff3e0';
            li.style.borderLeft = '4px solid #F39C12';
            li.textContent = `⚠️ "${prod.nombre}" vence en ${dias} día(s) (${prod.fecha})`;
        }
        lista.appendChild(li);
    });
}

// --- 4. AGREGAR / EDITAR ---
function abrirEscaner() {
    productoEnEdicion = null;
    limpiarFormulario();
    document.getElementById('titulo-agregar').innerText = 'Agregar Producto';
    document.getElementById('btn-guardar-producto').innerText = 'Guardar Producto';
    irA('pantalla-agregar');
}

function editarProducto(codigo, nombre) {
    const inv = getInventario();
    const prod = inv.find(p => (codigo !== "" && p.codigo === codigo) || (codigo === "" && p.nombre === nombre));
    if (!prod) return;
    const activa = document.querySelector('.pantalla.activa');
    pantallaRetorno = activa ? activa.id : 'pantalla-inventario';

    productoEnEdicion = { codigo: prod.codigo, nombreOriginal: prod.nombre };
    document.getElementById('prod-codigo').value = prod.codigo || '';
    document.getElementById('prod-nombre').value = prod.nombre;
    document.getElementById('prod-categoria').value = prod.categoria || '';
    document.getElementById('prod-fecha').value = prod.fecha || '';
    document.getElementById('prod-cantidad').value = prod.cantidad;
    document.getElementById('titulo-agregar').innerText = 'Editar Producto';
    document.getElementById('btn-guardar-producto').innerText = 'Guardar Cambios';
    irA('pantalla-agregar');
}

function agregarProducto() {
    const codigo    = document.getElementById('prod-codigo').value.trim();
    const nombre    = document.getElementById('prod-nombre').value.trim();
    const categoria = document.getElementById('prod-categoria').value;
    const fecha     = document.getElementById('prod-fecha').value;
    const cantidad  = parseInt(document.getElementById('prod-cantidad').value) || 1;

    if (!nombre || !fecha) { alert("El nombre y la fecha son obligatorios."); return; }
    let inv = getInventario();

    if (productoEnEdicion) {
        const idx = inv.findIndex(p =>
            (productoEnEdicion.codigo !== "" && p.codigo === productoEnEdicion.codigo) ||
            (productoEnEdicion.codigo === "" && p.nombre === productoEnEdicion.nombreOriginal)
        );
        if (idx !== -1) inv[idx] = { codigo, nombre, categoria, fecha, cantidad };
        setInventario(inv);
        productoEnEdicion = null;
        limpiarFormulario();
        mostrarToast('✓ Producto actualizado');
        irA(pantallaRetorno);
        return;
    }

    const idx = inv.findIndex(p => p.codigo === codigo && codigo !== "");
    if (idx !== -1) {
        inv[idx].cantidad += cantidad;
        inv[idx].fecha = fecha;
        inv[idx].categoria = categoria;
        mostrarToast('✓ Unidades sumadas al producto existente');
    } else {
        inv.push({ codigo, nombre, categoria, fecha, cantidad });
        mostrarToast('✓ ¡Producto agregado con éxito!');
    }
    setInventario(inv);
    limpiarFormulario();
    irA('pantalla-home');
}

function limpiarFormulario() {
    document.getElementById('prod-codigo').value = "";
    document.getElementById('prod-nombre').value = "";
    document.getElementById('prod-fecha').value = "";
    document.getElementById('prod-cantidad').value = "1";
    document.getElementById('prod-categoria').value = "";
}

function cancelarAgregar() {
    detenerEscaner();
    productoEnEdicion = null;
    limpiarFormulario();
    irA(pantallaRetorno);
}

// --- 5. INVENTARIO ---
function cambiarFiltro(tipo) {
    filtroInventario = tipo;
    document.querySelectorAll('.btn-filtro').forEach(b => b.classList.toggle('activo', b.dataset.filtro === tipo));
    cargarInventario();
}

function buscarProducto(texto) {
    const f = texto.toLowerCase().trim();
    document.querySelectorAll('#lista-productos li').forEach(li => {
        li.style.display = li.textContent.toLowerCase().includes(f) ? '' : 'none';
    });
}

function cargarInventario() {
    const lista = document.getElementById('lista-productos');
    lista.innerHTML = "";
    let inv = getInventario();
    if (inv.length === 0) {
        lista.innerHTML = "<li style='text-align:center; list-style:none; padding:30px; color:#A8D5BA;'>No hay productos cargados todavía.</li>";
        return;
    }
    inv.forEach(p => { p.diasRestantes = diasHasta(p.fecha); });

    if (filtroInventario === 'vencidos') inv = inv.filter(p => p.diasRestantes < 0);
    else if (filtroInventario === 'porvencer') inv = inv.filter(p => p.diasRestantes >= 0 && p.diasRestantes <= DIAS_ALERTA);

    if (inv.length === 0) {
        lista.innerHTML = "<li style='text-align:center; list-style:none; padding:30px; color:#A8D5BA;'>No hay productos en este filtro.</li>";
        return;
    }
    inv.sort((a, b) => a.diasRestantes - b.diasRestantes);

    inv.forEach(prod => {
        const agotado = prod.cantidad <= 0;
        let clase = "borde-verde";
        if (agotado) clase = "borde-gris";
        else if (prod.diasRestantes < 0) clase = "borde-rojo";
        else if (prod.diasRestantes <= DIAS_ALERTA) clase = "borde-naranja";
        else if (prod.diasRestantes <= 30) clase = "borde-amarillo";

        const li = document.createElement('li');
        li.className = clase;
        if (agotado) li.style.opacity = '0.6';

        const badge = document.createElement('span');
        badge.className = 'cantidad-badge';
        badge.textContent = agotado ? 'AGOTADO' : `Cant: ${prod.cantidad}`;
        if (agotado) badge.style.background = '#9e9e9e';

        const nombreEl = document.createElement('strong');
        nombreEl.textContent = prod.nombre;
        const catEl = document.createElement('span');
        catEl.textContent = `Cat: ${prod.categoria || 'Sin categoría'}`;
        const fechaEl = document.createElement('span');
        fechaEl.textContent = `Vence: ${prod.fecha || 'Sin fecha'}`;
        const codEl = document.createElement('span');
        codEl.textContent = `Cód: ${prod.codigo || 'N/A'}`;

        const cont = document.createElement('div');
        cont.style.cssText = 'display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;';

        const btnUsar = document.createElement('button');
        btnUsar.textContent = '− Usar 1';
        btnUsar.style.cssText = 'background:#ffebee;color:#d32f2f;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
        btnUsar.disabled = agotado;
        if (!agotado) btnUsar.addEventListener('click', () => descontar(prod.codigo, prod.nombre));
        cont.appendChild(btnUsar);

        const btnEditar = document.createElement('button');
        btnEditar.textContent = '✏️ Editar';
        btnEditar.style.cssText = 'background:#e3f2fd;color:#1976d2;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
        btnEditar.addEventListener('click', () => editarProducto(prod.codigo, prod.nombre));
        cont.appendChild(btnEditar);

        const btnElim = document.createElement('button');
        btnElim.textContent = '🗑️ Eliminar';
        btnElim.style.cssText = 'background:#ffebee;color:#c62828;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
        btnElim.addEventListener('click', () => eliminarProducto(prod.codigo, prod.nombre));
        cont.appendChild(btnElim);

        li.append(badge, nombreEl, catEl, fechaEl, codEl, cont);
        lista.appendChild(li);
    });
}

function descontar(codigo, nombre) {
    let inv = getInventario();
    const idx = inv.findIndex(p => (codigo !== "" && p.codigo === codigo) || (codigo === "" && p.nombre === nombre));
    if (idx !== -1 && inv[idx].cantidad > 0) {
        inv[idx].cantidad -= 1;
        setInventario(inv);
        if (inv[idx].cantidad === 0) mostrarToast('Producto marcado como agotado');
        const activa = document.querySelector('.pantalla.activa');
        if (activa && activa.id === 'pantalla-detalle-categoria') cargarDetalleCategoria();
        else cargarInventario();
    } else {
        alert("No te queda stock de este producto.");
    }
}

function eliminarProducto(codigo, nombre) {
    if (!confirm(`¿Eliminar "${nombre}" del inventario?`)) return;
    let inv = getInventario();
    inv = inv.filter(p => !((codigo !== "" && p.codigo === codigo) || (codigo === "" && p.nombre === nombre)));
    setInventario(inv);
    mostrarToast('Producto eliminado');
    const activa = document.querySelector('.pantalla.activa');
    if (activa && activa.id === 'pantalla-detalle-categoria') cargarDetalleCategoria();
    else cargarInventario();
}

// --- 6. CATEGORÍAS ---
const categoriasPredefinidas = [
    { nombre: "Lácteos y Huevos",   icono: "fa-egg",            color: "#F1C40F" },
    { nombre: "Carnes y Fiambres",  icono: "fa-drumstick-bite", color: "#E74C3C" },
    { nombre: "Frutas y Verduras",  icono: "fa-apple-alt",      color: "#4C9A2A" },
    { nombre: "Almacén (Secos)",    icono: "fa-wheat-awn",      color: "#F39C12" },
    { nombre: "Conservas",          icono: "fa-box-open",       color: "#2196F3" },
    { nombre: "Bebidas",            icono: "fa-wine-bottle",    color: "#9C27B0" },
    { nombre: "Congelados",         icono: "fa-snowflake",      color: "#00BCD4" }
];

function cargarCategorias() {
    const lista = document.getElementById('lista-categorias');
    lista.innerHTML = "";
    const inv = getInventario();
    const conteo = {};
    inv.forEach(p => { if (p.categoria) conteo[p.categoria] = (conteo[p.categoria] || 0) + 1; });

    categoriasPredefinidas.forEach(cat => {
        const cant = conteo[cat.nombre] || 0;
        const li = document.createElement('li');
        li.innerHTML = `
            <div class="icono-cat" style="background:${cat.color}22; color:${cat.color};">
                <i class="fas ${cat.icono}"></i>
            </div>
            <div style="flex:1;">
                <strong style="display:block; font-size:15px;">${cat.nombre}</strong>
                <small style="color:#9e9e9e;">${cant} producto(s)</small>
            </div>
            <i class="fas fa-chevron-right" style="color:#9e9e9e;"></i>`;
        li.addEventListener('click', () => abrirCategoria(cat.nombre));
        lista.appendChild(li);
    });
}

function abrirCategoria(nombreCategoria) {
    categoriaActual = nombreCategoria;
    document.getElementById('titulo-detalle-categoria').innerText = nombreCategoria;
    irA('pantalla-detalle-categoria');
}

function volverACategorias() {
    irA('pantalla-categorias');
}

function cargarDetalleCategoria() {
    const lista = document.getElementById('lista-detalle-categoria');
    lista.innerHTML = "";
    if (!categoriaActual) return;

    let inv = getInventario().filter(p => p.categoria === categoriaActual);

    if (inv.length === 0) {
        lista.innerHTML = "<li style='text-align:center; list-style:none; padding:30px; color:#A8D5BA;'>No hay productos en esta categoría todavía.</li>";
        return;
    }

    inv.forEach(p => { p.diasRestantes = diasHasta(p.fecha); });
    inv.sort((a, b) => a.diasRestantes - b.diasRestantes);

    inv.forEach(prod => {
        const agotado = prod.cantidad <= 0;
        let clase = "borde-verde";
        if (agotado) clase = "borde-gris";
        else if (prod.diasRestantes < 0) clase = "borde-rojo";
        else if (prod.diasRestantes <= DIAS_ALERTA) clase = "borde-naranja";
        else if (prod.diasRestantes <= 30) clase = "borde-amarillo";

        const li = document.createElement('li');
        li.className = clase;
        if (agotado) li.style.opacity = '0.6';

        const badge = document.createElement('span');
        badge.className = 'cantidad-badge';
        badge.textContent = agotado ? 'AGOTADO' : `Cant: ${prod.cantidad}`;
        if (agotado) badge.style.background = '#9e9e9e';

        const nombreEl = document.createElement('strong');
        nombreEl.textContent = prod.nombre;
        const fechaEl = document.createElement('span');
        fechaEl.textContent = `Vence: ${prod.fecha || 'Sin fecha'}`;

        const cont = document.createElement('div');
        cont.style.cssText = 'display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;';

        const btnUsar = document.createElement('button');
        btnUsar.textContent = '− Usar 1';
        btnUsar.style.cssText = 'background:#ffebee;color:#d32f2f;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
        btnUsar.disabled = agotado;
        if (!agotado) btnUsar.addEventListener('click', () => descontar(prod.codigo, prod.nombre));
        cont.appendChild(btnUsar);

        const btnEditar = document.createElement('button');
        btnEditar.textContent = '✏️ Editar';
        btnEditar.style.cssText = 'background:#e3f2fd;color:#1976d2;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
        btnEditar.addEventListener('click', () => editarProducto(prod.codigo, prod.nombre));
        cont.appendChild(btnEditar);

        const btnElim = document.createElement('button');
        btnElim.textContent = '🗑️ Eliminar';
        btnElim.style.cssText = 'background:#ffebee;color:#c62828;border:none;padding:6px 12px;border-radius:6px;font-size:12px;cursor:pointer;';
        btnElim.addEventListener('click', () => eliminarProducto(prod.codigo, prod.nombre));
        cont.appendChild(btnElim);

        li.append(badge, nombreEl, fechaEl, cont);
        lista.appendChild(li);
    });
}

// --- 7. AJUSTES ---
function cargarAjustes() {
    const s = getSesion();
    if (s) document.getElementById('nombre-ajustes').innerText = s.nombre + (s.esInvitado ? ' (Invitado)' : '');
    document.getElementById('toggle-notificaciones').checked = localStorage.getItem('alertasActivas') !== 'false';
    document.getElementById('toggle-modo-oscuro').checked = localStorage.getItem('modoOscuro') === 'true';
    const aviso = document.getElementById('aviso-notificaciones');
    aviso.style.display = ('Notification' in window && Notification.permission === 'denied') ? 'block' : 'none';
}

function cambiarModoOscuro() {
    const on = document.getElementById('toggle-modo-oscuro').checked;
    document.body.classList.toggle('modo-oscuro', on);
    document.body.classList.toggle('modo-claro', !on);
    localStorage.setItem('modoOscuro', on ? 'true' : 'false');
}

function guardarPreferenciaNotificaciones() {
    localStorage.setItem('alertasActivas', document.getElementById('toggle-notificaciones').checked);
}

function borrarTodo() {
    if (!confirm("¿Borrar TODO el inventario? Esta acción no se puede deshacer.")) return;
    setInventario([]);
    document.getElementById('badge-alertas').innerText = '0';
    mostrarToast('Inventario borrado');
    irA('pantalla-home');
}

// --- 8. CÁMARA ---
function encenderCamara(idInputDestino, divLector) {
    if (escanerActivo) return;
    escanerActivo = true;
    html5QrCode = new Html5Qrcode(divLector);
    html5QrCode.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 250, height: 150 } },
        (texto) => {
            document.getElementById(idInputDestino).value = texto;
            detenerEscaner();
        },
        () => {}
    ).catch(() => {
        alert("No se pudo acceder a la cámara. Verificá los permisos.");
        escanerActivo = false;
        html5QrCode = null;
    });
}

function detenerEscaner() {
    if (!html5QrCode) { escanerActivo = false; return; }
    html5QrCode.stop().then(() => {
        const l = document.getElementById('lector-agregar');
        if (l) l.innerHTML = "";
        escanerActivo = false;
        html5QrCode = null;
    }).catch(() => {
        escanerActivo = false;
        html5QrCode = null;
    });
}

// --- 9. TOAST ---
function mostrarToast(mensaje) {
    const t = document.createElement('div');
    t.textContent = mensaje;
    t.style.cssText = 'position:fixed; bottom:30px; left:50%; transform:translateX(-50%); background:#4C9A2A; color:white; padding:15px 25px; border-radius:10px; font-weight:bold; z-index:9999; box-shadow:0 4px 12px rgba(0,0,0,0.3); font-size:15px; max-width:90%; text-align:center;';
    document.body.appendChild(t);
    setTimeout(() => {
        t.style.transition = 'opacity 0.4s';
        t.style.opacity = '0';
        setTimeout(() => t.remove(), 400);
    }, 2000);
}