// --- CONFIGURACIÓN DE FIREBASE ---
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  onAuthStateChanged,
  updateProfile,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getDatabase, ref, set, get, child, onValue, update, push } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDjHsOXPFFFXKKKyAtDMtQz5jyi7jvnnnQ",
  authDomain: "movachat-3e8ea.firebaseapp.com",
  databaseURL: "https://movachat-3e8ea-default-rtdb.firebaseio.com",
  projectId: "movachat-3e8ea",
  storageBucket: "movachat-3e8ea.firebasestorage.app",
  messagingSenderId: "127806471801",
  appId: "1:127806471801:web:1924b7881925bff5d41ea8"
};

// 🔄 Cargar preferencia de tema visual al iniciar la app
(function cargarTemaGuardado() {
  const temaGuardado = localStorage.getItem("tema_app_pwa");
  if (temaGuardado === "claro") {
    document.body.classList.add("tema-claro");
  } else {
    document.body.classList.remove("tema-claro");
  }
})();

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- DECLARACIÓN DE VARIABLES GLOBALES DE ESTADO ---
let streamCamaraLive = null;
let segundosRestantes = 10;
let contactoActivoUid = null;
let burbujaEnEdicion = null;
let mensajeEnEdicionId = null;

// --- MANEJO DE PANTALLA DE AUTENTICACIÓN ---
const authPantalla = document.getElementById("pantalla-auth");
const authForm = document.getElementById("form-auth");
const authGrupoNombre = document.getElementById("grupo-nombre");
const authInputNombre = document.getElementById("auth-nombre");
const authInputCorreo = document.getElementById("auth-correo");
const authInputPassword = document.getElementById("auth-password");
const authBtnSubmit = document.getElementById("btn-auth-submit");
const authSubtituloTxt = document.getElementById("auth-subtitulo");
const authTextoToggle = document.getElementById("texto-toggle-auth");

let modoRegistro = false;

// Manejo unificado de clics para alternar entre Login y Registro
document.addEventListener("click", (e) => {
  if (e.target && e.target.id === "link-toggle-auth") {
    e.preventDefault();
    modoRegistro = !modoRegistro;

    if (modoRegistro) {
      if (authGrupoNombre) authGrupoNombre.style.display = "flex";
      if (authInputNombre) authInputNombre.setAttribute("required", "true");
      if (authBtnSubmit) authBtnSubmit.textContent = "Crear Cuenta";
      if (authSubtituloTxt) authSubtituloTxt.textContent = "Regístrate para comenzar a chatear";
      if (authTextoToggle) authTextoToggle.innerHTML = '¿Ya tienes cuenta? <a href="#" id="link-toggle-auth">Inicia sesión aquí</a>';
    } else {
      if (authGrupoNombre) authGrupoNombre.style.display = "none";
      if (authInputNombre) authInputNombre.removeAttribute("required");
      if (authBtnSubmit) authBtnSubmit.textContent = "Iniciar Sesión";
      if (authSubtituloTxt) authSubtituloTxt.textContent = "Inicia sesión para conectarte";
      if (authTextoToggle) authTextoToggle.innerHTML = '¿No tienes una cuenta? <a href="#" id="link-toggle-auth">Regístrate aquí</a>';
    }
  }
});

// --- MOSTRAR / OCULTAR CONTRASEÑA ---
document.addEventListener("click", (e) => {
  // Encuentra el botón sin importar si se hizo clic en el SVG o en sus rutas internas
  const btn = e.target.closest("#btn-toggle-password");
  if (!btn) return;

  e.preventDefault();
  const inputPass = document.getElementById("auth-password");
  if (!inputPass) return;

  // 1. Alternar tipo de input entre password y text
  const esPassword = inputPass.type === "password";
  inputPass.type = esPassword ? "text" : "password";

  // 2. Buscar el elemento del icono (sea <i> o <svg> que genera Lucide)
  const icono = btn.querySelector("[data-lucide]") || btn.querySelector("svg");

  if (icono) {
    const nuevoIcono = esPassword ? "eye-off" : "eye";

    // Si ya se convirtió en SVG, actualizamos la propiedad interna de Lucide y data-lucide
    icono.setAttribute("data-lucide", nuevoIcono);

    // Si Lucide está activo, reconstruimos los iconos del botón
    if (window.lucide) {
      window.lucide.createIcons({
        targets: [btn] // Re-renderiza únicamente el botón del ojito
      });
    }
  }
});

// Enviar Formulario (Login / Registro)
if (authForm) {
  authForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    const correo = authInputCorreo.value.trim();
    const password = authInputPassword.value.trim();
    const nombre = authInputNombre ? authInputNombre.value.trim() : "";

    authBtnSubmit.disabled = true;
    authBtnSubmit.textContent = "Procesando...";

    try {
      if (modoRegistro) {
        // Generar username limpio a partir del nombre (ej. "Juan Perez" -> "juanperez")
        const usernameGenerado = nombre.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

        // 1. Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
        const user = userCredential.user;

        // 2. Guardar nombre en Auth
        await updateProfile(user, { displayName: nombre });

        // 3. Guardar datos completos con @username en Database
        await set(ref(db, 'usuarios/' + user.uid), {
          uid: user.uid,
          nombre: nombre,
          username: usernameGenerado, // 🚀 ¡Campo de Username agregado!
          correo: correo,
          estado: "🚀 Nuevo en MovaChat",
          fotoUrl: "",
          rol: "usuario",
          estadoAcceso: "pendiente",
          fechaRegistro: Date.now()
        });

        // 4. CERRAR SESIÓN DE INMEDIATO
        await signOut(auth);

        // 5. Aviso de revisión
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(
            "⏳ Cuenta registrada con éxito. Un administrador debe aprobar tu acceso.",
            "🔒",
            "#ffb703"
          );
        } else {
          alert("⏳ Cuenta registrada. Tu acceso está pendiente de aprobación.");
        }

      } else {
        // Iniciar sesión
        await signInWithEmailAndPassword(auth, correo, password);
      }
    } catch (error) {
      console.error("❌ Error de autenticación:", error);

      let mensajeLegible = "Ocurrió un error inesperado. Inténtalo de nuevo.";

      if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
        mensajeLegible = "Contraseña incorrecta. Verifica tus datos e intenta de nuevo.";
      } else if (error.code === 'auth/user-not-found') {
        mensajeLegible = "No existe ninguna cuenta registrada con este correo.";
      } else if (error.code === 'auth/email-already-in-use') {
        mensajeLegible = "Este correo ya está registrado en MovaChat.";
      } else if (error.code === 'auth/weak-password') {
        mensajeLegible = "La contraseña debe tener al menos 6 caracteres.";
      } else if (error.code === 'auth/invalid-email') {
        mensajeLegible = "El formato del correo electrónico no es válido.";
      }

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium(mensajeLegible, "⚠️", "#ff4d4d");
      } else {
        alert("⚠️ " + mensajeLegible);
      }
    } finally {
      authBtnSubmit.disabled = false;
      authBtnSubmit.textContent = modoRegistro ? "Crear Cuenta" : "Iniciar Sesión";
    }
  });
}

// Listener de Estado de Autenticación con Guardián de Acceso
onAuthStateChanged(auth, async (user) => {
  const authPantalla = document.getElementById("pantalla-auth");

  if (user) {
    try {
      // 1. Obtener datos del usuario logueado en Realtime Database
      const snapshot = await get(ref(db, 'usuarios/' + user.uid));

      if (snapshot.exists()) {
        const datosUsuario = snapshot.val();
        const estadoAcceso = datosUsuario.estadoAcceso || "pendiente";

        if (estadoAcceso === "aprobado") {
          // 🟢 ACCESO AUTORIZADO -> Entra a MovaChat
          if (authPantalla) authPantalla.style.display = "none";
          console.log("🟢 Acceso concedido:", datosUsuario.nombre || user.email);

          // 🚀 2. INYECCIÓN DIRECTA DE DATOS REALES EN EL PERFIL
          // Apuntamos al selector exacto del HTML: <h2 id="texto-perfil-nombre"><span>Tu Nombre</span></h2>
          const elemNombreSpan = document.querySelector("#texto-perfil-nombre span");
          const elemFotoPerfil = document.querySelector(".avatar-perfil-img");
          const elemTextoEstado = document.querySelector(".texto-estado");
          const elemLedPerfil = document.querySelector(".btn-estado-sutil .punto-online");

          // A) Asignar nombre registrado
          if (elemNombreSpan) {
            elemNombreSpan.textContent = datosUsuario.nombre || user.displayName || "Usuario Mova";
          }

          // B) Asignar foto de perfil si la subió
          if (elemFotoPerfil && datosUsuario.fotoUrl) {
            elemFotoPerfil.src = datosUsuario.fotoUrl;
          }

          // C) Cargar texto de estado guardado en Firebase
          const fraseEstado = datosUsuario.estadoTexto || "Disponible. Toca para añadir estado...";
          if (elemTextoEstado) elemTextoEstado.textContent = fraseEstado;

          // D) Ajustar color LED según estado
          if (elemLedPerfil) {
            const estadoConexion = datosUsuario.estadoConexion || "online";
            if (estadoConexion === "ocupado") {
              elemLedPerfil.style.backgroundColor = "#ef4444";
              elemLedPerfil.style.boxShadow = "0 0 10px #ef4444";
            } else if (estadoConexion === "offline" || estadoConexion === "invisible") {
              elemLedPerfil.style.backgroundColor = "#888888";
              elemLedPerfil.style.boxShadow = "0 0 10px #888888";
            } else {
              elemLedPerfil.style.backgroundColor = "#00f2fe";
              elemLedPerfil.style.boxShadow = "0 0 10px #00f2fe";
            }
          }

          // 🚀 3. CARGAR CONTACTOS Y LISTA
          if (typeof cargarContactosAprobados === "function") {
            cargarContactosAprobados(user.uid);
          }

          // 🔕 SINCRONIZAR SILENCIADOS DESDE FIREBASE AL ABRIR LA APP (CON ICONO VISUAL)
          const refSilenciados = ref(db, `silenciados/${user.uid}`);
          onValue(refSilenciados, (snapshot) => {
            if (snapshot.exists()) {
              const silenciadosBD = snapshot.val();
              const objetivosIconos = [];

              Object.keys(silenciadosBD).forEach((contactoUid) => {
                if (silenciadosBD[contactoUid]) {
                  localStorage.setItem(`silenciado_${contactoUid}`, "true");

                  const tarjeta = document.getElementById(`tarjeta-chat-${contactoUid}`);
                  if (tarjeta) {
                    tarjeta.classList.add("chat-silenciado-zona");

                    // Inyectar el icono visual si no está presente en la tarjeta
                    const contenedorHora = tarjeta.querySelector(".chat-cabecera");
                    if (contenedorHora && !contenedorHora.querySelector(".indicador-silencio-neon")) {
                      contenedorHora.insertAdjacentHTML("beforeend", `
              <span class="indicador-silencio-neon" title="Chat silenciado">
                <i data-lucide="bell-off"></i>
              </span>
            `);
                      objetivosIconos.push(tarjeta);
                    }
                  }
                }
              });

              // Renderizar los iconos de Lucide cargados
              if (window.lucide && objetivosIconos.length > 0) {
                window.lucide.createIcons({ targets: objetivosIconos });
              }
            }
          });

          // 🚀 4. Lógica de Panel Admin
          const btnAdmin = document.getElementById("btn-abrir-admin");
          const modalAdmin = document.getElementById("modal-admin");
          const btnCerrarAdmin = document.getElementById("btn-cerrar-admin");

          if (datosUsuario.rol === "admin") {
            if (btnAdmin) btnAdmin.style.display = "inline-block";

            if (btnAdmin && modalAdmin) {
              btnAdmin.onclick = () => {
                modalAdmin.style.display = "flex";
                if (typeof cargarUsuariosPendientes === "function") {
                  cargarUsuariosPendientes();
                }
              };
            }

            if (btnCerrarAdmin && modalAdmin) {
              btnCerrarAdmin.onclick = () => {
                modalAdmin.style.display = "none";
              };
            }
          } else {
            if (btnAdmin) btnAdmin.style.display = "none";
          }

        } else {
          // ⏳ Bloqueo real si está pendiente
          await signOut(auth);
          if (authPantalla) authPantalla.style.display = "flex";
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("⏳ Tu acceso está pendiente de aprobación por el Administrador.", "🔒", "#ffb703");
          }
        }
      } else {
        await signOut(auth);
        if (authPantalla) authPantalla.style.display = "flex";
      }
    } catch (error) {
      console.error("❌ Error al verificar acceso:", error);
      await signOut(auth);
      if (authPantalla) authPantalla.style.display = "flex";
    }
  } else {
    if (authPantalla) authPantalla.style.display = "flex";
  }
});

// --- MOSTRAR / OCULTAR CONTRASEÑA ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btn-toggle-password");
  if (!btn) return;

  e.preventDefault();
  const inputPass = document.getElementById("auth-password");
  if (!inputPass) return;

  // Alternar entre password y text
  const esPassword = inputPass.type === "password";
  inputPass.type = esPassword ? "text" : "password";

  // Cambiar el icono en Lucide
  const icono = btn.querySelector("[data-lucide]");
  if (icono) {
    icono.setAttribute("data-lucide", esPassword ? "eye-off" : "eye");
    if (window.lucide) {
      window.lucide.createIcons();
    }
  }
});

// ========================================================
// 1. SELECTORES GLOBALES Y VARIABLES DE ESTADO
// ========================================================
const pantallaBienvenida = document.getElementById("pantalla-bienvenida");
const pantallaChats = document.getElementById("pantalla-chats");
const pantallaPerfil = document.getElementById("pantalla-perfil");
const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");

const encabezadoGlobal = document.querySelector(".encabezado-inicio");
const menuFlotanteGlobal = document.querySelector(".menu-flotante");
const btnVolver = document.getElementById("btn-volver-chats");

const botonesMenu = document.querySelectorAll(".menu-flotante .menu-btn");
const btnInicioMenu = botonesMenu[0];
const btnPerfilMenu = botonesMenu[1];

const btnRegistrarse = document.querySelector(".btn-primario");
const btnBuscarAmigo = document.querySelector(".btn-secundario");

let inputBuscador = document.querySelector(".input-buscador");
const contenedorChats = document.querySelector(".lista-chats");
const chatsOriginalesHTML = Array.from(contenedorChats ? contenedorChats.children : []);

const inputChat = document.getElementById("input-chat-privado");
const btnAccionChat = document.getElementById("btn-accion-chat");
const historialMensajes = document.querySelector(".historial-mensajes");

const menuMensajes = document.getElementById("menu-mensajes");
const menuCabecera = document.getElementById("menu-cabecera-chat");
const menuAdjuntar = document.getElementById("menu-adjuntar-files");
const btnOpcionesChat = document.getElementById("btn-opciones-chat");
const btnAdjuntarTodo = document.querySelector(".btn-adjuntar");

const menuCamaraPro = document.getElementById("menu-camara-pro");
const btnCancelarCamara = document.getElementById("btn-cancelar-camara");
const btnCamaraMovaPro = document.getElementById("btn-adjuntar-camara");
const cajaVistaPrevia = document.getElementById("caja-vista-previa");
const imgMiniaturaAdjunto = document.getElementById("img-miniatura-adjunto");
const btnBorrarVistaPrevia = document.getElementById("btn-borrar-vista-previa");

const inputRealGaleria = document.getElementById("input-archivo-galeria");
const inputRealDocumento = document.getElementById("input-archivo-documento");

const panelGrabacion = document.getElementById("panel-grabacion");
const cajaInputNormal = document.getElementById("caja-input-normal");
const contadorAudio = document.getElementById("contador-audio");

let timerLongPress = null;
let isLongPress = false;
let tipoAdjuntoActivo = null;
let nombreDocumentoSimulado = "";
let mensajeSeleccionadoNode = null;
let tarjetaSeleccionadaNode = null;

let timerGrabacionAudio = null;
let segundosGrabados = 0;
let estaGrabandoAudio = false;

// --- MOCK DATA ---
let chatsFalsosData = [];

let filtroActual = "todos";

// --- SISTEMA DE EFECTOS DE SONIDO NATIVOS (MOVACHAT) ---
window.sonidosApp = window.sonidosApp || {
  enviado: new Audio("assets/sounds/enviado.mp3"),
  recibido: new Audio("assets/sounds/recibido.mp3"),
  grabando: new Audio("assets/sounds/grabando.mp3")
};

// 🔊 Función global para reproducir sonidos uno a la vez (Respeta silenciados y tiempos de expiración)
window.reproducirSonido = function (tipo, contactoUid = null) {
  // 1. Si las notificaciones globales están apagadas en Ajustes
  const notifEstado = localStorage.getItem("movachat-notificaciones");
  if (notifEstado === "desactivado") return;

  // 🔕 2. Si es un mensaje recibido y este chat en específico está silenciado
  if (tipo === "recibido" && contactoUid) {
    const tiempoExpiracion = localStorage.getItem(`silenciado_hasta_${contactoUid}`);

    if (tiempoExpiracion) {
      if (tiempoExpiracion === "indefinido") {
        return; // Silenciado para siempre -> NO suena
      }

      const tiempoFin = parseInt(tiempoExpiracion, 10);
      if (Date.now() < tiempoFin) {
        return; // Aún no vence el silencio -> NO suena
      } else {
        // El tiempo ya venció -> Reactivar automáticamente
        localStorage.removeItem(`silenciado_${contactoUid}`);
        localStorage.removeItem(`silenciado_hasta_${contactoUid}`);
        
        const miUid = auth.currentUser ? auth.currentUser.uid : null;
        if (miUid) set(ref(db, `silenciados/${miUid}/${contactoUid}`), null);

        const tarjeta = document.getElementById(`tarjeta-chat-${contactoUid}`);
        if (tarjeta) {
          tarjeta.classList.remove("chat-silenciado-zona");
          const icono = tarjeta.querySelector(".indicador-silencio-neon");
          if (icono) icono.remove();
        }
      }
    }
  }

  if (window.sonidosApp) {
    Object.keys(window.sonidosApp).forEach((clave) => {
      if (window.sonidosApp[clave]) {
        window.sonidosApp[clave].pause();
        window.sonidosApp[clave].currentTime = 0;
      }
    });

    if (window.sonidosApp[tipo]) {
      window.sonidosApp[tipo].play().catch(() => { });
    }
  }
};

// ========================================================
// 2. PERSISTENCIA LOCALSTORAGE Y BANDEJA DE ENTRADA
// ========================================================
function guardarDatosLocales() {
  if (typeof chatsFalsosData !== "undefined") {
    localStorage.setItem("movachat_chats", JSON.stringify(chatsFalsosData));
  }
}

function cargarDatosLocales() {
  const datosGuardados = localStorage.getItem("movachat_chats");
  if (datosGuardados) {
    chatsFalsosData = JSON.parse(datosGuardados);
  }
}
cargarDatosLocales();

// 🟢 FUNCIÓN DE FILTROS SEGURA
function filtrarYRenderizar() {
  const contenedorChats = document.querySelector(".lista-chats");
  if (!contenedorChats) return;

  const badgeFiltro = document.querySelector(".caja-filtros .badge-filtro");
  if (badgeFiltro) {
    let totalNoLeidos = 0;
    document.querySelectorAll("#lista-chats-principal .badge-chat-no-leido:not(.oculto)").forEach((badge) => {
      const num = parseInt(badge.textContent.trim(), 10) || 0;
      totalNoLeidos += num;
    });
    badgeFiltro.textContent = totalNoLeidos.toString();
  }
}

// ⚡ Delegación de clics limpia para abrir chats
if (contenedorChats) {
  contenedorChats.addEventListener("click", (e) => {
    const tarjeta = e.target.closest(".tarjeta-chat");
    if (!tarjeta || tarjeta.classList.contains("tarjeta-solicitud-pendiente") || tarjeta.id === "tarjeta-mi-estado-propio") return;

    // FRENO DE MANO: Si el menú contextual está abierto o bloqueado, no abrir el chat
    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (typeof bloquearClickFantasma !== "undefined" && bloquearClickFantasma) return;
    if (menuTarjetas && !menuTarjetas.classList.contains("oculto")) return;

    const uidContacto = tarjeta.dataset.uid || tarjeta.id.replace("tarjeta-chat-", "");
    const elemNombre = tarjeta.querySelector(".chat-nombre");
    const elemImg = tarjeta.querySelector(".chat-avatar-caja img");

    const nombreContacto = elemNombre ? elemNombre.textContent.trim() : "Usuario";
    const fotoContacto = elemImg ? elemImg.src : "";

    window.contactoActivoUid = uidContacto;

    if (typeof abrirChatConUsuario === "function") {
      abrirChatConUsuario(uidContacto, nombreContacto, fotoContacto);
    }
  });
}

// ========================================================
// 3. MENÚS DESPLEGABLES Y ARCHIVOS DE CÁMARA PRO
// ========================================================
if (btnOpcionesChat) {
  btnOpcionesChat.addEventListener("click", async (e) => {
    e.stopPropagation();

    const contactoUid = window.contactoActivoUid;

    // 🔕 1. TEXTO DEL BOTÓN SILENCIAR
    const btnCtxSilenciar = document.getElementById("btn-ctx-silenciar");
    if (btnCtxSilenciar && contactoUid) {
      btnCtxSilenciar.innerHTML = `<i data-lucide="bell-off"></i> Silenciar / Notificacio..`;
    }

    // 🛡️ 2. ACTUALIZAR TEXTO Y ESTADO DEL BOTÓN BLOQUEAR EN TIEMPO REAL
    if (typeof verificarEstadoBloqueo === "function" && contactoUid) {
      await verificarEstadoBloqueo(contactoUid);
    }

    menuCabecera.classList.toggle("oculto");
    menuAdjuntar.classList.add("oculto");
    menuCamaraPro.classList.add("oculto");

    const rect = btnOpcionesChat.getBoundingClientRect();
    const marcoRect = document.querySelector(".contenedor-chat").getBoundingClientRect();
    menuCabecera.style.right = "20px";
    menuCabecera.style.left = "auto";
    menuCabecera.style.top = `${rect.bottom - marcoRect.top + 10}px`;

    if (window.lucide) {
      window.lucide.createIcons({ targets: [menuCabecera] });
    }
  });
}

if (btnAdjuntarTodo) {
  btnAdjuntarTodo.addEventListener("click", (e) => {
    e.stopPropagation();
    menuAdjuntar.classList.toggle("oculto");
    menuCabecera.classList.add("oculto");
    menuCamaraPro.classList.add("oculto");

    if (!menuAdjuntar.classList.contains("oculto")) {
      btnAdjuntarTodo.classList.add("caiman-abierto");
    } else {
      btnAdjuntarTodo.classList.remove("caiman-abierto");
    }

    const rect = btnAdjuntarTodo.getBoundingClientRect();
    const marcoRect = document.querySelector(".contenedor-chat").getBoundingClientRect();
    menuAdjuntar.style.left = "20px";
    menuAdjuntar.style.right = "auto";
    menuAdjuntar.style.top = `${rect.top - marcoRect.top - 170}px`;
  });
}

if (btnCamaraMovaPro) {
  btnCamaraMovaPro.addEventListener("click", (e) => {
    e.stopPropagation();
    menuAdjuntar.classList.add("oculto");
    menuCamaraPro.classList.remove("oculto");

    const rect = btnAdjuntarTodo.getBoundingClientRect();
    const marcoRect = document.querySelector(".contenedor-chat").getBoundingClientRect();
    menuCamaraPro.style.left = "20px";
    menuCamaraPro.style.right = "auto";
    menuCamaraPro.style.top = `${rect.top - marcoRect.top - 165}px`;
  });
}

if (btnCancelarCamara) {
  btnCancelarCamara.addEventListener("click", (e) => {
    e.stopPropagation();
    menuCamaraPro.classList.add("oculto");
    menuAdjuntar.classList.remove("oculto");
  });
}

const btnGaleriaMenu = document.querySelector("#menu-adjuntar-files button:nth-of-type(1)");
if (btnGaleriaMenu) {
  btnGaleriaMenu.addEventListener("click", () => {
    inputRealGaleria.click();
    menuAdjuntar.classList.add("oculto");
  });
}

const btnDocMenu = document.querySelector("#menu-adjuntar-files button:nth-of-type(2)");
if (btnDocMenu) {
  btnDocMenu.addEventListener("click", () => {
    inputRealDocumento.click();
    menuAdjuntar.classList.add("oculto");
  });
}

// ========================================================
// 🎥 MOTOR CÁMARA CIRCULAR CON RECORTADOR FÍSICO A 10S
// ========================================================
async function activarCamaraMovaPro(tipoMedia) {
  const menuCamaraPro = document.getElementById("menu-camara-pro");
  if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

  // 📸 FOTO (Optimizada para rendimiento y compatibilidad)
  if (tipoMedia === "foto") {
    const inputCamara = document.createElement("input");
    inputCamara.type = "file";
    inputCamara.accept = "image/*";
    // Opcional: quita capture="user" si prefieres que el usuario elija entre frontal/trasera en el selector nativo

    inputCamara.onchange = (evt) => {
      const archivo = evt.target.files && evt.target.files[0];
      if (archivo) {
        tipoAdjuntoActivo = 'foto';

        if (imgMiniaturaAdjunto) {
          imgMiniaturaAdjunto.style.display = "block";
          imgMiniaturaAdjunto.src = URL.createObjectURL(archivo);
        }

        const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
        if (iconoPrevio) iconoPrevio.remove();

        if (cajaVistaPrevia) cajaVistaPrevia.classList.remove("oculto");

        if (inputChat) {
          inputChat.placeholder = "Añade un comentario a la imagen...";
          inputChat.focus();
        }

        // ⚡ OPTIMIZACIÓN CPU: Renderizar solo el icono dentro del botón de acción
        if (btnAccionChat) {
          btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
          if (window.lucide) {
            window.lucide.createIcons({
              targets: [btnAccionChat]
            });
          }
        }
      }
    };

    inputCamara.click();
    return;
  }

  // 🎥 VIDEO CIRCULAR: Intento de Modal
  const modalCamara = document.getElementById("modal-camara-circular");
  const videoVisor = document.getElementById("video-visor-camara");
  const btnGrabar = document.getElementById("btn-iniciar-grabar-live");
  const txtContador = document.getElementById("contador-camara-10s");

  if (modalCamara && videoVisor) {
    txtContador.textContent = "00:10";
    segundosRestantes = 10;
    btnGrabar.textContent = "● Grabar";
    btnGrabar.disabled = false;
    modalCamara.classList.remove("oculto");
  }

  try {
    if (streamCamaraLive) {
      streamCamaraLive.getTracks().forEach(track => track.stop());
    }

    streamCamaraLive = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    if (videoVisor) videoVisor.srcObject = streamCamaraLive;

  } catch (e) {
    console.warn("Entorno sin cámara directa o permisos. Usando captura con recorte físico:", e);
    if (modalCamara) modalCamara.classList.add("oculto");

    // ⚡ CAPTURA DEL TELÉFONO + RECORTADOR FÍSICO AUTOMÁTICO
    const inputVideoDirecto = document.createElement("input");
    inputVideoDirecto.type = "file";
    inputVideoDirecto.accept = "video/*";
    inputVideoDirecto.capture = "user";

    inputVideoDirecto.onchange = async (evt) => {
      const archivo = evt.target.files[0];
      if (!archivo) return;

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Optimizando y recortando video a 10s... ⚡", "✂️", "#00f2fe");
      }

      // 1. Cargamos el video capturado en memoria
      const videoTemp = document.createElement("video");
      videoTemp.src = URL.createObjectURL(archivo);
      videoTemp.muted = true;
      videoTemp.playsInline = true;

      videoTemp.onloadedmetadata = async () => {
        if (videoTemp.duration <= 10.5) {
          asignarPreviewVideoCircular(videoTemp.src);
          return;
        }

        try {
          const urlCortada = await recortarVideoA10Segundos(videoTemp);
          asignarPreviewVideoCircular(urlCortada);
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Video recortado a 10s para ahorrar datos en la nube 🛡️", "🎬", "#00f2fe");
          }
        } catch (err) {
          console.warn("No se pudo re-codificar, asignando original con tope:", err);
          asignarPreviewVideoCircular(videoTemp.src);
        }
      };
    };
    inputVideoDirecto.click();
  }
}

