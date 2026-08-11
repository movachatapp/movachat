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
import {
  getDatabase,
  ref,
  set,
  get,
  child,
  onValue,
  onChildChanged,
  update,
  push,
  onDisconnect,
  remove
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

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

          if (typeof iniciarControlPresenciaReal === "function") {
            iniciarControlPresenciaReal();
          }

          // 🌐 Cargar redes sociales del perfil
          if (typeof cargarEstadoRedesPropias === "function") {
            cargarEstadoRedesPropias();
          }

          // 🚀 2. INYECCIÓN DIRECTA DE DATOS REALES EN EL PERFIL
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

          // 🔕 SINCRONIZAR SILENCIADOS DESDE FIREBASE (CON PROGRAMADOR Y LIMPIEZA AUTOMÁTICA)
          const refSilenciados = ref(db, `silenciados/${user.uid}`);
          onValue(refSilenciados, (snapshot) => {
            if (snapshot.exists()) {
              const silenciadosBD = snapshot.val();
              const objetivosIconos = [];
              const ahora = Date.now();

              Object.keys(silenciadosBD).forEach((contactoUid) => {
                const valorHasta = silenciadosBD[contactoUid];
                let estaVigente = false;

                if (valorHasta === "indefinido") {
                  estaVigente = true;
                } else {
                  const hastaMs = parseInt(valorHasta, 10);
                  if (!isNaN(hastaMs) && ahora < hastaMs) {
                    estaVigente = true;
                    // Programar temporizador de desactivación automática en tiempo real
                    if (typeof programarAutoDesactivacionSilencio === "function") {
                      programarAutoDesactivacionSilencio(contactoUid, hastaMs);
                    }
                  } else {
                    // Expiró el tiempo mientras la app estaba cerrada
                    if (typeof limpiarSilencioExpirado === "function") {
                      limpiarSilencioExpirado(contactoUid);
                    } else {
                      set(ref(db, `silenciados/${user.uid}/${contactoUid}`), null);
                      localStorage.removeItem(`silenciado_${contactoUid}`);
                      localStorage.removeItem(`silenciado_hasta_${contactoUid}`);
                    }
                  }
                }

                const tarjeta = document.getElementById(`tarjeta-chat-${contactoUid}`);

                if (estaVigente) {
                  localStorage.setItem(`silenciado_${contactoUid}`, "true");
                  localStorage.setItem(`silenciado_hasta_${contactoUid}`, valorHasta);

                  if (tarjeta) {
                    tarjeta.classList.add("chat-silenciado-zona");

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
                } else {
                  if (tarjeta) {
                    tarjeta.classList.remove("chat-silenciado-zona");
                    const iconoNeon = tarjeta.querySelector(".indicador-silencio-neon");
                    if (iconoNeon) iconoNeon.remove();
                  }
                }
              });

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

const menuTarjetas = document.getElementById("menu-tarjetas-chat");

if (contenedorChats) {
  contenedorChats.addEventListener("click", (e) => {
    const tarjeta = e.target.closest(".tarjeta-chat");
    if (!tarjeta) return;

    // 🛑 FRENO DE MANO: Si el menú contextual está visible o activado el bloqueo fantasma, no abrimos chat
    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (bloquarClickFantasma || (menuTarjetas && !menuTarjetas.classList.contains("oculto"))) {
      return;
    }

    if (isLongPress) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    // Abrir estado al hacer clic en la foto de avatar si tiene historia
    if (e.target.closest(".chat-avatar-caja")) {
      e.stopPropagation();

      // Buscar si la tarjeta tiene la clase o indicador de historia/estado activo
      const tieneEstado = tarjeta.dataset.estadoUrl;
      if (tieneEstado) {
        abrirEstadoAmigo(tarjeta.dataset.estadoUrl, tarjeta.dataset.estadoTexto || "");
      }
      return;
    }

    // Clic en la tarjeta para abrir el chat privado
    const nombreSeleccionado = tarjeta.querySelector(".chat-nombre").textContent;
    const textoEstadoCabecera = document.querySelector(".amigo-datos .amigo-estado-texto");
    const ledSuperiorEnfoque = document.getElementById("led-enfoque-app");

    document.querySelector(".amigo-nombre-chat").textContent = nombreSeleccionado;

    cargarMensajesDeAmigo(nombreSeleccionado, historialMensajes);

    const srcImg = tarjeta.querySelector("img") ? tarjeta.querySelector("img").src : "";
    if (srcImg) document.querySelector(".avatar-mini-caja img").src = srcImg;

    encabezadoGlobal.style.display = "none";
    menuFlotanteGlobal.style.display = "none";
    pantallaChatPrivado.classList.add("pantalla-completa");
    switchPantalla(pantallaChatPrivado, pantallaChats, pantallaPerfil, pantallaBienvenida);

    historialMensajes.scrollTop = historialMensajes.scrollHeight;

    if (window.timerSimuladorLectura) clearTimeout(window.timerSimuladorLectura);
    if (window.timerSimuladorEscribiendo) clearTimeout(window.timerSimuladorEscribiendo);

    if (textoEstadoCabecera) {
      textoEstadoCabecera.textContent = "En línea";
      textoEstadoCabecera.style.color = "rgba(255, 255, 255, 0.5)";
    }

    if (ledSuperiorEnfoque) {
      ledSuperiorEnfoque.style.backgroundColor = "#7f00ff";
      ledSuperiorEnfoque.style.boxShadow = "0 0 8px #7f00ff";
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

// --- MANEJO DE CÁMARA CIRCULAR LIVE ---
const modalCamaraLive = document.getElementById("modal-camara-circular");
const btnCancelarGrabarLive = document.getElementById("btn-cancelar-grabar-live");

if (btnCancelarGrabarLive && modalCamaraLive) {
  btnCancelarGrabarLive.addEventListener("click", () => {
    if (streamCamaraLive) {
      streamCamaraLive.getTracks().forEach(track => track.stop());
      streamCamaraLive = null;
    }
    modalCamaraLive.classList.add("oculto");
  });
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

  if (inputChat) {
    inputChat.value = "";
    inputChat.readOnly = false; // 🔓 DESBLOQUEAR CAJA PARA MENSAJES FUTUROS
  }

  if (miUid && contactoUid) {
    set(ref(db, `escribiendo/${chatId}/${miUid}`), false);
  }

  // 🚀 SUBIR A FIREBASE
  try {
    const listaMensajesRef = ref(db, `chats/${chatId}/mensajes`);
    const nuevoMensajeRef = push(listaMensajesRef);
    await set(nuevoMensajeRef, objetoMensaje);

    // 🔊 SONIDO DE MENSAJE ENVIADO
    reproducirSonidoEnviado();

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

    // ✏️ OPCIÓN 2: EDITAR (Solo mensajes propios dentro de los primeros 15 minutos)
    else if (accion === "editar") {
      const timestampMsg = parseInt(nodoMensaje ? nodoMensaje.getAttribute("data-timestamp") : "0", 10);
      const tiempoTranscurrido = Date.now() - timestampMsg;
      const limite15MinutosMs = 15 * 60 * 1000; // 15 minutos en milisegundos (900,000 ms)

      if (!esMio) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Solo puedes editar tus propios mensajes.", "⚠️", "#ff4b2b");
        }
      } else if (timestampMsg > 0 && tiempoTranscurrido > limite15MinutosMs) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Ha pasado el límite de 15 minutos para editar este mensaje.", "⏳", "#ff4b2b");
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

// ✏️ REEMPLAZAR POR ESTE BLOQUE:
let timerNotificarEscribiendo = null;

if (inputChat) {
  inputChat.addEventListener("input", () => {
    if (typeof actualizarIconoBotonAccion === "function") {
      actualizarIconoBotonAccion();
    }

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = window.contactoActivoUid;
    if (!miUid || !contactoUid) return;

    const chatId = obtenerChatId(miUid, contactoUid);
    const escribiendoRef = ref(db, `escribiendo/${chatId}/${miUid}`);

    // Activar estado escribiendo en Firebase
    set(escribiendoRef, true);

    // Apagar a los 2.5s si el usuario deja de escribir
    if (timerNotificarEscribiendo) clearTimeout(timerNotificarEscribiendo);
    timerNotificarEscribiendo = setTimeout(() => {
      set(escribiendoRef, false);
    }, 2500);
  });

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

// 🎯 CONTROL DE FILTROS POR ID DIRECTO
(function inicializarFiltrosEstables() {
  const btnFiltroTodos = document.getElementById("btn-filtro-todos");
  const btnFiltroNoLeidos = document.getElementById("btn-filtro-noleidos");

  if (btnFiltroNoLeidos) {
    btnFiltroNoLeidos.addEventListener("click", () => {
      if (btnFiltroTodos) btnFiltroTodos.classList.remove("activo");
      btnFiltroNoLeidos.classList.add("activo");

      const tarjetasChat = document.querySelectorAll("#lista-chats-principal .tarjeta-chat");

      tarjetasChat.forEach((tarjeta) => {
        if (tarjeta.id === "tarjeta-mi-estado-propio") return;

        const badge = tarjeta.querySelector(".badge-chat-no-leido") || tarjeta.querySelector(".badge-mensaje");
        const tieneNoLeidos = badge && !badge.classList.contains("oculto") && parseInt(badge.textContent.trim(), 10) > 0;

        tarjeta.style.display = tieneNoLeidos ? "flex" : "none";
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

    // 🔮 REFLEJAR LA POSICIÓN DE LA CÁPSULA AURA AL ENTRAR AL PERFIL
    setTimeout(() => {
      const auraGuardada = localStorage.getItem("movachat-aura-tema") || "cyber";
      const valorAttrHTML = (auraGuardada === "cyber") ? "cyan-morado" : auraGuardada;
      if (typeof window.cambiarAura === "function") {
        window.cambiarAura(valorAttrHTML);
      }
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
        const usuarioActual = auth.currentUser;
        if (!usuarioActual) return;

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Sincronizando chats y reconectando nube...", "🔄", "#00f2fe");
        }

        try {
          // 1. Forzar reconexión física de Firebase Realtime Database
          const { goOffline, goOnline } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js");
          goOffline(db);
          goOnline(db);

          // 2. Volver a cargar la lista de contactos y reenganchar escuchadores
          if (typeof cargarContactosAprobados === "function") {
            cargarContactosAprobados(usuarioActual.uid);
          }

          // 3. Recalcular la campanita y los contadores no leídos
          if (typeof actualizarBadgesNotificaciones === "function") {
            actualizarBadgesNotificaciones();
          }

          // 4. Refrescar presencia del usuario
          if (typeof iniciarControlPresenciaReal === "function") {
            iniciarControlPresenciaReal();
          }

          setTimeout(() => {
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("Conexión restablecida y chats sincronizados ✨", "✅", "#00f2fe");
            }
          }, 600);
        } catch (err) {
          console.error("Error durante la sincronización:", err);
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Error al intentar reconectar.", "❌", "#ff4b2b");
          }
        }
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
    // ⚠️ Limpiar contacto activo
    window.contactoActivoUid = null;
    if (typeof contactoActivoUid !== "undefined") contactoActivoUid = null;

    // 🧹 APAGADO TOTAL DE ESCUCHADORES EN SEGUNDO PLANO
    if (typeof listenerChatActivo === "function") { listenerChatActivo(); listenerChatActivo = null; }
    if (typeof listenerConfigActivo === "function") { listenerConfigActivo(); listenerConfigActivo = null; }
    if (typeof listenerEscribiendoActivo === "function") { listenerEscribiendoActivo(); listenerEscribiendoActivo = null; }
    if (typeof listenerLecturaActivo === "function") { listenerLecturaActivo(); listenerLecturaActivo = null; }
    if (typeof listenerPresenciaContactoActivo === "function") { listenerPresenciaContactoActivo(); listenerPresenciaContactoActivo = null; }

    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (menuTarjetas) menuTarjetas.classList.add("oculto");

    const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto");

    if (typeof mostrarEncabezadoPrincipal === "function") {
      mostrarEncabezadoPrincipal();
    } else if (encabezadoGlobal) {
      encabezadoGlobal.style.display = "flex";
    }

    if (menuFlotanteGlobal) menuFlotanteGlobal.style.display = "flex";
    if (btnFlotanteContacto) btnFlotanteContacto.style.display = "flex";

    const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
    if (pantallaChatPrivado) {
      pantallaChatPrivado.classList.remove("pantalla-completa");
      pantallaChatPrivado.style.display = "none";
    }

    const pantallaChats = document.getElementById("pantalla-chats");
    if (pantallaChats) pantallaChats.style.display = "flex";
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

// 📡 1. GESTIÓN AUTOMÁTICA DEL LED SUPERIOR (PRESENCIA REAL / SISTEMA)
function iniciarControlPresenciaReal() {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual) return;

  const userRef = ref(db, `usuarios/${usuarioActual.uid}`);
  const connectedRef = ref(db, ".info/connected");

  // Al desconectarse de Firebase, apagar el LED superior automáticamente
  onDisconnect(userRef).update({ presenciaReal: false });

  // Escuchar si hay conexión activa a Internet
  onValue(connectedRef, (snap) => {
    if (snap.val() === true && !document.hidden) {
      update(userRef, { presenciaReal: true });
    } else {
      update(userRef, { presenciaReal: false });
    }
  });

  // Escuchar cuando el usuario minimiza o vuelve a abrir la app
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      update(userRef, { presenciaReal: false });
    } else if (auth.currentUser) {
      update(userRef, { presenciaReal: true });
    }
  });
}

// 💡 2. RENDERIZAR LOS 2 LEDS DE CUALQUIER CONTACTO EN TIEMPO REAL
window.actualizarDobleLedContacto = function (datosContacto) {
  const ledSuperior = document.querySelector(".punto-online-doble-top") || document.querySelector(".led-top") || document.getElementById("led-enfoque-app");
  const ledInferior = document.querySelector(".punto-online-doble-bottom") || document.querySelector(".led-bottom") || document.getElementById("led-presencia-base");

  if (!datosContacto) return;

  // --- LED SUPERIOR (Presencia Real en App) ---
  const estaEnApp = datosContacto.presenciaReal === true;
  const colorTop = estaEnApp ? "#00f2fe" : "#888888";
  const sombraTop = estaEnApp ? "0 0 8px #00f2fe" : "none";

  if (ledSuperior) {
    ledSuperior.style.setProperty("background-color", colorTop, "important");
    ledSuperior.style.boxShadow = sombraTop;
  }

  // --- LED INFERIOR (Indicador Manual de Conexión) ---
  const estadoManual = datosContacto.estadoConexion || datosContacto.estadoPresencia || "online";
  let colorBottom = "#00f2fe";
  let sombraBottom = "0 0 8px #00f2fe";

  if (estadoManual === "ocupado") {
    colorBottom = "#ef4444";
    sombraBottom = "0 0 8px #ef4444";
  } else if (estadoManual === "offline" || estadoManual === "invisible") {
    colorBottom = "#888888";
    sombraBottom = "none";
  }

  if (ledInferior) {
    ledInferior.style.setProperty("background-color", colorBottom, "important");
    ledInferior.style.boxShadow = sombraBottom;
  }
};

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
// 🔮 SISTEMA DE AURAS MOVACHAT (CONECTADO A TU CSS)
// ========================================================

window.cambiarAura = function (nombreTema) {
  if (!nombreTema) return;

  // Normalizar nombre de tema
  const temaFinal = (nombreTema === "cyber") ? "cyan-morado" : nombreTema;

  // 1. Asignar atributo global para que cambie el color de la cápsula
  document.documentElement.setAttribute("data-aura", temaFinal);
  document.body.setAttribute("data-aura", temaFinal);

  // 2. Cambiar clases de las esferas decorativas (CODIGO 1)
  const esfera1 = document.querySelector(".esfera-cyan");
  const esfera2 = document.querySelector(".esfera-morada");

  if (esfera1 && esfera2) {
    esfera1.classList.remove("aura-cyan-morado", "aura-fuego", "aura-oceano", "aura-matrix");
    esfera2.classList.remove("aura-cyan-morado", "aura-fuego", "aura-oceano", "aura-matrix");

    esfera1.classList.add(`aura-${temaFinal}`);
    esfera2.classList.add(`aura-${temaFinal}`);
  }

  // 3. Guardar preferencia local
  localStorage.setItem("movachat-aura-tema", temaFinal);

  // 4. Mover la cápsula deslizante (glizzy-deslizante)
  const botones = Array.from(document.querySelectorAll(".opcion-aura"));
  const indicador = document.getElementById("indicador-aura") || document.querySelector(".glizzy-deslizante");

  let botonActivo = null;

  botones.forEach((btn) => {
    const attrAura = btn.getAttribute("data-aura") || "";
    const esSeleccionado = (attrAura === nombreTema) ||
      (attrAura === temaFinal) ||
      (temaFinal === "cyan-morado" && (attrAura === "cyber" || attrAura === "cyan-morado"));

    if (esSeleccionado) {
      btn.classList.add("activa");
      botonActivo = btn;
    } else {
      btn.classList.remove("activa");
    }
  });

  if (indicador && botonActivo && botonActivo.offsetWidth > 0) {
    indicador.style.width = `${botonActivo.offsetWidth}px`;
    indicador.style.transform = `translateX(${botonActivo.offsetLeft}px)`;
  }

  // 5. Sincronizar en Firebase si existe usuario activo
  if (typeof auth !== "undefined" && auth.currentUser) {
    update(ref(db, `usuarios/${auth.currentUser.uid}`), { aura: temaFinal }).catch(() => { });
  }
};

// Autocargar al abrir la aplicación
document.addEventListener("DOMContentLoaded", () => {
  const auraGuardada = localStorage.getItem("movachat-aura-tema") || "cyan-morado";
  window.cambiarAura(auraGuardada);
});

// Carga automática del tema al iniciar la app
document.addEventListener("DOMContentLoaded", () => {
  const auraGuardada = localStorage.getItem("movachat-aura-tema") || "cyber";
  window.cambiarAura(auraGuardada);
});

// Escuchador global de clics para detectar cualquier pulsación en el selector de Aura
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".opcion-aura");
  if (!btn) return;

  const auraAttr = btn.getAttribute("data-aura");
  if (auraAttr) {
    window.cambiarAura(auraAttr);
  } else {
    // Si no tiene atributo data-aura, leer por texto del botón
    const texto = btn.innerText.toLowerCase();
    if (texto.includes("fuego")) window.cambiarAura("fuego");
    else if (texto.includes("océano") || texto.includes("oceano")) window.cambiarAura("oceano");
    else if (texto.includes("matrix")) window.cambiarAura("matrix");
    else window.cambiarAura("cyber");
  }
});

// Auto-activar al cargar la página
document.addEventListener("DOMContentLoaded", () => {
  const auraGuardada = localStorage.getItem("movachat-aura-tema") || "cyber";
  window.cambiarAura(auraGuardada);
});

// 2. Escuchador de clics delegado para tus botones HTML
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".opcion-aura");
  if (!btn) return;

  const auraAttr = btn.getAttribute("data-aura");
  if (auraAttr) {
    window.cambiarAura(auraAttr);
  }
});

// 3. Auto-cargar el aura al refrescar la página
(function inicializarAuraAuto() {
  window.addEventListener("DOMContentLoaded", () => {
    const auraGuardada = localStorage.getItem("movachat-aura-tema") || "cyber";
    const valorAttrHTML = (auraGuardada === "cyber") ? "cyan-morado" : auraGuardada;
    window.cambiarAura(valorAttrHTML);
  });
})();

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

// ========================================================
// 🔗 SISTEMA DE COMPARTIR MOVACHAT (NATIVO + PORTAPAPELES)
// ========================================================

async function ejecutarCompartirMova() {
  // Enlace oficial o la URL actual de la PWA
  const urlCompartir = window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : window.location.href;

  const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
  const nombreUsuario = usuarioActual?.displayName || "un amigo";

  const datosCompartir = {
    title: 'MovaChat PWA',
    text: `¡Hola! ${nombreUsuario} te invita a chatear en MovaChat. La app de mensajería con diseño futurista 🌌🔥`,
    url: urlCompartir
  };

  // 1. En móviles (iOS/Android) abre la ventana nativa (WhatsApp, Telegram, etc.)
  if (navigator.share) {
    try {
      await navigator.share(datosCompartir);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("¡MovaChat compartido con éxito! 🪐", "✨", "#00f2fe");
      }
    } catch (err) {
      if (err.name !== "AbortError") {
        console.log("Error al compartir nativo:", err);
      }
    }
  }
  // 2. En PC copia directamente el enlace
  else {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(urlCompartir);
      } else {
        const cajaTemporal = document.createElement("textarea");
        cajaTemporal.value = urlCompartir;
        cajaTemporal.style.position = "fixed";
        cajaTemporal.style.left = "-9999px";
        document.body.appendChild(cajaTemporal);
        cajaTemporal.select();
        document.execCommand("copy");
        document.body.removeChild(cajaTemporal);
      }

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("¡Enlace de MovaChat copiado al portapapeles! 🚀", "📋", "#00f2fe");
      }
    } catch (err) {
      console.error("Error al copiar enlace:", err);
    }
  }
}

// Escuchador delegado global (captura cualquier botón con clase .btn-compartir o texto 'Compartir MovaChat')
document.addEventListener("click", (e) => {
  const btn = e.target.closest(".btn-compartir") ||
    e.target.closest("#btn-compartir-mova") ||
    (e.target.textContent && e.target.textContent.includes("Compartir MovaChat") ? e.target.closest("button, div") : null);

  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    ejecutarCompartirMova();
  }
});

// ========================================================
// 📲 SISTEMA DE CÓDIGO QR PRO (GENERADOR DINÁMICO)
// ========================================================

function abrirModalQRPro() {
  const modalQr = document.getElementById("modal-qr-mova");
  const imgQrDinamico = document.getElementById("img-qr-dinamico");

  const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
  const urlBase = window.location.origin && window.location.origin !== "null"
    ? window.location.origin
    : window.location.href;

  // Enlace dinámico con el UID del usuario activo para invitar directo a su perfil
  const urlACompartir = usuarioActual
    ? `${urlBase}?user=${usuarioActual.uid}`
    : urlBase;

  if (imgQrDinamico) {
    // Genera el código QR con los colores neón e identitarios de MovaChat
    imgQrDinamico.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(urlACompartir)}&color=00f2fe&bgcolor=0a0a12`;
  }

  if (modalQr) {
    modalQr.classList.remove("oculto");
    modalQr.style.display = "flex";
  }

  if (typeof mostrarAvisoPremium === "function") {
    mostrarAvisoPremium("Código QR Pro generado con éxito 📲", "✨", "#00f2fe");
  }
}

// Escuchador delegado global (detecta si presionan por clase, por ID o por texto 'QR Pro')
document.addEventListener("click", (e) => {
  const btnQr = e.target.closest(".btn-qr") ||
    e.target.closest("#btn-qr-mova") ||
    (e.target.textContent && e.target.textContent.includes("QR Pro") ? e.target.closest("button, div") : null);

  if (btnQr) {
    e.preventDefault();
    e.stopPropagation();
    abrirModalQRPro();
  }

  // Cerrar el modal al tocar la 'X' o la capa del fondo
  if (e.target.closest("#btn-cerrar-qr") || e.target.id === "modal-qr-mova") {
    const modalQr = document.getElementById("modal-qr-mova");
    if (modalQr) {
      modalQr.classList.add("oculto");
      modalQr.style.display = "none";
    }
  }
});

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

// 💾 Guardar en el perfil local y enviar a Firebase en tiempo real
if (btnGuardarEstado && modalEstado) {
  btnGuardarEstado.addEventListener("click", async () => {
    const fraseIngresada = inputNuevoEstado ? inputNuevoEstado.value.trim() : "";

    // Si escribió una frase personalizada la usa, si no, usa el nombre del estado
    const textoFinal = fraseIngresada !== "" ? fraseIngresada : nombreEstadoSeleccionado;

    // 1. Actualizar pantalla propia
    if (textoEstadoPerfil) {
      textoEstadoPerfil.textContent = textoFinal;
    }
    if (ledPerfil) {
      ledPerfil.style.backgroundColor = colorLedSeleccionado;
      ledPerfil.style.boxShadow = `0 0 10px ${colorLedSeleccionado}`;
    }

    // 2. Guardar en memoria local
    localStorage.setItem("movachat-estado-texto", textoFinal);
    localStorage.setItem("movachat-estado-tipo", tipoEstadoSeleccionado);

    // 3. ENVIAR A FIREBASE EN TIEMPO REAL A TODOS LOS CONTACTOS
    const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
    if (usuarioActual && typeof db !== "undefined") {
      const datosActualizar = {
        estadoTexto: textoFinal,
        estado: textoFinal,
        estadoConexion: tipoEstadoSeleccionado,
        estadoPresencia: tipoEstadoSeleccionado
      };

      try {
        await update(ref(db, `usuarios/${usuarioActual.uid}`), datosActualizar);
      } catch (err) {
        console.error("Error al actualizar estado en Firebase:", err);
      }
    }

    // 4. Cerrar el modal y notificar
    modalEstado.classList.add("oculto");
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Perfil actualizado: ${nombreEstadoSeleccionado} ✨`);
    }

    // 5. Refrescar leds de la cabecera
    if (typeof actualizarDobleLedCabecera === "function") {
      actualizarDobleLedCabecera("perfil");
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

// 🚀 ESCUCHAR Y RENDERIZAR BANDEJA DE ENTRADA CON CONTROL DE VACIADO, TEMPORALES Y ELIMINACIÓN
function escucharUltimoMensajeContacto(miUid, contactoUid, datosUsuario, fijadosBD = {}) {
  const chatId = obtenerChatId(miUid, contactoUid);
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);
  const lecturaRef = ref(db, `lecturas/${miUid}/${contactoUid}`);
  const vaciadoRef = ref(db, `vaciados/${miUid}/${contactoUid}`);
  const ocultoRef = ref(db, `chats_ocultos/${miUid}/${contactoUid}`);

  let timerExpiracionEfimera = null;

  onValue(mensajesRef, async (snapshot) => {
    const contenedorLista = document.getElementById("lista-chats-principal");
    if (!contenedorLista) return;

    if (timerExpiracionEfimera) clearTimeout(timerExpiracionEfimera);

    let tarjetaContacto = document.getElementById(`tarjeta-chat-${contactoUid}`);

    // Consultar marcas personales de vaciado y eliminación
    let timestampUltimoVaciado = 0;
    let timestampOculto = 0;

    try {
      const [snapVaciado, snapOculto] = await Promise.all([
        get(vaciadoRef),
        get(ocultoRef)
      ]);

      if (snapVaciado.exists()) timestampUltimoVaciado = Number(snapVaciado.val()) || 0;
      if (snapOculto.exists()) timestampOculto = Number(snapOculto.val()) || 0;
    } catch (err) {
      console.error("Error al consultar estados de vaciado/eliminación:", err);
    }

    let hayMensajesHistoricos = snapshot.exists();
    let mensajesValidosKeys = [];
    let ultimoMsg = null;
    let ultimoMsgKey = null;
    let mensajes = {};

    if (hayMensajesHistoricos) {
      mensajes = snapshot.val();
      const keys = Object.keys(mensajes);
      const ahora = Date.now();

      // ⏳ Filtrar mensajes posteriores al vaciado Y eliminar/omitir los temporales expirados
      mensajesValidosKeys = keys.filter((k) => {
        const m = mensajes[k];
        const esPosteriorVaciado = (m.timestamp || 0) > timestampUltimoVaciado;

        if (m.esEfimero) {
          const limiteMs = m.duracionEfimeraMs || 10000;
          const transcurrido = ahora - (m.timestamp || ahora);

          if (transcurrido >= limiteMs) {
            set(ref(db, `chats/${chatId}/mensajes/${k}`), null);
            return false;
          }
        }

        return esPosteriorVaciado;
      });

      if (mensajesValidosKeys.length > 0) {
        ultimoMsgKey = mensajesValidosKeys[mensajesValidosKeys.length - 1];
        ultimoMsg = mensajes[ultimoMsgKey];

        if (ultimoMsg && ultimoMsg.esEfimero) {
          const limiteMs = ultimoMsg.duracionEfimeraMs || 10000;
          const transcurrido = ahora - (ultimoMsg.timestamp || ahora);
          const tiempoRestante = limiteMs - transcurrido;

          if (tiempoRestante > 0) {
            timerExpiracionEfimera = setTimeout(() => {
              set(ref(db, `chats/${chatId}/mensajes/${ultimoMsgKey}`), null);
            }, tiempoRestante);
          }
        }
      }
    }

    // 🛑 1. CASO ELIMINADO EXPLICITO: Solo oculta la tarjeta si existe una marca en chats_ocultos
    // Y NO existe ningún mensaje nuevo con fecha posterior a esa eliminación
    const ultimoMsgTime = ultimoMsg ? (ultimoMsg.timestamp || 0) : 0;
    if (timestampOculto > 0 && ultimoMsgTime <= timestampOculto) {
      if (tarjetaContacto) tarjetaContacto.remove();
      if (typeof actualizarEstadoPantallaInicio === "function") actualizarEstadoPantallaInicio();
      if (typeof window.actualizarBadgesNotificaciones === "function") window.actualizarBadgesNotificaciones();
      return;
    }

    // 🛑 2. CASO CHAT NUEVO SIN REGISTROS: Si jamás ha tenido mensajes y jamás se ha vaciado ni ocultado
    if (!hayMensajesHistoricos && timestampUltimoVaciado === 0 && timestampOculto === 0) {
      if (tarjetaContacto) tarjetaContacto.remove();
      if (typeof actualizarEstadoPantallaInicio === "function") actualizarEstadoPantallaInicio();
      if (typeof window.actualizarBadgesNotificaciones === "function") window.actualizarBadgesNotificaciones();
      return;
    }

    // 🟢 3. CREAR O MANTENER TARJETA SI FUE VACIANO O TIENE MENSAJES
    if (!tarjetaContacto) {
      tarjetaContacto = document.createElement("div");
      tarjetaContacto.className = "tarjeta-chat contacto-item";
      tarjetaContacto.dataset.uid = contactoUid;
      tarjetaContacto.id = `tarjeta-chat-${contactoUid}`;

      const nombreContacto = datosUsuario ? (datosUsuario.nombre || "Usuario") : "Usuario";
      const primerLetra = nombreContacto.charAt(0).toUpperCase();

      const foto = (datosUsuario && datosUsuario.fotoUrl)
        ? `<img src="${datosUsuario.fotoUrl}" alt="${nombreContacto}">`
        : `<div class="avatar-placeholder" style="width: 45px; height: 45px; border-radius: 50%; background: #00f2fe; color: #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">${primerLetra}</div>`;

      const estadoDelContacto = datosUsuario ? (datosUsuario.estadoConexion || datosUsuario.estadoPresencia || datosUsuario.estado || "online") : "online";
      let colorLed = "#00f2fe";
      let sombraLed = "0 0 8px #00f2fe";

      if (estadoDelContacto === "ocupado") {
        colorLed = "#ef4444";
        sombraLed = "0 0 8px #ef4444";
      } else if (estadoDelContacto === "offline" || estadoDelContacto === "invisible") {
        colorLed = "#888888";
        sombraLed = "0 0 8px #888888";
      }

      const esFijado = fijadosBD[contactoUid] === true || localStorage.getItem(`fijado_${contactoUid}`) === "true";
      if (esFijado) {
        tarjetaContacto.classList.add("tarjeta-fijada");
        tarjetaContacto.style.order = "-1";
      }

      const estaSilenciado = localStorage.getItem(`silenciado_${contactoUid}`) === "true";
      if (estaSilenciado) {
        tarjetaContacto.classList.add("chat-silenciado-zona");
      }

      tarjetaContacto.innerHTML = `
        <div class="chat-avatar-caja">
          ${foto}
          <span class="punto-online-chat" style="background-color: ${colorLed}; box-shadow: ${sombraLed};"></span>
        </div>
        <div class="chat-info">
          <div class="chat-cabecera">
            <h4 class="chat-nombre">${nombreContacto}</h4>
            <span class="chat-hora">--:--</span>
            ${esFijado ? `<span class="indicador-pin-neon" title="Chat fijado"><i data-lucide="pin" style="width:14px; height:14px;"></i></span>` : ''}
            ${estaSilenciado ? `<span class="indicador-silencio-neon" title="Chat silenciado"><i data-lucide="bell-off"></i></span>` : ''}
          </div>
          <div class="chat-mensaje-caja">
            <p class="chat-texto"></p>
            <div class="badge-chat-no-leido badge-mensaje oculto">0</div>
          </div>
        </div>
      `;

      onValue(ref(db, `usuarios/${contactoUid}`), (uSnap) => {
        if (!uSnap.exists()) return;
        const uFresh = uSnap.val();
        const estContacto = uFresh.estadoConexion || uFresh.estadoPresencia || uFresh.estado || "online";

        let cLed = "#00f2fe";
        let sLed = "0 0 8px #00f2fe";

        if (estContacto === "ocupado") {
          cLed = "#ef4444";
          sLed = "0 0 8px #ef4444";
        } else if (estContacto === "offline" || estContacto === "invisible") {
          cLed = "#888888";
          sLed = "0 0 8px #888888";
        }

        const nodoLed = tarjetaContacto ? tarjetaContacto.querySelector(".punto-online-chat") : null;
        if (nodoLed) {
          nodoLed.style.backgroundColor = cLed;
          nodoLed.style.boxShadow = sLed;
        }
      });

      tarjetaContacto.addEventListener("click", (e) => {
        e.stopPropagation();

        window.contactoActivoUid = contactoUid;
        if (typeof contactoSeleccionado !== "undefined") contactoSeleccionado = contactoUid;

        const badge = tarjetaContacto.querySelector(".badge-chat-no-leido");
        const elemTexto = tarjetaContacto.querySelector(".chat-texto");

        if (badge) {
          badge.textContent = "0";
          badge.classList.add("oculto");
        }
        if (elemTexto) {
          elemTexto.classList.remove("texto-resaltado");
        }

        if (typeof actualizarCampanitaGlobal === "function") {
          actualizarCampanitaGlobal();
        }

        document.querySelectorAll(".tarjeta-chat").forEach(el => el.classList.remove("activo"));
        tarjetaContacto.classList.add("activo");

        if (typeof abrirChatConUsuario === "function") {
          abrirChatConUsuario(contactoUid, nombreContacto, (datosUsuario ? datosUsuario.fotoUrl : ""));
        }
      });

      contenedorLista.appendChild(tarjetaContacto);

      if (window.lucide) {
        window.lucide.createIcons({ targets: [tarjetaContacto] });
      }
    }

    // 4. ACTUALIZAR TEXTO DE LA TARJETA
    const elemTexto = tarjetaContacto.querySelector(".chat-texto");
    const elemHora = tarjetaContacto.querySelector(".chat-hora");
    const elemBadge = tarjetaContacto.querySelector(".badge-chat-no-leido") || tarjetaContacto.querySelector(".badge-mensaje");

    if (ultimoMsg) {
      if (elemTexto) elemTexto.textContent = ultimoMsg.texto || (ultimoMsg.tipoAdjunto ? "📷 Adjunto" : "");
      if (elemHora) elemHora.textContent = ultimoMsg.hora || "";
    } else {
      // Mantiene la tarjeta visible marcando el estado de vaciado
      if (elemTexto) elemTexto.textContent = "Conversación vaciada";
      if (elemHora) elemHora.textContent = "--:--";
    }

    // Verificar lectura en vivo
    const pantallaChat = document.getElementById("pantalla-chat-privado");
    const estaAbierto = (window.contactoActivoUid === contactoUid) &&
      pantallaChat &&
      (pantallaChat.style.display === "flex" || pantallaChat.classList.contains("pantalla-completa"));

    if (estaAbierto) {
      if (mensajesValidosKeys.length > 0) {
        set(lecturaRef, ultimoMsgKey);
      }
      if (elemBadge) {
        elemBadge.textContent = "0";
        elemBadge.classList.add("oculto");
      }
      if (elemTexto) elemTexto.classList.remove("texto-resaltado");
    } else {
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

    if (typeof actualizarEstadoPantallaInicio === "function") {
      actualizarEstadoPantallaInicio();
    }

    if (typeof window.verificarEstadoBloqueo === "function") {
      window.verificarEstadoBloqueo(contactoUid);
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
const textoSubtituloMiEstado = document.getElementById("texto-subtitulo-mi-estado");
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
// 🔕 GESTOR DE SILENCIADO CON AUTO-EXPIRACIÓN EN TIEMPO REAL
// ========================================================

// Almacén global para los temporizadores de auto-desactivación
window.temporizadoresSilencio = window.temporizadoresSilencio || {};

// Función auxiliar para programar la eliminación del silencio exactamente cuando venza
function programarAutoDesactivacionSilencio(contactoUid, hastaMs) {
  // Cancelar temporizador previo si existía para este contacto
  if (window.temporizadoresSilencio[contactoUid]) {
    clearTimeout(window.temporizadoresSilencio[contactoUid]);
  }

  const tiempoRestante = hastaMs - Date.now();

  if (tiempoRestante <= 0) {
    // Si ya pasó el tiempo, limpiar de inmediato
    limpiarSilencioExpirado(contactoUid);
    return;
  }

  // Programar la limpieza visual y en BD al cumplirse exactamente el tiempo
  window.temporizadoresSilencio[contactoUid] = setTimeout(() => {
    limpiarSilencioExpirado(contactoUid);
  }, tiempoRestante);
}

// Función encargada de quitar el ícono, limpiar LocalStorage y Firebase
async function limpiarSilencioExpirado(contactoUid) {
  const miUid = auth && auth.currentUser ? auth.currentUser.uid : null;

  // 1. Limpiar memoria local
  localStorage.removeItem(`silenciado_${contactoUid}`);
  localStorage.removeItem(`silenciado_hasta_${contactoUid}`);

  // 2. Limpiar nodo en Firebase Realtime Database
  if (miUid) {
    try {
      await set(ref(db, `silenciados/${miUid}/${contactoUid}`), null);
    } catch (err) {
      console.error("Error al limpiar silencio en Firebase:", err);
    }
  }

  // 3. Quitar el ícono neón y la clase visual de la lista de chats
  const tarjeta = document.getElementById(`tarjeta-chat-${contactoUid}`);
  if (tarjeta) {
    tarjeta.classList.remove("chat-silenciado-zona");
    const iconoNeon = tarjeta.querySelector(".indicador-silencio-neon");
    if (iconoNeon) iconoNeon.remove();
  }

  delete window.temporizadoresSilencio[contactoUid];
}

// --- REFERENCIAS DE ELEMENTOS Y EVENTOS DEL MODAL ---
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

    if (typeof menuCabecera !== "undefined" && menuCabecera) menuCabecera.classList.add("oculto");

    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    // Verificar si está silenciado
    const tiempoGuardado = localStorage.getItem(`silenciado_hasta_${contactoUid}`);
    let estaSilenciado = false;

    if (tiempoGuardado) {
      if (tiempoGuardado === "indefinido") {
        estaSilenciado = true;
      } else {
        const hastaMs = parseInt(tiempoGuardado, 10);
        if (Date.now() < hastaMs) {
          estaSilenciado = true;
        } else {
          limpiarSilencioExpirado(contactoUid);
        }
      }
    }

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

// EVENTO PARA EL BOTÓN "ACTIVAR NOTIFICACIONES" (ANULAR MANUALMENTE)
if (btnActivarNotifModal) {
  btnActivarNotifModal.addEventListener("click", async () => {
    const contactoUid = window.contactoActivoUid;
    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigo = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!contactoUid) return;

    if (window.temporizadoresSilencio[contactoUid]) {
      clearTimeout(window.temporizadoresSilencio[contactoUid]);
      delete window.temporizadoresSilencio[contactoUid];
    }

    await limpiarSilencioExpirado(contactoUid);

    if (modalSilenciarTiempo) modalSilenciarTiempo.classList.add("oculto");
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Notificaciones activadas para <b>${nombreAmigo}</b>.`, "🔔", "#00f2fe");
    }
  });
}

// EVENTO AL SELECCIONAR UNA OPCIÓN DE TIEMPO
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
      await set(ref(db, `silenciados/${miUid}/${contactoUid}`), valorGuardar);
    }

    // Programar la desactivación automática si no es indefinido
    if (duracionMs !== "indefinido") {
      programarAutoDesactivacionSilencio(contactoUid, Date.now() + duracionMs);
    }

    // Actualizar interfaz visual
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

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Has silenciado a <b>${nombreAmigo}</b> por ${textoTiempoNotif}.`, "🔕", "#ff4b2b");
    }
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

// 🟢 CARGAR MENSAJES DE CHAT (Selección Segura)
function cargarMensajesChat(contactoUid) {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual) return;

  const chatId = obtenerChatId(usuarioActual.uid, contactoUid);
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);

  onValue(mensajesRef, (snapshot) => {
    const contenedorMensajes = document.getElementById("historial-mensajes") || document.querySelector(".historial-mensajes");
    if (!contenedorMensajes) return;

    contenedorMensajes.innerHTML = "";

    if (snapshot.exists()) {
      const mensajes = snapshot.val();
      Object.keys(mensajes).forEach((key) => {
        const msg = mensajes[key];
        const esMio = msg.emisorUid === usuarioActual.uid || msg.emisor === usuarioActual.uid;

        const burbuja = document.createElement("div");
        burbuja.className = `mensaje-burbuja ${esMio ? 'enviado' : 'recibido'}`;
        burbuja.innerHTML = `
          <p class="mensaje-texto">${msg.texto || ''}</p>
          <span class="mensaje-hora">${msg.hora || new Date(msg.timestamp || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
        `;
        contenedorMensajes.appendChild(burbuja);
      });

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

// 🟢 VERIFICAR ESTADO DE BLOQUEO EN FIREBASE Y SINCRONIZAR INTERFAZ (CON CAMPANITA ROJA)
window.verificarEstadoBloqueo = async function (contactoUid) {
  const usuarioActual = auth.currentUser;
  const miUid = usuarioActual ? usuarioActual.uid : null;
  if (!miUid || !contactoUid) return false;

  try {
    const snap = await get(ref(db, `bloqueos/${miUid}/${contactoUid}`));
    const estaBloqueado = snap.exists() && snap.val() === true;

    // Guardar en almacenamiento local para respuesta instantánea
    if (estaBloqueado) {
      localStorage.setItem(`bloqueado_${contactoUid}`, "true");
    } else {
      localStorage.removeItem(`bloqueado_${contactoUid}`);
    }

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

    // 3. Actualizar aspecto visual y campanita roja en la tarjeta de la lista
    const tarjetaAmigoNodo = document.getElementById(`tarjeta-chat-${contactoUid}`);
    if (tarjetaAmigoNodo) {
      const cabecera = tarjetaAmigoNodo.querySelector(".chat-cabecera");
      let iconoBloqueo = tarjetaAmigoNodo.querySelector(".indicador-bloqueo-neon");

      if (estaBloqueado) {
        tarjetaAmigoNodo.style.opacity = "0.45";
        tarjetaAmigoNodo.style.filter = "grayscale(100%)";

        if (!iconoBloqueo && cabecera) {
          cabecera.insertAdjacentHTML(
            "beforeend",
            `<span class="indicador-bloqueo-neon" title="Usuario bloqueado" style="margin-left: 4px; display: inline-flex; align-items: center;"><i data-lucide="bell-off" style="width:14px; height:14px; color: #ff4b2b;"></i></span>`
          );
          if (window.lucide) {
            window.lucide.createIcons({ targets: [tarjetaAmigoNodo] });
          }
        }
      } else {
        tarjetaAmigoNodo.style.opacity = "1";
        tarjetaAmigoNodo.style.filter = "none";
        if (iconoBloqueo) iconoBloqueo.remove();
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

// 🗑️ Lógica de confirmación para Vaciar Chat (Solo dentro del chat privado)
document.addEventListener("DOMContentLoaded", () => {
  const modalVaciar = document.getElementById("modal-confirmar-vaciar");
  const btnAceptarVaciar = document.getElementById("btn-aceptar-vaciar-modal");
  const btnCancelarVaciar = document.getElementById("btn-cancelar-vaciar-modal");

  // 🔴 1. Cancelar Modal
  if (btnCancelarVaciar) {
    btnCancelarVaciar.onclick = () => {
      if (modalVaciar) modalVaciar.classList.add("oculto");
    };
  }

  // 🟢 2. Aceptar Modal (Vaciar Chat INDIVIDUAL interno)
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
});

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

const btnCtxFijar = document.getElementById("btn-ctx-fijar");
const btnCtxVaciarChat = document.getElementById("btn-ctx-vaciar-chat");
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
  const menuTarjetas = document.getElementById("menu-tarjetas-chat");
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
  const menuTarjetas = document.getElementById("menu-tarjetas-chat");
  if (menuTarjetas) {
    menuTarjetas.style.display = "none";
  }
}

// 📌 GESTIÓN DE ACCIONES DEL MENÚ CONTEXTUAL (Fijar, Vaciar, Eliminar, Cancelar)

if (btnCtxFijar) {
  btnCtxFijar.onclick = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (tarjetaChatSeleccionada) alternarFijarChat(tarjetaChatSeleccionada);
    cerrarMenuContextualMova();
  };
}

// 🧹 OPCIÓN 1: VACIAL CONVERSACIÓN (Mantiene la tarjeta, limpia mensajes)
if (btnCtxVaciarChat) {
  btnCtxVaciarChat.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    cerrarMenuContextualMova();

    if (!tarjetaChatSeleccionada) return;

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = tarjetaChatSeleccionada.dataset.uid || tarjetaChatSeleccionada.id.replace("tarjeta-chat-", "");
    const elemNombre = tarjetaChatSeleccionada.querySelector(".chat-nombre");
    const nombreContacto = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!miUid || !contactoUid) return;

    try {
      // Marcar timestamp de vaciado personal en Firebase
      await set(ref(db, `vaciados/${miUid}/${contactoUid}`), Date.now());

      // 🟢 ACTUALIZACIÓN INMEDIATA EN LA PANTALLA PRINCIPAL
      const elemTexto = tarjetaChatSeleccionada.querySelector(".chat-texto");
      const elemHora = tarjetaChatSeleccionada.querySelector(".chat-hora");
      const elemBadge = tarjetaChatSeleccionada.querySelector(".badge-chat-no-leido") || tarjetaChatSeleccionada.querySelector(".badge-mensaje");

      if (elemTexto) {
        elemTexto.textContent = "Conversación vaciada";
        elemTexto.classList.remove("texto-resaltado");
      }
      if (elemHora) elemHora.textContent = "--:--";
      if (elemBadge) {
        elemBadge.textContent = "0";
        elemBadge.classList.add("oculto");
      }

      // Si el chat privado con esta persona está abierto en pantalla, vaciar su vista
      if (window.contactoActivoUid === contactoUid) {
        const elemHistorial = document.querySelector(".historial-mensajes");
        if (elemHistorial) elemHistorial.innerHTML = "";
      }

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium(`Conversación vaciada con <b>${nombreContacto}</b>.`, "🧹", "#00f2fe");
      }
    } catch (err) {
      console.error("Error al vaciar conversación:", err);
    }
  };
}

// 🗑️ OPCIÓN 2: ELIMINAR CHAT (Quita la tarjeta de la pantalla principal)
if (btnCtxEliminar) {
  btnCtxEliminar.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    cerrarMenuContextualMova();

    if (!tarjetaChatSeleccionada) return;

    const miUid = auth.currentUser ? auth.currentUser.uid : null;
    const contactoUid = tarjetaChatSeleccionada.dataset.uid || tarjetaChatSeleccionada.id.replace("tarjeta-chat-", "");
    const elemNombre = tarjetaChatSeleccionada.querySelector(".chat-nombre");
    const nombreContacto = elemNombre ? elemNombre.textContent.trim() : "este usuario";

    if (!miUid || !contactoUid) return;

    try {
      const ahora = Date.now();
      // Guardar marcas de vaciado y ocultamiento en Firebase
      await set(ref(db, `vaciados/${miUid}/${contactoUid}`), ahora);
      await set(ref(db, `chats_ocultos/${miUid}/${contactoUid}`), ahora);

      // Eliminar tarjeta con animación de salida
      tarjetaChatSeleccionada.classList.add("tarjeta-eliminar-anim");
      setTimeout(() => {
        if (tarjetaChatSeleccionada) tarjetaChatSeleccionada.remove();
        if (typeof actualizarEstadoPantallaInicio === "function") actualizarEstadoPantallaInicio();
        if (typeof window.actualizarBadgesNotificaciones === "function") window.actualizarBadgesNotificaciones();
      }, 300);

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium(`Chat con <b>${nombreContacto}</b> eliminado.`, "🗑️", "#ff4b2b");
      }
    } catch (err) {
      console.error("Error al eliminar chat:", err);
    }
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
  if (e.target.closest("#pantalla-chat-privado .btn-volver") || e.target.closest("#btn-volver-chats")) {
    const encabezadoInicio = document.querySelector(".encabezado-inicio");
    const menuFlotante = document.querySelector(".menu-flotante");
    const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto") || document.getElementById("btn-abrir-contactos");

    // Restaurar encabezado, menú inferior y remover la clase que oculta el botón (+)
    if (encabezadoInicio) encabezadoInicio.style.display = "flex";
    if (menuFlotante) menuFlotante.style.display = "flex";
    if (btnFlotanteContacto) {
      btnFlotanteContacto.style.display = "flex";
      btnFlotanteContacto.classList.remove("oculto");
    }
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
// 🗑️ BOTÓN LIMPIAR HISTORIAL GLOBAL (CON MODAL GLASSMORPHISM)
// ==========================================================
document.addEventListener("click", (e) => {
  const btnLimpiar = e.target.closest("#btn-limpiar-historial-global");
  if (!btnLimpiar) return;

  const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
  const miUid = usuarioActual ? usuarioActual.uid : null;

  if (!miUid) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Debes iniciar sesión para realizar esta acción.", "⚠️", "#ff4b2b");
    }
    return;
  }

  // 1. Filtrar los chats activos (Excluyendo "Mi Estado")
  const tarjetasChat = Array.from(document.querySelectorAll("#lista-chats-principal .tarjeta-chat")).filter(
    (tarjeta) => tarjeta.id !== "tarjeta-mi-estado-propio" && !tarjeta.classList.contains("tarjeta-estado-propio")
  );

  if (tarjetasChat.length === 0) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("No hay conversaciones activas para limpiar.", "ℹ️", "#00f2fe");
    }
    return;
  }

  // 2. Abrir el modal personalizado
  const modalConfirmar = document.getElementById("modal-confirmar-limpiar-global");
  if (modalConfirmar) {
    modalConfirmar.classList.remove("oculto");
    if (window.lucide) window.lucide.createIcons({ targets: [modalConfirmar] });
  }
});

// 🔴 EVENTOS PARA BOTONES DEL MODAL CONFIRMAR LIMPIEZA GLOBAL
document.addEventListener("DOMContentLoaded", () => {
  const modalConfirmar = document.getElementById("modal-confirmar-limpiar-global");
  const btnCancelar = document.getElementById("btn-cancelar-limpiar-global");
  const btnAceptar = document.getElementById("btn-aceptar-limpiar-global");

  // A) Cancelar modal
  if (btnCancelar && modalConfirmar) {
    btnCancelar.onclick = () => modalConfirmar.classList.add("oculto");
  }

  // Cerrar al tocar el fondo oscuro
  if (modalConfirmar) {
    modalConfirmar.onclick = (e) => {
      if (e.target === modalConfirmar) modalConfirmar.classList.add("oculto");
    };
  }

  // B) Aceptar eliminación global
  if (btnAceptar && modalConfirmar) {
    btnAceptar.onclick = async () => {
      modalConfirmar.classList.add("oculto");

      const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
      const miUid = usuarioActual ? usuarioActual.uid : null;
      if (!miUid) return;

      const tarjetasChat = Array.from(document.querySelectorAll("#lista-chats-principal .tarjeta-chat")).filter(
        (tarjeta) => tarjeta.id !== "tarjeta-mi-estado-propio" && !tarjeta.classList.contains("tarjeta-estado-propio")
      );

      try {
        const ahora = Date.now();

        // Guardar marcas de vaciado y ocultamiento en Firebase para cada chat
        const promesasGuardado = tarjetasChat.map(async (tarjeta) => {
          const contactoUid = tarjeta.dataset.uid || tarjeta.id.replace("tarjeta-chat-", "");
          if (contactoUid) {
            await set(ref(db, `vaciados/${miUid}/${contactoUid}`), ahora);
            await set(ref(db, `chats_ocultos/${miUid}/${contactoUid}`), ahora);
          }
        });

        await Promise.all(promesasGuardado);

        // Animación fluida de salida
        tarjetasChat.forEach((tarjeta) => {
          tarjeta.style.transition = "all 0.3s ease";
          tarjeta.style.opacity = "0";
          tarjeta.style.transform = "scale(0.95)";
        });

        setTimeout(() => {
          tarjetasChat.forEach((t) => t.remove());

          if (typeof actualizarEstadoPantallaInicio === "function") actualizarEstadoPantallaInicio();
          if (typeof window.actualizarBadgesNotificaciones === "function") window.actualizarBadgesNotificaciones();

          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Bandeja de chats limpiada correctamente 🧹", "✨", "#00f2fe");
          }
        }, 300);

      } catch (err) {
        console.error("Error al limpiar lista global de chats:", err);
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No se pudo completar la limpieza.", "❌", "#ff4b2b");
        }
      }
    };
  }
});

// 🌐 SISTEMA ÚNICO DE REDES SOCIALES PERSONALES (Firebase v10 Modular)
function conectarRedesSociales() {
  const botonesRedes = document.querySelectorAll(".red-enlace");

  botonesRedes.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const user = auth ? auth.currentUser : null;
      if (!user) return;

      const tipoRed = btn.dataset.red; // 'instagram', 'tiktok', 'facebook'
      if (!tipoRed) return;

      const redRef = ref(db, `usuarios/${user.uid}/redes/${tipoRed}`);

      try {
        const snap = await get(redRef);
        const urlExistente = snap.exists() ? snap.val() : "";

        // Si ya tiene una red guardada, le consulta si desea abrirla o modificarla
        if (urlExistente !== "") {
          const opcion = confirm(`Tu ${tipoRed.toUpperCase()} actual es: ${urlExistente}\n\n¿Deseas EDITAR este enlace?\n(Presiona 'Cancelar' para abrir tu perfil en una pestaña nueva)`);
          
          if (!opcion) {
            const urlFinal = urlExistente.startsWith("http") ? urlExistente : `https://${tipoRed}.com/${urlExistente.replace('@', '')}`;
            window.open(urlFinal, "_blank");
            return;
          }
        }

        // Solicitar usuario o enlace
        const nuevaUrl = prompt(`Ingresa tu enlace o usuario de ${tipoRed.toUpperCase()}:`, urlExistente);

        if (nuevaUrl !== null) {
          const valorLimpio = nuevaUrl.trim();

          if (valorLimpio === "") {
            await remove(redRef);
            btn.classList.remove("conectada");
            btn.style.borderColor = "rgba(255, 255, 255, 0.08)";
            btn.style.boxShadow = "none";
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium(`Red ${tipoRed} eliminada`, "🗑️", "#ff4b2b");
            }
          } else {
            await set(redRef, valorLimpio);
            btn.classList.add("conectada");
            btn.style.borderColor = "#00f2fe";
            btn.style.boxShadow = "0 0 10px rgba(0, 242, 254, 0.3)";
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium(`¡Red ${tipoRed} vinculada con éxito! 🚀`, "✅", "#00f2fe");
            }
          }
        }
      } catch (error) {
        console.error("Error al actualizar red social:", error);
      }
    });
  });
}