function recortarVideoA10Segundos(videoElem) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    const streamCanvas = canvas.captureStream(30);

    if (videoElem.captureStream || videoElem.mozCaptureStream) {
      const streamOriginal = (videoElem.captureStream || videoElem.mozCaptureStream).call(videoElem);
      const audioTracks = streamOriginal.getAudioTracks();
      if (audioTracks.length > 0) streamCanvas.addTrack(audioTracks[0]);
    }

    let mimeElegido = 'video/webm';
    if (MediaRecorder.isTypeSupported('video/mp4')) mimeElegido = 'video/mp4';

    const recorder = new MediaRecorder(streamCanvas, { mimeType: mimeElegido });
    const chunks = [];

    recorder.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      const blobCortado = new Blob(chunks, { type: mimeElegido });
      resolve(URL.createObjectURL(blobCortado));
    };

    recorder.start();
    videoElem.currentTime = 0;
    videoElem.play();

    function renderFrame() {
      if (videoElem.currentTime < 10 && !videoElem.paused && !videoElem.ended) {
        ctx.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
        requestAnimationFrame(renderFrame);
      } else {
        videoElem.pause();
        if (recorder.state === "recording") recorder.stop();
      }
    }
    renderFrame();

    setTimeout(() => {
      videoElem.pause();
      if (recorder.state === "recording") recorder.stop();
    }, 10200);
  });
}

function asignarPreviewVideoCircular(urlFinal) {
  tipoAdjuntoActivo = 'video';

  if (imgMiniaturaAdjunto) {
    imgMiniaturaAdjunto.src = urlFinal;
    imgMiniaturaAdjunto.style.display = "none";
  }

  const wrapper = document.querySelector(".wrapper-miniatura");
  const iconoPrevio = wrapper ? wrapper.querySelector(".icono-doc-preview") : null;
  if (iconoPrevio) iconoPrevio.remove();

  if (wrapper) {
    wrapper.insertAdjacentHTML("beforeend", `
      <div class="icono-doc-preview" style="background: rgba(255, 75, 43, 0.15); color: #ff4b2b;">
        <i data-lucide="video" style="width: 28px; height: 28px;"></i>
      </div>
    `);

    // ⚡ OPTIMIZACIÓN CPU: Renderizar solo el icono recién inyectado
    if (window.lucide) {
      window.lucide.createIcons({
        targets: [wrapper]
      });
    }
  }

  if (cajaVistaPrevia) cajaVistaPrevia.classList.remove("oculto");

  if (inputChat) {
    inputChat.placeholder = "Comentar video circular (Máx 10s)...";
    inputChat.focus();
  }

  // ⚡ OPTIMIZACIÓN CPU: Cambiar icono del botón y renderizar solo ese botón
  if (btnAccionChat) {
    btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
    if (window.lucide) {
      window.lucide.createIcons({
        targets: [btnAccionChat]
      });
    }
  }
}

const btnFotoMova = document.querySelector('[data-camara="foto"]');
if (btnFotoMova) {
  btnFotoMova.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    activarCamaraMovaPro("foto");
  };
}

const btnVideoMova = document.querySelector('[data-camara="video"]');
if (btnVideoMova) {
  btnVideoMova.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    activarCamaraMovaPro("video");
  };
}

if (inputRealGaleria) {
  inputRealGaleria.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      const reader = new FileReader();

      reader.onload = function (evt) {
        const wrapper = document.querySelector(".wrapper-miniatura");

        // Validar wrapper de forma segura antes de buscar hijos
        if (wrapper) {
          const iconoPrevio = wrapper.querySelector(".icono-doc-preview");
          if (iconoPrevio) iconoPrevio.remove();
        }

        if (imgMiniaturaAdjunto) {
          imgMiniaturaAdjunto.style.display = "block";
          imgMiniaturaAdjunto.src = evt.target.result;
        }

        tipoAdjuntoActivo = 'foto';

        if (cajaVistaPrevia) cajaVistaPrevia.classList.remove("oculto");

        if (inputChat) {
          inputChat.placeholder = "Añade un comentario a la imagen...";
          inputChat.focus();
        }

        // ⚡ OPTIMIZACIÓN CPU: Dibujar solo el icono dentro de btnAccionChat
        if (btnAccionChat) {
          btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
          if (window.lucide) {
            window.lucide.createIcons({
              targets: [btnAccionChat]
            });
          }
        }
      };

      reader.readAsDataURL(e.target.files[0]);
    }
  });
}

if (inputRealDocumento) {
  inputRealDocumento.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      nombreDocumentoSimulado = e.target.files[0].name;
      tipoAdjuntoActivo = 'documento';
      imgMiniaturaAdjunto.style.display = "none";
      const wrapper = document.querySelector(".wrapper-miniatura");

      const iconoPrevio = wrapper.querySelector(".icono-doc-preview");
      if (iconoPrevio) iconoPrevio.remove();

      wrapper.insertAdjacentHTML("beforeend", `
        <div class="icono-doc-preview">
          <i data-lucide="file-text" style="width: 30px; height: 30px;"></i>
        </div>
      `);
      if (window.lucide) window.lucide.createIcons();

      cajaVistaPrevia.classList.remove("oculto");
      inputChat.placeholder = `Comentar documento: ${nombreDocumentoSimulado.substring(0, 15)}...`;
      inputChat.focus();

      btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
      if (window.lucide) window.lucide.createIcons();
    }
  });
}

if (btnBorrarVistaPrevia) {
  btnBorrarVistaPrevia.addEventListener("click", (e) => {
    e.stopPropagation();

    if (cajaVistaPrevia) cajaVistaPrevia.classList.add("oculto");
    if (imgMiniaturaAdjunto) imgMiniaturaAdjunto.src = "";

    const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();

    tipoAdjuntoActivo = null;

    if (inputChat) inputChat.placeholder = "Escribe un mensaje privado...";

    // ⚡ OPTIMIZACIÓN CPU: Restaurar solo el icono del micrófono en el botón
    if (btnAccionChat) {
      btnAccionChat.innerHTML = `<i data-lucide="mic"></i>`;
      if (window.lucide) {
        window.lucide.createIcons({
          targets: [btnAccionChat]
        });
      }
    }
  });
}

// ========================================================
// 4. SISTEMA DE AUDIOS Y NOTAS DE VOZ
// ========================================================
let mediaRecorderAudio = null;
let fragmentosAudio = [];
let streamAudioLive = null;

function arrancarCronometroAudio() {
  segundosGrabados = 0;
  contadorAudio.textContent = "00:00";
  timerGrabacionAudio = setInterval(() => {
    segundosGrabados++;
    let mins = Math.floor(segundosGrabados / 60).toString().padStart(2, '0');
    let secs = (segundosGrabados % 60).toString().padStart(2, '0');
    contadorAudio.textContent = `${mins}:${secs}`;
  }, 1000);
}

function frenarCronometroAudio() {
  if (timerGrabacionAudio) clearInterval(timerGrabacionAudio);
}

async function iniciarGrabacionVoz(e) {
  const tieneIconoSend = btnAccionChat ? btnAccionChat.querySelector("[data-lucide='send']") : null;
  if (tieneIconoSend || (inputChat && inputChat.value.trim().length > 0) || (cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto"))) {
    return;
  }

  if (e && e.preventDefault) e.preventDefault();

  try {
    // 🔊 SONIDO DE INICIO DE GRABACIÓN
    if (typeof reproducirSonido === "function") {
      reproducirSonido("grabando");
    }

    streamAudioLive = await navigator.mediaDevices.getUserMedia({ audio: true });
    fragmentosAudio = [];

    let mimeAudio = 'audio/webm';
    if (MediaRecorder.isTypeSupported('audio/mp4')) mimeAudio = 'audio/mp4';
    if (MediaRecorder.isTypeSupported('audio/ogg')) mimeAudio = 'audio/ogg';

    mediaRecorderAudio = new MediaRecorder(streamAudioLive, { mimeType: mimeAudio });

    mediaRecorderAudio.ondataavailable = (event) => {
      if (event.data.size > 0) fragmentosAudio.push(event.data);
    };

    mediaRecorderAudio.onstop = () => {
      if (streamAudioLive) streamAudioLive.getTracks().forEach(track => track.stop());

      if (typeof segundosGrabados !== 'undefined' && segundosGrabados >= 1 && fragmentosAudio.length > 0) {
        const blobAudio = new Blob(fragmentosAudio, { type: mimeAudio });
        const urlAudioReal = URL.createObjectURL(blobAudio);

        if (typeof inyectarNotaDeVozBurbuja === "function") {
          inyectarNotaDeVozBurbuja(contadorAudio ? contadorAudio.textContent : "0:01", urlAudioReal);
        }
      }
    };

    mediaRecorderAudio.start();
    estaGrabandoAudio = true;
    if (btnAccionChat) btnAccionChat.classList.add("grabando-activo");
    if (cajaInputNormal) cajaInputNormal.classList.add("oculto");
    if (panelGrabacion) panelGrabacion.classList.remove("oculto");
    if (typeof arrancarCronometroAudio === "function") arrancarCronometroAudio();

  } catch (err) {
    console.error("Error al acceder al micrófono:", err);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Otorga permisos de micrófono para enviar notas de voz 🎤", "⚠️", "#ff4b2b");
    } else {
      alert("Por favor concede permisos de micrófono.");
    }
  }
}

function finalizarGrabacionVoz() {
  if (!estaGrabandoAudio) return;
  estaGrabandoAudio = false;
  frenarCronometroAudio();

  btnAccionChat.classList.remove("grabando-activo");
  panelGrabacion.classList.add("oculto");
  cajaInputNormal.classList.remove("oculto");

  if (mediaRecorderAudio && mediaRecorderAudio.state === "recording") {
    mediaRecorderAudio.stop();
  }
}

if (btnAccionChat) {
  btnAccionChat.addEventListener("mousedown", iniciarGrabacionVoz);
  btnAccionChat.addEventListener("touchstart", iniciarGrabacionVoz, { passive: false });
}

window.addEventListener("mouseup", finalizarGrabacionVoz);
window.addEventListener("touchend", finalizarGrabacionVoz);

function inyectarNotaDeVozBurbuja(duracion, urlAudio) {
  const ahora = new Date();
  const horaFormateada = ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const nuevaBurbujaHTML = document.createElement("div");
  nuevaBurbujaHTML.className = "mensaje-burbuja enviado";
  nuevaBurbujaHTML.innerHTML = `
    <div class="reproductor-audio-burbuja">
      <button class="btn-play-audio"><i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i></button>
      <div class="ondas-audio-preview" style="position: relative; cursor: pointer;">
        <div class="aguja-reproduccion-roja" style="position: absolute; top:0; left: 0%; width: 2px; height: 100%; background: #ff4b2b; z-index: 2; transition: left 0.1s linear;"></div>
        <span class="onda-barra"></span><span class="onda-barra"></span>
        <span class="onda-barra"></span><span class="onda-barra"></span>
        <span class="onda-barra"></span><span class="onda-barra"></span>
        <span class="onda-barra"></span><span class="onda-barra"></span>
      </div>
      <span class="tiempo-texto-nodo" style="font-size:0.75rem; font-family:monospace; opacity:0.8; margin-right:4px;">${duracion}</span>
      <audio class="audio-elemento-nativo" src="${urlAudio}" preload="metadata"></audio>
    </div>
    <span class="mensaje-hora" style="margin-top: 4px;">${horaFormateada}</span>
  `;

  if (historialMensajes) {
    historialMensajes.appendChild(nuevaBurbujaHTML);
    if (typeof aplicarRelojArenaEfecto === "function") aplicarRelojArenaEfecto(nuevaBurbujaHTML);

    // ⚡ OPTIMIZACIÓN CPU: Renderizar solo los iconos dentro de la nueva burbuja
    if (window.lucide) {
      window.lucide.createIcons({
        targets: [nuevaBurbujaHTML]
      });
    }
    historialMensajes.scrollTop = historialMensajes.scrollHeight;
  }

  const btnPlay = nuevaBurbujaHTML.querySelector(".btn-play-audio");
  const audioElem = nuevaBurbujaHTML.querySelector(".audio-elemento-nativo");
  const agujaRoja = nuevaBurbujaHTML.querySelector(".aguja-reproduccion-roja");
  const nodoTextoTiempo = nuevaBurbujaHTML.querySelector(".tiempo-texto-nodo");
  const pistaOndas = nuevaBurbujaHTML.querySelector(".ondas-audio-preview");
  const barras = nuevaBurbujaHTML.querySelectorAll(".onda-barra");

  if (btnPlay && audioElem) {
    btnPlay.addEventListener("click", function () {
      document.querySelectorAll(".audio-elemento-nativo").forEach(a => {
        if (a !== audioElem) {
          a.pause();
          a.currentTime = 0;
        }
      });

      if (audioElem.paused) {
        audioElem.play();
        btnPlay.innerHTML = `<i data-lucide="square" style="width:14px; height:14px;"></i>`;
        barras.forEach(b => b.style.backgroundColor = "#00f2fe");
      } else {
        audioElem.pause();
        btnPlay.innerHTML = `<i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i>`;
        barras.forEach(b => b.style.backgroundColor = "rgba(255,255,255,0.2)");
      }

      // ⚡ OPTIMIZACIÓN CPU: Redibujar solo el botón de Play/Pause
      if (window.lucide) {
        window.lucide.createIcons({
          targets: [btnPlay]
        });
      }
    });

    audioElem.ontimeupdate = function () {
      if (audioElem.duration) {
        const porcentaje = (audioElem.currentTime / audioElem.duration) * 100;
        if (agujaRoja) agujaRoja.style.left = `${porcentaje}%`;

        const segsActuales = Math.floor(audioElem.currentTime);
        let mins = Math.floor(segsActuales / 60).toString().padStart(2, '0');
        let secs = (segsActuales % 60).toString().padStart(2, '0');
        if (nodoTextoTiempo) nodoTextoTiempo.textContent = `${mins}:${secs}`;
      }
    };

    audioElem.onended = function () {
      btnPlay.innerHTML = `<i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i>`;
      barras.forEach(b => b.style.backgroundColor = "rgba(255,255,255,0.2)");
      if (agujaRoja) agujaRoja.style.left = "0%";
      if (nodoTextoTiempo) nodoTextoTiempo.textContent = duracion;

      // ⚡ OPTIMIZACIÓN CPU: Redibujar solo el botón al terminar
      if (window.lucide) {
        window.lucide.createIcons({
          targets: [btnPlay]
        });
      }
    };
  }

  if (pistaOndas && audioElem) {
    pistaOndas.addEventListener("click", function (e) {
      const rectPista = pistaOndas.getBoundingClientRect();
      const clickX = e.clientX - rectPista.left;
      let porcentaje = (clickX / rectPista.width);

      if (porcentaje < 0) porcentaje = 0;
      if (porcentaje > 1) porcentaje = 1;

      if (audioElem.duration) {
        audioElem.currentTime = porcentaje * audioElem.duration;
        if (agujaRoja) agujaRoja.style.left = `${porcentaje * 100}%`;
      }
    });
  }

  const elemNombreAmigo = document.querySelector(".amigo-nombre-chat");
  const nombreAmigoActual = elemNombreAmigo ? elemNombreAmigo.textContent : null;
  if (nombreAmigoActual && typeof guardarMensajesEnMemoria === "function") {
    guardarMensajesEnMemoria(nombreAmigoActual, historialMensajes);
  }
}

// Variable candado global para evitar envíos dobles por rebote de eventos
let estaEnviandoMensaje = false;

// ========================================================
// 5. ENVÍO Y EDICIÓN DE MENSAJES (PROTEGIDO ANTI-DUPLICADOS + MODO EFÍMERO + VERIFICACIÓN DE BLOQUEOS)
// ========================================================
async function enviarMensajeNuevo() {
  // 🛡️ CANDADO: Si ya se está procesando un envío, bloquea cualquier intento secundario
  if (estaEnviandoMensaje) return;

  const texto = inputChat ? inputChat.value.trim() : "";
  const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

  if (texto === "" && !tieneAdjunto) return;

  const usuarioActual = auth.currentUser;
  const miUid = usuarioActual ? usuarioActual.uid : null;
  const contactoUid = window.contactoActivoUid;

  if (!miUid || !contactoUid) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Selecciona un contacto para chatear.", "⚠️", "#ff4b2b");
    }
    return;
  }

  // Activar candado
  estaEnviandoMensaje = true;

  // 🛡️ 1. VERIFICACIÓN DE BLOQUEO EN FIREBASE (AMBAS DIRECCIONES)
  try {
    // ¿El receptor te tiene bloqueado a ti?
    const snapBloqueoReceptor = await get(ref(db, `bloqueos/${contactoUid}/${miUid}`));
    // ¿Tú tienes bloqueado al receptor?
    const snapBloqueoPropio = await get(ref(db, `bloqueos/${miUid}/${contactoUid}`));

    const meTieneBloqueado = snapBloqueoReceptor.exists() && snapBloqueoReceptor.val() === true;
    const loTengoBloqueado = snapBloqueoPropio.exists() && snapBloqueoPropio.val() === true;

    if (meTieneBloqueado || loTengoBloqueado) {
      const mensajeAviso = loTengoBloqueado
        ? "Has bloqueado a este usuario. Desbloquéalo para enviar mensajes."
        : "No puedes enviar mensajes a este usuario.";

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium(mensajeAviso, "🚫", "#ff4b2b");
      }

      // Desactivar candado y salir
      estaEnviandoMensaje = false;
      return;
    }
  } catch (errBloqueo) {
    console.error("Error al consultar bloqueos antes de enviar:", errBloqueo);
  }

  const chatId = typeof obtenerChatId === "function"
    ? obtenerChatId(miUid, contactoUid)
    : [miUid, contactoUid].sort().join("_");

  const ahora = new Date();
  const horaFormateada = ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 🔴 CASO: EDICIÓN DE MENSAJE EN FIREBASE
  if (window.burbujaEnEdicion && window.mensajeEnEdicionId) {
    const mensajeRef = ref(db, `chats/${chatId}/mensajes/${window.mensajeEnEdicionId}`);
    try {
      await update(mensajeRef, {
        texto: texto,
        editado: true
      });

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Mensaje editado con éxito ✨", "✏️", "#00f2fe");
      }
    } catch (e) {
      console.error("Error al editar en Firebase:", e);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("No se pudo guardar la edición.", "❌", "#ff4b2b");
      }
    }

    // Resetear variables de control de edición
    window.burbujaEnEdicion = null;
    window.mensajeEnEdicionId = null;
    if (inputChat) inputChat.value = "";
    if (typeof actualizarIconoBotonAccion === "function") actualizarIconoBotonAccion();

    // Liberar candado
    estaEnviandoMensaje = false;
    return;
  }

  // ⏳ VERIFICAR DURACIÓN DE MODO TEMPORAL EN ESTE CHAT
  let duracionEfimeraMs = 0;
  try {
    const tempSnap = await get(ref(db, `chats/${chatId}/config/temporales`));
    if (tempSnap.exists()) {
      const val = tempSnap.val();
      duracionEfimeraMs = typeof val === 'number' ? val : (val === true ? 10000 : 0);
    }
  } catch (err) {
    console.error("Error verificando temporales:", err);
  }

  // 🟢 CASO: NUEVO MENSAJE
  let objetoMensaje = {
    emisor: miUid,
    receptor: contactoUid,
    texto: texto,
    hora: horaFormateada,
    timestamp: Date.now(),
    esEfimero: duracionEfimeraMs > 0,
    duracionEfimeraMs: duracionEfimeraMs,
    // ↪️ METADATOS DE REENVÍO (Lee la variable global)
    esReenviado: window.mensajeReenviadoActivo ? true : false,
    autorOriginal: window.mensajeReenviadoActivo ? window.mensajeReenviadoActivo.autorOriginal : null,
    tipoAdjunto: null,
    urlAdjunto: null,
    nombreDoc: null
  };

  // 🧹 Limpiar la barra visual de reenvío y la variable tras armar el objeto
  window.mensajeReenviadoActivo = null;
  const vistaPreviaReenvio = document.getElementById("vista-previa-reenvio");
  if (vistaPreviaReenvio) vistaPreviaReenvio.remove();

  if (tieneAdjunto) {
    objetoMensaje.tipoAdjunto = typeof tipoAdjuntoActivo !== 'undefined' ? tipoAdjuntoActivo : null;

    if (objetoMensaje.tipoAdjunto === 'foto') {
      objetoMensaje.urlAdjunto = imgMiniaturaAdjunto ? imgMiniaturaAdjunto.src : "";
    } else if (objetoMensaje.tipoAdjunto === 'documento') {
      objetoMensaje.nombreDoc = typeof nombreDocumentoSimulado !== 'undefined' ? nombreDocumentoSimulado : "Documento_Mova.pdf";
      objetoMensaje.urlAdjunto = imgMiniaturaAdjunto ? imgMiniaturaAdjunto.src : "";
    } else if (objetoMensaje.tipoAdjunto === 'video') {
      const urlVideoCapturado = imgMiniaturaAdjunto && imgMiniaturaAdjunto.src && imgMiniaturaAdjunto.src.startsWith("blob:")
        ? imgMiniaturaAdjunto.src
        : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
      objetoMensaje.urlAdjunto = urlVideoCapturado;
    }

    // Limpiar caja de vista previa
    if (cajaVistaPrevia) cajaVistaPrevia.classList.add("oculto");
    if (imgMiniaturaAdjunto) imgMiniaturaAdjunto.src = "";
    const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();
    if (typeof tipoAdjuntoActivo !== 'undefined') tipoAdjuntoActivo = null;
    if (inputChat) inputChat.placeholder = "Escribe un mensaje privado...";
  }

  // Limpiar el campo de texto INMEDIATAMENTE
  if (inputChat) inputChat.value = "";

  // 🚀 SUBIR A FIREBASE
  try {
    const listaMensajesRef = ref(db, `chats/${chatId}/mensajes`);
    const nuevoMensajeRef = push(listaMensajesRef);
    await set(nuevoMensajeRef, objetoMensaje);

    // 🔊 SONIDO DE MENSAJE ENVIADO
    if (typeof reproducirSonido === "function") {
      reproducirSonido("enviado");
    }

    if (typeof actualizarIconoBotonAccion === "function") actualizarIconoBotonAccion();
  } catch (error) {
    console.error("❌ Error al enviar mensaje a Firebase:", error);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("No se pudo enviar el mensaje.", "❌", "#ff4b2b");
    }
  } finally {
    // Liberar el candado tras 300ms para permitir el siguiente mensaje
    setTimeout(() => {
      estaEnviandoMensaje = false;
    }, 300);
  }
}

// ========================================================
// 6. EVENTOS DE MENÚ CONTEXTUAL PARA BURBUJAS Y TECLADO
// ========================================================
if (historialMensajes) {
  historialMensajes.addEventListener("mousedown", (e) => {
    const burbuja = e.target.closest(".mensaje-burbuja");
    if (!burbuja) return;
    iniciarContador(e, burbuja);
  });

  historialMensajes.addEventListener("touchstart", (e) => {
    const burbuja = e.target.closest(".mensaje-burbuja");
    if (!burbuja) return;
    iniciarContador(e, burbuja);
  }, { passive: true });

  historialMensajes.addEventListener("contextmenu", (e) => e.preventDefault());
}

window.addEventListener("mouseup", (e) => {
  if (isLongPress) {
    e.stopPropagation();
    setTimeout(() => { isLongPress = false; }, 100);
    return;
  }
  limpiarContador();
}, true);

window.addEventListener("touchend", () => {
  limpiarContador();
  setTimeout(() => { isLongPress = false; }, 100);
});

function iniciarContador(e, burbuja) {
  limpiarContador();
  isLongPress = false;
  const x = e.touches ? e.touches[0].clientX : e.clientX;
  const y = e.touches ? e.touches[0].clientY : e.clientY;

  timerLongPress = setTimeout(() => {
    isLongPress = true;
    desplegarMenuContextual(x, y, burbuja);
  }, 500);
}

function limpiarContador() {
  if (timerLongPress) clearTimeout(timerLongPress);
}

function desplegarMenuContextual(x, y, burbuja) {
  mensajeSeleccionadoNode = burbuja;
  if (menuMensajes) {
    menuMensajes.classList.remove("oculto");

    const marcoRect = document.querySelector(".contenedor-chat").getBoundingClientRect();
    const posX = x - marcoRect.left;
    const posY = y - marcoRect.top;

    menuMensajes.style.left = `${Math.min(posX, marcoRect.width - 190)}px`;
    menuMensajes.style.top = `${Math.min(posY, marcoRect.height - 200)}px`;
  }
}

// Cierre de menús flotantes al hacer clic fuera
document.addEventListener("click", (e) => {
  if (isLongPress) return;

  const menuTarjetas = document.getElementById("menu-tarjetas-chat");

  if (menuTarjetas && !menuTarjetas.contains(e.target) && !e.target.closest(".tarjeta-chat")) {
    menuTarjetas.classList.add("oculto");
  }

  if (menuMensajes && !menuMensajes.contains(e.target)) menuMensajes.classList.add("oculto");
  if (menuCabecera && !menuCabecera.contains(e.target) && e.target !== btnOpcionesChat) menuCabecera.classList.add("oculto");
  if (menuAdjuntar && !menuAdjuntar.contains(e.target) && e.target !== btnAdjuntarTodo) menuAdjuntar.classList.add("oculto");
  if (menuCamaraPro && !menuCamaraPro.contains(e.target) && btnCamaraMovaPro && !btnCamaraMovaPro.contains(e.target)) menuCamaraPro.classList.add("oculto");
});

// Flotante Copiar, editar, reenviar y eliminar
document.querySelectorAll(".opcion-menu-ctx").forEach(boton => {
  boton.addEventListener("click", async () => {
    const accion = boton.getAttribute("data-accion");

    const nodoMensaje = (typeof mensajeSeleccionadoNode !== "undefined") ? mensajeSeleccionadoNode : null;
    const nodoTexto = nodoMensaje ? nodoMensaje.querySelector(".mensaje-texto") : null;
    const textoMensaje = nodoTexto ? nodoTexto.textContent.trim() : "";
    const msgId = nodoMensaje ? nodoMensaje.getAttribute("data-msg-id") : null;
    const esMio = nodoMensaje ? nodoMensaje.classList.contains("enviado") : false;

    // 📋 OPCIÓN 1: COPIAR (Con soporte universal)
    if (accion === "copiar") {
      let textoACopiar = textoMensaje;

      // Si no es un mensaje de texto puro, intentar copiar la URL de la foto/adjunto
      if (!textoACopiar && nodoMensaje) {
        const img = nodoMensaje.querySelector("img");
        if (img) textoACopiar = img.src;
      }

      if (textoACopiar) {
        try {
          if (navigator.clipboard && window.isSecureContext) {
            await navigator.clipboard.writeText(textoACopiar);
          } else {
            const textArea = document.createElement("textarea");
            textArea.value = textoACopiar;
            textArea.style.position = "fixed";
            textArea.style.left = "-9999px";
            document.body.appendChild(textArea);
            textArea.select();
            document.execCommand("copy");
            document.body.removeChild(textArea);
          }

          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Texto copiado al portapapeles 📋", "✨", "#00f2fe");
          }
        } catch (err) {
          console.error("Error al copiar texto:", err);
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("No se pudo copiar el texto.", "❌", "#ff4b2b");
          }
        }
      } else {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No hay contenido para copiar.", "⚠️", "#ff4b2b");
        }
      }
    }

    // ✏️ OPCIÓN 2: EDITAR (Solo mensajes propios)
    else if (accion === "editar") {
      if (!esMio) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Solo puedes editar tus propios mensajes.", "⚠️", "#ff4b2b");
        }
      } else if (textoMensaje && typeof inputChat !== "undefined") {
        inputChat.value = textoMensaje;
        inputChat.focus();

        window.burbujaEnEdicion = nodoMensaje;
        window.mensajeEnEdicionId = msgId; // ID de Firebase para guardar edición

        if (btnAccionChat) {
          btnAccionChat.innerHTML = `<i data-lucide="check"></i>`;
          if (window.lucide) {
            window.lucide.createIcons({ targets: [btnAccionChat] });
          }
        }
      }
    }

    // ↪️ OPCIÓN 3: REENVIAR MENSAJE (Captura el nombre exacto del autor)
    else if (accion === "reenviar") {
      if (textoMensaje) {
        const esMio = nodoMensaje ? nodoMensaje.classList.contains("enviado") : false;

        // 1. Si el mensaje YA venía reenviado, conservamos el autor original
        const tagReenviadoPrevio = nodoMensaje ? nodoMensaje.querySelector(".mensaje-etiqueta-reenviado b") : null;
        let autorOriginal = tagReenviadoPrevio ? tagReenviadoPrevio.textContent.trim() : null;

        // 2. Si es la primera vez que se reenvía, obtenemos el nombre actual
        if (!autorOriginal) {
          if (esMio) {
            autorOriginal = "Tú";
          } else {
            const elemNombreContacto = document.querySelector(".amigo-nombre-chat");
            autorOriginal = elemNombreContacto ? elemNombreContacto.textContent.trim() : "Contacto";
          }
        }

        // 3. Guardar el paquete en memoria global
        window.objetoPendienteReenviar = {
          texto: textoMensaje,
          autorOriginal: autorOriginal
        };

        // 4. Volver a la lista de chats
        const pantallaChat = document.getElementById("pantalla-chat-privado") || document.querySelector(".pantalla-chat-privado");
        const btnVolver = document.querySelector(".btn-volver") || document.getElementById("btn-cerrar-chat");

        if (btnVolver) {
          btnVolver.click();
        } else if (pantallaChat) {
          pantallaChat.classList.remove("pantalla-completa");
          pantallaChat.style.display = "none";
          if (typeof pantallaChats !== "undefined" && pantallaChats) {
            pantallaChats.style.display = "flex";
          }
        }

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`Mensaje de ${autorOriginal} listo. Selecciona el chat ↪️`, "✨", "#00f2fe");
        }
      } else {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No hay texto para reenviar.", "⚠️", "#ff4b2b");
        }
      }
    }

    // 🗑️ OPCIÓN 4: ELIMINAR (De la pantalla y de Firebase)
    else if (accion === "eliminar") {
      // 1. 🙈 Ocultar el menú contextual inmediatamente
      const menuFlotante = typeof menuCtx !== "undefined" ? menuCtx : document.getElementById("menu-contextual-mensaje");
      if (menuFlotante) {
        menuFlotante.classList.add("oculto");
        menuFlotante.style.display = "none";
      }

      // 2. Capturar el ID del mensaje
      const idParaBorrar = msgId
        || (nodoMensaje ? nodoMensaje.getAttribute("data-msg-id") : null)
        || (menuFlotante ? menuFlotante.dataset.msgId : null);

      const elementoBurbuja = nodoMensaje || (idParaBorrar ? document.querySelector(`[data-msg-id="${idParaBorrar}"]`) : null);

      if (!idParaBorrar) {
        console.error("No se pudo obtener el ID del mensaje.");
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No se encontró el ID del mensaje.", "⚠️", "#ff4b2b");
        }
        return;
      }

      // 3. 🎨 Animación fluida de salida en pantalla
      if (elementoBurbuja) {
        elementoBurbuja.style.transition = "all 0.25s cubic-bezier(0.4, 0, 0.2, 1)";
        elementoBurbuja.style.opacity = "0";
        elementoBurbuja.style.transform = "scale(0.85) translateY(10px)";

        setTimeout(() => {
          if (elementoBurbuja && elementoBurbuja.parentNode) {
            elementoBurbuja.remove();
          }
        }, 250);
      }

      // 4. ☁️ Borrar en Firebase Realtime Database
      const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
      const miUid = usuarioActual ? usuarioActual.uid : null;
      const contactoUid = window.contactoActivoUid;

      if (miUid && contactoUid) {
        const chatId = typeof obtenerChatId === "function"
          ? obtenerChatId(miUid, contactoUid)
          : [miUid, contactoUid].sort().join("_");

        const mensajeRef = ref(db, `chats/${chatId}/mensajes/${idParaBorrar}`);

        // Uso de set(..., null) para garantizar compatibilidad total con tus importaciones existentes
        set(mensajeRef, null)
          .then(() => {
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("Mensaje eliminado.", "🗑️", "#ff4b2b");
            }
          })
          .catch((err) => {
            console.error("Error al eliminar mensaje de Firebase:", err);
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("Error al eliminar de la nube.", "⚠️", "#ff4b2b");
            }
          });
      } else {
        console.warn("Falta miUid o contactoUid para la conexión con Firebase.");
      }
    }

    // Ocultar menú contextual de mensajes al terminar
    if (typeof menuMensajes !== "undefined" && menuMensajes) {
      menuMensajes.classList.add("oculto");
    }
  });
});

function actualizarIconoBotonAccion() {
  if (!btnAccionChat) return;

  const tieneTexto = inputChat ? inputChat.value.trim().length > 0 : false;
  const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

  if (!tieneTexto && window.burbujaEnEdicion) {
    window.burbujaEnEdicion = null;
    window.mensajeEnEdicionId = null; // Limpiamos también el ID de edición en Firebase
  }

  if (tieneTexto || tieneAdjunto) {
    btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
  } else {
    btnAccionChat.innerHTML = `<i data-lucide="mic"></i>`;
  }

  // ⚡ OPTIMIZACIÓN CPU: Redibujar ÚNICAMENTE el botón de acción
  if (window.lucide) {
    window.lucide.createIcons({
      targets: [btnAccionChat]
    });
  }
}

if (inputChat) {
  inputChat.addEventListener("input", actualizarIconoBotonAccion);

  inputChat.addEventListener("keydown", (evento) => {
    if (evento.key === "Enter") {
      enviarMensajeNuevo();
    }
  });
}

if (btnAccionChat) {
  btnAccionChat.addEventListener("click", (e) => {
    const tieneTexto = inputChat.value.trim().length > 0;
    const tieneAdjunto = !cajaVistaPrevia.classList.contains("oculto");

    if (tieneTexto || tieneAdjunto) {
      e.preventDefault();
      enviarMensajeNuevo();
    }
  });
}

// Evento para filtrar contactos con el buscador en tiempo real (Soporta @tags)
const inputBuscadorModal = document.getElementById("input-buscar-contacto");

if (inputBuscadorModal) {
  inputBuscadorModal.addEventListener("input", (e) => {
    // 1. Limpiamos el texto: quitamos el '@' si lo escriben y pasamos a minúsculas
    const textoBusqueda = e.target.value.replace("@", "").trim().toLowerCase();
    const items = document.querySelectorAll(".contacto-item");

    // 2. Filtramos cada tarjeta de la lista
    items.forEach((item) => {
      const elementoNombre = item.querySelector(".nombre-contacto");

      if (elementoNombre) {
        const nombre = elementoNombre.textContent.toLowerCase();

        // Si la caja de texto está vacía o el nombre coincide, se muestra
        if (!textoBusqueda || nombre.includes(textoBusqueda)) {
          item.style.display = "flex";
        } else {
          item.style.display = "none";
        }
      }
    });
  });
}

// ========================================================
// 🎯 CONTROL DE FILTROS DEFINITIVO (Fusionado y Estable)
// ========================================================
(function inicializarFiltrosEstables() {
  const botones = document.querySelectorAll(".caja-filtros .filtro-btn");
  const btnFiltroTodos = botones[0];
  const btnFiltroNoLeidos = botones[1];

  if (btnFiltroNoLeidos) {
    btnFiltroNoLeidos.addEventListener("click", () => {
      if (btnFiltroTodos) btnFiltroTodos.classList.remove("activo");
      btnFiltroNoLeidos.classList.add("activo");

      const tarjetasChat = document.querySelectorAll("#lista-chats-principal .tarjeta-chat");

      tarjetasChat.forEach((tarjeta) => {
        if (tarjeta.id === "tarjeta-mi-estado-propio") return;

        // Leer directamente la bolita visual para no depender de memorias ocultas
        const badge = tarjeta.querySelector(".badge-chat-no-leido") || tarjeta.querySelector(".badge-mensaje");
        const tieneNoLeidos = badge && !badge.classList.contains("oculto") && parseInt(badge.textContent.trim(), 10) > 0;

        if (tieneNoLeidos) {
          tarjeta.style.display = "flex";
        } else {
          tarjeta.style.display = "none";
        }
      });
    });
  }

  if (btnFiltroTodos) {
    btnFiltroTodos.addEventListener("click", () => {
      if (btnFiltroNoLeidos) btnFiltroNoLeidos.classList.remove("activo");
      btnFiltroTodos.classList.add("activo");

      const tarjetasChat = document.querySelectorAll("#lista-chats-principal .tarjeta-chat");
      tarjetasChat.forEach((tarjeta) => (tarjeta.style.display = "flex"));
    });
  }
})();

function switchPantalla(mostrar, ocultar1, ocultar2, ocultar3) {
  // 1. APAGADO EN SEGUNDO PLANO (Corta timers y medios activos)
  if (typeof cerrarEstadoMova === "function") {
    cerrarEstadoMova();
  }

  if (typeof streamCamaraLive !== "undefined" && streamCamaraLive) {
    streamCamaraLive.getTracks().forEach(track => track.stop());
    streamCamaraLive = null;
  }

  if (typeof estaGrabandoAudio !== "undefined" && estaGrabandoAudio) {
    finalizarGrabacionVoz();
  }

  document.querySelectorAll("audio, video").forEach(medio => {
    if (!medio.paused) {
      medio.pause();
    }
  });

  // 2. OCULTAR Y MOSTRAR PANTALLAS (CSS)
  ocultar1.style.display = "none";
  ocultar2.style.display = "none";
  ocultar3.style.display = "none";

  mostrar.style.display = "flex";
  if (mostrar === pantallaChats || mostrar === pantallaPerfil) {
    mostrar.style.flexDirection = "column";
    mostrar.style.alignItems = "stretch";
  }

  // 3. CONTROL DE BOTÓN FLOTANTE
  const btnFlotante = document.getElementById("btn-abrir-contactos");
  if (btnFlotante) {
    if (mostrar === pantallaChats) {
      btnFlotante.classList.remove("oculto");
    } else {
      btnFlotante.classList.add("oculto");
    }
  }
}

if (btnInicioMenu) {
  btnInicioMenu.addEventListener("click", () => {
    botonesMenu.forEach(b => b.classList.remove("activo"));
    btnInicioMenu.classList.add("activo");
    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (menuTarjetas) menuTarjetas.classList.add("oculto");

    switchPantalla(pantallaChats, pantallaBienvenida, pantallaPerfil, pantallaChatPrivado);
  });
}

if (btnPerfilMenu) {
  btnPerfilMenu.addEventListener("click", () => {
    botonesMenu.forEach(b => b.classList.remove("activo"));
    btnPerfilMenu.classList.add("activo");

    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (menuTarjetas) menuTarjetas.classList.add("oculto");

    switchPantalla(pantallaPerfil, pantallaBienvenida, pantallaChats, pantallaChatPrivado);

    setTimeout(() => {
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }, 50);
  });
}

// ========================================================
// 📱 MENÚ DINÁMICO DE 3 PUNTOS PARA LA CABECERA
// ========================================================
const btnOpcionesCabecera = document.getElementById("btn-opciones-cabecera");
const menuCabeceraFlotante = document.getElementById("menu-desplegable-cabecera");
const listaOpcionesCabecera = document.getElementById("lista-opciones-cabecera");

if (btnOpcionesCabecera && menuCabeceraFlotante && listaOpcionesCabecera) {
  btnOpcionesCabecera.addEventListener("click", (e) => {
    e.stopPropagation();

    const estaOculto = menuCabeceraFlotante.classList.contains("oculto");

    if (estaOculto) {
      const pantallaPerfil = document.getElementById("pantalla-perfil") || document.querySelector(".pantalla-perfil");
      const estaEnPerfil = pantallaPerfil && (pantallaPerfil.style.display === "flex" || pantallaPerfil.classList.contains("activa"));

      // 1. Inyección dinámica según la pantalla activa
      if (estaEnPerfil) {
        // 👤 OPCIONES DEL MENÚ EN MI PERFIL
        listaOpcionesCabecera.innerHTML = `
          <li class="opcion-cabecera-item" data-accion="cambiar-password"><i data-lucide="key"></i> Cambiar Contraseña</li>
          <li class="opcion-cabecera-item opcion-peligro" data-accion="cerrar-sesion"><i data-lucide="log-out"></i> Cerrar Sesión</li>
        `;
      } else {
        // 💬 OPCIONES DEL MENÚ EN PANTALLA PRINCIPAL (CHATS)
        listaOpcionesCabecera.innerHTML = `
          <li class="opcion-cabecera-item" data-accion="mi-perfil"><i data-lucide="user"></i> Mi Perfil / Ajustes</li>
          <li class="opcion-cabecera-item" data-accion="modo-oscuro"><i data-lucide="moon"></i> Modo Oscuro / Claro</li>
          <li class="opcion-cabecera-item" data-accion="mensajes-guardados"><i data-lucide="bookmark"></i> Mensajes Guardados</li>
          <li class="opcion-cabecera-item" data-accion="sincronizar"><i data-lucide="refresh-cw"></i> Sincronizar / Refrescar</li>
        `;
      }

      // 2. Renderizar iconos únicamente dentro de la lista con Lucide
      if (window.lucide) {
        window.lucide.createIcons({
          targets: [listaOpcionesCabecera]
        });
      }

      // 3. Asignar los eventos de clic a cada opción inyectada
      asignarEventosMenuCabecera();

      menuCabeceraFlotante.classList.remove("oculto");
    } else {
      menuCabeceraFlotante.classList.add("oculto");
    }
  });

  // Cerrar menú al hacer clic en cualquier otra parte
  document.addEventListener("click", (e) => {
    if (!menuCabeceraFlotante.contains(e.target) && e.target !== btnOpcionesCabecera) {
      menuCabeceraFlotante.classList.add("oculto");
    }
  });
}

// ========================================================
// ⚙️ MANEJADOR DE EVENTOS PARA LAS OPCIONES INYECTADAS
// ========================================================
function asignarEventosMenuCabecera() {
  document.querySelectorAll(".opcion-cabecera-item").forEach((item) => {
    item.addEventListener("click", async (e) => {
      e.stopPropagation();
      const accion = item.getAttribute("data-accion");
      const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
      const miUid = usuarioActual ? usuarioActual.uid : null;

      // Ocultar menú tras hacer clic
      if (typeof menuCabeceraFlotante !== "undefined" && menuCabeceraFlotante) {
        menuCabeceraFlotante.classList.add("oculto");
      }

      // --- OPCIONES PANTALLA PRINCIPAL ---
      if (accion === "mi-perfil") {
        // Busca cualquier elemento dentro de la barra inferior que contenga el texto "Perfil"
        const elementosNav = document.querySelectorAll(".barra-navegacion *, footer *");
        const btnPerfilInferior = Array.from(elementosNav).find((el) =>
          el.textContent && el.textContent.trim().toLowerCase() === "perfil"
        );

        if (btnPerfilInferior) {
          btnPerfilInferior.click();
        } else {
          // Si no lo halla por texto, alterna las pantallas directamente
          const pantallaPerfil = document.getElementById("pantalla-perfil") || document.querySelector(".pantalla-perfil");
          const pantallaChats = document.getElementById("pantalla-chats") || document.querySelector(".pantalla-chats");

          if (pantallaPerfil && pantallaChats) {
            pantallaChats.style.display = "none";
            pantallaPerfil.style.display = "flex";
          }
        }
      }

      else if (accion === "modo-oscuro") {
        const esClaro = document.body.classList.toggle("tema-claro");
        localStorage.setItem("tema_app_pwa", esClaro ? "claro" : "oscuro");

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(
            esClaro ? "Tema Claro activado" : "Tema Oscuro activado",
            esClaro ? "☀️" : "🌙",
            "#00f2fe"
          );
        }
      }

      else if (accion === "mensajes-guardados") {
        if (!miUid) return;

        const miNombre = usuarioActual.displayName || "Mensajes Guardados";
        const miFoto = usuarioActual.photoURL || `https://api.dicebear.com/7.x/bottts/svg?seed=${miUid}`;

        if (typeof abrirChatConUsuario === "function") {
          abrirChatConUsuario(miUid, `${miNombre} (Tú)`, miFoto);

          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Tu espacio de notas privadas 📌", "✨", "#00f2fe");
          }
        }
      }

      else if (accion === "sincronizar") {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Sincronizando chats con la nube...", "🔄", "#00f2fe");
        }

        if (typeof escucharListaChats === "function") {
          escucharListaChats();
        }

        setTimeout(() => {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Aplicación actualizada y conectada ✨", "✅", "#00f2fe");
          }
        }, 1000);
      }

      // --- OPCIONES PANTALLA MI PERFIL ---
      else if (accion === "cambiar-password") {
        if (usuarioActual && usuarioActual.email) {
          try {
            const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            await sendPasswordResetEmail(auth, usuarioActual.email);

            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium(`Enlace enviado a <b>${usuarioActual.email}</b> 🔑`, "✉️", "#00f2fe");
            }
          } catch (error) {
            console.error("Error al enviar correo:", error);
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("No se pudo enviar el correo de cambio ⚠️", "❌", "#ff4b2b");
            }
          }
        }
      }

      else if (accion === "cerrar-sesion") {
        if (confirm("¿Estás seguro de que deseas cerrar sesión?")) {
          try {
            const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
            await signOut(auth);

            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("Sesión cerrada correctamente 👋", "🚪", "#ff4b2b");
            }
          } catch (error) {
            console.error("Error al cerrar sesión:", error);
          }
        }
      }
    });
  });
}

// Cierre automático al tocar fuera
document.addEventListener("click", () => {
  if (menuCabeceraFlotante) menuCabeceraFlotante.classList.add("oculto");
});

if (btnVolver) {
  btnVolver.addEventListener("click", () => {
    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (menuTarjetas) menuTarjetas.classList.add("oculto");

    const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto");

    if (encabezadoGlobal) encabezadoGlobal.style.display = "flex";
    if (menuFlotanteGlobal) menuFlotanteGlobal.style.display = "flex";
    if (btnFlotanteContacto) btnFlotanteContacto.style.display = "flex";

    pantallaChatPrivado.classList.remove("pantalla-completa");
    switchPantalla(pantallaChats, pantallaBienvenida, pantallaPerfil, pantallaChatPrivado);
  });
}

const entrarALosChats = () => {
  botonesMenu.forEach(b => b.classList.remove("activo"));
  btnInicioMenu.classList.add("activo");
  switchPantalla(pantallaChats, pantallaBienvenida, pantallaPerfil, pantallaChatPrivado);
};

if (btnRegistrarse) btnRegistrarse.addEventListener("click", entrarALosChats);
if (btnBuscarAmigo) btnBuscarAmigo.addEventListener("click", entrarALosChats);

// ========================================================
// 7. CABECERA Y PRESENCIA CON LEDS INTERACTIVOS
// ========================================================
const fotoCabeceraPrivada = document.getElementById("avatar-cabecera-privada");
const textoDatosCabecera = document.querySelector(".amigo-perfil-cabecera .amigo-datos");

if (textoDatosCabecera) {
  textoDatosCabecera.style.cursor = "pointer";
  textoDatosCabecera.addEventListener("click", (e) => {
    e.stopPropagation();

    if (menuFlotanteGlobal) menuFlotanteGlobal.style.display = "flex";
    if (pantallaChatPrivado) pantallaChatPrivado.classList.remove("pantalla-completa");

    if (btnPerfilMenu) {
      btnPerfilMenu.click();
      mostrarAvisoPremium("Abriendo el espacio de configuración... 🕵️‍♂️", "👤", "#00f2fe");
    }
  });
}

if (fotoCabeceraPrivada) {
  fotoCabeceraPrivada.style.cursor = "pointer";
  fotoCabeceraPrivada.addEventListener("click", (e) => {
    e.stopPropagation();

    const urlImagenEnVivo = fotoCabeceraPrivada.src;
    const nombrePersonaEnVivo = document.querySelector(".amigo-nombre-chat") ? document.querySelector(".amigo-nombre-chat").textContent : "Usuario";

    if (visorEstados && imgEstadoRender && textoEstadoRender) {
      imgEstadoRender.src = urlImagenEnVivo;
      textoEstadoRender.textContent = `Foto de perfil de ${nombrePersonaEnVivo}`;

      likesSimulados = 0;
      if (contadorLikesEstado) contadorLikesEstado.textContent = likesSimulados;
      if (btnCorazonEstado) btnCorazonEstado.classList.remove("activo");

      if (lineaProgreso && lineaProgreso.parentNode) {
        lineaProgreso.parentNode.style.visibility = "hidden";
      }

      visorEstados.classList.remove("oculto");
      mostrarAvisoPremium("Visualizando imagen de perfil en Alta Definición 🌌", "📸", "#00f2fe");
    }
  });
}

const botonCerrarVisorHistorias = document.getElementById("btn-cerrar-estado");
if (botonCerrarVisorHistorias) {
  botonCerrarVisorHistorias.addEventListener("click", () => {
    const barraTiempoSuperior = document.querySelector(".barra-tiempo-estado");
    if (barraTiempoSuperior) {
      barraTiempoSuperior.style.visibility = "visible";
    }
  });
}

// 💡 FUNCIÓN CORREGIDA: Actualiza solo los leds de la cabecera del usuario (sin afectar a otros contactos)
function actualizarDobleLedCabecera(pantallaActual) {
  const ledSuperior = document.getElementById("led-enfoque-app");
  const ledInferior = document.getElementById("led-presencia-base");

  if (!ledSuperior || !ledInferior) return;

  const ledPerfil = document.querySelector(".btn-estado-sutil .punto-online");
  let colorEstadoActual = "#00f2fe";

  if (ledPerfil) {
    colorEstadoActual = window.getComputedStyle(ledPerfil).backgroundColor;
  }

  // Detectar el color propio de tu perfil
  let esOcupado = colorEstadoActual.includes("255, 75, 43") || colorEstadoActual === "rgb(255, 75, 43)" || colorEstadoActual === "#ff4b2b" || colorEstadoActual.includes("239, 68, 68");
  let esInvisible = colorEstadoActual.includes("136, 136, 136") || colorEstadoActual === "rgb(136, 136, 136)" || colorEstadoActual === "#888888";

  // 1. Si tu estado es INVISIBLE
  if (esInvisible) {
    ledInferior.style.setProperty("background-color", "#888888", "important");
    ledInferior.style.boxShadow = "none";

    ledSuperior.style.setProperty("background-color", "#888888", "important");
    ledSuperior.style.boxShadow = "none";
    return;
  }

  // 2. Si tu estado es OCUPADO
  if (esOcupado) {
    ledInferior.style.setProperty("background-color", "#ef4444", "important");
    ledInferior.style.boxShadow = "0 0 8px #ef4444";

    ledSuperior.style.setProperty("background-color", "#ef4444", "important");
    ledSuperior.style.boxShadow = "0 0 8px #ef4444";
    return;
  }

  // 3. Estado DISPONIBLE (Default en cabecera)
  if (pantallaActual === "perfil") {
    ledInferior.style.setProperty("background-color", "rgba(255, 255, 255, 0.05)", "important");
    ledInferior.style.boxShadow = "none";

    ledSuperior.style.setProperty("background-color", "rgba(255, 255, 255, 0.05)", "important");
    ledSuperior.style.boxShadow = "none";
  } else {
    ledInferior.style.setProperty("background-color", "#00f2fe", "important");
    ledInferior.style.boxShadow = "0 0 8px #00f2fe";

    ledSuperior.style.setProperty("background-color", "#00f2fe", "important");
    ledSuperior.style.boxShadow = "0 0 8px #00f2fe";
  }
}

const btnGuardarEstadoMova = document.getElementById("btn-guardar-estado");
if (btnGuardarEstadoMova) {
  btnGuardarEstadoMova.addEventListener("click", () => {
    setTimeout(() => {
      actualizarDobleLedCabecera("perfil");
    }, 50);
  });
}

setTimeout(() => actualizarDobleLedCabecera("bienvenida"), 100);

// ========================================================
// 8. VISOR DE HISTORIAS Y TOAST NOTIFICACIONES LÍQUIDAS
// ========================================================
const visorEstados = document.getElementById("visor-historias-mova");
const btnCerrarEstado = document.getElementById("btn-cerrar-estado");
const imgEstadoRender = document.getElementById("img-estado-render");
const textoEstadoRender = document.getElementById("texto-estado-render");
const lineaProgreso = document.getElementById("linea-progreso-estado");
const btnCorazonEstado = document.getElementById("btn-corazon-estado");
const contadorLikesEstado = document.getElementById("contador-likes-estado");

let temporizadorEstado = null;
let intervaloBarraProgreso = null;
let likesSimulados = 0;

function abrirEstadoAmigo(urlFoto, fraseInicial) {
  if (!visorEstados) return;
  imgEstadoRender.src = urlFoto;
  textoEstadoRender.textContent = fraseInicial;

  likesSimulados = 0;
  if (contadorLikesEstado) contadorLikesEstado.textContent = likesSimulados;
  if (btnCorazonEstado) btnCorazonEstado.classList.remove("activo");

  visorEstados.classList.remove("oculto");

  let tiempoTranscurrido = 0;
  if (lineaProgreso) lineaProgreso.style.width = "0%";

  if (intervaloBarraProgreso) clearInterval(intervaloBarraProgreso);
  intervaloBarraProgreso = setInterval(() => {
    tiempoTranscurrido += 50;
    let porcentaje = (tiempoTranscurrido / 10000) * 100;
    if (lineaProgreso) lineaProgreso.style.width = `${porcentaje}%`;
  }, 50);

  if (temporizadorEstado) clearTimeout(temporizadorEstado);
  temporizadorEstado = setTimeout(() => {
    cerrarEstadoMova();
  }, 10000);
}

function cerrarEstadoMova() {
  if (visorEstados) visorEstados.classList.add("oculto");
  if (temporizadorEstado) clearTimeout(temporizadorEstado);
  if (intervaloBarraProgreso) clearInterval(intervaloBarraProgreso);
  if (lineaProgreso) lineaProgreso.style.width = "0%";
}

if (btnCerrarEstado) {
  btnCerrarEstado.addEventListener("click", () => {
    cerrarEstadoMova();
  });
}

if (btnCorazonEstado) {
  btnCorazonEstado.addEventListener("click", (e) => {
    e.stopPropagation();

    if (!btnCorazonEstado.classList.contains("activo")) {
      btnCorazonEstado.classList.add("activo");
      likesSimulados++;
      contadorLikesEstado.textContent = likesSimulados;
    } else {
      btnCorazonEstado.classList.remove("activo");
      likesSimulados--;
      contadorLikesEstado.textContent = likesSimulados;
    }
  });
}