// 🌐 Cargar estado neón de las redes guardadas en Firebase
function cargarEstadoRedesPropias() {
  const user = auth ? auth.currentUser : null;
  if (!user) return;

  const redesRef = ref(db, `usuarios/${user.uid}/redes`);

  onValue(redesRef, (snap) => {
    const redes = snap.val() || {};

    document.querySelectorAll(".red-enlace").forEach(btn => {
      const tipoRed = btn.dataset.red;
      if (tipoRed && redes[tipoRed]) {
        btn.classList.add("conectada");
        btn.style.borderColor = "#00f2fe";
        btn.style.boxShadow = "0 0 10px rgba(0, 242, 254, 0.3)";
      } else {
        btn.classList.remove("conectada");
        btn.style.borderColor = "rgba(255, 255, 255, 0.08)";
        btn.style.boxShadow = "none";
      }
    });
  });
}

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

// ========================================================
// 🔊 SISTEMA DE DESBLOQUEO Y DESPERTARES DE AUDIO FORZADO
// ========================================================
let audioDesbloqueado = false;

function despertarAudioForzado() {
  if (audioDesbloqueado) return;

  const audioRecibido = document.getElementById("sonido-recibido");
  const audioEnviado = document.getElementById("sonido-enviado");

  const activarAudio = (elem) => {
    if (!elem) return Promise.resolve(false);
    elem.volume = 0.01;
    return elem.play()
      .then(() => {
        elem.pause();
        elem.currentTime = 0;
        elem.volume = 1.0;
        return true;
      })
      .catch((e) => {
        console.log("Intento de activación de audio diferido:", e);
        return false;
      });
  };

  Promise.all([activarAudio(audioRecibido), activarAudio(audioEnviado)]).then((resultados) => {
    // Si al menos un elemento de audio se activó correctamente
    if (resultados.some((res) => res === true)) {
      audioDesbloqueado = true;
      console.log("🔊 Motor de audio despertado y listo para todas las pantallas.");

      // Retiramos los eventos solo cuando la activación ha sido exitosa
      document.removeEventListener("click", despertarAudioForzado);
      document.removeEventListener("touchstart", despertarAudioForzado);
      document.removeEventListener("pointerdown", despertarAudioForzado);
    }
  });
}

// Escuchadores de interacción inicial (Sin 'once: true' para reintentar si el navegador falla la primera vez)
document.addEventListener("click", despertarAudioForzado);
document.addEventListener("touchstart", despertarAudioForzado);
document.addEventListener("pointerdown", despertarAudioForzado);

// 🔊 FUNCIÓN DE REPRODUCCIÓN Y VIBRACIÓN CON DIAGNÓSTICO EN CONSOLA
window.reproducirSonidoRecibido = function (contactoUid = null) {
  console.log("🔔 Intentando reproducir sonido para el contacto:", contactoUid);

  // 1. Verificar si las notificaciones generales están desactivadas
  const notifEstado = localStorage.getItem("movachat-notificaciones");
  if (notifEstado === "desactivado") {
    console.warn("🚫 Notificaciones globales desactivadas en LocalStorage.");
    return;
  }

  // 2. Verificar si este contacto específico está silenciado
  if (contactoUid) {
    const tiempoGuardado = localStorage.getItem(`silenciado_hasta_${contactoUid}`);
    if (tiempoGuardado) {
      if (tiempoGuardado === "indefinido") {
        console.warn("🔇 Contacto silenciado de forma indefinida.");
        return;
      }
      const hastaMs = parseInt(tiempoGuardado, 10);
      if (Date.now() < hastaMs) {
        console.warn("🔇 Contacto silenciado temporalmente (Tiempo vigente).");
        return;
      }
    }
  }

  // 3. VIBRACIÓN HÁPTICA (Se dispara primero)
  if ("vibrate" in navigator) {
    try {
      navigator.vibrate([200, 100, 200]);
      console.log("📳 Vibración ejecutada.");
    } catch (e) {
      console.warn("⚠️ No se pudo activar la vibración:", e);
    }
  }

  // 4. REPRODUCCIÓN DE AUDIO (Usando la etiqueta HTML)
  const audioRecibido = document.getElementById("sonido-recibido");
  if (audioRecibido) {
    audioRecibido.currentTime = 0;
    audioRecibido.play()
      .then(() => console.log("🔊 ¡Sonido reproducido con éxito!"))
      .catch((err) => {
        console.error("❌ Chrome bloqueó la reproducción de audio:", err);
        if (typeof despertarAudioForzado === "function") despertarAudioForzado();
      });
  } else {
    console.error("❌ No se encontró el elemento HTML <audio id='sonido-recibido'>");
  }
};