// Al hacer clic en la opción de Aura
window.cambiarAura = function (nombreTema) {
  const esfera1 = document.querySelector(".esfera-cyan");
  const esfera2 = document.querySelector(".esfera-morada");

  if (esfera1 && esfera2) {
    esfera1.classList.remove("aura-cyan-morado", "aura-fuego", "aura-oceano", "aura-matrix");
    esfera2.classList.remove("aura-cyan-morado", "aura-fuego", "aura-oceano", "aura-matrix");

    esfera1.classList.add(`aura-${nombreTema}`);
    esfera2.classList.add(`aura-${nombreTema}`);

    // 💾 Guardar preferencia en memoria local
    localStorage.setItem("movachat-aura", nombreTema);

    // 🎨 Sincronizar el botón activo y la cápsula deslizante en la UI
    const botones = Array.from(document.querySelectorAll(".opcion-aura"));
    const indicador = document.getElementById("indicador-aura");

    botones.forEach((btn, index) => {
      const onclickAttr = btn.getAttribute("onclick") || "";
      if (onclickAttr.includes(nombreTema)) {
        botones.forEach(b => b.classList.remove("activa"));
        btn.classList.add("activa");

        if (indicador) {
          indicador.style.transform = `translateX(${index * 100}%)`;
        }
      }
    });

    mostrarAvisoPremium(`Aura cambiada al tema [ ${nombreTema.toUpperCase()} ] 🔮`, "🌌", "#00f2fe");
  }
};

// 🔄 Restaurar Aura al cargar la aplicación
document.addEventListener("DOMContentLoaded", () => {
  const auraGuardada = localStorage.getItem("movachat-aura");
  if (auraGuardada && typeof cambiarAura === "function") {
    cambiarAura(auraGuardada);
  }
});

function mostrarAvisoPremium(mensaje, icono = "🔔", colorNeon = "#00f2fe") {
  const toast = document.getElementById("toast-premium");
  const toastMensaje = document.getElementById("toast-mensaje");
  const toastIcono = document.getElementById("toast-icono-caja");

  if (toast && toastMensaje && toastIcono) {
    toastMensaje.innerHTML = mensaje;
    toastIcono.textContent = icono;

    if (colorNeon === '#ff4b2b' || icono === '⚠️' || icono === '🔕' || icono === '👁️‍🗨️') {
      toastIcono.style.background = "rgba(255, 75, 43, 0.15)";
      toastIcono.style.color = "#ff4b2b";
      toast.style.borderColor = "rgba(255, 75, 43, 0.4)";
      toast.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.6), 0 0 20px rgba(255, 75, 43, 0.25), inset 0 0 15px rgba(255, 75, 43, 0.05)";
    } else if (colorNeon === '#9b5de5') {
      toastIcono.style.background = "rgba(155, 93, 229, 0.08)";
      toastIcono.style.color = "#9b5de5";
      toast.style.borderColor = "rgba(155, 93, 229, 0.15)";
      toast.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(155, 93, 229, 0.03)";
    } else {
      toastIcono.style.background = "rgba(0, 242, 254, 0.08)";
      toastIcono.style.color = "#00f2fe";
      toast.style.borderColor = "rgba(0, 242, 254, 0.15)";
      toast.style.boxShadow = "0 20px 40px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(0, 242, 254, 0.03)";
    }

    toast.style.top = "24px";
    toast.style.opacity = "1";

    setTimeout(() => {
      toast.style.top = "-100px";
      toast.style.opacity = "0";
    }, 3500);
  }
}

// ========================================================
// 9. QR, COMPARTIR Y MODALES DE CONFIGURACIÓN
// ========================================================

// Puerta de enlace por si no existe 'mostrarAvisoPremium' usar el Toast flotante
if (typeof mostrarAvisoPremium === "undefined") {
  window.mostrarAvisoPremium = function (mensaje) {
    if (typeof mostrarToast === "function") {
      mostrarToast(mensaje);
    }
  };
}

// --- 1. COMPARTIR MOVACHAT ---
const btnCompartirMova = document.querySelector(".btn-compartir");

if (btnCompartirMova) {
  const nuevoBtnCompartir = btnCompartirMova.cloneNode(true);
  btnCompartirMova.parentNode.replaceChild(nuevoBtnCompartir, btnCompartirMova);

  nuevoBtnCompartir.addEventListener("click", async function () {
    const urlCompartir = window.location.href;

    // Si tiene HTTPS y el móvil/navegador lo soporta, abre el menú nativo
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'MovaChat',
          text: '¡Únete a MovaChat! La app de chat premium con diseño futurista. 🌌🔥',
          url: urlCompartir
        });
        mostrarAvisoPremium("¡Contenido compartido con éxito! 🪐");
      } catch (error) {
        if (error.name !== "AbortError") {
          console.log("MovaChat: Error al compartir.", error);
        }
      }
    } else {
      // Fallback seguro usando API de Portapapeles moderna
      try {
        await navigator.clipboard.writeText(urlCompartir);
        mostrarAvisoPremium("¡Enlace copiado al portapapeles! Listo para enviar. 🚀");
      } catch (err) {
        // Fallback antiguo por si el navegador es legacy
        const cajaTemporal = document.createElement("textarea");
        cajaTemporal.value = urlCompartir;
        document.body.appendChild(cajaTemporal);
        cajaTemporal.select();
        document.execCommand("copy");
        document.body.removeChild(cajaTemporal);
        mostrarAvisoPremium("¡Enlace copiado al portapapeles! Listo para enviar. 🚀");
      }
    }
  });
}

// --- 2. CÓDIGO QR PRO ---
const btnQrMova = document.querySelector(".btn-qr");
const modalQr = document.getElementById("modal-qr-mova");
const btnCerrarQr = document.getElementById("btn-cerrar-qr");
const imgQrDinamico = document.getElementById("img-qr-dinamico");

if (btnQrMova) {
  btnQrMova.addEventListener("click", () => {
    const urlActual = window.location.href;
    if (imgQrDinamico) {
      imgQrDinamico.src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(urlActual)}`;
    }
    if (modalQr) modalQr.classList.remove("oculto");
    mostrarAvisoPremium("Código QR Pro generado con éxito. 📲");
  });
}

if (btnCerrarQr && modalQr) {
  btnCerrarQr.addEventListener("click", () => {
    modalQr.classList.add("oculto");
  });
}

// --- 3. EDITAR ESTADO DE PERFIL Y LED (AMARRADO TOTALMENTE A FIREBASE) ---
const btnEditarEstado = document.getElementById("btn-editar-estado");
const modalEstado = document.getElementById("modal-estado");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");
const btnGuardarEstado = document.getElementById("btn-guardar-estado");
const inputNuevoEstado = document.getElementById("input-nuevo-estado");
const textoEstadoPerfil = document.querySelector(".texto-estado");
const ledPerfil = document.querySelector(".btn-estado-sutil .punto-online");
const botonesLed = document.querySelectorAll(".selector-led .btn-led");

let colorLedSeleccionado = "#00f2fe";
let tipoEstadoSeleccionado = "online"; // 'online', 'ocupado' o 'offline'
let nombreEstadoSeleccionado = "Disponible"; // 'Disponible', 'Ocupado' o 'Invisible'

if (btnEditarEstado && modalEstado) {
  btnEditarEstado.addEventListener("click", () => {
    modalEstado.classList.remove("oculto");
    if (inputNuevoEstado) inputNuevoEstado.focus();
  });
}

if (btnCerrarModal && modalEstado) {
  btnCerrarModal.addEventListener("click", () => {
    modalEstado.classList.add("oculto");
  });
}

// 🎨 Escuchar los botones del modal para saber qué estado eligió el usuario
botonesLed.forEach(boton => {
  boton.addEventListener("click", () => {
    botonesLed.forEach(b => b.classList.remove("activo"));
    boton.classList.add("activo");

    // Leer el color configurado en el botón
    colorLedSeleccionado = boton.style.getPropertyValue("--led-color").trim() || "#00f2fe";

    // Asignar el tipo y el nombre según el color elegido
    if (colorLedSeleccionado === "#ef4444" || colorLedSeleccionado === "#ff4b2b") {
      tipoEstadoSeleccionado = "ocupado";
      nombreEstadoSeleccionado = "Ocupado";
    } else if (colorLedSeleccionado === "#888888") {
      tipoEstadoSeleccionado = "offline";
      nombreEstadoSeleccionado = "Invisible";
    } else {
      tipoEstadoSeleccionado = "online";
      nombreEstadoSeleccionado = "Disponible";
    }
  });
});

// 💾 Guardar en el perfil local y enviar a Firebase
if (btnGuardarEstado && modalEstado) {
  btnGuardarEstado.addEventListener("click", () => {
    const fraseIngresada = inputNuevoEstado ? inputNuevoEstado.value.trim() : "";

    // Si escribió una frase personalizada la usa, si no, usa "Disponible", "Ocupado" o "Invisible"
    const textoFinal = fraseIngresada !== "" ? fraseIngresada : nombreEstadoSeleccionado;

    // 1. Actualizar pantalla propia
    if (textoEstadoPerfil) {
      textoEstadoPerfil.textContent = textoFinal;
    }
    if (ledPerfil) {
      ledPerfil.style.backgroundColor = colorLedSeleccionado;
      ledPerfil.style.boxShadow = `0 0 10px ${colorLedSeleccionado}`;
    }

    // 2. Guardar en memoria local del teléfono
    localStorage.setItem("movachat-estado-texto", textoFinal);
    localStorage.setItem("movachat-estado-tipo", tipoEstadoSeleccionado);

    // 3. AMARRAR A FIREBASE: Escribir en el perfil del usuario activo
    const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
    if (usuarioActual && typeof db !== "undefined" && typeof ref !== "undefined") {

      const datosActualizar = {
        estadoTexto: textoFinal,
        estadoConexion: tipoEstadoSeleccionado,
        estadoPresencia: tipoEstadoSeleccionado
      };

      if (typeof update !== "undefined") {
        update(ref(db, `usuarios/${usuarioActual.uid}`), datosActualizar);
      } else if (typeof set !== "undefined") {
        set(ref(db, `usuarios/${usuarioActual.uid}/estadoTexto`), textoFinal);
        set(ref(db, `usuarios/${usuarioActual.uid}/estadoConexion`), tipoEstadoSeleccionado);
      }
    }

    // 4. Cerrar el modal y notificar
    modalEstado.classList.add("oculto");
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Perfil actualizado: ${nombreEstadoSeleccionado} ✨`);
    }
  });
}

// --- 4. CAMPANITA Y AJUSTES DE NOTIFICACIONES (UNIFICADO Y REPARADO) ---
const btnCampanita = document.getElementById("btn-campanita-alertas");
const badgeCampanita = document.getElementById("badge-campanita");
const toggleNotificaciones = document.getElementById("check-notificaciones");

// Cargar estado inicial guardado de Notificaciones
const notifGuardada = localStorage.getItem("movachat-notificaciones");
if (toggleNotificaciones) {
  toggleNotificaciones.checked = notifGuardada !== null ? notifGuardada === "activado" : true;
}

// 🔔 EVENTO AL TOCAR LA CAMPANITA: Activa el filtro "No leídos" en la interfaz
if (btnCampanita) {
  btnCampanita.onclick = () => {
    const botonesFiltro = document.querySelectorAll(".caja-filtros .filtro-btn");
    const btnTodos = botonesFiltro[0];
    const btnNoLeidos = botonesFiltro[1];

    if (btnNoLeidos) {
      if (btnTodos) btnTodos.classList.remove("activo");
      btnNoLeidos.classList.add("activo");

      // Simular la filtración de la lista
      document.querySelectorAll("#lista-chats-principal .tarjeta-chat").forEach((tarjeta) => {
        if (tarjeta.id === "tarjeta-mi-estado-propio") return;

        const badge = tarjeta.querySelector(".badge-chat-no-leido") || tarjeta.querySelector(".badge-mensaje");
        const tieneNoLeidos = badge && !badge.classList.contains("oculto") && parseInt(badge.textContent.trim(), 10) > 0;

        tarjeta.style.display = tieneNoLeidos ? "flex" : "none";
      });
    }
  };
}

// ========================================================
// 🔔 1. FUNCIÓN UNIFICADA PARA LA CAMPANITA Y FILTROS
// ========================================================
window.actualizarBadgesNotificaciones = function () {
  const elemBadgeCampanita = document.getElementById("badge-campanita");
  const elemBadgeFiltroNoLeidos = document.querySelector(".caja-filtros .badge-filtro");

  let totalNoLeidos = 0;

  document.querySelectorAll("#lista-chats-principal .tarjeta-chat").forEach((tarjeta) => {
    if (tarjeta.classList.contains("tarjeta-estado-propio") || tarjeta.id === "tarjeta-mi-estado-propio") return;

    const badge = tarjeta.querySelector(".badge-chat-no-leido") || tarjeta.querySelector(".badge-mensaje");

    if (badge) {
      const num = parseInt(badge.textContent.trim(), 10) || 0;

      if (num === 0) {
        badge.classList.add("oculto");
      }

      if (!badge.classList.contains("oculto") && num > 0) {
        totalNoLeidos += num;
      }
    }
  });

  if (elemBadgeCampanita) {
    if (totalNoLeidos > 0) {
      elemBadgeCampanita.textContent = totalNoLeidos > 99 ? "99+" : totalNoLeidos.toString();
      elemBadgeCampanita.classList.remove("oculto");
    } else {
      elemBadgeCampanita.textContent = "0";
      elemBadgeCampanita.classList.add("oculto");
    }
  }

  if (elemBadgeFiltroNoLeidos) {
    elemBadgeFiltroNoLeidos.textContent = totalNoLeidos.toString();
  }
};

// Crear alias global para sincronizar ambas llamadas
window.actualizarCampanitaGlobal = window.actualizarBadgesNotificaciones;

// 🚀 ESCUCHAR ÚLTIMO MENSAJE Y SINCRONIZAR VISTA PREVIA (TENIENDO EN CUENTA EL VACIADO PERSONAL)
function escucharUltimoMensajeContacto(miUid, contactoUid) {
  const chatId = obtenerChatId(miUid, contactoUid);
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);
  const lecturaRef = ref(db, `lecturas/${miUid}/${contactoUid}`);
  const vaciadoRef = ref(db, `vaciados/${miUid}/${contactoUid}`);

  onValue(mensajesRef, async (snapshot) => {
    const tarjetaContacto = document.getElementById(`tarjeta-chat-${contactoUid}`);
    const contenedorLista = document.getElementById("lista-chats-principal");

    if (!tarjetaContacto || !contenedorLista) return;

    const elemTexto = tarjetaContacto.querySelector(".chat-texto");
    const elemHora = tarjetaContacto.querySelector(".chat-hora");
    const elemBadge = tarjetaContacto.querySelector(".badge-chat-no-leido") || tarjetaContacto.querySelector(".badge-mensaje");

    // 1. Obtener fecha del último vaciado personal del usuario
    let timestampUltimoVaciado = 0;
    try {
      const snapVaciado = await get(vaciadoRef);
      if (snapVaciado.exists()) {
        timestampUltimoVaciado = snapVaciado.val();
      }
    } catch (err) {
      console.error("Error al consultar fecha de vaciado para tarjeta:", err);
    }

    if (snapshot.exists()) {
      const mensajes = snapshot.val();
      const keys = Object.keys(mensajes);

      // 2. Filtrar únicamente los mensajes posteriores al vaciado personal
      const mensajesValidosKeys = keys.filter((k) => {
        const m = mensajes[k];
        return (m.timestamp || 0) > timestampUltimoVaciado;
      });

      if (mensajesValidosKeys.length > 0) {
        // Hay mensajes tras el vaciado -> mostrar el último válido
        const ultimoMsgKey = mensajesValidosKeys[mensajesValidosKeys.length - 1];
        const ultimoMsg = mensajes[ultimoMsgKey];

        if (elemTexto) elemTexto.textContent = ultimoMsg.texto || "📷 Adjunto";
        if (elemHora) elemHora.textContent = ultimoMsg.hora || "";

        // Verificar si la pantalla del chat está abierta actualmente
        const pantallaChat = document.getElementById("pantalla-chat-privado");
        const estaAbierto = (window.contactoActivoUid === contactoUid) &&
          pantallaChat &&
          (pantallaChat.style.display === "flex" || pantallaChat.classList.contains("pantalla-completa"));

        if (estaAbierto) {
          set(lecturaRef, ultimoMsgKey);
          if (elemBadge) {
            elemBadge.textContent = "0";
            elemBadge.classList.add("oculto");
          }
          if (elemTexto) elemTexto.classList.remove("texto-resaltado");
        } else {
          // Comparar lecturas de mensajes no leídos posteriores al vaciado
          get(lecturaRef).then((lecturaSnap) => {
            const ultimoLeidoKey = lecturaSnap.exists() ? lecturaSnap.val() : "";
            let nuevos = 0;
            let empezarAContar = (ultimoLeidoKey === "");

            mensajesValidosKeys.forEach((k) => {
              if (k === ultimoLeidoKey) {
                empezarAContar = true;
                return;
              }
              if (empezarAContar) {
                const m = mensajes[k];
                const idEmisor = m.emisor || m.emisorUid;
                if (idEmisor === contactoUid) nuevos++;
              }
            });

            if (nuevos > 0) {
              if (elemBadge) {
                elemBadge.textContent = nuevos > 99 ? "99+" : nuevos.toString();
                elemBadge.classList.remove("oculto");
              }
              if (elemTexto) elemTexto.classList.add("texto-resaltado");
            } else {
              if (elemBadge) {
                elemBadge.textContent = "0";
                elemBadge.classList.add("oculto");
              }
              if (elemTexto) elemTexto.classList.remove("texto-resaltado");
            }

            if (typeof window.actualizarBadgesNotificaciones === "function") {
              window.actualizarBadgesNotificaciones();
            }
          });
        }
      } else {
        // No hay mensajes posteriores al vaciado -> limpiar vista previa de la tarjeta
        if (elemTexto) elemTexto.textContent = "Conversación vaciada";
        if (elemHora) elemHora.textContent = "--:--";
        if (elemBadge) {
          elemBadge.textContent = "0";
          elemBadge.classList.add("oculto");
        }
      }
    } else {
      // Si el chat en la base de datos está completamente vacío
      if (elemTexto) elemTexto.textContent = "Conversación vaciada";
      if (elemHora) elemHora.textContent = "--:--";
      if (elemBadge) {
        elemBadge.textContent = "0";
        elemBadge.classList.add("oculto");
      }
    }

    if (typeof window.actualizarBadgesNotificaciones === "function") {
      window.actualizarBadgesNotificaciones();
    }
  });
}

// --- 5. MODO SIGILO (INVISIBLE) - CONECTADO REALMENTE A FIREBASE ---
const toggleSigilo = document.getElementById("check-sigilo");
const ledPerfilIdentidad = document.querySelector(".btn-estado-sutil .punto-online");
const textoEstadoIdentidad = document.querySelector(".texto-estado");

// A. Cargar estado inicial del Modo Sigilo al abrir la app
const estadoSigiloGuardado = localStorage.getItem("movachat-sigilo");
if (estadoSigiloGuardado === "activo" && toggleSigilo) {
  toggleSigilo.checked = true;
  if (ledPerfilIdentidad) {
    ledPerfilIdentidad.style.backgroundColor = "#888888";
    ledPerfilIdentidad.style.boxShadow = "0 0 10px #888888";
  }
  if (textoEstadoIdentidad) {
    textoEstadoIdentidad.textContent = "Invisible (Modo Sigilo)";
  }
}

// B. Escuchar cuando el usuario enciende o apaga el interruptor
if (toggleSigilo) {
  toggleSigilo.addEventListener("change", () => {
    const estaActivo = toggleSigilo.checked;
    const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;

    if (estaActivo) {
      // 1. Guardar preferencia local
      localStorage.setItem("movachat-sigilo", "activo");

      // 2. Cambiar aspecto visual local (Gris)
      if (ledPerfilIdentidad) {
        ledPerfilIdentidad.style.backgroundColor = "#888888";
        ledPerfilIdentidad.style.boxShadow = "0 0 10px #888888";
      }
      if (textoEstadoIdentidad) {
        textoEstadoIdentidad.textContent = "Invisible (Modo Sigilo)";
      }

      // 3. ENVIAR A FIREBASE: Marcar como offline en tu base de datos
      if (usuarioActual && typeof db !== "undefined" && typeof ref !== "undefined") {
        if (typeof update !== "undefined") {
          update(ref(db, `usuarios/${usuarioActual.uid}`), {
            estadoConexion: "offline",
            estadoPresencia: "offline"
          });
        }
      }

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Modo Sigilo activado: Tu estado ahora es invisible 👤", "🥷", "#888888");
      }

    } else {
      // 1. Guardar preferencia local
      localStorage.setItem("movachat-sigilo", "inactivo");

      // 2. Cambiar aspecto visual local (Cyan / En línea)
      if (ledPerfilIdentidad) {
        ledPerfilIdentidad.style.backgroundColor = "#00f2fe";
        ledPerfilIdentidad.style.boxShadow = "0 0 10px #00f2fe";
      }
      if (textoEstadoIdentidad) {
        textoEstadoIdentidad.textContent = "Disponible";
      }

      // 3. ENVIAR A FIREBASE: Marcar como online en tu base de datos
      if (usuarioActual && typeof db !== "undefined" && typeof ref !== "undefined") {
        if (typeof update !== "undefined") {
          update(ref(db, `usuarios/${usuarioActual.uid}`), {
            estadoConexion: "online",
            estadoPresencia: "online"
          });
        }
      }

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Modo Sigilo desactivado: Estás Visible 🟢", "✨", "#00f2fe");
      }
    }
  });
}

// --- 6. NOTIFICACIONES PUSH NATIVAS (CONECTADAS) ---

// A. Solicitar permiso al navegador/móvil
async function solicitarPermisoNotificaciones() {
  if (!("Notification" in window)) {
    console.warn("Este navegador no soporta notificaciones nativas.");
    return false;
  }

  if (Notification.permission === "granted") {
    return true;
  }

  if (Notification.permission !== "denied") {
    const permiso = await Notification.requestPermission();
    return permiso === "granted";
  }

  return false;
}

// B. DISPARADOR AUTOMÁTICO: Pedir permiso al entrar si no se ha decidido
if (typeof solicitarPermisoNotificaciones === "function") {
  solicitarPermisoNotificaciones().then((permitido) => {
    if (permitido) {
      console.log("✅ Permiso de notificaciones activo y concedido.");
    } else {
      console.warn("⚠️ Notificaciones denegadas o no configuradas aún.");
    }
  });
}

// ========================================================
// 10. ESTADO PROPIO, REDES BENTO Y CONTACTOS
// ========================================================
const tarjetaMiEstado = document.getElementById("tarjeta-mi-estado-propio");
const avatarMiEstadoClick = document.getElementById("avatar-mi-estado-click");
const textoSubtituloMiEstado = document.getElementById("texto-subtulo-mi-estado");
const tiempoMiEstado = document.getElementById("tiempo-mi-estado");
const inputSubirEstadoReal = document.getElementById("input-subir-estado");

let imagenEstadoGuardada = null;
let fraseEstadoGuardada = "";

if (tarjetaMiEstado) {
  tarjetaMiEstado.addEventListener("click", (e) => {
    e.stopPropagation();
    if (imagenEstadoGuardada) {
      const textoFinal = fraseEstadoGuardada || "¡Compartiendo mi día en MovaChat! 🌌🔥";
      if (typeof abrirEstadoAmigo === "function") abrirEstadoAmigo(imagenEstadoGuardada, textoFinal);
    } else {
      if (inputSubirEstadoReal) inputSubirEstadoReal.click();
    }
  });
}

if (inputSubirEstadoReal) {
  inputSubirEstadoReal.addEventListener("change", (e) => {
    if (!imagenEstadoGuardada && e.target.files && e.target.files[0]) {
      const lector = new FileReader();
      lector.onload = function (evento) {
        imagenEstadoGuardada = evento.target.result;
        if (modalEstado) modalEstado.classList.remove("oculto");
        if (inputNuevoEstado) inputNuevoEstado.focus();

        const interceptarGuardado = () => {
          if (inputNuevoEstado) fraseEstadoGuardada = inputNuevoEstado.value.trim();
          if (avatarMiEstadoClick) avatarMiEstadoClick.classList.add("con-estado-activo");
          if (textoSubtituloMiEstado) {
            textoSubtituloMiEstado.textContent = "👁️ Toca para ver tu estado activo";
            textoSubtituloMiEstado.classList.add("texto-cyan");
          }
          if (tiempoMiEstado) tiempoMiEstado.textContent = "Hace un momento";

          const miniBotonMas = avatarMiEstadoClick ? avatarMiEstadoClick.querySelector(".punto-online-chat") : null;
          if (miniBotonMas) {
            miniBotonMas.textContent = "";
            miniBotonMas.style.boxShadow = "0 0 10px #00f2fe";
          }
          mostrarAvisoPremium("¡Tu nueva historia ha sido publicada con éxito! 🪐", "🛸", "#00f2fe");
          if (btnGuardarEstado) btnGuardarEstado.removeEventListener("click", interceptarGuardado);
        };
        if (btnGuardarEstado) btnGuardarEstado.addEventListener("click", interceptarGuardado);
      };
      lector.readAsDataURL(e.target.files[0]);
    }
  });
}

const imagenPerfilElena = document.querySelector(".avatar-perfil-img");
const iconoCamaraElena = document.querySelector(".overlay-camara");
const inputCambiarFotoPerfil = document.getElementById("input-foto-perfil");

if (imagenPerfilElena) {
  imagenPerfilElena.style.cursor = "pointer";
  imagenPerfilElena.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const urlFotoPropia = imagenPerfilElena.src;

    if (visorEstados && imgEstadoRender && textoEstadoRender) {
      imgEstadoRender.src = urlFotoPropia;
      textoEstadoRender.textContent = "Tu foto de perfil (Elena Rostova)";

      likesSimulados = 0;
      if (contadorLikesEstado) contadorLikesEstado.textContent = likesSimulados;
      if (btnCorazonEstado) btnCorazonEstado.classList.remove("activo");

      if (lineaProgreso && lineaProgreso.parentNode) {
        lineaProgreso.parentNode.style.visibility = "hidden";
      }

      visorEstados.classList.remove("oculto");
      mostrarAvisoPremium("Visualizando tu foto de perfil en pantalla completa 🌌", "📸", "#00f2fe");
    }
  });
}

if (iconoCamaraElena && inputCambiarFotoPerfil) {
  iconoCamaraElena.style.cursor = "pointer";
  iconoCamaraElena.addEventListener("click", (e) => {
    e.stopPropagation();
    inputCambiarFotoPerfil.click();
  });

  inputCambiarFotoPerfil.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      const lectorPerfil = new FileReader();

      lectorPerfil.onload = function (eventoCarga) {
        const nuevaImagenUrl = eventoCarga.target.result;
        if (imagenPerfilElena) imagenPerfilElena.src = nuevaImagenUrl;
        mostrarAvisoPremium("Identidad de perfil actualizada y vinculada. 🛡️", "📸", "#00f2fe");
      };

      lectorPerfil.readAsDataURL(e.target.files[0]);
    }
  });
}

const modalRedes = document.getElementById("modal-redes-bento");
const btnCerrarRedes = document.getElementById("btn-cerrar-redes");
const btnGuardarRed = document.getElementById("btn-guardar-red-bento");
const inputUsuarioRed = document.getElementById("input-usuario-red");
const tituloModalRed = document.getElementById("titulo-modal-red");
const prefijoRed = document.getElementById("prefijo-red-social");

const enlacesRedesBento = document.querySelectorAll(".iconos-redes .red-enlace");
let redActivaSeleccionada = null;
let temporizadorRedLongPress = null;
let fuePresionLargaRed = false;

const configuracionRedes = {
  instagram: { titulo: "Instagram Pro", prefijo: "@", base: "https://instagram.com/" },
  tiktok: { titulo: "TikTok Core", prefijo: "@", base: "https://tiktok.com/@" },
  facebook: { titulo: "Facebook Network", prefijo: "fb/", base: "https://facebook.com/" }
};

function abrirEditorRedSocial(redKey) {
  if (!modalRedes) return;
  tituloModalRed.innerHTML = `Editar ${configuracionRedes[redKey].titulo}`;
  prefijoRed.textContent = configuracionRedes[redKey].prefijo;

  const actual = localStorage.getItem(`movachat-red-${redKey}`) || "";
  inputUsuarioRed.value = actual;
  inputUsuarioRed.placeholder = "ej: elena_rostova";

  modalRedes.classList.remove("oculto");
  setTimeout(() => inputUsuarioRed.focus(), 50);
}

enlacesRedesBento.forEach(enlace => {
  let miRedKey = "";
  if (enlace.classList.contains("red-instagram")) miRedKey = "instagram";
  if (enlace.classList.contains("red-tiktok")) miRedKey = "tiktok";
  if (enlace.classList.contains("red-facebook")) miRedKey = "facebook";

  const iniciarPresionLargaRed = () => {
    redActivaSeleccionada = miRedKey;
    fuePresionLargaRed = false;

    temporizadorRedLongPress = setTimeout(() => {
      fuePresionLargaRed = true;
      enlace.style.transform = "scale(0.85)";
      setTimeout(() => { enlace.style.transform = ""; }, 150);

      mostrarAvisoPremium(`Modificando enlace de ${miRedKey.toUpperCase()}... ⚙️`, "✏️", "#00f2fe");
      abrirEditorRedSocial(miRedKey);
    }, 800);
  };

  const finalizarPresionLargaRed = (e) => {
    if (temporizadorRedLongPress) clearTimeout(temporizadorRedLongPress);

    if (fuePresionLargaRed) {
      e.preventDefault();
      e.stopPropagation();
      return;
    }

    redActivaSeleccionada = miRedKey;
    const usuarioGuardado = localStorage.getItem(`movachat-red-${miRedKey}`);

    if (!usuarioGuardado) {
      e.preventDefault();
      e.stopPropagation();
      abrirEditorRedSocial(miRedKey);
    } else {
      enlace.href = configuracionRedes[miRedKey].base + usuarioGuardado;
      mostrarAvisoPremium(`Viajando al portal de ${miRedKey}... 🛸`, "🌐", "#00f2fe");
    }
  };

  enlace.addEventListener("mousedown", iniciarPresionLargaRed);
  enlace.addEventListener("touchstart", iniciarPresionLargaRed, { passive: true });
  enlace.addEventListener("click", finalizarPresionLargaRed);
  enlace.addEventListener("mouseleave", () => { if (temporizadorRedLongPress) clearTimeout(temporizadorRedLongPress); });
  enlace.addEventListener("touchmove", () => { if (temporizadorRedLongPress) clearTimeout(temporizadorRedLongPress); });
});

if (btnGuardarRed) {
  btnGuardarRed.addEventListener("click", () => {
    const nombreUsuario = inputUsuarioRed.value.trim().replace(/[@/]/g, "");

    if (nombreUsuario === "") {
      localStorage.removeItem(`movachat-red-${redActivaSeleccionada}`);
      modalRedes.classList.add("oculto");
      mostrarAvisoPremium("Enlace removido. El botón volverá a pedir configuración.", "🗑️", "#ff4b2b");
      return;
    }

    localStorage.setItem(`movachat-red-${redActivaSeleccionada}`, nombreUsuario);
    modalRedes.classList.add("oculto");
    mostrarAvisoPremium(`Portal de ${redActivaSeleccionada.toUpperCase()} guardado correctamente. 🛡️`, "💎", "#00f2fe");
  });
}

if (btnCerrarRedes) {
  btnCerrarRedes.addEventListener("click", () => {
    modalRedes.classList.add("oculto");
  });
}

// ========================================================
// 11. BÚSQUEDA INTERNA Y GESTIÓN AVANZADA DE CHATS
// ========================================================
const btnCtxBuscar = document.getElementById("btn-ctx-buscar");
const cajaBuscadorInterno = document.getElementById("caja-buscador-interno-chat");
const inputBuscadorInterno = document.getElementById("input-buscador-interno");
const btnCancelarBusquedaInterna = document.getElementById("btn-cancelar-busqueda-interna");

if (btnCtxBuscar && cajaBuscadorInterno && inputBuscadorInterno) {
  btnCtxBuscar.addEventListener("click", (e) => {
    e.stopPropagation();

    if (menuCabecera) menuCabecera.classList.add("oculto");

    cajaBuscadorInterno.classList.remove("oculto");
    inputBuscadorInterno.focus();

    mostrarAvisoPremium("Filtro de conversación activo. Escribe para buscar.", "🔍", "#00f2fe");
  });
}

if (inputBuscadorInterno) {
  inputBuscadorInterno.addEventListener("input", () => {
    const query = inputBuscadorInterno.value.toLowerCase().trim();
    const burbujasMensajes = document.querySelectorAll(".historial-mensajes .mensaje-burbuja");

    burbujasMensajes.forEach(burbuja => {
      const nodoTexto = burbuja.querySelector(".mensaje-texto");
      if (!nodoTexto) return;

      if (!burbuja.hasAttribute("data-texto-original")) {
        burbuja.setAttribute("data-texto-original", nodoTexto.textContent);
      }

      const textoOriginal = burbuja.getAttribute("data-texto-original");

      if (query === "") {
        burbuja.style.display = "block";
        burbuja.style.opacity = "1";
        nodoTexto.textContent = textoOriginal;
      } else if (textoOriginal.toLowerCase().includes(query)) {
        burbuja.style.display = "block";
        burbuja.style.opacity = "1";

        const expresionRegular = new RegExp(`(${query})`, "gi");
        nodoTexto.innerHTML = textoOriginal.replace(expresionRegular, `<span class="texto-resaltado-busqueda">$1</span>`);
      } else {
        burbuja.style.display = "none";
        burbuja.style.opacity = "0";
      }
    });
  });
}

if (btnCancelarBusquedaInterna) {
  btnCancelarBusquedaInterna.addEventListener("click", () => {
    if (cajaBuscadorInterno && inputBuscadorInterno) {
      cajaBuscadorInterno.classList.add("oculto");
      inputBuscadorInterno.value = "";

      const eventoReset = new Event("input");
      inputBuscadorInterno.dispatchEvent(eventoReset);
    }
  });
}

// ========================================================
// 🔕 GESTOR DE SILENCIADO CON TIEMPOS (MODAL CUMPLIDO)
// ========================================================
const btnCtxSilenciar = document.getElementById("btn-ctx-silenciar");
const modalSilenciarTiempo = document.getElementById("modal-silenciar-tiempo");
const btnCerrarModalSilenciar = document.getElementById("btn-cerrar-modal-silenciar");
const btnActivarNotifModal = document.getElementById("btn-activar-notificaciones-modal");
const txtEstadoSilencioActual = document.getElementById("txt-estado-silencio-actual");

if (btnCtxSilenciar) {
  btnCtxSilenciar.addEventListener("click", (e) => {
    e.stopPropagation();

    const contactoUid = window.contactoActivoUid;
    if (!contactoUid) return;

    if (menuCabecera) menuCabecera.classList.add("oculto");

    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    // Verificar si está silenciado actualmente
    const tiempoGuardado = localStorage.getItem(`silenciado_hasta_${contactoUid}`);
    let estaSilenciado = false;

    if (tiempoGuardado) {
      if (tiempoGuardado === "indefinido") {
        estaSilenciado = true;
      } else {
        estaSilenciado = Date.now() < parseInt(tiempoGuardado, 10);
      }
    }

    // Actualizar elementos dentro del modal
    if (txtEstadoSilencioActual) {
      txtEstadoSilencioActual.innerHTML = estaSilenciado
        ? `Notificaciones actualmente <b>silenciadas</b> para ${nombreAmigo}.`
        : `Elige por cuánto tiempo deseas silenciar a <b>${nombreAmigo}</b>:`;
    }

    if (btnActivarNotifModal) {
      if (estaSilenciado) {
        btnActivarNotifModal.classList.remove("oculto");
      } else {
        btnActivarNotifModal.classList.add("oculto");
      }
    }

    if (modalSilenciarTiempo) {
      modalSilenciarTiempo.classList.remove("oculto");
      if (window.lucide) window.lucide.createIcons({ targets: [modalSilenciarTiempo] });
    }
  });
}

// Evento Cerrar Modal
if (btnCerrarModalSilenciar && modalSilenciarTiempo) {
  btnCerrarModalSilenciar.onclick = () => modalSilenciarTiempo.classList.add("oculto");
}

// Evento al elegir una opción de tiempo (1m, 1h, 8h, 1d, indefinido)
document.querySelectorAll(".btn-opcion-tiempo").forEach((btnTiempo) => {
  btnTiempo.addEventListener("click", async () => {
    const claveTiempo = btnTiempo.getAttribute("data-tiempo");
    const contactoUid = window.contactoActivoUid;
    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!contactoUid) return;

    let duracionMs = 0;
    let textoTiempoNotif = "";

    if (claveTiempo === "1m") {
      duracionMs = 1 * 60 * 1000;
      textoTiempoNotif = "1 minuto";
    } else if (claveTiempo === "1h") {
      duracionMs = 1 * 60 * 60 * 1000;
      textoTiempoNotif = "1 hora";
    } else if (claveTiempo === "8h") {
      duracionMs = 8 * 60 * 60 * 1000;
      textoTiempoNotif = "8 horas";
    } else if (claveTiempo === "1d") {
      duracionMs = 24 * 60 * 60 * 1000;
      textoTiempoNotif = "1 día (24h)";
    } else if (claveTiempo === "indefinido") {
      duracionMs = "indefinido";
      textoTiempoNotif = "tiempo indefinido";
    }

    const valorGuardar = duracionMs === "indefinido" ? "indefinido" : (Date.now() + duracionMs).toString();

    // Guardar en LocalStorage y Firebase
    localStorage.setItem(`silenciado_${contactoUid}`, "true");
    localStorage.setItem(`silenciado_hasta_${contactoUid}`, valorGuardar);

    if (miUid) {
      set(ref(db, `silenciados/${miUid}/${contactoUid}`), valorGuardar);
    }

    // Actualizar tarjeta visualmente en la lista de chats
    const tarjeta = document.getElementById(`tarjeta-chat-${contactoUid}`);
    if (tarjeta) {
      tarjeta.classList.add("chat-silenciado-zona");
      const contenedorHora = tarjeta.querySelector(".chat-cabecera");
      if (contenedorHora && !contenedorHora.querySelector(".indicador-silencio-neon")) {
        contenedorHora.insertAdjacentHTML("beforeend", `
          <span class="indicador-silencio-neon" title="Chat silenciado">
            <i data-lucide="bell-off"></i>
          </span>
        `);
        if (window.lucide) window.lucide.createIcons({ targets: [tarjeta] });
      }
    }

    if (modalSilenciarTiempo) modalSilenciarTiempo.classList.add("oculto");

    mostrarAvisoPremium(`Has silenciado a <b>${nombreAmigo}</b> por ${textoTiempoNotif}.`, "🔕", "#ff4b2b");
  });
});

// Evento del botón "Activar notificaciones" dentro del Modal
if (btnActivarNotifModal) {
  btnActivarNotifModal.addEventListener("click", () => {
    const contactoUid = window.contactoActivoUid;
    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!contactoUid) return;

    // Remover de LocalStorage y Firebase
    localStorage.removeItem(`silenciado_${contactoUid}`);
    localStorage.removeItem(`silenciado_hasta_${contactoUid}`);

    if (miUid) {
      set(ref(db, `silenciados/${miUid}/${contactoUid}`), null);
    }

    // Limpiar indicación visual
    const tarjeta = document.getElementById(`tarjeta-chat-${contactoUid}`);
    if (tarjeta) {
      tarjeta.classList.remove("chat-silenciado-zona");
      const icono = tarjeta.querySelector(".indicador-silencio-neon");
      if (icono) icono.remove();
    }

    if (modalSilenciarTiempo) modalSilenciarTiempo.classList.add("oculto");

    mostrarAvisoPremium(`Notificaciones activadas para <b>${nombreAmigo}</b>.`, "🔔", "#00f2fe");
  });
}

// ========================================================
// ⏳ GESTOR DE MENSAJES TEMPORALES CON SELECCIÓN DE TIEMPO
// ========================================================
const btnCtxTemporales = document.getElementById("btn-ctx-temporales");
const modalTemporalesTiempo = document.getElementById("modal-temporales-tiempo");
const btnCerrarModalTemporales = document.getElementById("btn-cerrar-modal-temporales");
const btnDesactivarTemporalesModal = document.getElementById("btn-desactivar-temporales-modal");
const txtEstadoTemporalesActual = document.getElementById("txt-estado-temporales-actual");

if (btnCtxTemporales) {
  btnCtxTemporales.addEventListener("click", async (e) => {
    e.stopPropagation();

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = window.contactoActivoUid;
    if (!miUid || !contactoUid) return;

    if (menuCabecera) menuCabecera.classList.add("oculto");

    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    const chatId = obtenerChatId(miUid, contactoUid);
    const configRef = ref(db, `chats/${chatId}/config/temporales`);

    try {
      const snap = await get(configRef);
      const tiempoConfigurado = snap.exists() ? snap.val() : 0;
      const estaActivo = typeof tiempoConfigurado === 'number' ? tiempoConfigurado > 0 : Boolean(tiempoConfigurado);

      if (txtEstadoTemporalesActual) {
        txtEstadoTemporalesActual.innerHTML = estaActivo
          ? `El modo efímero está <b>activo</b> para la conversación con ${nombreAmigo}.`
          : `Selecciona cuánto tiempo durarán los mensajes con <b>${nombreAmigo}</b>:`;
      }

      if (btnDesactivarTemporalesModal) {
        if (estaActivo) {
          btnDesactivarTemporalesModal.classList.remove("oculto");
        } else {
          btnDesactivarTemporalesModal.classList.add("oculto");
        }
      }

      if (modalTemporalesTiempo) {
        modalTemporalesTiempo.classList.remove("oculto");
        if (window.lucide) window.lucide.createIcons({ targets: [modalTemporalesTiempo] });
      }
    } catch (err) {
      console.error("Error al consultar estado de temporales:", err);
    }
  });
}

// Evento Cerrar Modal
if (btnCerrarModalTemporales && modalTemporalesTiempo) {
  btnCerrarModalTemporales.onclick = () => modalTemporalesTiempo.classList.add("oculto");
}

// Evento al elegir una opción de tiempo (10s, 5m, 1h, 1d)
document.querySelectorAll(".btn-opcion-temporal").forEach((btnTiempo) => {
  btnTiempo.addEventListener("click", async () => {
    const duracionClave = btnTiempo.getAttribute("data-duracion");
    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = window.contactoActivoUid;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!miUid || !contactoUid) return;

    let duracionMs = 0;
    let textoTiempo = "";

    if (duracionClave === "10s") {
      duracionMs = 10 * 1000;
      textoTiempo = "10 segundos";
    } else if (duracionClave === "5m") {
      duracionMs = 5 * 60 * 1000;
      textoTiempo = "5 minutos";
    } else if (duracionClave === "1h") {
      duracionMs = 60 * 60 * 1000;
      textoTiempo = "1 hora";
    } else if (duracionClave === "1d") {
      duracionMs = 24 * 60 * 60 * 1000;
      textoTiempo = "24 horas";
    }

    const chatId = obtenerChatId(miUid, contactoUid);
    const configRef = ref(db, `chats/${chatId}/config/temporales`);

    try {
      await set(configRef, duracionMs);

      if (modalTemporalesTiempo) modalTemporalesTiempo.classList.add("oculto");

      mostrarAvisoPremium(`Modo efímero activo con <b>${nombreAmigo}</b>: los mensajes durarán ${textoTiempo}.`, "⏳", "#00f2fe");
    } catch (err) {
      console.error("Error al guardar tiempo de temporales:", err);
    }
  });
});

// Evento del botón "Desactivar modo efímero" dentro del Modal
if (btnDesactivarTemporalesModal) {
  btnDesactivarTemporalesModal.addEventListener("click", async () => {
    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = window.contactoActivoUid;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!miUid || !contactoUid) return;

    const chatId = obtenerChatId(miUid, contactoUid);
    const configRef = ref(db, `chats/${chatId}/config/temporales`);

    try {
      await set(configRef, 0);

      if (modalTemporalesTiempo) modalTemporalesTiempo.classList.add("oculto");

      mostrarAvisoPremium(`Modo permanente restaurado con <b>${nombreAmigo}</b>.`, "📡", "#00f2fe");
    } catch (err) {
      console.error("Error al desactivar temporales:", err);
    }
  });
}

function aplicarRelojArenaEfecto(burbujaNodo) {
  const nombreAmigoActual = document.querySelector(".amigo-nombre-chat")?.textContent;

  if (nombreAmigoActual && chatsTemporalesBD[nombreAmigoActual]) {
    burbujaNodo.classList.add("mensaje-efimero");

    const horaNodo = burbujaNodo.querySelector(".mensaje-hora");
    if (horaNodo && !horaNodo.querySelector("[data-lucide='hourglass']")) {
      horaNodo.insertAdjacentHTML("afterbegin", `<i data-lucide="hourglass" style="width:10px; height:10px; display:inline-block; margin-right:4px; opacity:0.6; vertical-align:middle;"></i>`);

      // 🚀 OPTIMIZACIÓN CPU: Renderizar solo el icono dentro de 'horaNodo'
      if (window.lucide) {
        window.lucide.createIcons({
          targets: [horaNodo]
        });
      }
    }

    setTimeout(() => {
      burbujaNodo.classList.add("burbuja-evaporar-anim");
      setTimeout(() => {
        burbujaNodo.remove();
        guardarMensajesEnMemoria(nombreAmigoActual, historialMensajes);
      }, 400);
    }, 10000);
  }
}

function guardarMensajesEnMemoria(nombreAmigo, historialNodo) {
  if (!nombreAmigo || !historialNodo) return;

  const historialLimpio = historialNodo.cloneNode(true);
  historialLimpio.querySelectorAll(".mensaje-efimero, .burbuja-evaporar-anim").forEach(b => b.remove());

  localStorage.setItem(`movachat_msgs_${nombreAmigo}`, historialLimpio.innerHTML);
}

// Función para generar un ID único entre dos usuarios
function obtenerChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