// 🔊 Función para reproducir sonido de mensaje enviado
window.reproducirSonidoEnviado = function () {
  const audioEnviado = document.getElementById("sonido-enviado");
  if (audioEnviado) {
    audioEnviado.currentTime = 0;
    audioEnviado.play().catch(() => {
      despertarAudioForzado();
    });
  }
};

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

const contactosRegistradosSet = new Set();

// 🟢 Cargar presencia y escuchadores de chats activos (OPTIMIZADO ANTI-CALENTAMIENTO)
function cargarContactosAprobados(usuarioActualUid) {
  const contenedorContactos = document.getElementById("lista-chats-principal");
  if (!contenedorContactos) return;

  const usuariosRef = ref(db, 'usuarios');
  const fijadosRef = ref(db, `fijados/${usuarioActualUid}`);

  // 1. Obtener fijados solo una vez al cargar
  get(fijadosRef).then((snapFijados) => {
    const fijadosBD = snapFijados.exists() ? snapFijados.val() : {};

    // 2. Obtener usuarios solo una vez al cargar
    get(usuariosRef).then((snapshot) => {
      try {
        if (snapshot.exists()) {
          const usuarios = snapshot.val();

          Object.keys(usuarios).forEach((uid) => {
            const usuario = usuarios[uid];

            // 3. Registrar el escuchador SOLO SI NO se ha registrado previamente
            if (usuario && uid !== usuarioActualUid && usuario.estadoAcceso === "aprobado") {
              if (!contactosRegistradosSet.has(uid)) {
                contactosRegistradosSet.add(uid);

                if (typeof escucharUltimoMensajeContacto === "function") {
                  escucharUltimoMensajeContacto(usuarioActualUid, uid, usuario, fijadosBD);
                }
              }
            }
          });
        }
      } catch (e) {
        console.error("Error al sincronizar contactos con la lista de chats:", e);
      }
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

  // 🎧 ESCUCHAR CAMBIOS DE ESTADO DE LOS 2 LEDS EN TIEMPO REAL
  if (window.desuscribirLedContacto) window.desuscribirLedContacto();

  const contactoRef = ref(db, `usuarios/${uidTarget}`);
  window.desuscribirLedContacto = onValue(contactoRef, (snapshot) => {
    if (snapshot.exists()) {
      const datosFresh = snapshot.val();
      if (typeof window.actualizarDobleLedContacto === "function") {
        window.actualizarDobleLedContacto(datosFresh);
      }
    }
  });

  // ↪️ VERIFICAR SI HAY UN PAQUETE DE REENVÍO PENDIENTE
  if (window.objetoPendienteReenviar) {
    const cajaEntrada = document.getElementById("input-chat-privado") || (typeof inputChat !== "undefined" ? inputChat : null);

    window.mensajeReenviadoActivo = { ...window.objetoPendienteReenviar };
    window.objetoPendienteReenviar = null;

    if (cajaEntrada) {
      cajaEntrada.value = window.mensajeReenviadoActivo.texto;
      cajaEntrada.readOnly = true; // 🔒 BLOQUEAR EDICIÓN DEL TEXTO REENVIADO

      // Banner flotante elegante
      let vistaPreviaReenvio = document.getElementById("vista-previa-reenvio");
      if (!vistaPreviaReenvio) {
        vistaPreviaReenvio = document.createElement("div");
        vistaPreviaReenvio.id = "vista-previa-reenvio";

        const pieDeChat = cajaEntrada.closest(".footer-chat") || cajaEntrada.closest(".caja-input-privado") || cajaEntrada.parentElement.parentElement;

        if (pieDeChat && pieDeChat.parentNode) {
          pieDeChat.parentNode.insertBefore(vistaPreviaReenvio, pieDeChat);
        } else if (cajaEntrada.parentElement) {
          cajaEntrada.parentElement.insertBefore(vistaPreviaReenvio, cajaEntrada);
        }
      }

      // ❌ CONTENEDOR SEGURO PARA EL BOTÓN DE CANCELAR
      vistaPreviaReenvio.innerHTML = `
        <div style="display: flex; align-items: center; gap: 6px; overflow: hidden;">
          <i data-lucide="forward" style="width: 14px; height: 14px; stroke: #00f2fe; flex-shrink: 0;"></i>
          <span>Reenviando mensaje de <b>${window.mensajeReenviadoActivo.autorOriginal}</b></span>
        </div>
        <span id="btn-cancelar-reenvio" style="cursor: pointer; opacity: 0.8; flex-shrink: 0; padding: 4px; display: flex; align-items: center;">
          <i data-lucide="x" style="width: 16px; height: 16px; pointer-events: none;"></i>
        </span>
      `;

      if (window.lucide) window.lucide.createIcons({ targets: [vistaPreviaReenvio] });

      const btnCancelar = document.getElementById("btn-cancelar-reenvio");
      if (btnCancelar) {
        btnCancelar.onclick = (e) => {
          e.stopPropagation();
          window.mensajeReenviadoActivo = null;
          cajaEntrada.value = "";
          cajaEntrada.readOnly = false; // 🔓 DESBLOQUEAR CAJA AL CANCELAR
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

// 📌 ESCUCHAR MENSAJES Y CHECKS DE LECTURA EN TIEMPO REAL (CORREGIDO)
let listenerEscribiendoActivo = null;
let listenerLecturaActivo = null;
let listenerPresenciaContactoActivo = null;

function escucharMensajesChat(chatId) {
  const contenedorHistorial = document.querySelector(".historial-mensajes");
  if (!contenedorHistorial) return;

  // 1. 🧹 CANCELAR SUSCRIPCIONES ANTERIORES
  if (typeof listenerChatActivo === "function") {
    listenerChatActivo();
    listenerChatActivo = null;
  }
  if (typeof listenerConfigActivo === "function") {
    listenerConfigActivo();
    listenerConfigActivo = null;
  }
  if (typeof listenerEscribiendoActivo === "function") {
    listenerEscribiendoActivo();
    listenerEscribiendoActivo = null;
  }
  if (typeof listenerLecturaActivo === "function") {
    listenerLecturaActivo();
    listenerLecturaActivo = null;
  }
  if (typeof listenerPresenciaContactoActivo === "function") {
    listenerPresenciaContactoActivo();
    listenerPresenciaContactoActivo = null;
  }

  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  const contactoUid = window.contactoActivoUid;
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);
  const configRef = ref(db, `chats/${chatId}/config/temporales`);

  // 2. Escuchar mensajes temporales
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

  // 💬 3. ESCUCHAR SI EL OTRO USUARIO ESTÁ ESCRIBIENDO
  if (contactoUid) {
    const escribiendoContactoRef = ref(db, `escribiendo/${chatId}/${contactoUid}`);
    listenerEscribiendoActivo = onValue(escribiendoContactoRef, (snapEscribiendo) => {
      const estaEscribiendo = snapEscribiendo.exists() && snapEscribiendo.val() === true;
      const elemHistorial = document.querySelector(".historial-mensajes");
      if (!elemHistorial) return;

      let burbujaEscribiendo = document.getElementById("burbuja-escribiendo-animada");

      if (estaEscribiendo) {
        if (!burbujaEscribiendo) {
          burbujaEscribiendo = document.createElement("div");
          burbujaEscribiendo.id = "burbuja-escribiendo-animada";
          burbujaEscribiendo.className = "mensaje-burbuja recibido burbuja-escribiendo";
          burbujaEscribiendo.innerHTML = `
            <div class="puntos-escribiendo-anim">
              <span></span>
              <span></span>
              <span></span>
            </div>
          `;
          elemHistorial.appendChild(burbujaEscribiendo);
          elemHistorial.scrollTop = elemHistorial.scrollHeight;
        }
      } else {
        if (burbujaEscribiendo) {
          burbujaEscribiendo.remove();
        }
      }
    });
  }

  // 👁️ 4. ESCUCHAR EN TIEMPO REAL CUÁNDO EL RECEPTOR LEE LOS MENSAJES
  let ultimoLeidoKeyReceptor = "";
  if (contactoUid && miUid) {
    const lecturaReceptorRef = ref(db, `lecturas/${contactoUid}/${miUid}`);
    listenerLecturaActivo = onValue(lecturaReceptorRef, (snapLectura) => {
      ultimoLeidoKeyReceptor = snapLectura.exists() ? snapLectura.val() : "";
      if (typeof actualizarChecksEnPantalla === "function") {
        actualizarChecksEnPantalla(ultimoLeidoKeyReceptor);
      }
    });
  }

  // 🟢 5. ESCUCHAR LA PRESENCIA EN VIVO DEL RECEPTOR
  let estaEnAppReceptorLive = false;
  if (contactoUid) {
    const presenciaContactoRef = ref(db, `usuarios/${contactoUid}/presenciaReal`);
    listenerPresenciaContactoActivo = onValue(presenciaContactoRef, (snapPresencia) => {
      estaEnAppReceptorLive = snapPresencia.exists() && snapPresencia.val() === true;

      // Si el contacto se desconecta, refrescar visualmente los mensajes no leídos a 1 check
      document.querySelectorAll(".indicador-checks-mova").forEach((contenedor) => {
        const esLeido = contenedor.classList.contains("leido");
        if (!esLeido) {
          if (estaEnAppReceptorLive) {
            contenedor.className = "indicador-checks-mova entregado";
            contenedor.innerHTML = `<i data-lucide="check-check"></i>`;
          } else {
            contenedor.className = "indicador-checks-mova enviado";
            contenedor.innerHTML = `<i data-lucide="check"></i>`;
          }
        }
      });

      if (window.lucide) {
        window.lucide.createIcons({ targets: document.querySelectorAll(".indicador-checks-mova") });
      }
    });
  }

  let esCargaInicial = true;

  // 🚀 6. ESCUCHAR MENSAJES EN TIEMPO REAL
  listenerChatActivo = onValue(mensajesRef, (snapshot) => {
    const elemHistorial = document.querySelector(".historial-mensajes");
    if (!elemHistorial) return;

    Promise.all([
      miUid && contactoUid ? get(ref(db, `vaciados/${miUid}/${contactoUid}`)) : Promise.resolve(null),
      miUid && contactoUid ? get(ref(db, `bloqueos/${miUid}/${contactoUid}`)) : Promise.resolve(null)
    ]).then(([snapVaciado, snapBloqueo]) => {

      const timestampUltimoVaciado = (snapVaciado && snapVaciado.exists()) ? snapVaciado.val() : 0;
      const estaBloqueadoElContacto = (snapBloqueo && snapBloqueo.exists()) ? (snapBloqueo.val() === true) : false;

      elemHistorial.innerHTML = "";

      if (snapshot.exists()) {
        const mensajes = snapshot.val();
        const keysMensajes = Object.keys(mensajes);

        // Marcar como leído ÚNICAMENTE si el chat privado está visible en pantalla
        const pantallaChat = document.getElementById("pantalla-chat-privado");
        const chatEstaAbierto = (window.contactoActivoUid === contactoUid) &&
          pantallaChat &&
          (pantallaChat.style.display === "flex" || pantallaChat.classList.contains("pantalla-completa"));

        const ultimoMsgKey = keysMensajes[keysMensajes.length - 1];
        const ultimoMsgObj = mensajes[ultimoMsgKey];

        if (chatEstaAbierto && ultimoMsgObj && (ultimoMsgObj.emisor || ultimoMsgObj.emisorUid) !== miUid && miUid && contactoUid) {
          set(ref(db, `lecturas/${miUid}/${contactoUid}`), ultimoMsgKey);
        }

        keysMensajes.forEach((msgId) => {
          const msg = mensajes[msgId];
          if (!msg) return;

          const msgTimestamp = msg.timestamp || 0;
          if (msgTimestamp <= timestampUltimoVaciado) return;

          const idEmisorReal = msg.emisor || msg.emisorUid || msg.remitente || msg.remitenteId || msg.uid;
          const esMio = idEmisorReal === miUid;

          if (estaBloqueadoElContacto && !esMio) return;

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

          // 🟢 CORRECCIÓN: DEFINICIÓN DE TIEMPO PARA MENSAJES EN VIVO
          const haceCuantoEnviado = Date.now() - (msg.timestamp || 0);
          const esMensajeNuevoEnVivo = haceCuantoEnviado < 5000;
          const esElUltimoMensaje = (msgId === keysMensajes[keysMensajes.length - 1]);

          // 🛡️ ESCUDO ANTI-DUPLICADOS: Evita que un mensaje suene varias veces si editan o recargan
          window.mensajesNotificados = window.mensajesNotificados || new Set();
          const yaSono = window.mensajesNotificados.has(msgId);

          if (!esCargaInicial && !esMio && esMensajeNuevoEnVivo && !estaBloqueadoElContacto && esElUltimoMensaje && !yaSono) {

            window.mensajesNotificados.add(msgId); // 👈 Marcar como reproducido

            const textoNotif = msg.texto || msg.contenido || "Te envió un mensaje";
            const nombreRemitente = msg.nombreEmisor || msg.remitente || "Amigo";
            const fotoRemitente = msg.avatar || msg.fotoUrl || "assets/logo.png";

            if (typeof notificarNuevoMensaje === "function") {
              notificarNuevoMensaje(nombreRemitente, textoNotif, fotoRemitente);
            }

            // 🔊 DISPARAR REPRODUCCIÓN Y VIBRACIÓN
            if (typeof window.reproducirSonidoRecibido === "function") {
              window.reproducirSonidoRecibido(idEmisorReal);
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

          // ⚡ EVALUACIÓN INDEPENDIENTE POR CADA MENSAJE
          let htmlChecks = "";
          if (esMio) {
            let claseChecks = "enviado";
            let iconoLucide = "check";

            // Verificar si este mensaje específico es igual o anterior al último leído
            const esLeido = ultimoLeidoKeyReceptor && (keysMensajes.indexOf(msgId) <= keysMensajes.indexOf(ultimoLeidoKeyReceptor));

            if (esLeido) {
              claseChecks = "leido";
              iconoLucide = "check-check";
            } else if (estaEnAppReceptorLive) {
              claseChecks = "entregado";
              iconoLucide = "check-check";
            }

            htmlChecks = `
              <span class="indicador-checks-mova ${claseChecks}" data-msg-id="${msgId}">
                <i data-lucide="${iconoLucide}"></i>
              </span>
            `;
          }

          let contenidoBurbuja = "";
          let estiloEspecialBurbuja = "";

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
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
            `;
          } else if (msg.tipoAdjunto === 'documento') {
            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="contenedor-documento-enviado" style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">
                <i data-lucide="file-text" style="color: #00f2fe; width:24px; height:24px;"></i>
                <span style="font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">${msg.nombreDoc || "Documento"}</span>
              </div>
              ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
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
              <span class="mensaje-hora" style="margin-top: 6px; display: block; text-align: center;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
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
              <span class="mensaje-hora" style="margin-top: 4px;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
            `;
          } else {
            contenidoBurbuja = `
              ${htmlReenviado}
              <p class="mensaje-texto">${msg.texto || ''}</p>
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
            `;
          }

          const burbujaHTML = document.createElement("div");
          burbujaHTML.className = `mensaje-burbuja ${esMio ? 'enviado' : 'recibido'} ${msg.esEfimero ? 'mensaje-efimero' : ''}`;
          burbujaHTML.setAttribute("data-msg-id", msgId);
          burbujaHTML.setAttribute("data-timestamp", msg.timestamp || Date.now());
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

// 🔄 FUNCIÓN AUXILIAR PARA RE-PINTAR PALOMITAS A NEÓN AL LEER EN VIVO
function actualizarChecksEnPantalla(ultimoKeyLeido) {
  if (!ultimoKeyLeido) return;

  const contenedoresChecks = document.querySelectorAll(".indicador-checks-mova");
  let alcanzadoLeido = false;

  // Convertir nodos a Array y recorrerlos de abajo hacia arriba
  const listaInvertida = Array.from(contenedoresChecks).reverse();

  listaInvertida.forEach((contenedor) => {
    const msgId = contenedor.getAttribute("data-msg-id");

    if (msgId === ultimoKeyLeido) {
      alcanzadoLeido = true;
    }

    if (alcanzadoLeido) {
      contenedor.className = "indicador-checks-mova leido";
      contenedor.innerHTML = `<i data-lucide="check-check"></i>`;
    }
  });

  if (window.lucide) {
    window.lucide.createIcons({ targets: document.querySelectorAll(".indicador-checks-mova.leido") });
  }
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

  // 🌐 Enlazar los botones de redes sociales del perfil
  conectarRedesSociales();

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

  // 5️⃣ Conectar el interruptor de notificaciones con el permiso del navegador (CORREGIDO)
  const toggleNotificaciones = document.getElementById("check-notificaciones");
  if (toggleNotificaciones) {
    toggleNotificaciones.addEventListener("change", async () => {
      if (toggleNotificaciones.checked) {
        const concedido = await solicitarPermisoNotificaciones();
        if (concedido) {
          localStorage.setItem("movachat-notificaciones", "activado");
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("¡Notificaciones activadas con éxito! 🚀", "🔔", "#00f2fe");
          }
        } else {
          toggleNotificaciones.checked = false;
          localStorage.setItem("movachat-notificaciones", "desactivado");
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Por favor permite las notificaciones en tu navegador ⚙️", "⚠️", "#ff4b2b");
          }
        }
      } else {
        // 🔕 Guardar en memoria cuando el usuario apaga manualmente el interruptor
        localStorage.setItem("movachat-notificaciones", "desactivado");
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Notificaciones de la app desactivadas 🔕", "🔕", "#ff4b2b");
        }
      }
    });
  }

});

// 🔔 5. NOTIFICACIONES PUSH NATIVAS (Versión unificada)
window.notificarNuevoMensaje = function (nombreRemitente, textoMensaje, avatarUrl) {
  const estaSilenciado = localStorage.getItem("movachat-notificaciones") === "desactivado";
  if (estaSilenciado) return;

  // Si la app está en segundo plano o minimizada
  if (document.hidden && Notification.permission === "granted") {
    const opciones = {
      body: textoMensaje || "Te ha enviado un mensaje.",
      icon: avatarUrl || "assets/logo/icon-192.png",
      badge: "assets/logo/icon-192.png",
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

// 🌐 DETECTOR DE ESTADO DE RED EN TIEMPO REAL
window.addEventListener("online", () => {
  if (typeof mostrarAvisoPremium === "function") {
    mostrarAvisoPremium("Conexión restablecida 🟢", "📡", "#00f2fe");
  }
});

window.addEventListener("offline", () => {
  if (typeof mostrarAvisoPremium === "function") {
    mostrarAvisoPremium("Sin conexión a Internet. Modo Offline 🔴", "⚠️", "#ff4b2b");
  }
});

// 🟢 AUTO-SCROLL UNIVERSAL PARA TECLADOS LENTOS Y SUPERPUESTOS
const inputMensaje = document.getElementById("input-chat-privado");
const contenedorMensajes = document.querySelector(".historial-mensajes");

function forzarScrollAlUltimoMensaje() {
  if (!contenedorMensajes) return;

  // Buscar la última burbuja visible
  const ultimoMensaje = contenedorMensajes.lastElementChild;
  if (ultimoMensaje) {
    ultimoMensaje.scrollIntoView({ behavior: "smooth", block: "end" });
  } else {
    contenedorMensajes.scrollTop = contenedorMensajes.scrollHeight;
  }
}

if (inputMensaje) {
  // 1. Disparo inmediato al tocar la caja
  inputMensaje.addEventListener("focus", () => {
    setTimeout(forzarScrollAlUltimoMensaje, 100);
    setTimeout(forzarScrollAlUltimoMensaje, 350); // Para teléfonos con teclados lentos
  });

  // 2. Detección exacta en el instante en que el teclado termina de desplegarse
  if (window.visualViewport) {
    window.visualViewport.addEventListener("resize", () => {
      if (document.activeElement === inputMensaje) {
        forzarScrollAlUltimoMensaje();
      }
    });
  }
}

// ⚡ CONTROLADOR MODO AHORRO DE BATERÍA / RENDIMIENTO
(function inicializarModoAhorro() {
  const toggleAhorro = document.getElementById("check-ahorro");
  const ahorroGuardado = localStorage.getItem("movachat-ahorro-bateria") === "activo";

  // Cargar preferencia al iniciar
  if (ahorroGuardado) {
    document.body.classList.add("modo-ahorro");
    if (toggleAhorro) toggleAhorro.checked = true;
  }

  // Escuchar el interruptor
  document.addEventListener("change", (e) => {
    if (!e.target || e.target.id !== "check-ahorro") return;

    const estaActivo = e.target.checked;

    if (estaActivo) {
      document.body.classList.add("modo-ahorro");
      localStorage.setItem("movachat-ahorro-bateria", "activo");
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Modo Ahorro activado: Máxima fluidez ⚡", "🔋", "#00f2fe");
      }
    } else {
      document.body.classList.remove("modo-ahorro");
      localStorage.setItem("movachat-ahorro-bateria", "inactivo");
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Modo Neón reactivado: Efectos completos 🌌", "✨", "#00f2fe");
      }
    }
  });
})();