// 🟢 FUNCIÓN REAL QUE REEMPLAZARÁ A LA ANTERIOR:
function cargarMensajesChat(contactoUid) {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual) return;

  const chatId = obtenerChatId(usuarioActual.uid, contactoUid);
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);

  // Escuchar mensajes en tiempo real
  onValue(mensajesRef, (snapshot) => {
    const contenedorMensajes = document.getElementById("historial-mensajes"); // Ajusta según tu HTML
    if (!contenedorMensajes) return;

    contenedorMensajes.innerHTML = "";

    if (snapshot.exists()) {
      const mensajes = snapshot.val();
      Object.keys(mensajes).forEach((key) => {
        const msg = mensajes[key];
        const esMio = msg.emisorUid === usuarioActual.uid;

        const burbuja = document.createElement("div");
        burbuja.className = `mensaje-burbuja ${esMio ? 'enviado' : 'recibido'}`;
        burbuja.innerHTML = `
          <p class="mensaje-texto">${msg.texto}</p>
          <span class="mensaje-hora">${new Date(msg.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        contenedorMensajes.appendChild(burbuja);
      });

      // Auto-scroll al final del chat
      contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
    } else {
      contenedorMensajes.innerHTML = `<div style="text-align:center; color:#888; padding:20px;">Inicia la conversación 👋</div>`;
    }
  });
}

// 🛡️ EVENTO DE CLIC EN BLOQUEAR / DESBLOQUEAR
const btnCtxBloquear = document.getElementById("btn-ctx-bloquear");

if (btnCtxBloquear) {
  btnCtxBloquear.addEventListener("click", async (e) => {
    e.stopPropagation();

    const usuarioActual = auth.currentUser;
    const miUid = usuarioActual ? usuarioActual.uid : null;
    const contactoUid = window.contactoActivoUid;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!miUid || !contactoUid) return;

    if (menuCabecera) menuCabecera.classList.add("oculto");

    const bloqueoRef = ref(db, `bloqueos/${miUid}/${contactoUid}`);

    try {
      const snap = await get(bloqueoRef);
      const estaBloqueado = snap.exists() && snap.val() === true;

      if (!estaBloqueado) {
        // 🔒 BLOQUEAR
        await set(bloqueoRef, true);
        mostrarAvisoPremium(`Usuario <b>${nombreAmigoActual}</b> bloqueado con éxito.`, "⚠️", "#ff4b2b");
      } else {
        // 🔓 DESBLOQUEAR
        await set(bloqueoRef, null);
        mostrarAvisoPremium(`Has desbloqueado a <b>${nombreAmigoActual}</b>. Conexión restaurada.`, "📡", "#00f2fe");
      }

      // Re-sincronizar el estado de este usuario específico en la interfaz
      await window.verificarEstadoBloqueo(contactoUid);

    } catch (error) {
      console.error("❌ Error al actualizar bloqueo en Firebase:", error);
      mostrarAvisoPremium("Ocurrió un error al procesar el bloqueo.", "❌", "#ff4b2b");
    }
  });
}

// 🟢 VERIFICAR ESTADO DE BLOQUEO EN FIREBASE Y SINCRONIZAR INTERFAZ
window.verificarEstadoBloqueo = async function (contactoUid) {
  const usuarioActual = auth.currentUser;
  const miUid = usuarioActual ? usuarioActual.uid : null;
  if (!miUid || !contactoUid) return false;

  try {
    const snap = await get(ref(db, `bloqueos/${miUid}/${contactoUid}`));
    const estaBloqueado = snap.exists() && snap.val() === true;

    // 1. Actualizar botón en el menú desplegable
    const btnCtxBloquear = document.getElementById("btn-ctx-bloquear");
    if (btnCtxBloquear) {
      btnCtxBloquear.innerHTML = estaBloqueado
        ? `<i data-lucide="shield-check"></i> Desbloquear usuario`
        : `<i data-lucide="shield-alert"></i> Bloquear usuario`;

      if (estaBloqueado) {
        btnCtxBloquear.classList.remove("texto-rojo");
        btnCtxBloquear.style.color = "#00f2fe";
      } else {
        btnCtxBloquear.classList.add("texto-rojo");
        btnCtxBloquear.style.color = "";
      }

      if (window.lucide) {
        window.lucide.createIcons({ targets: [btnCtxBloquear] });
      }
    }

    // 2. Si el chat abierto en pantalla es el de este contacto, ajustar inputs
    if (window.contactoActivoUid === contactoUid) {
      if (inputChat) {
        inputChat.disabled = estaBloqueado;
        inputChat.placeholder = estaBloqueado ? "Has bloqueado a este usuario." : "Escribe un mensaje privado...";
        inputChat.style.opacity = estaBloqueado ? "0.5" : "1";
      }
      if (btnAccionChat) {
        btnAccionChat.style.pointerEvents = estaBloqueado ? "none" : "auto";
        btnAccionChat.style.opacity = estaBloqueado ? "0.3" : "1";
      }
    }

    // 3. Actualizar aspecto visual de la tarjeta en la lista principal
    const tarjetaAmigoNodo = document.getElementById(`tarjeta-chat-${contactoUid}`);
    if (tarjetaAmigoNodo) {
      if (estaBloqueado) {
        tarjetaAmigoNodo.style.opacity = "0.4";
        tarjetaAmigoNodo.style.filter = "grayscale(100%)";
      } else {
        tarjetaAmigoNodo.style.opacity = "1";
        tarjetaAmigoNodo.style.filter = "none";
      }
    }

    return estaBloqueado;
  } catch (error) {
    console.error("Error al verificar estado de bloqueo:", error);
    return false;
  }
};

// ========================================================
// 🗑️ BOTÓN VACIAR CHAT (CON MODAL Y BORRADO EN FIREBASE)
// ========================================================
const btnCtxVaciar = document.getElementById("btn-ctx-vaciar");
const modalVaciar = document.getElementById("modal-confirmar-vaciar");
const modalTexto = document.getElementById("modal-vaciar-mensaje");
const btnAceptarVaciar = document.getElementById("btn-aceptar-vaciar-modal");
const btnCancelarVaciar = document.getElementById("btn-cancelar-vaciar-modal");

if (btnCtxVaciar) {
  btnCtxVaciar.addEventListener("click", (e) => {
    e.stopPropagation();

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = window.contactoActivoUid;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!miUid || !contactoUid) return;
    if (menuCabecera) menuCabecera.classList.add("oculto");

    if (modalTexto) {
      modalTexto.innerHTML = `¿Estás seguro de que deseas vaciar la conversación con <b>${nombreAmigoActual}</b>? Esta acción es irreversible.`;
    }

    if (modalVaciar) {
      modalVaciar.classList.remove("oculto");
    }
  });
}

// Evento Cancelar Modal
if (btnCancelarVaciar) {
  btnCancelarVaciar.addEventListener("click", () => {
    if (modalVaciar) modalVaciar.classList.add("oculto");
  });
}

// Evento Aceptar Modal (Vaciar Chat INDIVIDUAL)
if (btnAceptarVaciar) {
  btnAceptarVaciar.addEventListener("click", async () => {
    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = window.contactoActivoUid;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (modalVaciar) modalVaciar.classList.add("oculto");
    if (!miUid || !contactoUid) return;

    try {
      // 1. Guardar la marca de vaciado personal en Firebase
      const timestampVaciado = Date.now();
      await set(ref(db, `vaciados/${miUid}/${contactoUid}`), timestampVaciado);

      // 2. Limpiar visualmente la pantalla del chat
      const contenedorHistorial = document.querySelector(".historial-mensajes");
      if (contenedorHistorial) {
        contenedorHistorial.innerHTML = "";
      }

      // 3. Limpiar inmediatamente la tarjeta de la lista de chats principal
      const tarjetaAmigoNodo = document.getElementById(`tarjeta-chat-${contactoUid}`);
      if (tarjetaAmigoNodo) {
        const elemTexto = tarjetaAmigoNodo.querySelector(".chat-texto");
        const elemHora = tarjetaAmigoNodo.querySelector(".chat-hora");
        const elemBadge = tarjetaAmigoNodo.querySelector(".badge-chat-no-leido") || tarjetaAmigoNodo.querySelector(".badge-mensaje");

        if (elemTexto) elemTexto.textContent = "Conversación vaciada";
        if (elemHora) elemHora.textContent = "--:--";
        if (elemBadge) {
          elemBadge.textContent = "0";
          elemBadge.classList.add("oculto");
        }
      }

      if (typeof window.actualizarBadgesNotificaciones === "function") {
        window.actualizarBadgesNotificaciones();
      }

      // 4. Notificación de confirmación
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium(`Se ha limpiado tu historial con <b>${nombreAmigoActual}</b>.`, "🗑️", "#ff4b2b");
      }
    } catch (err) {
      console.error("Error al vaciar el chat en Firebase:", err);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("No se pudo vaciar el chat. Inténtalo de nuevo.", "❌", "#ff4b2b");
      }
    }
  });
}

// ========================================================
// 🔍 LÓGICA COMPLETA DE BÚSQUEDA EN LA PANTALLA PRINCIPAL
// ========================================================
const btnBuscadorEncabezado = document.getElementById("btn-buscador-encabezado");
const inputBuscadorPrincipal = document.querySelector(".input-buscador") || document.getElementById("input-buscador");

// 1. Clic en la Lupa de la Cabecera (Lleva a Inicio, enfoca y da destello)
if (btnBuscadorEncabezado && inputBuscadorPrincipal) {
  btnBuscadorEncabezado.addEventListener("click", () => {
    const btnInicioMenu = document.querySelectorAll(".menu-flotante .menu-btn")[0];
    if (btnInicioMenu && !btnInicioMenu.classList.contains("activo")) {
      btnInicioMenu.click();
    }

    inputBuscadorPrincipal.focus();

    const cajaBuscador = document.querySelector(".caja-buscador");
    if (cajaBuscador) {
      cajaBuscador.style.borderColor = "#00f2fe";
      cajaBuscador.style.boxShadow = "0 0 15px rgba(0, 242, 254, 0.3)";

      setTimeout(() => {
        cajaBuscador.style.borderColor = "";
        cajaBuscador.style.boxShadow = "";
      }, 2000);
    }

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Escribe para buscar conversaciones o amigos... 🔍", "⚡", "#00f2fe");
    }
  });
}

// 2. Filtrado en tiempo real mientras el usuario escribe
if (inputBuscadorPrincipal) {
  inputBuscadorPrincipal.addEventListener("input", (e) => {
    const textoBusqueda = e.target.value.toLowerCase().trim();
    const tarjetasChat = document.querySelectorAll("#pantalla-chats .tarjeta-chat");
    const tarjetaMiEstado = document.getElementById("tarjeta-mi-estado-propio");

    // Ocultar "Mi Estado" al buscar un contacto para limpiar la lista
    if (tarjetaMiEstado) {
      if (textoBusqueda.length > 0) {
        tarjetaMiEstado.classList.add("oculto");
      } else {
        tarjetaMiEstado.classList.remove("oculto");
      }
    }

    tarjetasChat.forEach((tarjeta) => {
      if (tarjeta.id === "tarjeta-mi-estado-propio") return;

      const elementoNombre = tarjeta.querySelector(".chat-nombre") || tarjeta.querySelector(".nombre-contacto");
      const elementoTexto = tarjeta.querySelector(".chat-texto") || tarjeta.querySelector(".ultimo-mensaje");

      const nombre = elementoNombre ? elementoNombre.textContent.toLowerCase() : "";
      const mensaje = elementoTexto ? elementoTexto.textContent.toLowerCase() : "";

      const coincide = nombre.includes(textoBusqueda) || mensaje.includes(textoBusqueda);

      if (coincide) {
        tarjeta.classList.remove("oculto");
      } else {
        tarjeta.classList.add("oculto");
      }
    });
  });
}

// ==========================================================
// 12. MENÚ CONTEXTUAL UNIFICADO (PC + MÓVIL / F12 SIN CONFLIC)
// ==========================================================
let tarjetaChatSeleccionada = null;
let temporizadorLongPress = null;
let bloquarClickFantasma = false;

const menuTarjetas = document.getElementById("menu-tarjetas-chat");
const btnCtxFijar = document.getElementById("btn-ctx-fijar");
const btnCtxEliminar = document.getElementById("btn-ctx-eliminar-chat");
const btnCtxCerrar = document.getElementById("btn-ctx-cerrar");

// 1️⃣ EVENTO Clic Derecho en PC (Directo a nivel de document)
document.addEventListener("contextmenu", (e) => {
  const tarjeta = e.target.closest(".tarjeta-chat");
  if (tarjeta) {
    e.preventDefault();
    e.stopPropagation();
    abrirMenuContextualMova(e.clientX, e.clientY, tarjeta);
  }
});

// 2️⃣ EVENTO Long Press para Móviles y Emulador F12
document.addEventListener("touchstart", (e) => {
  const tarjeta = e.target.closest(".tarjeta-chat");
  if (tarjeta) {
    temporizadorLongPress = setTimeout(() => {
      const touch = e.touches[0];
      bloquarClickFantasma = true;
      abrirMenuContextualMova(touch.clientX, touch.clientY, tarjeta);

      setTimeout(() => {
        bloquarClickFantasma = false;
      }, 400);

    }, 450);
  }
}, { passive: true });

document.addEventListener("touchend", () => clearTimeout(temporizadorLongPress));
document.addEventListener("touchmove", () => clearTimeout(temporizadorLongPress));

// 3️⃣ Abrir y Posicionar Menú (Cálculo Relativo + Límites de Seguridad)
function abrirMenuContextualMova(x, y, tarjeta) {
  if (!menuTarjetas) return;

  tarjetaChatSeleccionada = tarjeta;

  // 📌 Leer si está fijado tanto por clase CSS como por LocalStorage/Dataset
  const contactoUid = tarjeta.dataset.uid || tarjeta.id.replace("tarjeta-chat-", "");
  const esFijado = tarjeta.classList.contains("tarjeta-fijada") || localStorage.getItem(`fijado_${contactoUid}`) === "true";

  // Sincronizar la clase visual por si acaso
  if (esFijado) {
    tarjeta.classList.add("tarjeta-fijada");
  } else {
    tarjeta.classList.remove("tarjeta-fijada");
  }

  // 📐 Referencia del contenedor principal de forma segura
  const elContenedor = document.querySelector(".contenedor-chat") || document.body;
  const marcoApp = elContenedor.getBoundingClientRect();

  // 🧮 Coordenadas relativas dentro de la tarjeta / app
  let posX = x - marcoApp.left;
  let posY = y - marcoApp.top;

  // 🛡️ MÁRGENES DE SEGURIDAD (Evita que el menú se dibuje fuera del marco)
  const anchoMenu = 190;
  const altoMenu = 150;

  if (posX + anchoMenu > marcoApp.width) {
    posX = marcoApp.width - anchoMenu - 10;
  }
  if (posX < 10) posX = 10;

  if (posY + altoMenu > marcoApp.height) {
    posY = marcoApp.height - altoMenu - 10;
  }
  if (posY < 10) posY = 10;

  // 📍 Posicionamiento absoluto seguro
  menuTarjetas.style.position = "absolute";
  menuTarjetas.style.top = `${posY}px`;
  menuTarjetas.style.left = `${posX}px`;
  menuTarjetas.style.zIndex = "99999";
  menuTarjetas.style.display = "block";

  // ✏️ Texto dinámico según el estado real
  if (btnCtxFijar) {
    btnCtxFijar.innerHTML = `<i data-lucide="pin"></i> <span>${esFijado ? 'Desfijar chat' : 'Fijar chat arriba'}</span>`;

    if (window.lucide) {
      window.lucide.createIcons({
        targets: [btnCtxFijar]
      });
    }
  }

  menuTarjetas.classList.remove("oculto");
}

function cerrarMenuContextualMova() {
  if (menuTarjetas) {
    menuTarjetas.classList.add("oculto");
    menuTarjetas.style.display = ""; // Limpia el estilo en línea para que mande el CSS
  }
}

// 4️⃣ Opciones del Menú (Fijar, Eliminar, Cancelar)
if (btnCtxFijar) {
  btnCtxFijar.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (tarjetaChatSeleccionada) alternarFijarChat(tarjetaChatSeleccionada);
    cerrarMenuContextualMova();
  };
}

if (btnCtxEliminar) {
  btnCtxEliminar.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (tarjetaChatSeleccionada) eliminarChatAnimado(tarjetaChatSeleccionada);
    cerrarMenuContextualMova();
  };
}

if (btnCtxCerrar) {
  btnCtxCerrar.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    cerrarMenuContextualMova();
  };
}

// 📌 Lógica para Fijar / Desfijar Chat conectada a Firebase (Respuesta a 1 Clic)
async function alternarFijarChat(tarjeta) {
  if (!tarjeta) return;

  const usuarioActual = auth.currentUser;
  const miUid = usuarioActual ? usuarioActual.uid : null;
  const contactoUid = tarjeta.dataset.uid || tarjeta.id.replace("tarjeta-chat-", "");

  if (!miUid || !contactoUid) return;

  const cabecera = tarjeta.querySelector(".chat-cabecera");
  let pinIcono = tarjeta.querySelector(".indicador-pin-neon");
  
  // Evaluar estado real
  const esFijado = tarjeta.classList.contains("tarjeta-fijada") || localStorage.getItem(`fijado_${contactoUid}`) === "true";

  const fijadoRef = ref(db, `fijados/${miUid}/${contactoUid}`);

  if (esFijado) {
    // 🔴 DESFIJAR (Cambio visual inmediato)
    tarjeta.classList.remove("tarjeta-fijada");
    tarjeta.style.order = "";
    localStorage.removeItem(`fijado_${contactoUid}`);
    if (pinIcono) pinIcono.remove();

    try {
      await set(fijadoRef, null);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Chat desfijado", "📌", "#00f2fe");
      }
    } catch (error) {
      console.error("Error al desfijar en Firebase:", error);
    }
  } else {
    // 🟢 FIJAR (Cambio visual inmediato)
    tarjeta.classList.add("tarjeta-fijada");
    tarjeta.style.order = "-1";
    localStorage.setItem(`fijado_${contactoUid}`, "true");

    if (!pinIcono && cabecera) {
      cabecera.insertAdjacentHTML(
        "beforeend",
        `<span class="indicador-pin-neon"><i data-lucide="pin" style="width:14px; height:14px;"></i></span>`
      );

      if (window.lucide) {
        window.lucide.createIcons({
          targets: [cabecera]
        });
      }
    }

    try {
      await set(fijadoRef, true);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Chat fijado arriba 📌", "📌", "#00f2fe");
      }
    } catch (error) {
      console.error("Error al fijar en Firebase:", error);
    }
  }
}

// 🗑️ Lógica para Eliminar Conversación por Completo en Firebase (Modal Glassmorphism)
let tarjetaParaEliminarGlobal = null;

function eliminarChatAnimado(tarjeta) {
  if (!tarjeta) return;

  tarjetaParaEliminarGlobal = tarjeta;

  const elemNombre = tarjeta.querySelector(".chat-nombre");
  const nombreContacto = elemNombre ? elemNombre.textContent.trim() : "este usuario";

  const modalVaciar = document.getElementById("modal-confirmar-vaciar");
  const modalTexto = document.getElementById("modal-vaciar-mensaje");

  if (modalTexto) {
    modalTexto.innerHTML = `¿Estás seguro de que deseas eliminar permanentemente la conversación con <b>${nombreContacto}</b>? Se borrarán todos los mensajes de la nube.`;
  }

  if (modalVaciar) {
    modalVaciar.classList.remove("oculto");
  }
}

// 🗑️ Lógica de Eliminar Conversación UNILATERAL (Solo para quien elimina)
document.addEventListener("DOMContentLoaded", () => {
  const modalVaciar = document.getElementById("modal-confirmar-vaciar");
  const btnAceptarVaciar = document.getElementById("btn-aceptar-vaciar-modal");
  const btnCancelarVaciar = document.getElementById("btn-cancelar-vaciar-modal");

  if (btnCancelarVaciar) {
    btnCancelarVaciar.onclick = () => {
      if (modalVaciar) modalVaciar.classList.add("oculto");
      tarjetaParaEliminarGlobal = null;
    };
  }

  if (btnAceptarVaciar) {
    btnAceptarVaciar.onclick = async () => {
      if (!tarjetaParaEliminarGlobal) return;

      const tarjeta = tarjetaParaEliminarGlobal;
      const usuarioActual = auth.currentUser;
      const miUid = usuarioActual ? usuarioActual.uid : null;
      const contactoUid = tarjeta.dataset.uid || tarjeta.id.replace("tarjeta-chat-", "");

      if (modalVaciar) modalVaciar.classList.add("oculto");

      if (!miUid || !contactoUid) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No se pudo identificar el usuario.", "⚠️", "#ff4b2b");
        }
        return;
      }

      const elemNombre = tarjeta.querySelector(".chat-nombre");
      const nombreContacto = elemNombre ? elemNombre.textContent.trim() : "este usuario";

      try {
        // 1. Guardar la fecha de vaciado ÚNICAMENTE en tu nodo personal
        const timestampVaciado = Date.now();
        await set(ref(db, `vaciados/${miUid}/${contactoUid}`), timestampVaciado);

        // 2. Limpiar solo tus configuraciones locales (fijado y silenciado personales)
        await set(ref(db, `fijados/${miUid}/${contactoUid}`), null);
        await set(ref(db, `silenciados/${miUid}/${contactoUid}`), null);
        await set(ref(db, `lecturas/${miUid}/${contactoUid}`), null);

        localStorage.removeItem(`fijado_${contactoUid}`);
        localStorage.removeItem(`silenciado_${contactoUid}`);
        localStorage.removeItem(`silenciado_hasta_${contactoUid}`);

        // 3. Reseteo visual en tu pantalla
        tarjeta.classList.add("tarjeta-eliminar-anim");
        setTimeout(() => {
          const elemTexto = tarjeta.querySelector(".chat-texto");
          const elemHora = tarjeta.querySelector(".chat-hora");
          const elemBadge = tarjeta.querySelector(".badge-chat-no-leido") || tarjeta.querySelector(".badge-mensaje");
          const pinIcono = tarjeta.querySelector(".indicador-pin-neon");
          const silencioIcono = tarjeta.querySelector(".indicador-silencio-neon");

          tarjeta.classList.remove("tarjeta-eliminar-anim", "tarjeta-fijada", "chat-silenciado-zona");
          tarjeta.style.order = "";

          if (elemTexto) elemTexto.textContent = "Conversación eliminada";
          if (elemHora) elemHora.textContent = "--:--";
          if (elemBadge) {
            elemBadge.textContent = "0";
            elemBadge.classList.add("oculto");
          }
          if (pinIcono) pinIcono.remove();
          if (silencioIcono) silencioIcono.remove();

          if (typeof window.actualizarBadgesNotificaciones === "function") {
            window.actualizarBadgesNotificaciones();
          }
        }, 300);

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`Has eliminado el historial con <b>${nombreContacto}</b> de tu cuenta.`, "🗑️", "#ff4b2b");
        }

      } catch (error) {
        console.error("Error al borrar conversación personal en Firebase:", error);
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No se pudo vaciar la conversación.", "❌", "#ff4b2b");
        }
      } finally {
        tarjetaParaEliminarGlobal = null;
      }
    };
  }
});

// ⚡ FUNCIÓN DEBOUNCE PARA REDUCIR USO DE CPU Y PETICIONES A FIREBASE
function crearDebounce(funcion, espera = 300) {
  let temporizador;
  return function (...parametros) {
    clearTimeout(temporizador);
    temporizador = setTimeout(() => funcion.apply(this, parametros), espera);
  };
}

// ========================================================
// 13. GESTIÓN DE CONTACTOS Y MODALES (UNIFICADO Y CORREGIDO)
// ========================================================
const btnAbrirContactos = document.getElementById("btn-abrir-contactos");
const modalContactos = document.getElementById("modal-contactos");
const btnCerrarContactos = document.getElementById("btn-cerrar-contactos");
const inputNuevoContacto = document.getElementById("input-nuevo-contacto");
const btnGuardarContacto = document.getElementById("btn-guardar-contacto");
const inputBuscarContacto = document.getElementById("input-buscar-contacto");
const contenedorListaContactos = document.getElementById("contenedor-lista-contactos");

const capaConfirmarEliminar = document.getElementById("capa-confirmar-eliminar");
const textoConfirmarEliminar = document.getElementById("texto-confirmar-eliminar");
const btnCancelarEliminar = document.getElementById("btn-cancelar-eliminar");
const btnConfirmarEliminar = document.getElementById("btn-confirmar-eliminar");

let contactoParaEliminarNodo = null;

// Variable global de control de llamadas para evitar duplicados por ejecuciones simultáneas
let ultimoRenderIdContactos = 0;

// 🟢 LÓGICA CONECTADA A FIREBASE CON CONTROL ANTI-CARRERA ASÍNCRONA
async function renderizarListaContactosModal(filtro = "") {
  if (!contenedorListaContactos) return;

  // Incrementar token de ejecución para cancelar renders anteriores en espera
  const renderIdActual = ++ultimoRenderIdContactos;

  const textoFiltro = filtro.toLowerCase().trim();
  const miUid = auth.currentUser ? auth.currentUser.uid : null;

  if (!miUid) return;

  try {
    const misContactosRef = ref(db, `mis_contactos/${miUid}`);
    const snapshotContactos = await get(misContactosRef);

    // Si se disparó otra búsqueda mientras esperábamos Firebase, abortar esta
    if (renderIdActual !== ultimoRenderIdContactos) return;

    if (snapshotContactos.exists()) {
      const contactosRaw = snapshotContactos.val();

      // Extraer UIDs únicos de Firebase
      const uidsUnicos = new Set();
      Object.entries(contactosRaw).forEach(([key, val]) => {
        if (typeof val === 'object' && val !== null && val.uid) {
          uidsUnicos.add(val.uid);
        } else {
          uidsUnicos.add(key);
        }
      });

      const contactosUids = Array.from(uidsUnicos);

      // Traer los datos de 'usuarios'
      const promesasUsuarios = contactosUids.map(uid => get(ref(db, `usuarios/${uid}`)));
      const snapshotsUsuarios = await Promise.all(promesasUsuarios);

      // Si hubo otra llamada más reciente mientras traíamos usuarios, abortar
      if (renderIdActual !== ultimoRenderIdContactos) return;

      // Limpiar la caja justo antes de pintar los elementos
      contenedorListaContactos.innerHTML = "";

      snapshotsUsuarios.forEach((snapUsuario, index) => {
        if (snapUsuario.exists()) {
          const usuario = snapUsuario.val();
          const targetUid = snapUsuario.key || contactosUids[index];
          const nombreContacto = usuario.nombre || "Usuario";

          // Filtro por texto
          if (nombreContacto.toLowerCase().includes(textoFiltro)) {
            const filaHTML = document.createElement("div");
            filaHTML.className = "item-contacto-fila";

            const primerLetra = nombreContacto.charAt(0).toUpperCase();
            const fotoUrl = usuario.fotoUrl || usuario.fotoPerfil || usuario.photoURL;
            const fotoHTML = fotoUrl
              ? `<img src="${fotoUrl}" alt="${nombreContacto}" class="avatar-contacto-mini">`
              : `<div class="avatar-contacto-mini" style="background:#00f2fe; color:#000; display:flex; align-items:center; justify-content:center; font-weight:bold; font-size:14px; border-radius:50%; width:32px; height:32px;">${primerLetra}</div>`;

            filaHTML.innerHTML = `
              <div class="info-contacto-izq" style="cursor: pointer; display: flex; align-items: center; gap: 10px; flex-grow: 1;">
                ${fotoHTML}
                <span class="nombre-contacto-texto">${nombreContacto}</span>
              </div>
              <button class="btn-eliminar-contacto-item" aria-label="Eliminar contacto" title="Eliminar">
                <i data-lucide="trash-2"></i>
              </button>
            `;

            // Evento para abrir chat privado
            filaHTML.querySelector(".info-contacto-izq").addEventListener("click", (e) => {
              e.stopPropagation();

              document.querySelectorAll(".item-contacto-fila").forEach(el => el.classList.remove("activo"));
              filaHTML.classList.add("activo");

              const uidContacto = targetUid;
              const nomContacto = usuario.nombre || "Usuario";
              const fotoContacto = fotoUrl || "";

              if (typeof abrirChatConUsuario === "function") {
                abrirChatConUsuario(uidContacto, nomContacto, fotoContacto);
              } else if (window.abrirChatConUsuario) {
                window.abrirChatConUsuario(uidContacto, nomContacto, fotoContacto);
              }

              if (modalContactos) modalContactos.classList.add("oculto");
            });

            // Evento para confirmar eliminación
            const btnZafacon = filaHTML.querySelector(".btn-eliminar-contacto-item");
            if (btnZafacon) {
              btnZafacon.addEventListener("click", (e) => {
                e.stopPropagation();
                contactoParaEliminarNodo = { nodo: filaHTML, uid: targetUid, nombre: nombreContacto };
                if (textoConfirmarEliminar) {
                  textoConfirmarEliminar.innerHTML = `¿Seguro que deseas eliminar a <b>${nombreContacto}</b>?`;
                }
                if (capaConfirmarEliminar) capaConfirmarEliminar.classList.remove("oculto");
              });
            }

            contenedorListaContactos.appendChild(filaHTML);
          }
        }
      });

      if (window.lucide) {
        window.lucide.createIcons({ targets: [contenedorListaContactos] });
      }
    } else {
      contenedorListaContactos.innerHTML = `<p style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; padding:10px;">No tienes contactos agregados aún.</p>`;
    }
  } catch (error) {
    console.error("Error al cargar la lista de contactos:", error);
  }
}

// 🔴 1. ELIMINACIÓN PERMANENTE EN FIREBASE REALTIME DATABASE
if (btnConfirmarEliminar) {
  btnConfirmarEliminar.onclick = async () => {
    if (!contactoParaEliminarNodo) return;

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const targetUid = contactoParaEliminarNodo.uid;

    if (miUid && targetUid) {
      try {
        // Eliminar directamente en la base de datos Firebase
        await set(ref(db, `mis_contactos/${miUid}/${targetUid}`), null);

        // Remover nodo HTML de pantalla
        if (contactoParaEliminarNodo.nodo) {
          contactoParaEliminarNodo.nodo.remove();
        }

        mostrarAvisoPremium(`Contacto <b>${contactoParaEliminarNodo.nombre || ''}</b> eliminado.`, "🗑️", "#ff4b2b");
        
        // Recargar vista por si quedó vacía
        renderizarListaContactosModal();
      } catch (err) {
        console.error("Error al eliminar contacto de Firebase:", err);
      }
    }

    if (capaConfirmarEliminar) capaConfirmarEliminar.classList.add("oculto");
    contactoParaEliminarNodo = null;
  };
}

if (btnCancelarEliminar && capaConfirmarEliminar) {
  btnCancelarEliminar.onclick = () => {
    capaConfirmarEliminar.classList.add("oculto");
    contactoParaEliminarNodo = null;
  };
}

// 🔍 2. BÚSQUEDA / FILTRO LOCAL (PASO 2)
if (inputBuscarContacto) {
  inputBuscarContacto.addEventListener("input", (e) => {
    const terminoFiltro = e.target.value.toLowerCase().trim();
    renderizarListaContactosModal(terminoFiltro);
  });
}

// 👤 3. AGREGAR CONTACTO NUEVO (PASO 1)
if (btnGuardarContacto) {
  btnGuardarContacto.onclick = async () => {
    const nombreIngresado = inputNuevoContacto ? inputNuevoContacto.value.trim() : "";
    const miUid = auth.currentUser ? auth.currentUser.uid : null;

    if (!nombreIngresado || !miUid) return;

    try {
      const snapUsuarios = await get(ref(db, "usuarios"));
      if (!snapUsuarios.exists()) return;

      let uidEncontrado = null;
      let usuarioEncontrado = null;

      snapUsuarios.forEach((child) => {
        const uData = child.val();
        if (uData.nombre && uData.nombre.toLowerCase().trim() === nombreIngresado.toLowerCase().trim()) {
          uidEncontrado = child.key;
          usuarioEncontrado = uData;
        }
      });

      if (uidEncontrado && uidEncontrado !== miUid) {
        // Guardar contacto en Firebase
        await set(ref(db, `mis_contactos/${miUid}/${uidEncontrado}`), true);
        if (inputNuevoContacto) inputNuevoContacto.value = "";
        renderizarListaContactosModal();
        mostrarAvisoPremium(`Contacto <b>${usuarioEncontrado.nombre}</b> añadido.`, "👤", "#00f2fe");
      } else if (uidEncontrado === miUid) {
        mostrarAvisoPremium("No puedes agregarte a ti mismo.", "⚠️", "#ffaa00");
      } else {
        mostrarAvisoPremium("Usuario no encontrado.", "❌", "#ff4b2b");
      }
    } catch (err) {
      console.error("Error guardando contacto:", err);
    }
  };
}

// 🔍 4. AUTOCOMPLETADO GLOBAL DE CONTACTOS EN TIEMPO REAL
const cajaSugerencias = document.getElementById("sugerencias-busqueda-contactos");

if (inputNuevoContacto && cajaSugerencias) {
  inputNuevoContacto.addEventListener("input", async (e) => {
    const textoConsulta = e.target.value.trim().toLowerCase();
    const miUid = auth.currentUser ? auth.currentUser.uid : null;

    if (!textoConsulta || !miUid) {
      cajaSugerencias.classList.add("oculto");
      cajaSugerencias.innerHTML = "";
      return;
    }

    try {
      const snapUsuarios = await get(ref(db, "usuarios"));
      if (!snapUsuarios.exists()) {
        cajaSugerencias.classList.add("oculto");
        return;
      }

      const snapMisContactos = await get(ref(db, `mis_contactos/${miUid}`));
      const misContactosAgregados = snapMisContactos.exists() ? Object.keys(snapMisContactos.val()) : [];

      const usuariosCoincidentes = [];

      snapUsuarios.forEach((child) => {
        const uUid = child.key;
        const uData = child.val();

        // Excluir propio usuario y contactos ya agregados
        if (uUid === miUid || misContactosAgregados.includes(uUid)) return;

        const nombreUsuario = (uData.nombre || "").toLowerCase().trim();

        // Coincidencia precisa por inicio de texto
        if (nombreUsuario.startsWith(textoConsulta) || nombreUsuario.includes(textoConsulta)) {
          usuariosCoincidentes.push({ uid: uUid, ...uData });
        }
      });

      if (usuariosCoincidentes.length === 0) {
        cajaSugerencias.innerHTML = `<div style="padding: 10px; font-size: 12px; color: rgba(255,255,255,0.5); text-align: center;">No se encontraron usuarios</div>`;
        cajaSugerencias.classList.remove("oculto");
        return;
      }

      let htmlSugerencias = "";
      usuariosCoincidentes.forEach((usuario) => {
        const tieneFoto = usuario.fotoPerfil || usuario.fotoUrl || usuario.photoURL;
        const inicial = usuario.nombre ? usuario.nombre.charAt(0).toUpperCase() : "?";

        htmlSugerencias += `
          <div class="item-sugerencia-usuario" data-nombre="${usuario.nombre}">
            ${tieneFoto 
              ? `<img src="${tieneFoto}" class="avatar-sugerencia" alt="Perfil">` 
              : `<div class="avatar-sugerencia-placeholder">${inicial}</div>`}
            <span class="nombre-sugerencia-txt">${usuario.nombre}</span>
          </div>
        `;
      });

      cajaSugerencias.innerHTML = htmlSugerencias;
      cajaSugerencias.classList.remove("oculto");

      cajaSugerencias.querySelectorAll(".item-sugerencia-usuario").forEach((item) => {
        item.addEventListener("click", () => {
          const nombreSeleccionado = item.getAttribute("data-nombre");
          inputNuevoContacto.value = nombreSeleccionado;
          cajaSugerencias.classList.add("oculto");
          cajaSugerencias.innerHTML = "";
          
          if (btnGuardarContacto) btnGuardarContacto.click();
        });
      });

    } catch (err) {
      console.error("Error buscando usuarios en Firebase:", err);
    }
  });

  document.addEventListener("click", (e) => {
    if (!inputNuevoContacto.contains(e.target) && !cajaSugerencias.contains(e.target)) {
      cajaSugerencias.classList.add("oculto");
    }
  });
}

if (btnAbrirContactos && modalContactos) {
  btnAbrirContactos.addEventListener("click", () => {
    renderizarListaContactosModal();
    modalContactos.classList.remove("oculto");
    if (capaConfirmarEliminar) capaConfirmarEliminar.classList.add("oculto");
  });
}

if (btnCerrarContactos && modalContactos) {
  btnCerrarContactos.addEventListener("click", () => {
    modalContactos.classList.add("oculto");
  });
}

if (btnGuardarContacto && inputNuevoContacto) {
  btnGuardarContacto.addEventListener("click", async () => {
    const nombreNuevo = inputNuevoContacto.value.trim().toLowerCase();

    if (nombreNuevo === "") return;

    try {
      // 1. Consultar usuarios reales en Firebase
      const usuariosRef = ref(db, 'usuarios');
      const snapshot = await get(usuariosRef);

      if (snapshot.exists()) {
        const usuarios = snapshot.val();
        let usuarioEncontrado = null;
        let uidEncontrado = null;

        // 2. Buscar si coincide por correo o por nombre real
        Object.keys(usuarios).forEach((uid) => {
          const u = usuarios[uid];
          if (
            (u.email && u.email.toLowerCase() === nombreNuevo) ||
            (u.nombre && u.nombre.toLowerCase() === nombreNuevo)
          ) {
            usuarioEncontrado = u;
            uidEncontrado = uid;
          }
        });

        // 3. Si existe, lo agregamos; si no, mostramos aviso
        if (usuarioEncontrado) {
          const miUid = auth.currentUser ? auth.currentUser.uid : null;

          if (miUid) {
            // Guardar la relación en la base de datos
            await set(ref(db, `mis_contactos/${miUid}/${uidEncontrado}`), true);
          }

          inputNuevoContacto.value = "";

          if (typeof renderizarListaContactosModal === "function") {
            renderizarListaContactosModal(inputBuscarContacto ? inputBuscarContacto.value : "");
          }

          mostrarAvisoPremium(`Contacto <b>${usuarioEncontrado.nombre}</b> añadido con éxito.`, "👤", "#00f2fe");
        } else {
          mostrarAvisoPremium(`El usuario <b>${nombreNuevo}</b> no existe en la plataforma.`, "⚠️", "#ff4b2b");
        }
      } else {
        mostrarAvisoPremium("No hay usuarios registrados.", "⚠️", "#ff4b2b");
      }
    } catch (error) {
      console.error("Error al añadir contacto:", error);
      mostrarAvisoPremium("Error al buscar el usuario.", "❌", "#ff4b2b");
    }
  });
}

if (inputBuscarContacto) {
  inputBuscarContacto.addEventListener("input", () => {
    renderizarListaContactosModal(inputBuscarContacto.value);
  });
}

if (btnCancelarEliminar && capaConfirmarEliminar) {
  btnCancelarEliminar.addEventListener("click", () => {
    capaConfirmarEliminar.classList.add("oculto");
    contactoParaEliminarNodo = null;
  });
}

if (btnConfirmarEliminar && capaConfirmarEliminar) {
  btnConfirmarEliminar.addEventListener("click", () => {
    if (contactoParaEliminarNodo) {
      const idx = listaContactosBD.findIndex(c => c.nombre === contactoParaEliminarNodo.nombre);
      if (idx !== -1) listaContactosBD.splice(idx, 1);

      contactoParaEliminarNodo.nodo.style.transition = "all 0.25s ease";
      contactoParaEliminarNodo.nodo.style.opacity = "0";
      contactoParaEliminarNodo.nodo.style.transform = "scale(0.9)";

      setTimeout(() => {
        contactoParaEliminarNodo.nodo.remove();
        capaConfirmarEliminar.classList.add("oculto");
        mostrarAvisoPremium(`Contacto <b>${contactoParaEliminarNodo.nombre}</b> eliminado.`, "🗑️", "#ff4b2b");
        contactoParaEliminarNodo = null;
      }, 250);
    }
  });
}

const btnAdjuntarContacto = document.getElementById("btn-adjuntar-contacto");

if (btnAdjuntarContacto && modalContactos) {
  btnAdjuntarContacto.addEventListener("click", (e) => {
    e.stopPropagation();

    if (menuAdjuntar) menuAdjuntar.classList.add("oculto");
    if (btnAdjuntarTodo) btnAdjuntarTodo.classList.remove("caiman-abierto");

    renderizarListaContactosModal();

    setTimeout(() => {
      document.querySelectorAll(".item-contacto-fila").forEach(fila => {
        fila.style.cursor = "pointer";

        fila.addEventListener("click", (evt) => {
          if (evt.target.closest(".btn-eliminar-contacto-item")) return;

          const nombreContacto = fila.querySelector(".nombre-contacto-texto").textContent;
          const srcAvatar = fila.querySelector(".avatar-contacto-mini").src;

          modalContactos.classList.add("oculto");
          inyectarContactoCompartidoBurbuja(nombreContacto, srcAvatar);
        });
      });
    }, 100);

    modalContactos.classList.remove("oculto");
    mostrarAvisoPremium("Selecciona un contacto para compartirlo en la conversación.", "📇", "#00f2fe");
  });
}

function inyectarContactoCompartidoBurbuja(nombre, avatar) {
  const ahora = new Date();
  const horaFormateada = ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const nuevaBurbujaHTML = document.createElement("div");
  nuevaBurbujaHTML.className = "mensaje-burbuja enviado";
  nuevaBurbujaHTML.style.padding = "8px";

  // Foto por defecto o la url provista
  const avatarUrl = avatar || "https://i.pravatar.cc/150";

  nuevaBurbujaHTML.innerHTML = `
    <div class="tarjeta-contacto-compartido">
      <div class="cabecera-contacto-card">
        <img src="${avatarUrl}" alt="${nombre}" class="avatar-contacto-card">
        <div class="info-contacto-card">
          <span class="nombre-contacto-card">${nombre}</span>
          <span class="subtexto-contacto-card">
            <i data-lucide="shield-check" style="width:12px; height:12px;"></i> Contacto MovaChat
          </span>
        </div>
      </div>
      <button class="btn-accion-contacto-card">
        <i data-lucide="message-square" style="width:14px; height:14px;"></i> Chatear
      </button>
    </div>
    <span class="mensaje-hora" style="margin-top: 4px;">${horaFormateada}</span>
  `;

  // 🛡️ Asignar el evento al botón desde JS para evitar fallos de sintaxis con nombres complejos
  const btnChatear = nuevaBurbujaHTML.querySelector(".btn-accion-contacto-card");
  if (btnChatear) {
    btnChatear.addEventListener("click", () => {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium(`Iniciando conversación con ${nombre}...`, '💬', '#00f2fe');
      }
    });
  }

  if (historialMensajes) {
    historialMensajes.appendChild(nuevaBurbujaHTML);

    if (typeof aplicarRelojArenaEfecto === "function") {
      aplicarRelojArenaEfecto(nuevaBurbujaHTML);
    }

    // ⚡ OPTIMIZACIÓN CPU: Renderizar únicamente los iconos dentro de la nueva tarjeta de contacto
    if (window.lucide) {
      window.lucide.createIcons({
        targets: [nuevaBurbujaHTML]
      });
    }

    historialMensajes.scrollTop = historialMensajes.scrollHeight;

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Contacto <b>${nombre}</b> compartido con éxito.`, "📇", "#00f2fe");
    }
  }
}

// ========================================================
// 14. INICIALIZACIÓN GLOBAL (DOM CONTENT LOADED)
// ========================================================
function conectarBotonEmoji() {
  const btnEmoji = document.querySelector(".btn-emoji");
  const inputTexto = document.getElementById("input-chat-privado") || document.querySelector(".caja-input-chat input");

  if (btnEmoji && inputTexto) {
    btnEmoji.onclick = function (e) {
      e.preventDefault();
      e.stopPropagation();

      inputTexto.focus();

      if ('showPicker' in HTMLInputElement.prototype) {
        try {
          inputTexto.showPicker();
        } catch (err) {
        }
      }
    };
  }
}

// ==========================================================
// 📇 CONECTOR DE CONTACTOS A CHAT PRIVADO
// ==========================================================
document.addEventListener("click", (e) => {
  // 1. Verificar si hiciste clic en una fila de contacto
  const filaContacto = e.target.closest(".item-contacto-fila");

  // Si no es un contacto o diste clic en eliminar, no hacemos nada
  if (!filaContacto || e.target.closest(".btn-eliminar-contacto-item")) return;

  // 2. Extraer nombre y foto del contacto
  const nombre = filaContacto.querySelector(".nombre-contacto-texto")?.textContent || "Contacto";
  const avatar = filaContacto.querySelector(".avatar-contacto-mini")?.src;

  // 3. Cerrar el modal de contactos
  const modal = filaContacto.closest(".modal-overlay");
  if (modal) modal.classList.add("oculto");

  // 4. Ocultar la pantalla principal de chats
  const pantallaChats = document.getElementById("pantalla-chats");
  if (pantallaChats) pantallaChats.style.display = "none";

  // 5. 🙈 OCULTAR ELEMENTOS GLOBALES DE INICIO (Encabezado + Menú Inferior + Botón +)
  const encabezadoInicio = document.querySelector(".encabezado-inicio");
  const menuFlotante = document.querySelector(".menu-flotante");
  const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto");

  if (encabezadoInicio) encabezadoInicio.style.display = "none";
  if (menuFlotante) menuFlotante.style.display = "none";
  if (btnFlotanteContacto) btnFlotanteContacto.style.display = "none";

  // 6. Cargar los datos en la pantalla de chat privado
  const nombreCabecera = document.querySelector("#pantalla-chat-privado .amigo-nombre-chat");
  const avatarCabecera = document.querySelector("#pantalla-chat-privado .avatar-mini-caja img");

  if (nombreCabecera) nombreCabecera.textContent = nombre;
  if (avatarCabecera && avatar) avatarCabecera.src = avatar;

  // 7. Abrir la pantalla de chat privado
  const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
  if (pantallaChatPrivado) {
    pantallaChatPrivado.style.display = "flex";
    pantallaChatPrivado.classList.add("pantalla-completa");
  }
});

// ==========================================================
// 🔙 RESTAURAR ELEMENTOS AL REGRESAR A LA LISTA DE CHATS
// ==========================================================
document.addEventListener("click", (e) => {
  // Si presiona el botón de flecha atrás en el chat privado
  if (e.target.closest("#pantalla-chat-privado .btn-volver")) {
    const encabezadoInicio = document.querySelector(".encabezado-inicio");
    const menuFlotante = document.querySelector(".menu-flotante");
    const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto");

    // Restaurar encabezado y menús flotantes
    if (encabezadoInicio) encabezadoInicio.style.display = "flex";
    if (menuFlotante) menuFlotante.style.display = "flex";
    if (btnFlotanteContacto) btnFlotanteContacto.style.display = "flex";
  }
});

// ==========================================================
// ✏️ MODAL GLASSMORPHISM EDITAR NOMBRE
// ==========================================================
const modalNombre = document.getElementById("modal-editar-nombre");
const inputNombre = document.getElementById("input-nuevo-nombre");
const btnGuardarNombre = document.getElementById("btn-guardar-nombre");
const btnCerrarModalNombre = document.getElementById("btn-cerrar-modal-nombre");

// 1. Abrir Modal al hacer clic en el nombre
document.addEventListener("click", (e) => {
  const btnNombre = e.target.closest("#texto-perfil-nombre");
  if (btnNombre && modalNombre) {
    const spanNombre = btnNombre.querySelector("span");
    const nombreActual = spanNombre ? spanNombre.textContent.trim() : "";

    if (inputNombre) inputNombre.value = nombreActual;
    modalNombre.classList.remove("oculto");
    setTimeout(() => inputNombre?.focus(), 100);
  }
});

// 2. Guardar Nombre
if (btnGuardarNombre) {
  btnGuardarNombre.onclick = () => {
    const valor = inputNombre ? inputNombre.value.trim() : "";
    if (valor !== "") {
      const spanNombre = document.querySelector("#texto-perfil-nombre span");
      if (spanNombre) spanNombre.textContent = valor;
      if (modalNombre) modalNombre.classList.add("oculto");
    }
  };
}

// 3. Cerrar con la X o dando clic afuera
if (btnCerrarModalNombre) {
  btnCerrarModalNombre.onclick = () => modalNombre?.classList.add("oculto");
}

if (modalNombre) {
  modalNombre.onclick = (e) => {
    if (e.target === modalNombre) modalNombre.classList.add("oculto");
  };
}

// ==========================================================
// 🎨 ANIMAR EL DESLIZADOR DE AURA AL CLIC
// ==========================================================
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".opcion-aura");
  if (!btn) return;

  const botones = Array.from(document.querySelectorAll(".opcion-aura"));
  const indicador = document.getElementById("indicador-aura");
  const index = botones.indexOf(btn);

  if (indicador && index !== -1) {
    indicador.style.transform = `translateX(${index * 100}%)`;
  }

  botones.forEach(b => b.classList.remove("activa"));
  btn.classList.add("activa");
});

// ==========================================================
// 🗑️ BOTÓN LIMPIAR: BORRAR CHATS CON ALERTA VISUAL (TOAST)
// ==========================================================
document.addEventListener("click", (e) => {
  // Atrapamos el botón exacto mediante su ID
  const btnLimpiar = e.target.closest("#btn-limpiar-historial-global");
  if (!btnLimpiar) return;

  const tarjetasChat = document.querySelectorAll(".lista-chats .tarjeta-chat");

  if (tarjetasChat.length === 0) {
    mostrarToast("La lista ya está vacía");
    return;
  }

  // Animación de salida fluida
  tarjetasChat.forEach((tarjeta) => {
    tarjeta.style.transition = "all 0.3s ease";
    tarjeta.style.opacity = "0";
    tarjeta.style.transform = "scale(0.95)";
  });

  // Limpiar el DOM y mostrar la notificación
  setTimeout(() => {
    tarjetasChat.forEach(t => t.remove());
    mostrarToast("¡Lista de chats limpiada!");
  }, 300);
});

// Variable para controlar el temporizador activo del toast
let toastTimeoutId = null;

function mostrarToast(mensaje) {
  // Comprobar si el usuario desactivó las notificaciones
  const notifEstado = localStorage.getItem("movachat-notificaciones");
  if (notifEstado === "desactivado") return; // No muestra la alerta flotante

  const toast = document.getElementById("toast-notificacion");
  const texto = document.getElementById("toast-texto");
  if (!toast) return;

  if (texto) texto.textContent = mensaje;

  toast.classList.remove("oculto");

  // ⚡ OPTIMIZACIÓN CPU: Renderizar únicamente los iconos dentro del elemento Toast
  if (window.lucide) {
    window.lucide.createIcons({
      targets: [toast]
    });
  }

  // ⏱️ Reiniciar el temporizador si ya había una alerta mostrándose
  if (toastTimeoutId) clearTimeout(toastTimeoutId);

  toastTimeoutId = setTimeout(() => {
    toast.classList.add("oculto");
    toastTimeoutId = null;
  }, 2500);
}

// 🔊 Función para el sonido de mensaje recibido (Respeta el botón de silenciar)
function reproducirSonidoRecibido() {
  // 1. Preguntamos a la memoria si el usuario apagó las notificaciones
  const notifEstado = localStorage.getItem("movachat-notificaciones");

  // 2. Si dice "desactivado", nos detenemos aquí y NO suena nada
  if (notifEstado === "desactivado") {
    return;
  }

  // 3. Si está activado, reproduce el sonido de recibido
  const audioRecibido = document.getElementById("sonido-recibido");
  if (audioRecibido) {
    audioRecibido.currentTime = 0; // Detiene cualquier audio previo para que no se encima
    audioRecibido.play().catch((e) => console.log("Audio bloqueado por el navegador:", e));
  }
}

// Función global para alternar visibilidad de contraseña
window.togglePasswordVisibility = function () {
  const inputPass = document.getElementById("auth-password");
  const iconoOjito = document.getElementById("icono-ojito");

  if (inputPass) {
    const esPassword = inputPass.type === "password";
    inputPass.type = esPassword ? "text" : "password";

    if (iconoOjito) {
      iconoOjito.setAttribute("data-lucide", esPassword ? "eye-off" : "eye");
      if (window.lucide) {
        window.lucide.createIcons();
      }
    }
  }
};

// --- 2. OPCIÓN: CAMBIAR CONTRASEÑA (Envío de correo real) ---
const opcionCambiarPassword = document.getElementById("opcion-cambiar-password");
if (opcionCambiarPassword) {
  opcionCambiarPassword.addEventListener("click", async () => {
    menuCabeceraFlotante.classList.add("oculto");

    const usuarioActual = auth.currentUser;

    if (usuarioActual && usuarioActual.email) {
      try {
        const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");

        await sendPasswordResetEmail(auth, usuarioActual.email);

        // Notificación explícita para que revise su correo
        mostrarAvisoPremium(`Te enviamos un enlace de cambio a <b>${usuarioActual.email}</b>. Revisa tu correo 🔑`, "✉️", "#00f2fe");
      } catch (error) {
        console.error("❌ Error al solicitar cambio de clave:", error);
        mostrarAvisoPremium("No se pudo enviar el correo de recuperación ⚠️", "❌", "#ff4b2b");
      }
    } else {
      mostrarAvisoPremium("No se detectó un correo asociado activo ⚠️", "❌", "#ff4b2b");
    }
  });
}

// --- PANEL DE ADMINISTRACIÓN: ESCUCHAR Y APROBAR USUARIOS ---
function cargarUsuariosPendientes() {
  const contenedorPendientes = document.getElementById("lista-pendientes");
  if (!contenedorPendientes) return;

  // Consultar en tiempo real a los usuarios en la base de datos
  const usuariosRef = ref(db, 'usuarios');

  onValue(usuariosRef, (snapshot) => {
    contenedorPendientes.innerHTML = ""; // Limpiar lista anterior
    let hayPendientes = false;

    if (snapshot.exists()) {
      const usuarios = snapshot.val();

      Object.keys(usuarios).forEach((uid) => {
        const u = usuarios[uid];

        // Filtrar solo los que están pendientes
        if (u.estadoAcceso === "pendiente") {
          hayPendientes = true;

          const tarjeta = document.createElement("div");
          tarjeta.className = "tarjeta-usuario-pendiente";
          tarjeta.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            background: rgba(255, 255, 255, 0.05);
            padding: 12px 16px;
            margin-bottom: 10px;
            border-radius: 12px;
            border: 1px solid rgba(255, 255, 255, 0.1);
          `;

          tarjeta.innerHTML = `
            <div>
              <p style="margin: 0; font-weight: bold; color: #fff;">${u.nombre || 'Sin nombre'}</p>
              <p style="margin: 0; font-size: 0.8rem; color: #aaa;">${u.correo}</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button onclick="cambiarEstadoAcceso('${uid}', 'aprobado')" style="background: #2ec4b6; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; cursor: pointer;">Aprobar 🟢</button>
              <button onclick="cambiarEstadoAcceso('${uid}', 'baneado')" style="background: #e71d36; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; cursor: pointer;">Rechazar 🔴</button>
            </div>
          `;

          contenedorPendientes.appendChild(tarjeta);
        }
      });
    }

    if (!hayPendientes) {
      contenedorPendientes.innerHTML = `<p style="color: #aaa; font-size: 0.9rem; text-align: center;">No hay solicitudes pendientes ✨</p>`;
    }
  });
}

// Función global para cambiar el estado de acceso desde los botones de Admin
window.cambiarEstadoAcceso = async function (uid, nuevoEstado) {
  try {
    // 1. Actualizar el estado de acceso en Firebase Realtime Database
    await update(ref(db, 'usuarios/' + uid), {
      estadoAcceso: nuevoEstado
    });

    // 2. Notificación visual de confirmación
    if (typeof mostrarAvisoPremium === "function") {
      const msj = nuevoEstado === 'aprobado' ? 'aprobado 🟢' : 'rechazado 🔴';
      mostrarAvisoPremium(`Usuario ${msj} con éxito.`, "✅", "#2ec4b6");
    }
  } catch (error) {
    console.error("❌ Error al actualizar el estado de acceso:", error);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("No se pudo cambiar el estado del usuario.", "⚠️", "#ff4b2b");
    } else {
      alert("Error al actualizar el estado del usuario.");
    }
  }
};

// Variable global para guardar el contacto seleccionado actualmente
let contactoSeleccionado = null;

// 🟢 Cargar solo contactos agregados y tarjetas de solicitud "X quiere hablar contigo"
function cargarContactosAprobados(usuarioActualUid) {
  const contenedorContactos = document.getElementById("lista-chats-principal");
  if (!contenedorContactos) return;

  const misContactosRef = ref(db, `mis_contactos/${usuarioActualUid}`);
  const misSolicitudesRef = ref(db, `solicitudes/${usuarioActualUid}`);
  const fijadosRef = ref(db, `fijados/${usuarioActualUid}`);

  // Escuchar solicitudes y contactos en tiempo real
  onValue(misContactosRef, (snapContactos) => {
    onValue(misSolicitudesRef, (snapSolicitudes) => {
      onValue(fijadosRef, (snapFijados) => {
        const contactosAprobadosMap = snapContactos.exists() ? snapContactos.val() : {};
        const solicitudesMap = snapSolicitudes.exists() ? snapSolicitudes.val() : {};
        const fijadosBD = snapFijados.exists() ? snapFijados.val() : {};

        const tarjetaMiEstado = document.getElementById("tarjeta-mi-estado-propio");
        contenedorContactos.innerHTML = "";
        if (tarjetaMiEstado) contenedorContactos.appendChild(tarjetaMiEstado);

        // 📩 A) MOSTRAR TARJETAS DE SOLICITUD PENDIENTE ("Juan quiere hablar contigo")
        Object.keys(solicitudesMap).forEach((emisorUid) => {
          const sol = solicitudesMap[emisorUid];
          if (!sol) return;

          const tarjetaSol = document.createElement("div");
          tarjetaSol.className = "tarjeta-chat tarjeta-solicitud-pendiente";
          tarjetaSol.style.cssText = "background: rgba(0, 242, 254, 0.08); border: 1px solid rgba(0, 242, 254, 0.3); border-radius: 16px; margin-bottom: 10px; padding: 12px;";

          const foto = sol.fotoUrl
            ? `<img src="${sol.fotoUrl}" style="width: 45px; height: 45px; border-radius: 50%; object-fit: cover;">`
            : `<div style="width: 45px; height: 45px; border-radius: 50%; background: #00f2fe; color: #000; display: flex; align-items: center; justify-content: center; font-weight: bold;">${(sol.nombre || 'U').charAt(0).toUpperCase()}</div>`;

          tarjetaSol.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
              ${foto}
              <div style="flex: 1;">
                <h4 style="margin: 0; font-size: 0.95rem; color: #fff;"><b>${sol.nombre || 'Usuario'}</b> quiere hablar contigo</h4>
                <p style="margin: 2px 0 0; font-size: 0.78rem; color: rgba(255,255,255,0.6);">¿Deseas aceptar la conversación?</p>
              </div>
            </div>
            <div style="display: flex; gap: 8px; margin-top: 10px;">
              <button class="btn-rechazar-sol" style="flex: 1; padding: 6px 10px; border-radius: 8px; background: rgba(255,255,255,0.1); border: none; color: #fff; font-size: 0.8rem; cursor: pointer;">Rechazar</button>
              <button class="btn-aceptar-sol" style="flex: 1; padding: 6px 10px; border-radius: 8px; background: linear-gradient(135deg, #00f2fe, #4facfe); border: none; color: #000; font-weight: bold; font-size: 0.8rem; cursor: pointer;">Aceptar</button>
            </div>
          `;

          tarjetaSol.querySelector(".btn-aceptar-sol").onclick = () => aceptarSolicitudContacto(emisorUid, tarjetaSol);
          tarjetaSol.querySelector(".btn-rechazar-sol").onclick = () => rechazarSolicitudContacto(emisorUid, tarjetaSol);

          contenedorContactos.appendChild(tarjetaSol);
        });

        // 💬 B) MOSTRAR SOLO CONTACTOS APROBADOS
        const uidsContactos = Object.keys(contactosAprobadosMap);
        if (uidsContactos.length === 0 && Object.keys(solicitudesMap).length === 0) {
          return;
        }

        // Obtener datos de los usuarios agregados
        onValue(ref(db, 'usuarios'), (snapUsuarios) => {
          if (!snapUsuarios.exists()) return;
          const todosLosUsuarios = snapUsuarios.val();

          uidsContactos.forEach((uid) => {
            const usuario = todosLosUsuarios[uid];
            if (!usuario) return;

            const itemContacto = document.createElement("div");
            itemContacto.className = "tarjeta-chat contacto-item";
            itemContacto.dataset.uid = uid;
            itemContacto.id = `tarjeta-chat-${uid}`;

            const esFijado = fijadosBD[uid] === true || localStorage.getItem(`fijado_${uid}`) === "true";
            if (esFijado) {
              itemContacto.classList.add("tarjeta-fijada");
              itemContacto.style.order = "-1";
            }

            const estaSilenciado = localStorage.getItem(`silenciado_${uid}`) === "true";
            if (estaSilenciado) itemContacto.classList.add("chat-silenciado-zona");

            const primerLetra = usuario.nombre ? usuario.nombre.charAt(0).toUpperCase() : 'U';
            const foto = usuario.fotoUrl
              ? `<img src="${usuario.fotoUrl}" alt="${usuario.nombre}">`
              : `<div class="avatar-placeholder" style="width: 45px; height: 45px; border-radius: 50%; background: #00f2fe; color: #000; display: flex; align-items: center; justify-content: center; font-weight: bold;">${primerLetra}</div>`;

            itemContacto.innerHTML = `
              <div class="chat-avatar-caja">
                ${foto}
                <span class="punto-online-chat"></span>
              </div>
              <div class="chat-info">
                <div class="chat-cabecera">
                  <h4 class="chat-nombre">${usuario.nombre || "Usuario"}</h4>
                  <span class="chat-hora">--:--</span>
                  ${esFijado ? `<span class="indicador-pin-neon"><i data-lucide="pin" style="width:14px; height:14px;"></i></span>` : ''}
                </div>
                <div class="chat-mensaje-caja">
                  <p class="chat-texto">${usuario.estadoTexto || "Disponible"}</p>
                </div>
              </div>
            `;

            itemContacto.addEventListener("click", () => {
              window.contactoActivoUid = uid;
              if (typeof abrirChatConUsuario === "function") {
                abrirChatConUsuario(uid, usuario.nombre || "Usuario", usuario.fotoUrl || "");
              }
            });

            contenedorContactos.appendChild(itemContacto);
            if (typeof escucharUltimoMensajeContacto === "function") {
              escucharUltimoMensajeContacto(usuarioActualUid, uid);
            }
          });

          if (window.lucide) window.lucide.createIcons({ targets: [contenedorContactos] });
        }, { onlyOnce: true });
      });
    });
  });
}

// Crear alias para que ambas llamadas funcionen igual de bien
window.actualizarCampanitaGlobal = window.actualizarBadgesNotificaciones;

// 🟢 Función unificada adaptada a tus selectores (CON RESET DE CAJA DE TEXTO Y VERIFICACIÓN DE BLOQUEO)
function abrirChatConUsuario(contactoUid, nombreContacto, fotoContacto) {
  // 🟢 RESETEAR CAJA DE TEXTO A ESTADO NORMAL AL CAMBIAR DE CHAT
  if (inputChat) {
    inputChat.disabled = false;
    inputChat.placeholder = "Escribe un mensaje privado...";
    inputChat.style.opacity = "1";
  }
  if (btnAccionChat) {
    btnAccionChat.style.pointerEvents = "auto";
    btnAccionChat.style.opacity = "1";
  }

  let uidTarget, nombreTarget, fotoTarget;

  if (typeof contactoUid === 'object' && contactoUid !== null) {
    uidTarget = contactoUid.uid || contactoUid.id;
    nombreTarget = contactoUid.nombre || contactoUid.displayName || "Contacto";
    fotoTarget = contactoUid.fotoUrl || contactoUid.photoURL || "";
  } else {
    uidTarget = contactoUid;
    nombreTarget = nombreContacto || "Contacto";
    fotoTarget = fotoContacto || "";
  }

  if (!uidTarget) return;

  // Registrar el UID del contacto que estamos viendo
  window.contactoActivoUid = uidTarget;
  if (typeof contactoSeleccionado !== "undefined") {
    contactoSeleccionado = uidTarget;
  }

  // 1. 🧹 LIMPIAR EL CONTADOR Y EL BADGE DE LA TARJETA EN LA LISTA
  const tarjetaContacto = document.getElementById(`tarjeta-chat-${uidTarget}`);
  if (tarjetaContacto) {
    tarjetaContacto.dataset.mensajesNoLeidos = "0";
    tarjetaContacto.dataset.forzarReiniciar = "true";

    const badge = tarjetaContacto.querySelector(".badge-chat-no-leido") || tarjetaContacto.querySelector(".badge-mensaje");
    const elemTexto = tarjetaContacto.querySelector(".chat-texto");

    if (badge) {
      badge.textContent = "0";
      badge.classList.add("oculto");
    }
    if (elemTexto) {
      elemTexto.classList.remove("texto-resaltado");
    }
  }

  // Sincronizar inmediatamente la campanita
  if (typeof window.actualizarBadgesNotificaciones === "function") {
    window.actualizarBadgesNotificaciones();
  }

  // 2. 🔔 RECALCULAR LA CAMPANITA GLOBAL DE NOTIFICACIONES
  if (typeof actualizarCampanitaGlobal === "function") {
    actualizarCampanitaGlobal();
  }

  // 3. Limpiar pantalla de mensajes previa para evitar "parpadeo" de la conversación anterior
  if (typeof historialMensajes !== "undefined" && historialMensajes) {
    historialMensajes.innerHTML = "";
  }

  // 4. Actualizar datos en la cabecera del chat privado
  const elemNombre = document.querySelector(".amigo-nombre-chat");
  const elemFoto = document.getElementById("avatar-cabecera-privada");

  if (elemNombre) elemNombre.textContent = nombreTarget;
  if (elemFoto) {
    if (fotoTarget) {
      elemFoto.src = fotoTarget;
      elemFoto.style.display = "block";
    } else {
      // Avatar genérico por defecto si no tiene foto
      elemFoto.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nombreTarget)}`;
    }
  }

  // 5. Ocultar menús flotantes abiertos
  const menuTarjetas = document.getElementById("menu-tarjetas-chat");
  if (menuTarjetas) menuTarjetas.classList.add("oculto");

  // 6. 🚀 USAR TU PROPIA LÓGICA DE NAVEGACIÓN
  if (typeof encabezadoGlobal !== "undefined" && encabezadoGlobal) encabezadoGlobal.style.display = "none";
  if (typeof menuFlotanteGlobal !== "undefined" && menuFlotanteGlobal) menuFlotanteGlobal.style.display = "none";

  const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto");
  if (btnFlotanteContacto) btnFlotanteContacto.style.display = "none";

  if (typeof pantallaChatPrivado !== "undefined" && pantallaChatPrivado) {
    pantallaChatPrivado.classList.add("pantalla-completa");
    if (typeof switchPantalla === "function") {
      switchPantalla(pantallaChatPrivado, pantallaChats, pantallaBienvenida, pantallaPerfil);
    } else {
      if (typeof pantallaChats !== "undefined" && pantallaChats) pantallaChats.style.display = "none";
      pantallaChatPrivado.style.display = "flex";
    }
  }

  // 7. Conectar Firebase de forma limpia y guardar lectura en la nube
  const miUid = (typeof auth !== "undefined" && auth.currentUser) ? auth.currentUser.uid : null;
  if (miUid && uidTarget) {
    const chatId = obtenerChatId(miUid, uidTarget);

    // ☁️ REGISTRAR EN FIREBASE EL ÚLTIMO MENSAJE VISTO
    const mensajesRef = ref(db, `chats/${chatId}/mensajes`);
    get(mensajesRef).then((snapshot) => {
      if (snapshot.exists()) {
        const mensajes = snapshot.val();
        const keys = Object.keys(mensajes);
        const ultimoMsgKey = keys[keys.length - 1];

        // Escribe el ID del último mensaje en el nodo 'lecturas'
        set(ref(db, `lecturas/${miUid}/${uidTarget}`), ultimoMsgKey);
      }
    }).catch(err => console.error("Error al registrar lectura:", err));

    if (typeof escucharMensajesChat === "function") {
      escucharMensajesChat(chatId);
    }
  }

  // 🔕 TEXTO DEL BOTÓN SILENCIAR EN CABECERA
  const btnCtxSilenciar = document.getElementById("btn-ctx-silenciar");
  if (btnCtxSilenciar && uidTarget) {
    btnCtxSilenciar.innerHTML = `<i data-lucide="bell-off"></i> Silenciar / Notificaciones`;
    if (window.lucide) window.lucide.createIcons({ targets: [btnCtxSilenciar] });
  }

  // 🛡️ VERIFICAR ESTADO DE BLOQUEO EN FIREBASE
  if (typeof verificarEstadoBloqueo === "function") {
    verificarEstadoBloqueo(uidTarget);
  }

  // ↪️ VERIFICAR SI HAY UN PAQUETE DE REENVÍO PENDIENTE
  if (window.objetoPendienteReenviar) {
    const cajaEntrada = document.getElementById("input-chat-privado") || (typeof inputChat !== "undefined" ? inputChat : null);

    window.mensajeReenviadoActivo = { ...window.objetoPendienteReenviar };
    window.objetoPendienteReenviar = null;

    if (cajaEntrada) {
      cajaEntrada.value = window.mensajeReenviadoActivo.texto;
      cajaEntrada.focus();

      // Banner flotante elegante
      let vistaPreviaReenvio = document.getElementById("vista-previa-reenvio");
      if (!vistaPreviaReenvio) {
        vistaPreviaReenvio = document.createElement("div");
        vistaPreviaReenvio.id = "vista-previa-reenvio";

        // 🎯 Buscar el contenedor principal del pie de chat para ponerse justo arriba
        const pieDeChat = cajaEntrada.closest(".footer-chat") || cajaEntrada.closest(".caja-input-privado") || cajaEntrada.parentElement.parentElement;

        if (pieDeChat && pieDeChat.parentNode) {
          pieDeChat.parentNode.insertBefore(vistaPreviaReenvio, pieDeChat);
        } else if (cajaEntrada.parentElement) {
          cajaEntrada.parentElement.insertBefore(vistaPreviaReenvio, cajaEntrada);
        }
      }

      vistaPreviaReenvio.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
          <i data-lucide="forward" style="width: 14px; height: 14px; stroke: #00f2fe; flex-shrink: 0;"></i>
          <span>Reenviando mensaje de <b>${window.mensajeReenviadoActivo.autorOriginal}</b></span>
        </div>
        <i data-lucide="x" id="btn-cancelar-reenvio" style="width: 16px; height: 16px; cursor: pointer; opacity: 0.8; flex-shrink: 0;"></i>
      `;

      if (window.lucide) window.lucide.createIcons({ targets: [vistaPreviaReenvio] });

      const btnCancelar = document.getElementById("btn-cancelar-reenvio");
      if (btnCancelar) {
        btnCancelar.onclick = () => {
          window.mensajeReenviadoActivo = null;
          cajaEntrada.value = "";
          if (vistaPreviaReenvio) vistaPreviaReenvio.remove();
          if (typeof actualizarIconoBotonAccion === "function") actualizarIconoBotonAccion();
        };
      }

      if (typeof actualizarIconoBotonAccion === "function") {
        actualizarIconoBotonAccion();
      }
    }
  }
}

// 🟢 CONECTOR ÚNICO Y OFICIAL PARA ENVIAR MENSAJES
const inputChatPrivado = document.getElementById("input-chat-privado");

if (btnAccionChat) {
  btnAccionChat.onclick = (e) => {
    e.preventDefault();
    const tieneTexto = inputChatPrivado && inputChatPrivado.value.trim().length > 0;
    const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

    if (tieneTexto || tieneAdjunto) {
      enviarMensajeNuevo();
    }
  };
}

if (inputChatPrivado) {
  inputChatPrivado.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensajeNuevo();
    }
  };
}

// ⌨️ Cancelar edición al presionar la tecla Escape
if (inputChatPrivado) {
  inputChatPrivado.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && window.mensajeEnEdicionId) {
      window.mensajeEnEdicionId = null;
      window.burbujaEnEdicion = null;
      inputChatPrivado.value = "";

      // Restaurar el icono del botón (enviar / micrófono)
      if (typeof actualizarIconoBotonAccion === "function") {
        actualizarIconoBotonAccion();
      }

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Edición cancelada.", "ℹ️", "#ff4b2b");
      }
    }
  });
}

let listenerChatActivo = null;
let listenerConfigActivo = null;

// 📌 Escuchar mensajes en tiempo real desde Firebase (CON VACIADO UNILATERAL Y FILTRADO DE BLOQUEOS)
function escucharMensajesChat(chatId) {
  const contenedorHistorial = document.querySelector(".historial-mensajes");
  if (!contenedorHistorial) return;

  // 1. 🧹 CANCELAR SUSCRIPCIONES ANTERIORES PARA EVITAR MULTIPLICACIÓN DE EVENTOS
  if (typeof listenerChatActivo === "function") {
    listenerChatActivo(); // Ejecuta la función de desuscripción de Firebase
    listenerChatActivo = null;
  }
  if (typeof listenerConfigActivo === "function") {
    listenerConfigActivo();
    listenerConfigActivo = null;
  }

  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  const contactoUid = window.contactoActivoUid;
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);
  const configRef = ref(db, `chats/${chatId}/config/temporales`);

  // 2. Escuchar el estado de mensajes temporales
  listenerConfigActivo = onValue(configRef, (snapshot) => {
    const btnCtxTemporales = document.getElementById("btn-ctx-temporales");
    if (btnCtxTemporales) {
      const estaActivo = snapshot.exists() && snapshot.val() === true;
      btnCtxTemporales.innerHTML = estaActivo
        ? `<i data-lucide="hourglass"></i> Mensajes normales`
        : `<i data-lucide="hourglass"></i> Mensajes temporales`;

      if (window.lucide) {
        window.lucide.createIcons({ targets: [btnCtxTemporales] });
      }
    }
  });

  let esCargaInicial = true;

  // 3. Escuchar mensajes en tiempo real guardando la referencia de desuscripción
  listenerChatActivo = onValue(mensajesRef, (snapshot) => {
    const elemHistorial = document.querySelector(".historial-mensajes");
    if (!elemHistorial) return;

    // Resolver promesas de vaciado y bloqueo antes de renderizar para evitar bloqueos del DOM
    Promise.all([
      miUid && contactoUid ? get(ref(db, `vaciados/${miUid}/${contactoUid}`)) : Promise.resolve(null),
      miUid && contactoUid ? get(ref(db, `bloqueos/${miUid}/${contactoUid}`)) : Promise.resolve(null)
    ]).then(([snapVaciado, snapBloqueo]) => {

      const timestampUltimoVaciado = (snapVaciado && snapVaciado.exists()) ? snapVaciado.val() : 0;
      const estaBloqueadoElContacto = (snapBloqueo && snapBloqueo.exists()) ? (snapBloqueo.val() === true) : false;

      // Limpieza total del contenedor de mensajes
      elemHistorial.innerHTML = "";

      if (snapshot.exists()) {
        const mensajes = snapshot.val();

        Object.keys(mensajes).forEach((msgId) => {
          const msg = mensajes[msgId];
          if (!msg) return;

          // 🗑️ Ignorar mensajes anteriores al vaciado personal
          const msgTimestamp = msg.timestamp || 0;
          if (msgTimestamp <= timestampUltimoVaciado) return;

          const idEmisorReal = msg.emisor || msg.emisorUid || msg.remitente || msg.remitenteId || msg.uid;
          const esMio = idEmisorReal === miUid;

          // 🛑 Ignorar mensajes de contactos bloqueados
          if (estaBloqueadoElContacto && !esMio) return;

          // A) Lógica de mensajes efímeros dinámica
          if (msg.esEfimero) {
            const limiteMs = msg.duracionEfimeraMs || 10000;
            const transcurrido = Date.now() - (msg.timestamp || Date.now());
            const tiempoRestante = limiteMs - transcurrido;

            if (tiempoRestante <= 0) {
              set(ref(db, `chats/${chatId}/mensajes/${msgId}`), null);
              return;
            } else {
              setTimeout(() => {
                set(ref(db, `chats/${chatId}/mensajes/${msgId}`), null);
              }, tiempoRestante);
            }
          }

          const haceCuantoEnviado = Date.now() - (msg.timestamp || 0);
          const esMensajeNuevoEnVivo = haceCuantoEnviado < 4000;

          if (!esCargaInicial && !esMio && esMensajeNuevoEnVivo && !estaBloqueadoElContacto) {
            const textoNotif = msg.texto || msg.contenido || "Te envió un mensaje";
            const nombreRemitente = msg.nombreEmisor || msg.remitente || "Amigo";
            const fotoRemitente = msg.avatar || msg.fotoUrl || "assets/logo.png";

            if (typeof notificarNuevoMensaje === "function") {
              notificarNuevoMensaje(nombreRemitente, textoNotif, fotoRemitente);
            }
            if (typeof reproducirSonido === "function") {
              reproducirSonido("recibido", idEmisorReal);
            }
          }

          let horaFormateada = "00:00";
          if (msg.hora) {
            horaFormateada = msg.hora;
          } else if (msg.fecha || msg.timestamp) {
            const fechaObj = new Date(msg.fecha || msg.timestamp);
            horaFormateada = fechaObj.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
          }

          const textoEditadoHTML = msg.editado ? ' <span style="font-size:0.65rem; opacity:0.6;">(editado)</span>' : '';
          const iconoRelojHTML = msg.esEfimero ? '<i data-lucide="hourglass" style="width:10px; height:10px; display:inline-block; margin-right:4px; opacity:0.6; vertical-align:middle;"></i>' : '';

          let contenidoBurbuja = "";
          let estiloEspecialBurbuja = "";

          // ↪️ ETIQUETA VISUAL SI EL MENSAJE ES REENVIADO
          let htmlReenviado = "";
          if (msg.esReenviado) {
            const autor = msg.autorOriginal || "Contacto";
            htmlReenviado = `
              <div class="mensaje-etiqueta-reenviado" style="font-size: 0.72rem; font-style: italic; color: rgba(255, 255, 255, 0.6); display: flex; align-items: center; gap: 4px; margin-bottom: 4px; border-bottom: 1px solid rgba(255, 255, 255, 0.08); padding-bottom: 2px;">
                <i data-lucide="forward" style="width: 12px; height: 12px; stroke: #00f2fe;"></i> 
                <span>Reenviado de <b>${autor}</b></span>
              </div>
            `;
          }

          if (msg.tipoAdjunto === 'foto') {
            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="contenedor-foto-enviada" style="max-width: 100%; margin-bottom: 6px; border-radius: 10px; overflow: hidden; cursor: pointer;">
                <img src="${msg.urlAdjunto}" style="width: 100%; display: block; border-radius: 8px;">
              </div>
              ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}</span>
            `;
          } else if (msg.tipoAdjunto === 'documento') {
            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="contenedor-documento-enviado" style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">
                <i data-lucide="file-text" style="color: #00f2fe; width:24px; height:24px;"></i>
                <span style="font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">${msg.nombreDoc || "Documento"}</span>
              </div>
              ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}</span>
            `;
          } else if (msg.tipoAdjunto === 'video') {
            estiloEspecialBurbuja = "padding: 10px;";
            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="contenedor-video-circular-burbuja" style="cursor: pointer; position: relative; width: 140px; height: 140px; margin: 0 auto; display: block;">
                <svg class="anillo-progreso-video" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; transform: rotate(-90deg); z-index: 3;">
                  <circle cx="70" cy="70" r="66" class="progreso-anillo-nodo" stroke="#00f2fe" stroke-width="4" fill="none" stroke-dasharray="414" stroke-dashoffset="414"></circle>
                </svg>
                <div class="capa-play-video-sim" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; background: rgba(0,0,0,0.35); border-radius: 50%;">
                  <i data-lucide="play" style="width: 28px; height: 28px; fill: white; color: white;"></i>
                </div>
                <div class="marco-video-redondo" style="width: 100%; height: 100%; border-radius: 50%; overflow: hidden; position: relative; z-index: 1; background: #000;">
                  <video src="${msg.urlAdjunto}" playsinline webkit-playsinline preload="auto" muted style="width: 100%; height: 100%; object-fit: cover; display: block;"></video>
                </div>
              </div>
              ${msg.texto ? `<p class="mensaje-texto" style="text-align: center; margin-top: 6px;">${msg.texto}</p>` : ""}
              <span class="mensaje-hora" style="margin-top: 6px; display: block; text-align: center;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}</span>
            `;
          } else if (msg.tipoAdjunto === 'audio') {
            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="reproductor-audio-burbuja">
                <button class="btn-play-audio"><i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i></button>
                <div class="ondas-audio-preview" style="position: relative; cursor: pointer;">
                  <div class="aguja-reproduccion-roja" style="position: absolute; top:0; left: 0%; width: 2px; height: 100%; background: #ff4b2b; z-index: 2; transition: left 0.1s linear;"></div>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                </div>
                <span class="tiempo-texto-nodo" style="font-size:0.75rem; font-family:monospace; opacity:0.8; margin-right:4px;">${msg.duracion || '0:00'}</span>
                <audio class="audio-elemento-nativo" src="${msg.urlAdjunto}" preload="metadata"></audio>
              </div>
              <span class="mensaje-hora" style="margin-top: 4px;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}</span>
            `;
          } else {
            contenidoBurbuja = `
              ${htmlReenviado}
              <p class="mensaje-texto">${msg.texto || ''}</p>
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}</span>
            `;
          }

          const burbujaHTML = document.createElement("div");
          burbujaHTML.className = `mensaje-burbuja ${esMio ? 'enviado' : 'recibido'} ${msg.esEfimero ? 'mensaje-efimero' : ''}`;
          burbujaHTML.setAttribute("data-msg-id", msgId);
          if (estiloEspecialBurbuja) burbujaHTML.style.cssText = estiloEspecialBurbuja;
          burbujaHTML.innerHTML = contenidoBurbuja;

          elemHistorial.appendChild(burbujaHTML);
        });

        if (window.lucide) {
          window.lucide.createIcons({ targets: [elemHistorial] });
        }

        elemHistorial.scrollTop = elemHistorial.scrollHeight;
      }

      esCargaInicial = false;
    });
  });
}

// 🔄 Control dinámico de la tarjeta de bienvenida / lista vacía
function actualizarEstadoPantallaInicio() {
  const contenedorVacio = document.getElementById("pantalla-lista-vacia");
  const listaChats = document.querySelector(".lista-chats");

  if (!contenedorVacio || !listaChats) return;

  // Contamos cuántas tarjetas de chat reales hay cargadas
  const tarjetasReales = listaChats.querySelectorAll(".tarjeta-chat");

  if (tarjetasReales.length === 0) {
    // 📭 SIN CHATS: Mostramos la tarjeta de bienvenida orientada a buscar amigos
    contenedorVacio.classList.remove("oculto");
  } else {
    // 💬 CON CHATS: Ocultamos la tarjeta por completo para darle prioridad a la lista
    contenedorVacio.classList.add("oculto");
  }
}

// ⚡ Inicialización principal y eventos al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {

  // 1️⃣ Ajustes iniciales (Emojis, scroll y Lucide Icons)
  conectarBotonEmoji();
  const menuTarjetas = document.getElementById("menu-tarjetas-chat");
  window.addEventListener("scroll", cerrarMenuContextualMova, true);

  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 2️⃣ Botón 'Buscar amigo' de la pantalla de bienvenida vacía
  const btnBuscarVacio = document.getElementById("btn-vacio-buscar-amigo");
  if (btnBuscarVacio) {
    btnBuscarVacio.addEventListener("click", () => {
      if (typeof abrirModalBuscarAmigos === "function") {
        abrirModalBuscarAmigos();
      } else if (typeof modalContactos !== "undefined" && modalContactos) {
        modalContactos.classList.remove("oculto");
      }
    });
  }

  // 5️⃣ Conectar el interruptor de notificaciones con el permiso del navegador
  const toggleNotificaciones = document.getElementById("check-notificaciones");
  if (toggleNotificaciones) {
    toggleNotificaciones.addEventListener("change", async () => {
      if (toggleNotificaciones.checked) {
        const concedido = await solicitarPermisoNotificaciones();
        if (concedido) {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("¡Notificaciones activadas con éxito! 🚀", "🔔", "#00f2fe");
          }
        } else {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Por favor permite las notificaciones en tu navegador ⚙️", "⚠️", "#ff4b2b");
          }
        }
      }
    });
  }

});

// 🔔 5. NOTIFICACIONES PUSH NATIVAS (Global para que Firebase la encuentre)
window.notificarNuevoMensaje = function (nombreRemitente, textoMensaje, avatarUrl) {
  const estaSilenciado = localStorage.getItem("movachat-notificaciones") === "desactivado";
  if (estaSilenciado) return;

  // Si la app está en segundo plano o minimizada
  if (document.hidden && Notification.permission === "granted") {
    const opciones = {
      body: textoMensaje || "Te ha enviado un mensaje.",
      icon: avatarUrl || "assets/logo.png",
      badge: "assets/logo.png",
      vibrate: [100, 50, 100],
      tag: "movachat-mensaje",
      renotify: true
    };

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(`Mensaje de ${nombreRemitente}`, opciones);
      });
    } else {
      new Notification(`Mensaje de ${nombreRemitente}`, opciones);
    }
  } else {
    // Si la app está abierta en pantalla, actualizamos la campanita y badges
    if (typeof actualizarBadgesNotificaciones === "function") {
      actualizarBadgesNotificaciones();
    }
  }
};

// 🔔 Función global para lanzar notificación de nuevo mensaje
function notificarNuevoMensaje(nombreRemitente, textoMensaje, avatarUrl) {
  const estaSilenciado = localStorage.getItem("movachat-notificaciones") === "desactivado";
  if (estaSilenciado) return;

  // Si la app está en segundo plano o minimizada
  if (document.hidden && Notification.permission === "granted") {
    const opciones = {
      body: textoMensaje || "Te ha enviado un mensaje.",
      icon: avatarUrl || "assets/logo.png",
      badge: "assets/logo.png",
      vibrate: [100, 50, 100],
      tag: "movachat-mensaje",
      renotify: true
    };

    if (navigator.serviceWorker && navigator.serviceWorker.controller) {
      navigator.serviceWorker.ready.then((reg) => {
        reg.showNotification(`Mensaje de ${nombreRemitente}`, opciones);
      });
    } else {
      new Notification(`Mensaje de ${nombreRemitente}`, opciones);
    }
  } else {
    // Si la app está abierta en pantalla, actualizamos la campanita y badges
    actualizarBadgesNotificaciones();
  }
}

// --- REGISTRO OFICIAL DEL SERVICE WORKER (Permite instalar la PWA) ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((registro) => {
        console.log('🟢 MovaChat PWA lista. Service Worker activo en:', registro.scope);
      })
      .catch((error) => {
        console.error('🔴 Error al activar el Service Worker:', error);
      });
  });
}

// ========================================================
// 🥷 CONEXIÓN DIRECTA DEL MODO SIGILO A FIREBASE
// ========================================================
function actualizarEstadoEnFirebase(nuevoEstado) {
  // 1. Verificamos que el usuario tenga la sesión iniciada
  const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
  if (!usuarioActual) return;

  // 2. Si el usuario activó Modo Sigilo, enviamos "offline", si no "online"
  const estadoFinal = (nuevoEstado === "offline") ? "offline" : "online";

  // 3. Guardar directamente en la base de datos de Firebase
  if (typeof db !== "undefined" && typeof ref !== "undefined" && typeof set !== "undefined") {
    const estadoRef = ref(db, `usuarios/${usuarioActual.uid}/estado`);
    set(estadoRef, estadoFinal)
      .then(() => console.log("🟢 Estado de presencia actualizado en Firebase:", estadoFinal))
      .catch((err) => console.log("⚠️ Error guardando estado:", err));
  }
}

// --- MANEJO DEL PROMPT DE INSTALACIÓN PWA ---
let eventoInstalacionPWA = null;

window.addEventListener('beforeinstallprompt', (e) => {
  // Prevenir que el navegador muestre la barra emergente por defecto
  e.preventDefault();
  eventoInstalacionPWA = e;

  // Si tienes un botón en el menú o perfil para instalar, hazlo visible aquí
  const btnInstalarApp = document.getElementById('btn-instalar-pwa');
  if (btnInstalarApp) {
    btnInstalarApp.style.display = 'flex';
    btnInstalarApp.onclick = async () => {
      if (eventoInstalacionPWA) {
        eventoInstalacionPWA.prompt();
        const { outcome } = await eventoInstalacionPWA.userChoice;
        console.log(`Respuesta de instalación: ${outcome}`);
        eventoInstalacionPWA = null;
        btnInstalarApp.style.display = 'none';
      }
    };
  }
});

window.addEventListener('appinstalled', () => {
  console.log('🟢 MovaChat instalada exitosamente en el dispositivo.');
  eventoInstalacionPWA = null;
});

// ========================================================
// 🛡️ REPARACIÓN DE NAVEGACIÓN: MOSTRAR ENCABEZADO EN INICIO
// ========================================================
function mostrarEncabezadoPrincipal() {
  const encabezado = document.querySelector(".encabezado-inicio");
  if (encabezado) {
    encabezado.classList.remove("oculto");
    encabezado.style.display = "flex";
  }
}

// 1. Escuchar los clics en los botones de navegación inferior
document.querySelectorAll(".menu-flotante .menu-btn, .barra-navegacion .nav-item").forEach((btn) => {
  btn.addEventListener("click", () => {
    mostrarEncabezadoPrincipal();
  });
});

// 2. Corregir el botón "Volver" del Chat Privado
const btnVolverChat = document.querySelector(".chat-privado-header .btn-volver") || document.getElementById("btn-volver-chat");

if (btnVolverChat) {
  btnVolverChat.addEventListener("click", () => {
    const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
    const pantallaChats = document.getElementById("pantalla-chats");

    if (pantallaChatPrivado) pantallaChatPrivado.style.display = "none";
    if (pantallaChats) pantallaChats.style.display = "flex";

    mostrarEncabezadoPrincipal();
  });
}


// 📩 1. Enviar solicitud de amistad/chat a otro usuario
async function enviarSolicitudContacto(uidDestino) {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual || !uidDestino) return;

  const miUid = usuarioActual.uid;
  if (miUid === uidDestino) {
    if (typeof mostrarAvisoPremium === "function") mostrarAvisoPremium("No puedes agregarte a ti mismo.", "⚠️", "#ff4b2b");
    return;
  }

  try {
    // Obtener mis datos para enviarle la tarjeta al receptor
    const snapMiUser = await get(ref(db, `usuarios/${miUid}`));
    const misDatos = snapMiUser.exists() ? snapMiUser.val() : {};

    await set(ref(db, `solicitudes/${uidDestino}/${miUid}`), {
      emisorUid: miUid,
      nombre: misDatos.nombre || "Usuario",
      fotoUrl: misDatos.fotoUrl || "",
      timestamp: Date.now()
    });

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Solicitud enviada correctamente 📩", "✨", "#00f2fe");
    }
  } catch (error) {
    console.error("Error al enviar solicitud:", error);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("No se pudo enviar la solicitud.", "❌", "#ff4b2b");
    }
  }
}

// ✅ 2. Aceptar solicitud y desbloquear conversación para ambos
async function aceptarSolicitudContacto(emisorUid, tarjetaSolicitud) {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual || !emisorUid) return;

  const miUid = usuarioActual.uid;

  try {
    // A) Agregar contacto en mi lista y en la del emisor
    await set(ref(db, `mis_contactos/${miUid}/${emisorUid}`), true);
    await set(ref(db, `mis_contactos/${emisorUid}/${miUid}`), true);

    // B) Eliminar la solicitud pendiente
    await set(ref(db, `solicitudes/${miUid}/${emisorUid}`), null);

    if (tarjetaSolicitud) {
      tarjetaSolicitud.remove();
    }

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("¡Contacto aceptado! Ya pueden conversar 💬", "✅", "#00f2fe");
    }
  } catch (error) {
    console.error("Error al aceptar solicitud:", error);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Error al aceptar la solicitud.", "❌", "#ff4b2b");
    }
  }
}

// ❌ 3. Rechazar solicitud
async function rechazarSolicitudContacto(emisorUid, tarjetaSolicitud) {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual || !emisorUid) return;

  try {
    await set(ref(db, `solicitudes/${usuarioActual.uid}/${emisorUid}`), null);
    if (tarjetaSolicitud) tarjetaSolicitud.remove();
  } catch (error) {
    console.error("Error al rechazar solicitud:", error);
  }
}