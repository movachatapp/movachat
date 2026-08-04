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

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

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

// --- MOSTRAR / OCULTAR CONTRASEÑA (ÚNICO LISTENER UNIFICADO) ---
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btn-toggle-password");
  if (!btn) return;

  e.preventDefault();
  const inputPass = document.getElementById("auth-password");
  if (!inputPass) return;

  const esPassword = inputPass.type === "password";
  inputPass.type = esPassword ? "text" : "password";

  const icono = btn.querySelector("[data-lucide]") || btn.querySelector("svg");
  if (icono) {
    icono.setAttribute("data-lucide", esPassword ? "eye-off" : "eye");
    if (window.lucide) {
      window.lucide.createIcons({ targets: [btn] });
    }
  }
});

// 👁️ Función global para compatibilidad con el onclick del HTML
window.togglePasswordVisibility = function () {
  const btn = document.getElementById("btn-toggle-password");
  if (btn) btn.click();
};

// --- MOSTRAR / OCULTAR CONTRASEÑA ---
window.togglePasswordVisibility = function () {
  const inputPass = document.getElementById("auth-password");
  const btn = document.getElementById("btn-toggle-password");

  if (inputPass) {
    const esPassword = inputPass.type === "password";
    inputPass.type = esPassword ? "text" : "password";

    if (btn) {
      const icono = btn.querySelector("[data-lucide]") || btn.querySelector("svg");
      if (icono) {
        icono.setAttribute("data-lucide", esPassword ? "eye-off" : "eye");
        if (window.lucide) {
          window.lucide.createIcons({ targets: [btn] });
        }
      }
    }
  }
};

// Listener alternativo por si el usuario hace clic directo
document.addEventListener("click", (e) => {
  const btn = e.target.closest("#btn-toggle-password");
  if (!btn) return;
  e.preventDefault();
  window.togglePasswordVisibility();
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
        const usernameGenerado = nombre.toLowerCase().replace(/\s+/g, "").replace(/[^a-z0-9]/g, "");

        const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
        const user = userCredential.user;

        await updateProfile(user, { displayName: nombre });

        await set(ref(db, 'usuarios/' + user.uid), {
          uid: user.uid,
          nombre: nombre,
          username: usernameGenerado,
          correo: correo,
          estado: "🚀 Nuevo en MovaChat",
          fotoUrl: "",
          rol: "usuario",
          estadoAcceso: "pendiente",
          fechaRegistro: Date.now()
        });

        await signOut(auth);

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
  if (user) {
    try {
      const snapshot = await get(ref(db, 'usuarios/' + user.uid));

      if (snapshot.exists()) {
        const datosUsuario = snapshot.val();
        const estadoAcceso = datosUsuario.estadoAcceso || "pendiente";

        if (estadoAcceso === "aprobado") {
          if (authPantalla) authPantalla.style.display = "none";
          console.log("🟢 Acceso concedido:", datosUsuario.nombre || user.email);

          const elemNombrePerfil = document.getElementById("perfil-nombre") || document.querySelector(".nombre-usuario");
          const elemUsernamePerfil = document.getElementById("perfil-username") || document.querySelector(".username-usuario");
          const elemEmailPerfil = document.getElementById("perfil-email") || document.querySelector(".email-usuario");
          const elemFotoPerfil = document.getElementById("perfil-foto") || document.querySelector(".foto-usuario");

          if (elemNombrePerfil) elemNombrePerfil.textContent = datosUsuario.nombre || "Usuario";
          if (elemUsernamePerfil) elemUsernamePerfil.textContent = datosUsuario.username ? `@${datosUsuario.username}` : `@${(datosUsuario.nombre || "user").toLowerCase().replace(/\s+/g, "")}`;
          if (elemEmailPerfil) elemEmailPerfil.textContent = datosUsuario.correo || user.email;
          if (elemFotoPerfil && datosUsuario.fotoUrl) elemFotoPerfil.src = datosUsuario.fotoUrl;

          if (typeof cargarContactosAprobados === "function") {
            cargarContactosAprobados(user.uid);
          }

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
          await signOut(auth);
          if (authPantalla) authPantalla.style.display = "flex";

          const mensaje = estadoAcceso === "baneado"
            ? "⛔ Tu cuenta ha sido suspendida."
            : "⏳ Tu cuenta está en revisión por el Administrador. Intenta ingresar cuando seas aprobado.";

          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium(mensaje, "🔒", "#ffb703");
          } else {
            alert(mensaje);
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

window.reproducirSonido = function(tipo) {
  if (window.sonidosApp && window.sonidosApp[tipo]) {
    window.sonidosApp[tipo].currentTime = 0;
    window.sonidosApp[tipo].play().catch(() => {});
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

function filtrarYRenderizar() {
  if (!contenedorChats) return;
  const textoBusqueda = inputBuscador ? inputBuscador.value.toLowerCase().trim() : "";
  contenedorChats.innerHTML = "";

  let totalNoLeidos = 0;

  chatsFalsosData.forEach(chat => {
    if (chat.unread) totalNoLeidos++;
  });

  chatsOriginalesHTML.forEach(tarjeta => {
    if (tarjeta.querySelector(".badge-mensaje")) totalNoLeidos++;
  });

  const badgeFiltro = document.querySelector(".caja-filtros .badge-filtro");
  if (badgeFiltro) {
    badgeFiltro.textContent = totalNoLeidos;
  }

  chatsOriginalesHTML.forEach((tarjeta) => {
    const nombreElem = tarjeta.querySelector(".chat-nombre");
    const nombre = nombreElem ? nombreElem.textContent.toLowerCase() : "";
    const tieneBadge = tarjeta.querySelector(".badge-mensaje") !== null;

    let pasaFiltro = false;
    if (filtroActual === "todos") pasaFiltro = true;
    if (filtroActual === "no-leidos" && tieneBadge) pasaFiltro = true;

    if (pasaFiltro && nombre.includes(textoBusqueda)) {
      contenedorChats.appendChild(tarjeta);
    }
  });

  chatsFalsosData.forEach((chat) => {
    let pasaFiltro = false;
    if (filtroActual === "todos") pasaFiltro = true;
    if (filtroActual === "no-leidos" && chat.unread) pasaFiltro = true;

    const coincideBusqueda = chat.nombre.toLowerCase().includes(textoBusqueda);

    if (pasaFiltro && coincideBusqueda) {
      const badgeHTML = chat.unread ? `<div class="badge-mensaje">1</div>` : "";
      const avatarHTML = chat.group
        ? `<div class="avatar-grupo"><i data-lucide="users"></i></div>`
        : `<img src="https://i.pravatar.cc/150?img=${chat.img}" alt="${chat.nombre}">`;

      const tarjetaFalsa = `
        <div class="tarjeta-chat" data-uid="${chat.uid || ''}">
          <div class="chat-avatar-caja">
            ${avatarHTML}
            ${chat.group ? "" : `<span class="punto-online-chat" style="--led-color: ${chat.led || '#00f2fe'};"></span>`}
          </div>
          <div class="chat-info">
            <div class="chat-cabecera">
              <h4 class="chat-nombre">${chat.nombre}</h4>
              <span class="chat-hora ${chat.unread ? 'texto-cyan' : ''}">12:00 PM</span>
            </div>
            <div class="chat-mensaje-caja">
              <p class="chat-texto ${chat.unread ? 'texto-resaltado' : ''}">${chat.msg}</p>
              ${badgeHTML}
            </div>
          </div>
        </div>`;
      contenedorChats.insertAdjacentHTML('beforeend', tarjetaFalsa);
    }
  });

  if (window.lucide) {
    window.lucide.createIcons({ targets: [contenedorChats] });
  }
}

if (contenedorChats) {
  contenedorChats.addEventListener("click", (e) => {
    const tarjeta = e.target.closest(".tarjeta-chat");
    if (!tarjeta) return;

    const menuTarjetas = document.getElementById("menu-tarjetas-chat");
    if (typeof bloquarClickFantasma !== "undefined" && bloquarClickFantasma || (menuTarjetas && !menuTarjetas.classList.contains("oculto"))) {
      return;
    }

    if (isLongPress) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }

    if (e.target.closest(".chat-avatar-caja")) {
      e.stopPropagation();
      const tieneEstado = tarjeta.dataset.estadoUrl;
      if (tieneEstado && typeof abrirEstadoAmigo === "function") {
        abrirEstadoAmigo(tarjeta.dataset.estadoUrl, tarjeta.dataset.estadoTexto || "");
      }
      return;
    }

    const nombreSeleccionado = tarjeta.querySelector(".chat-nombre").textContent;
    const textoEstadoCabecera = document.querySelector(".amigo-datos .amigo-estado-texto");
    const ledSuperiorEnfoque = document.getElementById("led-enfoque-app");

    document.querySelector(".amigo-nombre-chat").textContent = nombreSeleccionado;

    if (typeof cargarMensajesDeAmigo === "function") {
      cargarMensajesDeAmigo(nombreSeleccionado, historialMensajes);
    }

    const srcImg = tarjeta.querySelector("img") ? tarjeta.querySelector("img").src : "";
    if (srcImg) document.querySelector(".avatar-mini-caja img").src = srcImg;

    if (encabezadoGlobal) encabezadoGlobal.style.display = "none";
    if (menuFlotanteGlobal) menuFlotanteGlobal.style.display = "none";
    if (pantallaChatPrivado) pantallaChatPrivado.classList.add("pantalla-completa");

    if (typeof switchPantalla === "function") {
      switchPantalla(pantallaChatPrivado, pantallaChats, pantallaPerfil, pantallaBienvenida);
    }

    if (historialMensajes) historialMensajes.scrollTop = historialMensajes.scrollHeight;

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
  btnOpcionesChat.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menuCabecera) menuCabecera.classList.toggle("oculto");
    if (menuAdjuntar) menuAdjuntar.classList.add("oculto");
    if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

    const rect = btnOpcionesChat.getBoundingClientRect();
    const marco = document.querySelector(".contenedor-chat");
    if (marco && menuCabecera) {
      const marcoRect = marco.getBoundingClientRect();
      menuCabecera.style.right = "20px";
      menuCabecera.style.left = "auto";
      menuCabecera.style.top = `${rect.bottom - marcoRect.top + 10}px`;
    }
  });
}

if (btnAdjuntarTodo) {
  btnAdjuntarTodo.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menuAdjuntar) menuAdjuntar.classList.toggle("oculto");
    if (menuCabecera) menuCabecera.classList.add("oculto");
    if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

    if (menuAdjuntar && !menuAdjuntar.classList.contains("oculto")) {
      btnAdjuntarTodo.classList.add("caiman-abierto");
    } else {
      btnAdjuntarTodo.classList.remove("caiman-abierto");
    }

    const rect = btnAdjuntarTodo.getBoundingClientRect();
    const marco = document.querySelector(".contenedor-chat");
    if (marco && menuAdjuntar) {
      const marcoRect = marco.getBoundingClientRect();
      menuAdjuntar.style.left = "20px";
      menuAdjuntar.style.right = "auto";
      menuAdjuntar.style.top = `${rect.top - marcoRect.top - 170}px`;
    }
  });
}

if (btnCamaraMovaPro) {
  btnCamaraMovaPro.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menuAdjuntar) menuAdjuntar.classList.add("oculto");
    if (menuCamaraPro) menuCamaraPro.classList.remove("oculto");

    const rect = btnAdjuntarTodo.getBoundingClientRect();
    const marco = document.querySelector(".contenedor-chat");
    if (marco && menuCamaraPro) {
      const marcoRect = marco.getBoundingClientRect();
      menuCamaraPro.style.left = "20px";
      menuCamaraPro.style.right = "auto";
      menuCamaraPro.style.top = `${rect.top - marcoRect.top - 165}px`;
    }
  });
}

if (btnCancelarCamara) {
  btnCancelarCamara.addEventListener("click", (e) => {
    e.stopPropagation();
    if (menuCamaraPro) menuCamaraPro.classList.add("oculto");
    if (menuAdjuntar) menuAdjuntar.classList.remove("oculto");
  });
}

const btnGaleriaMenu = document.querySelector("#menu-adjuntar-files button:nth-of-type(1)");
if (btnGaleriaMenu) {
  btnGaleriaMenu.addEventListener("click", () => {
    if (inputRealGaleria) inputRealGaleria.click();
    if (menuAdjuntar) menuAdjuntar.classList.add("oculto");
  });
}

const btnDocMenu = document.querySelector("#menu-adjuntar-files button:nth-of-type(2)");
if (btnDocMenu) {
  btnDocMenu.addEventListener("click", () => {
    if (inputRealDocumento) inputRealDocumento.click();
    if (menuAdjuntar) menuAdjuntar.classList.add("oculto");
  });
}

// ========================================================
// 🎥 MOTOR CÁMARA CIRCULAR CON RECORTADOR FÍSICO A 10S
// ========================================================
async function activarCamaraMovaPro(tipoMedia) {
  const menuCamaraPro = document.getElementById("menu-camara-pro");
  if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

  if (tipoMedia === "foto") {
    const inputCamara = document.createElement("input");
    inputCamara.type = "file";
    inputCamara.accept = "image/*";

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

        if (btnAccionChat) {
          btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
          if (window.lucide) {
            window.lucide.createIcons({ targets: [btnAccionChat] });
          }
        }
      }
    };

    inputCamara.click();
    return;
  }

  const modalCamara = document.getElementById("modal-camara-circular");
  const videoVisor = document.getElementById("video-visor-camara");
  const btnGrabar = document.getElementById("btn-iniciar-grabar-live");
  const txtContador = document.getElementById("contador-camara-10s");

  if (modalCamara && videoVisor) {
    if (txtContador) txtContador.textContent = "00:10";
    if (btnGrabar) {
      btnGrabar.textContent = "● Grabar";
      btnGrabar.disabled = false;
    }
    modalCamara.classList.remove("oculto");
  }

  try {
    if (typeof streamCamaraLive !== "undefined" && streamCamaraLive) {
      streamCamaraLive.getTracks().forEach(track => track.stop());
    }

    window.streamCamaraLive = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user" },
      audio: true
    });

    if (videoVisor) videoVisor.srcObject = window.streamCamaraLive;

  } catch (e) {
    console.warn("Entorno sin cámara directa. Usando captura nativa:", e);
    if (modalCamara) modalCamara.classList.add("oculto");

    const inputVideoDirecto = document.createElement("input");
    inputVideoDirecto.type = "file";
    inputVideoDirecto.accept = "video/*";
    inputVideoDirecto.capture = "user";

    inputVideoDirecto.onchange = async (evt) => {
      const archivo = evt.target.files && evt.target.files[0];
      if (!archivo) return;

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Optimizando y recortando video a 10s... ⚡", "✂️", "#00f2fe");
      }

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
            mostrarAvisoPremium("Video recortado a 10s 🛡️", "🎬", "#00f2fe");
          }
        } catch (err) {
          console.warn("Asignando original con tope:", err);
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

    if (window.lucide) {
      window.lucide.createIcons({ targets: [wrapper] });
    }
  }

  if (cajaVistaPrevia) cajaVistaPrevia.classList.remove("oculto");

  if (inputChat) {
    inputChat.placeholder = "Comentar video circular (Máx 10s)...";
    inputChat.focus();
  }

  if (btnAccionChat) {
    btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
    if (window.lucide) {
      window.lucide.createIcons({ targets: [btnAccionChat] });
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

        if (btnAccionChat) {
          btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
          if (window.lucide) {
            window.lucide.createIcons({ targets: [btnAccionChat] });
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
      if (imgMiniaturaAdjunto) imgMiniaturaAdjunto.style.display = "none";
      const wrapper = document.querySelector(".wrapper-miniatura");

      if (wrapper) {
        const iconoPrevio = wrapper.querySelector(".icono-doc-preview");
        if (iconoPrevio) iconoPrevio.remove();

        wrapper.insertAdjacentHTML("beforeend", `
          <div class="icono-doc-preview">
            <i data-lucide="file-text" style="width: 30px; height: 30px;"></i>
          </div>
        `);
        if (window.lucide) window.lucide.createIcons({ targets: [wrapper] });
      }

      if (cajaVistaPrevia) cajaVistaPrevia.classList.remove("oculto");
      if (inputChat) {
        inputChat.placeholder = `Comentar documento: ${nombreDocumentoSimulado.substring(0, 15)}...`;
        inputChat.focus();
      }

      if (btnAccionChat) {
        btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
        if (window.lucide) window.lucide.createIcons({ targets: [btnAccionChat] });
      }
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

    if (btnAccionChat) {
      btnAccionChat.innerHTML = `<i data-lucide="mic"></i>`;
      if (window.lucide) {
        window.lucide.createIcons({ targets: [btnAccionChat] });
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
  if (contadorAudio) contadorAudio.textContent = "00:00";
  timerGrabacionAudio = setInterval(() => {
    segundosGrabados++;
    let mins = Math.floor(segundosGrabados / 60).toString().padStart(2, '0');
    let secs = (segundosGrabados % 60).toString().padStart(2, '0');
    if (contadorAudio) contadorAudio.textContent = `${mins}:${secs}`;
  }, 1000);
}

function frenarCronometroAudio() {
  if (timerGrabacionAudio) clearInterval(timerGrabacionAudio);
}

// ========================================================
// 4. SISTEMA DE AUDIOS Y NOTAS DE VOZ (CONTINUACIÓN)
// ========================================================
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

  if (btnAccionChat) btnAccionChat.classList.remove("grabando-activo");
  if (panelGrabacion) panelGrabacion.classList.add("oculto");
  if (cajaInputNormal) cajaInputNormal.classList.remove("oculto");

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
// 5. ENVÍO Y EDICIÓN DE MENSAJES (PROTEGIDO ANTI-DUPLICADOS)
// ========================================================
async function enviarMensajeNuevo() {
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

  estaEnviandoMensaje = true;

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
    } catch (e) {
      console.error("Error al editar en Firebase:", e);
    }

    window.burbujaEnEdicion = null;
    window.mensajeEnEdicionId = null;
    if (inputChat) inputChat.value = "";
    if (typeof actualizarIconoBotonAccion === "function") actualizarIconoBotonAccion();

    estaEnviandoMensaje = false;
    return;
  }

  // 🟢 CASO: NUEVO MENSAJE
  let objetoMensaje = {
    emisor: miUid,
    receptor: contactoUid,
    texto: texto,
    hora: horaFormateada,
    timestamp: Date.now(),
    tipoAdjunto: null,
    urlAdjunto: null,
    nombreDoc: null
  };

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

    if (cajaVistaPrevia) cajaVistaPrevia.classList.add("oculto");
    if (imgMiniaturaAdjunto) imgMiniaturaAdjunto.src = "";
    const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();
    if (typeof tipoAdjuntoActivo !== 'undefined') tipoAdjuntoActivo = null;
    if (inputChat) inputChat.placeholder = "Escribe un mensaje privado...";
  }

  if (inputChat) inputChat.value = "";

  // 🚀 SUBIR A FIREBASE
  try {
    const listaMensajesRef = ref(db, `chats/${chatId}/mensajes`);
    const nuevoMensajeRef = push(listaMensajesRef);
    await set(nuevoMensajeRef, objetoMensaje);

    // 🔊 SONIDO UNIFICADO DE MENSAJE ENVIADO
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

    const marco = document.querySelector(".contenedor-chat");
    if (marco) {
      const marcoRect = marco.getBoundingClientRect();
      const posX = x - marcoRect.left;
      const posY = y - marcoRect.top;

      menuMensajes.style.left = `${Math.min(posX, marcoRect.width - 190)}px`;
      menuMensajes.style.top = `${Math.min(posY, marcoRect.height - 200)}px`;
    }
  }
}

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

document.querySelectorAll(".opcion-menu-ctx").forEach(boton => {
  boton.addEventListener("click", () => {
    const accion = boton.getAttribute("data-accion");

    const nodoMensaje = (typeof mensajeSeleccionadoNode !== "undefined") ? mensajeSeleccionadoNode : null;
    const nodoTexto = nodoMensaje ? nodoMensaje.querySelector(".mensaje-texto") : null;
    const textoMensaje = nodoTexto ? nodoTexto.textContent : "";
    const msgId = nodoMensaje ? nodoMensaje.getAttribute("data-msg-id") : null;

    if (accion === "copiar" && textoMensaje) {
      navigator.clipboard.writeText(textoMensaje);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Texto copiado al portapapeles 📋", "✨", "#00f2fe");
      }
    }
    else if (accion === "eliminar" && nodoMensaje) {
      nodoMensaje.style.transition = "all 0.2s ease-out";
      nodoMensaje.style.opacity = "0";
      nodoMensaje.style.transform = "scale(0.9)";

      setTimeout(() => {
        if (nodoMensaje) nodoMensaje.remove();
      }, 200);

      const usuarioActual = auth.currentUser;
      const miUid = usuarioActual ? usuarioActual.uid : null;
      const contactoUid = window.contactoActivoUid;

      if (msgId && miUid && contactoUid) {
        const chatId = typeof obtenerChatId === "function"
          ? obtenerChatId(miUid, contactoUid)
          : [miUid, contactoUid].sort().join("_");

        const mensajeRef = ref(db, `chats/${chatId}/mensajes/${msgId}`);
        set(mensajeRef, null).catch(err => console.error("Error al eliminar de Firebase:", err));
      }
    }
    else if (accion === "editar" && textoMensaje && typeof inputChat !== "undefined") {
      inputChat.value = textoMensaje;
      inputChat.focus();

      window.burbujaEnEdicion = nodoMensaje;
      window.mensajeEnEdicionId = msgId;

      if (btnAccionChat) {
        btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
        if (window.lucide) {
          window.lucide.createIcons({ targets: [btnAccionChat] });
        }
      }
    }

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
    window.mensajeEnEdicionId = null;
  }

  if (tieneTexto || tieneAdjunto) {
    btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
  } else {
    btnAccionChat.innerHTML = `<i data-lucide="mic"></i>`;
  }

  if (window.lucide) {
    window.lucide.createIcons({ targets: [btnAccionChat] });
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
    const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

    if (tieneTexto || tieneAdjunto) {
      e.preventDefault();
      enviarMensajeNuevo();
    }
  });
}

const inputBuscadorModal = document.getElementById("input-buscar-contacto");

if (inputBuscadorModal) {
  inputBuscadorModal.addEventListener("input", (e) => {
    const textoBusqueda = e.target.value.replace("@", "").trim().toLowerCase();
    const items = document.querySelectorAll(".contacto-item");

    items.forEach((item) => {
      const elementoNombre = item.querySelector(".nombre-contacto");

      if (elementoNombre) {
        const nombre = elementoNombre.textContent.toLowerCase();

        if (!textoBusqueda || nombre.includes(textoBusqueda)) {
          item.style.display = "flex";
        } else {
          item.style.display = "none";
        }
      }
    });
  });
}

const botonesFiltros = document.querySelectorAll(".caja-filtros .filtro-btn");
botonesFiltros.forEach((boton, index) => {
  boton.addEventListener("click", () => {
    botonesFiltros.forEach(b => b.classList.remove("activo"));
    boton.classList.add("activo");
    if (index === 0) filtroActual = "todos";
    if (index === 1) filtroActual = "no-leidos";
    if (index === 2) filtroActual = "grupos";
    filtrarYRenderizar();
  });
});

filtrarYRenderizar();

function switchPantalla(mostrar, ocultar1, ocultar2, ocultar3) {
  if (typeof cerrarEstadoMova === "function") {
    cerrarEstadoMova();
  }

  if (typeof streamCamaraLive !== "undefined" && streamCamaraLive) {
    streamCamaraLive.getTracks().forEach(track => track.stop());
    window.streamCamaraLive = null;
  }

  if (typeof estaGrabandoAudio !== "undefined" && estaGrabandoAudio) {
    finalizarGrabacionVoz();
  }

  document.querySelectorAll("audio, video").forEach(medio => {
    if (!medio.paused) {
      medio.pause();
    }
  });

  if (ocultar1) ocultar1.style.display = "none";
  if (ocultar2) ocultar2.style.display = "none";
  if (ocultar3) ocultar3.style.display = "none";

  if (mostrar) {
    mostrar.style.display = "flex";
    if (mostrar === pantallaChats || mostrar === pantallaPerfil) {
      mostrar.style.flexDirection = "column";
      mostrar.style.alignItems = "stretch";
    }
  }

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

const btnOpcionesCabecera = document.getElementById("btn-opciones-cabecera");
const menuCabeceraFlotante = document.getElementById("menu-desplegable-cabecera");
const listaOpcionesCabecera = document.getElementById("lista-opciones-cabecera");

if (btnOpcionesCabecera && menuCabeceraFlotante && listaOpcionesCabecera) {
  btnOpcionesCabecera.addEventListener("click", (e) => {
    e.stopPropagation();

    const estaOculto = menuCabeceraFlotante.classList.contains("oculto");

    if (estaOculto) {
      const estaEnPerfil = pantallaPerfil && (pantallaPerfil.style.display === "flex" || pantallaPerfil.classList.contains("activa"));

      if (estaEnPerfil) {
        listaOpcionesCabecera.innerHTML = `
          <li id="opcion-cambiar-password"><i data-lucide="key"></i> Cambiar Contraseña</li>
          <li id="opcion-cerrar-sesion" class="opcion-peligro"><i data-lucide="log-out"></i> Cerrar Sesión</li>
        `;
      } else {
        listaOpcionesCabecera.innerHTML = `
          <li id="opcion-mi-perfil"><i data-lucide="user"></i> Mi Perfil</li>
        `;
      }

      if (window.lucide) {
        window.lucide.createIcons({ targets: [listaOpcionesCabecera] });
      }

      asignarEventosMenuCabecera();
      menuCabeceraFlotante.classList.remove("oculto");
    } else {
      menuCabeceraFlotante.classList.add("oculto");
    }
  });
}

function asignarEventosMenuCabecera() {
  const opcionMiPerfil = document.getElementById("opcion-mi-perfil");
  if (opcionMiPerfil) {
    opcionMiPerfil.addEventListener("click", () => {
      if (menuCabeceraFlotante) menuCabeceraFlotante.classList.add("oculto");
      if (btnPerfilMenu) btnPerfilMenu.click();
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Abriendo tu Perfil... 👤", "✨", "#00f2fe");
      }
    });
  }

  const opcionCambiarPassword = document.getElementById("opcion-cambiar-password");
  if (opcionCambiarPassword) {
    opcionCambiarPassword.addEventListener("click", async () => {
      if (menuCabeceraFlotante) menuCabeceraFlotante.classList.add("oculto");

      const usuarioActual = auth.currentUser;
      if (usuarioActual && usuarioActual.email) {
        try {
          const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
          await sendPasswordResetEmail(auth, usuarioActual.email);
          mostrarAvisoPremium(`Enlace enviado a <b>${usuarioActual.email}</b> 🔑`, "✉️", "#00f2fe");
        } catch (error) {
          console.error("Error al enviar correo:", error);
          mostrarAvisoPremium("No se pudo enviar el correo de cambio ⚠️", "❌", "#ff4b2b");
        }
      }
    });
  }

  const opcionCerrarSesion = document.getElementById("opcion-cerrar-sesion");
  if (opcionCerrarSesion) {
    opcionCerrarSesion.addEventListener("click", async () => {
      if (menuCabeceraFlotante) menuCabeceraFlotante.classList.add("oculto");
      try {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        await signOut(auth);
        mostrarAvisoPremium("Sesión cerrada correctamente 👋", "🚪", "#ff4b2b");
      } catch (error) {
        console.error("Error al cerrar sesión:", error);
      }
    });
  }
}

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

    if (pantallaChatPrivado) pantallaChatPrivado.classList.remove("pantalla-completa");
    switchPantalla(pantallaChats, pantallaBienvenida, pantallaPerfil, pantallaChatPrivado);
  });
}

const entrarALosChats = () => {
  botonesMenu.forEach(b => b.classList.remove("activo"));
  if (btnInicioMenu) btnInicioMenu.classList.add("activo");
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

function actualizarDobleLedCabecera(pantallaActual) {
  const ledSuperior = document.getElementById("led-enfoque-app");
  const ledInferior = document.getElementById("led-presencia-base");

  if (!ledSuperior || !ledInferior) return;

  const ledPerfil = document.querySelector(".btn-estado-sutil .punto-online");
  let colorEstadoActual = "#00f2fe";

  if (ledPerfil) {
    colorEstadoActual = window.getComputedStyle(ledPerfil).backgroundColor;
  }

  let esOcupado = colorEstadoActual.includes("255, 75, 43") || colorEstadoActual === "rgb(255, 75, 43)" || colorEstadoActual === "#ff4b2b";
  let esInvisible = colorEstadoActual.includes("136, 136, 136") || colorEstadoActual === "rgb(136, 136, 136)" || colorEstadoActual === "#888888";

  const todosLosLedsBandeja = document.querySelectorAll(".lista-chats .punto-online-chat");

  if (esInvisible) {
    ledInferior.style.setProperty("background-color", "#888888", "important");
    ledInferior.style.setProperty("--led-color", "#888888", "important");
    ledInferior.style.boxShadow = "none";

    ledSuperior.style.setProperty("background-color", "#888888", "important");
    ledSuperior.style.boxShadow = "none";

    todosLosLedsBandeja.forEach(led => {
      led.style.setProperty("--led-color", "#888888", "important");
      led.style.boxShadow = "none";
    });
    return;
  }

  if (esOcupado) {
    ledInferior.style.setProperty("background-color", "#ff4b2b", "important");
    ledInferior.style.setProperty("--led-color", "#ff4b2b", "important");
    ledInferior.style.boxShadow = "0 0 8px #ff4b2b";

    ledSuperior.style.setProperty("background-color", "#ff4b2b", "important");
    ledSuperior.style.boxShadow = "0 0 8px #ff4b2b";

    todosLosLedsBandeja.forEach(led => {
      led.style.setProperty("--led-color", "#ff4b2b", "important");
      led.style.boxShadow = "0 0 8px #ff4b2b";
    });
    return;
  }

  todosLosLedsBandeja.forEach(led => {
    led.style.setProperty("--led-color", "#00f2fe", "important");
    led.style.boxShadow = "0 0 5px #00f2fe";
  });

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
  if (imgEstadoRender) imgEstadoRender.src = urlFoto;
  if (textoEstadoRender) textoEstadoRender.textContent = fraseInicial;

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
      if (contadorLikesEstado) contadorLikesEstado.textContent = likesSimulados;
    } else {
      btnCorazonEstado.classList.remove("activo");
      likesSimulados--;
      if (contadorLikesEstado) contadorLikesEstado.textContent = likesSimulados;
    }
  });
}

const esfera1 = document.querySelector(".esfera-cyan");
const esfera2 = document.querySelector(".esfera-morada");

window.cambiarAura = function (nombreTema) {
  if (esfera1 && esfera2) {
    esfera1.classList.remove("aura-cyan-morado", "aura-fuego", "aura-oceano", "aura-matrix");
    esfera2.classList.remove("aura-cyan-morado", "aura-fuego", "aura-oceano", "aura-matrix");

    esfera1.classList.add(`aura-${nombreTema}`);
    esfera2.classList.add(`aura-${nombreTema}`);

    mostrarAvisoPremium(`Aura cambiada al tema [ ${nombreTema.toUpperCase()} ] 🔮`, "🌌", "#00f2fe");
  }
};

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
if (typeof mostrarAvisoPremium === "undefined") {
  window.mostrarAvisoPremium = function (mensaje) {
    if (typeof mostrarToast === "function") {
      mostrarToast(mensaje);
    }
  };
}

const btnCompartirMova = document.querySelector(".btn-compartir");

if (btnCompartirMova) {
  const nuevoBtnCompartir = btnCompartirMova.cloneNode(true);
  btnCompartirMova.parentNode.replaceChild(nuevoBtnCompartir, btnCompartirMova);

  nuevoBtnCompartir.addEventListener("click", async function () {
    const urlCompartir = window.location.href;

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
      try {
        await navigator.clipboard.writeText(urlCompartir);
        mostrarAvisoPremium("¡Enlace copiado al portapapeles! Listo para enviar. 🚀");
      } catch (err) {
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

const btnEditarEstado = document.getElementById("btn-editar-estado");
const modalEstado = document.getElementById("modal-estado");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");
const btnGuardarEstado = document.getElementById("btn-guardar-estado");
const inputNuevoEstado = document.getElementById("input-nuevo-estado");
const textoEstadoPerfil = document.querySelector(".texto-estado");
const ledPerfil = document.querySelector(".btn-estado-sutil .punto-online");
const botonesLed = document.querySelectorAll(".selector-led .btn-led");
let colorLedSeleccionado = "#00f2fe";

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

botonesLed.forEach(boton => {
  boton.addEventListener("click", () => {
    botonesLed.forEach(b => b.classList.remove("activo"));
    boton.classList.add("activo");
    colorLedSeleccionado = boton.style.getPropertyValue("--led-color").trim();
  });
});

if (btnGuardarEstado && modalEstado) {
  btnGuardarEstado.addEventListener("click", () => {
    if (inputNuevoEstado && textoEstadoPerfil) {
      const nuevaFrase = inputNuevoEstado.value.trim();
      if (nuevaFrase !== "") {
        textoEstadoPerfil.textContent = nuevaFrase;
      } else {
        textoEstadoPerfil.textContent = "Toca para añadir estado...";
      }
    }
    if (ledPerfil) {
      ledPerfil.style.backgroundColor = colorLedSeleccionado;
      ledPerfil.style.boxShadow = `0 0 10px ${colorLedSeleccionado}`;
    }
    modalEstado.classList.add("oculto");
    mostrarAvisoPremium("Estado de conexión actualizado en tu perfil.");
  });
}

// --- 4. CAMPANITA Y AJUSTES DE NOTIFICACIONES ---
const btnCampanita = document.getElementById("btn-campanita-alertas");
const badgeCampanita = document.getElementById("badge-campanita");
const toggleNotificaciones = document.getElementById("check-notificaciones");

// Cargar estado inicial guardado de Notificaciones
const notifGuardada = localStorage.getItem("movachat-notificaciones");
if (toggleNotificaciones) {
  toggleNotificaciones.checked = notifGuardada !== null ? notifGuardada === "activado" : true;
}

// 🔔 Función para recalcular y actualizar los badges (Campanita + Filtro)
function actualizarBadgesNotificaciones() {
  const estaSilenciado = localStorage.getItem("movachat-notificaciones") === "desactivado";
  const badgeFiltroNoLeidos = document.querySelector(".badge-filtro");

  const badgesChats = document.querySelectorAll(".badge-chat-no-leido, .badge-mensaje");
  let totalNoLeidos = 0;

  badgesChats.forEach((badge) => {
    const cantidad = parseInt(badge.textContent, 10) || 0;
    totalNoLeidos += cantidad;
  });

  // 1️⃣ Actualizar Campanita
  if (badgeCampanita) {
    if (totalNoLeidos > 0 && !estaSilenciado) {
      badgeCampanita.textContent = totalNoLeidos > 99 ? "99+" : totalNoLeidos;
      badgeCampanita.classList.remove("oculto");
    } else {
      badgeCampanita.classList.add("oculto");
    }
  }

  // 2️⃣ Actualizar filtro 'No leídos'
  if (badgeFiltroNoLeidos) {
    badgeFiltroNoLeidos.textContent = totalNoLeidos;
  }
}

// Evento Clic en la Campanita
if (btnCampanita) {
  btnCampanita.addEventListener("click", () => {
    if (badgeCampanita && !badgeCampanita.classList.contains("oculto")) {
      badgeCampanita.style.transform = "scale(0)";
      setTimeout(() => {
        badgeCampanita.classList.add("oculto");
        badgeCampanita.style.transform = "scale(1)";
      }, 200);

      mostrarAvisoPremium("¡Estás al día! No tienes alertas pendientes. 🔔");
    } else {
      mostrarAvisoPremium("Todo está en orden y en calma por aquí. 🌌");
    }
  });
}

// Evento Switch de Ajustes
if (toggleNotificaciones) {
  toggleNotificaciones.addEventListener("change", async () => {
    if (toggleNotificaciones.checked) {
      localStorage.setItem("movachat-notificaciones", "activado");

      const concedido = await solicitarPermisoNotificaciones();
      if (!concedido) {
        mostrarAvisoPremium("Por favor permite las notificaciones en tu navegador ⚙️");
      } else {
        mostrarAvisoPremium("¡Notificaciones activadas con éxito! 🚀");
      }

      actualizarBadgesNotificaciones();
    } else {
      localStorage.setItem("movachat-notificaciones", "desactivado");
      if (badgeCampanita) badgeCampanita.classList.add("oculto");
      mostrarAvisoPremium("Notificaciones silenciadas por el usuario. 🔕");
    }
  });
}

// --- 6. NOTIFICACIONES PUSH NATIVAS Y DISPARADOR ---

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
    if (permiso === "granted") {
      return true;
    }
  }

  return false;
}

// Asignación global para compatibilidad total en el entorno
window.solicitarPermisoNotificaciones = solicitarPermisoNotificaciones;

// 🔔 FUNCIÓN GLOBAL PARA NOTIFICAR MENSAJES NUEVOS EN MÓVIL Y ESCRITORIO
window.notificarNuevoMensaje = function(nombreRemitente, textoMensaje, avatarUrl) {
  const estaSilenciado = localStorage.getItem("movachat-notificaciones") === "desactivado";
  if (estaSilenciado) return;

  // 🔊 Reproducir sonido de recibido
  if (typeof reproducirSonido === "function") {
    reproducirSonido("recibido");
  }

  // Actualizar indicadores visuales
  actualizarBadgesNotificaciones();

  // 🔔 Lógica para pantalla bloqueada / minimizada
  if (document.hidden && "Notification" in window && Notification.permission === "granted") {
    const opciones = {
      body: textoMensaje || "Te ha enviado un mensaje.",
      icon: avatarUrl || "assets/logo.png",
      badge: "assets/logo.png",
      vibrate: [200, 100, 200],
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
  }
};

// --- 5. MODO SIGILO (INVISIBLE) ---
var toggleSigilo = document.getElementById("check-sigilo");
var ledPerfilIdentidad = document.querySelector(".btn-estado-sutil .punto-online");
var textoEstadoIdentidad = document.querySelector(".texto-estado");

// Cargar estado inicial guardado de Sigilo
var estadoSigiloGuardado = localStorage.getItem("movachat-sigilo");
if (estadoSigiloGuardado === "activo" && toggleSigilo) {
  toggleSigilo.checked = true;
  if (ledPerfilIdentidad) {
    ledPerfilIdentidad.style.backgroundColor = "#888888";
    ledPerfilIdentidad.style.boxShadow = "0 0 10px #888888";
  }
  if (textoEstadoIdentidad) {
    textoEstadoIdentidad.textContent = "Modo Sigilo Activo (Invisible)";
  }
}

if (toggleSigilo) {
  toggleSigilo.addEventListener("change", () => {
    if (toggleSigilo.checked) {
      localStorage.setItem("movachat-sigilo", "activo");
      if (ledPerfilIdentidad) {
        ledPerfilIdentidad.style.backgroundColor = "#888888";
        ledPerfilIdentidad.style.boxShadow = "0 0 10px #888888";
      }
      if (textoEstadoIdentidad) {
        textoEstadoIdentidad.textContent = "Modo Sigilo Activo (Invisible)";
      }
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Has entrado en Modo Sigilo. Presencia oculta. 🌌");
      }
    } else {
      localStorage.setItem("movachat-sigilo", "inactivo");
      if (ledPerfilIdentidad) {
        ledPerfilIdentidad.style.backgroundColor = "#00f2fe";
        ledPerfilIdentidad.style.boxShadow = "0 0 10px #00f2fe";
      }
      if (textoEstadoIdentidad) {
        textoEstadoIdentidad.textContent = "Disponible. Toca para añadir estado...";
      }
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Modo Sigilo desactivado. Estás visible de nuevo. 📡");
      }
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
        if (typeof modalEstado !== "undefined" && modalEstado) modalEstado.classList.remove("oculto");
        if (typeof inputNuevoEstado !== "undefined" && inputNuevoEstado) inputNuevoEstado.focus();

        const interceptarGuardado = () => {
          if (typeof inputNuevoEstado !== "undefined" && inputNuevoEstado) fraseEstadoGuardada = inputNuevoEstado.value.trim();
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
          if (typeof btnGuardarEstado !== "undefined" && btnGuardarEstado) btnGuardarEstado.removeEventListener("click", interceptarGuardado);
        };
        if (typeof btnGuardarEstado !== "undefined" && btnGuardarEstado) btnGuardarEstado.addEventListener("click", interceptarGuardado);
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

    if (typeof visorEstados !== "undefined" && visorEstados && imgEstadoRender && textoEstadoRender) {
      imgEstadoRender.src = urlFotoPropia;
      textoEstadoRender.textContent = "Tu foto de perfil";

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
  if (tituloModalRed) tituloModalRed.innerHTML = `Editar ${configuracionRedes[redKey].titulo}`;
  if (prefijoRed) prefijoRed.textContent = configuracionRedes[redKey].prefijo;

  const actual = localStorage.getItem(`movachat-red-${redKey}`) || "";
  if (inputUsuarioRed) {
    inputUsuarioRed.value = actual;
    inputUsuarioRed.placeholder = "ej: tu_usuario";
  }

  modalRedes.classList.remove("oculto");
  setTimeout(() => { if (inputUsuarioRed) inputUsuarioRed.focus(); }, 50);
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
    const nombreUsuario = inputUsuarioRed ? inputUsuarioRed.value.trim().replace(/[@/]/g, "") : "";

    if (nombreUsuario === "") {
      localStorage.removeItem(`movachat-red-${redActivaSeleccionada}`);
      if (modalRedes) modalRedes.classList.add("oculto");
      mostrarAvisoPremium("Enlace removido. El botón volverá a pedir configuración.", "🗑️", "#ff4b2b");
      return;
    }

    localStorage.setItem(`movachat-red-${redActivaSeleccionada}`, nombreUsuario);
    if (modalRedes) modalRedes.classList.add("oculto");
    mostrarAvisoPremium(`Portal de ${redActivaSeleccionada.toUpperCase()} guardado correctamente. 🛡️`, "💎", "#00f2fe");
  });
}

if (btnCerrarRedes) {
  btnCerrarRedes.addEventListener("click", () => {
    if (modalRedes) modalRedes.classList.add("oculto");
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

    if (typeof menuCabecera !== "undefined" && menuCabecera) menuCabecera.classList.add("oculto");

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

const chatsSilenciadosBD = {};
const btnCtxSilenciar = document.getElementById("btn-ctx-silenciar");

if (btnCtxSilenciar) {
  btnCtxSilenciar.addEventListener("click", (e) => {
    e.stopPropagation();

    const elemNombreCabecera = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombreCabecera ? elemNombreCabecera.textContent.trim() : null;

    if (!nombreAmigoActual) return;

    if (typeof menuCabecera !== "undefined" && menuCabecera) menuCabecera.classList.add("oculto");

    let tarjetaAmigoNodo = null;
    document.querySelectorAll(".lista-chats .tarjeta-chat").forEach(tarjeta => {
      const elemNombreTarjeta = tarjeta.querySelector(".chat-nombre");
      if (elemNombreTarjeta && elemNombreTarjeta.textContent.trim() === nombreAmigoActual) {
        tarjetaAmigoNodo = tarjeta;
      }
    });

    if (!chatsSilenciadosBD[nombreAmigoActual]) {
      chatsSilenciadosBD[nombreAmigoActual] = true;
      btnCtxSilenciar.innerHTML = `<i data-lucide="bell"></i> Activar notificaciones`;

      if (tarjetaAmigoNodo) {
        tarjetaAmigoNodo.classList.add("chat-silenciado-zona");
        const contenedorHora = tarjetaAmigoNodo.querySelector(".chat-cabecera");

        if (contenedorHora && !contenedorHora.querySelector(".indicador-silencio-neon")) {
          contenedorHora.insertAdjacentHTML("beforeend", `
            <span class="indicador-silencio-neon" title="Chat silenciado">
              <i data-lucide="bell-off"></i>
            </span>
          `);
        }
      }

      mostrarAvisoPremium(`Has silenciado las alertas de <b>${nombreAmigoActual}</b>.`, "🔕", "#ff4b2b");
    } else {
      chatsSilenciadosBD[nombreAmigoActual] = false;
      btnCtxSilenciar.innerHTML = `<i data-lucide="bell-off"></i> Silenciar chat`;

      if (tarjetaAmigoNodo) {
        tarjetaAmigoNodo.classList.remove("chat-silenciado-zona");
        const iconoSilencio = tarjetaAmigoNodo.querySelector(".indicador-silencio-neon");
        if (iconoSilencio) iconoSilencio.remove();
      }

      mostrarAvisoPremium(`Alertas reactivadas para <b>${nombreAmigoActual}</b>.`, "🔔", "#00f2fe");
    }

    if (window.lucide) {
      const objetivos = [btnCtxSilenciar];
      if (tarjetaAmigoNodo) objetivos.push(tarjetaAmigoNodo);

      window.lucide.createIcons({
        targets: objetivos
      });
    }
  });
}

const chatsTemporalesBD = {};
const btnCtxTemporales = document.getElementById("btn-ctx-temporales");

if (btnCtxTemporales) {
  btnCtxTemporales.addEventListener("click", (e) => {
    e.stopPropagation();

    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombre ? elemNombre.textContent.trim() : null;

    if (!nombreAmigoActual) return;

    if (typeof menuCabecera !== "undefined" && menuCabecera) menuCabecera.classList.add("oculto");

    if (!chatsTemporalesBD[nombreAmigoActual]) {
      chatsTemporalesBD[nombreAmigoActual] = true;
      btnCtxTemporales.innerHTML = `<i data-lucide="hourglass"></i> Mensajes normales`;
      mostrarAvisoPremium(`Modo efímero activo con <b>${nombreAmigoActual}</b>. Los mensajes nuevos durarán 10s.`, "⏳", "#00f2fe");
    } else {
      chatsTemporalesBD[nombreAmigoActual] = false;
      btnCtxTemporales.innerHTML = `<i data-lucide="hourglass"></i> Mensajes temporales`;
      mostrarAvisoPremium(`Modo permanente restaurado con <b>${nombreAmigoActual}</b>.`, "📡", "#00f2fe");
    }

    if (window.lucide) {
      window.lucide.createIcons({
        targets: [btnCtxTemporales]
      });
    }
  });
}

function aplicarRelojArenaEfecto(burbujaNodo) {
  const elemNombre = document.querySelector(".amigo-nombre-chat");
  const nombreAmigoActual = elemNombre ? elemNombre.textContent : null;

  if (nombreAmigoActual && chatsTemporalesBD[nombreAmigoActual]) {
    burbujaNodo.classList.add("mensaje-efimero");

    const horaNodo = burbujaNodo.querySelector(".mensaje-hora");
    if (horaNodo && !horaNodo.querySelector("[data-lucide='hourglass']")) {
      horaNodo.insertAdjacentHTML("afterbegin", `<i data-lucide="hourglass" style="width:10px; height:10px; display:inline-block; margin-right:4px; opacity:0.6; vertical-align:middle;"></i>`);

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
        if (typeof guardarMensajesEnMemoria === "function" && typeof historialMensajes !== "undefined") {
          guardarMensajesEnMemoria(nombreAmigoActual, historialMensajes);
        }
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

function obtenerChatId(uid1, uid2) {
  return uid1 < uid2 ? `${uid1}_${uid2}` : `${uid2}_${uid1}`;
}

const chatsBloqueadosBD = {};
const btnCtxBloquear = document.getElementById("btn-ctx-bloquear");

if (btnCtxBloquear) {
  btnCtxBloquear.addEventListener("click", (e) => {
    e.stopPropagation();

    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombre ? elemNombre.textContent.trim() : null;

    if (!nombreAmigoActual) return;

    if (typeof menuCabecera !== "undefined" && menuCabecera) menuCabecera.classList.add("oculto");

    let tarjetaAmigoNodo = null;
    document.querySelectorAll(".lista-chats .tarjeta-chat").forEach(tarjeta => {
      const elemNombreTarjeta = tarjeta.querySelector(".chat-nombre");
      if (elemNombreTarjeta && elemNombreTarjeta.textContent.trim() === nombreAmigoActual) {
        tarjetaAmigoNodo = tarjeta;
      }
    });

    if (!chatsBloqueadosBD[nombreAmigoActual]) {
      chatsBloqueadosBD[nombreAmigoActual] = true;

      btnCtxBloquear.innerHTML = `<i data-lucide="shield-check"></i> Desbloquear usuario`;
      btnCtxBloquear.classList.remove("texto-rojo");
      btnCtxBloquear.style.color = "#00f2fe";

      if (typeof inputChat !== "undefined" && inputChat) {
        inputChat.disabled = true;
        inputChat.placeholder = "Has bloqueado a este usuario.";
        inputChat.style.opacity = "0.5";
      }
      if (typeof btnAccionChat !== "undefined" && btnAccionChat) {
        btnAccionChat.style.pointerEvents = "none";
        btnAccionChat.style.opacity = "0.3";
      }

      if (tarjetaAmigoNodo) {
        tarjetaAmigoNodo.style.opacity = "0.4";
        tarjetaAmigoNodo.style.filter = "grayscale(100%)";
      }

      mostrarAvisoPremium(`Usuario <b>${nombreAmigoActual}</b> ha sido bloqueado con éxito.`, "⚠️", "#ff4b2b");
    } else {
      chatsBloqueadosBD[nombreAmigoActual] = false;

      btnCtxBloquear.innerHTML = `<i data-lucide="shield-alert"></i> Bloquear usuario`;
      btnCtxBloquear.classList.add("texto-rojo");
      btnCtxBloquear.style.color = "";

      if (typeof inputChat !== "undefined" && inputChat) {
        inputChat.disabled = false;
        inputChat.placeholder = "Escribe un mensaje privado...";
        inputChat.style.opacity = "1";
      }
      if (typeof btnAccionChat !== "undefined" && btnAccionChat) {
        btnAccionChat.style.pointerEvents = "auto";
        btnAccionChat.style.opacity = "1";
      }

      if (tarjetaAmigoNodo) {
        tarjetaAmigoNodo.style.opacity = "1";
        tarjetaAmigoNodo.style.filter = "none";
      }

      mostrarAvisoPremium(`Has desbloqueado a <b>${nombreAmigoActual}</b>. Conexión restaurada.`, "📡", "#00f2fe");
    }

    if (window.lucide) {
      window.lucide.createIcons({
        targets: [btnCtxBloquear]
      });
    }
  });
}

const btnCtxVaciar = document.getElementById("btn-ctx-vaciar");
if (btnCtxVaciar) {
  btnCtxVaciar.addEventListener("click", (e) => {
    e.stopPropagation();

    const elemNombre = document.querySelector(".amigo-nombre-chat");
    const nombreAmigoActual = elemNombre ? elemNombre.textContent : "Chat";
    if (typeof menuCabecera !== "undefined" && menuCabecera) menuCabecera.classList.add("oculto");

    const contenedorMensajesActivo = document.querySelector("#pantalla-chat-privado .historial-mensajes");
    if (!contenedorMensajesActivo) return;

    const burbujasDelChatActual = contenedorMensajesActivo.querySelectorAll(".mensaje-burbuja");

    if (burbujasDelChatActual.length === 0) {
      mostrarAvisoPremium(`El historial con <b>${nombreAmigoActual}</b> ya está vacío.`, "📡", "#00f2fe");
      return;
    }

    burbujasDelChatActual.forEach(burbuja => {
      burbuja.style.transition = "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)";
      burbuja.style.opacity = "0";
      burbuja.style.transform = "scale(0.8) translateY(-10px)";
      setTimeout(() => { burbuja.remove(); }, 300);
    });

    localStorage.removeItem(`movachat_msgs_${nombreAmigoActual}`);
    mostrarAvisoPremium(`Historial efímero con <b>${nombreAmigoActual}</b> eliminado con éxito.`, "🗑️", "#ff4b2b");
  });
}

const btnBuscadorEncabezado = document.getElementById("btn-buscador-encabezado");
const inputBuscadorPrincipal = document.querySelector(".input-buscador");

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

    mostrarAvisoPremium("Escribe para buscar conversaciones o amigos... 🔍", "⚡", "#00f2fe");
  });
}

// ========================================================
// 14. LISTA DE CONTACTOS Y EVENTOS FINALES (SANO Y SIN DUPLICADOS)
// ========================================================

// 🟢 Cargar contactos aprobados desde Firebase a la lista principal
function cargarContactosAprobados(usuarioActualUid) {
  const contenedorContactos = document.getElementById("lista-chats-principal") || document.querySelector(".lista-chats");
  if (!contenedorContactos) return;

  const usuariosRef = ref(db, 'usuarios');

  onValue(usuariosRef, (snapshot) => {
    try {
      const tarjetaMiEstado = document.getElementById("tarjeta-mi-estado-propio");
      contenedorContactos.innerHTML = "";

      if (tarjetaMiEstado) {
        contenedorContactos.appendChild(tarjetaMiEstado);
      }

      if (snapshot.exists()) {
        const usuarios = snapshot.val();

        Object.keys(usuarios).forEach((uid) => {
          const usuario = usuarios[uid];

          if (usuario && uid !== usuarioActualUid && usuario.estadoAcceso === "aprobado") {
            const itemContacto = document.createElement("div");
            itemContacto.className = "tarjeta-chat contacto-item";
            itemContacto.dataset.uid = uid;

            const primerLetra = usuario.nombre ? usuario.nombre.charAt(0).toUpperCase() : 'U';
            const foto = usuario.fotoUrl
              ? `<img src="${usuario.fotoUrl}" alt="${usuario.nombre || 'Usuario'}">`
              : `<div class="avatar-placeholder" style="width: 45px; height: 45px; border-radius: 50%; background: #00f2fe; color: #000; display: flex; align-items: center; justify-content: center; font-weight: bold; font-size: 18px;">${primerLetra}</div>`;

            itemContacto.innerHTML = `
              <div class="chat-avatar-caja">
                ${foto}
                <span class="punto-online-chat" style="--led-color: #00f2fe;"></span>
              </div>
              <div class="chat-info">
                <div class="chat-cabecera">
                  <h4 class="chat-nombre">${usuario.nombre || "Usuario"}</h4>
                </div>
                <div class="chat-mensaje-caja">
                  <p class="chat-texto">${usuario.estado || "¡Disponible en MovaChat!"}</p>
                </div>
              </div>
            `;

            // Clic en la tarjeta de chat
            itemContacto.addEventListener("click", (e) => {
              e.stopPropagation();
              const uidContacto = usuario.uid || uid;
              const nombreContacto = usuario.nombre || "Usuario";
              const fotoContacto = usuario.fotoUrl || "";

              abrirChatConUsuario(uidContacto, nombreContacto, fotoContacto);
            });

            contenedorContactos.appendChild(itemContacto);
          }
        });

        if (window.lucide) {
          window.lucide.createIcons({ targets: [contenedorContactos] });
        }
      }
    } catch (e) {
      console.error("Error al cargar la lista de contactos:", e);
    }
  });
}

// 🟢 Abrir Chat Privado con Datos Reales
function abrirChatConUsuario(contactoUid, nombreContacto, fotoContacto) {
  if (!contactoUid) return;

  window.contactoActivoUid = contactoUid;

  if (historialMensajes) {
    historialMensajes.innerHTML = "";
  }

  const elemNombre = document.querySelector(".amigo-nombre-chat");
  const elemFoto = document.getElementById("avatar-cabecera-privada");

  if (elemNombre) elemNombre.textContent = nombreContacto;
  if (elemFoto) {
    if (fotoContacto) {
      elemFoto.src = fotoContacto;
      elemFoto.style.display = "block";
    } else {
      elemFoto.src = `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(nombreContacto)}`;
    }
  }

  if (encabezadoGlobal) encabezadoGlobal.style.display = "none";
  if (menuFlotanteGlobal) menuFlotanteGlobal.style.display = "none";

  const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto") || document.getElementById("btn-abrir-contactos");
  if (btnFlotanteContacto) btnFlotanteContacto.style.display = "none";

  if (pantallaChatPrivado) {
    pantallaChatPrivado.classList.add("pantalla-completa");
    if (typeof switchPantalla === "function") {
      switchPantalla(pantallaChatPrivado, pantallaChats, pantallaBienvenida, pantallaPerfil);
    } else {
      if (pantallaChats) pantallaChats.style.display = "none";
      pantallaChatPrivado.style.display = "flex";
    }
  }

  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  if (miUid && contactoUid && typeof escucharMensajesChat === "function") {
    const chatId = obtenerChatId(miUid, contactoUid);
    escucharMensajesChat(chatId);
  }
}

// 📌 Hacerlas globales para que Firebase pueda ejecutarlas al iniciar sesión
window.cargarContactosAprobados = cargarContactosAprobados;
window.abrirChatConUsuario = abrirChatConUsuario;

// ⚡ Inicializaciones finales del DOM
document.addEventListener("DOMContentLoaded", () => {
  // Inicializar iconos de Lucide
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // Activar audio y notificaciones con el primer clic del usuario
  document.addEventListener("click", () => {
    if ("Notification" in window && Notification.permission === "default") {
      solicitarPermisoNotificaciones();
    }
  }, { once: true });
});

// ========================================================
// 🚀 SOLUCIÓN DEFINITIVA: CONTROL DE MODAL (+), CERRAR (X) Y BUSCADOR
// ========================================================

// 1. Manejo unificado de Abrir y Cerrar Modal de Contactos (+)
document.addEventListener("click", (e) => {
  // 🟢 ABRIR MODAL
  const btnPlus = e.target.closest("#btn-abrir-contactos") || e.target.closest(".btn-flotante-contacto");
  if (btnPlus) {
    e.preventDefault();
    e.stopPropagation();
    const modalCont = document.getElementById("modal-contactos");
    if (modalCont) {
      modalCont.classList.remove("oculto");
      modalCont.style.display = "flex"; // Forzamos visibilidad para evitar congelamiento
      if (typeof renderizarListaContactosModal === "function") {
        renderizarListaContactosModal();
      }
    }
  }

  // 🔴 CERRAR MODAL CON LA (X) O BOTÓN CERRAR
  const btnCerrar = e.target.closest("#btn-cerrar-contactos") || e.target.closest(".btn-cerrar-modal");
  if (btnCerrar) {
    e.preventDefault();
    e.stopPropagation();
    const modalCont = document.getElementById("modal-contactos");
    if (modalCont) {
      modalCont.classList.add("oculto");
      modalCont.style.display = "none"; // Ocultamos limpiamente
    }
  }
});

// 2. Buscador en tiempo real dentro del modal de contactos
const inputBuscarContactoModal = document.getElementById("input-buscar-contacto");
if (inputBuscarContactoModal) {
  inputBuscarContactoModal.addEventListener("input", (e) => {
    const texto = e.target.value.toLowerCase().trim();
    
    if (typeof renderizarListaContactosModal === "function") {
      renderizarListaContactosModal(texto);
    } else {
      const filas = document.querySelectorAll("#contenedor-lista-contactos .item-contacto-fila, .contacto-item");
      filas.forEach(fila => {
        const nombre = fila.textContent.toLowerCase();
        fila.style.display = nombre.includes(texto) ? "flex" : "none";
      });
    }
  });
}

// 2. Escuchar Mensajes de Firebase en Tiempo Real
window.escucharMensajesChat = function(chatId) {
  const historial = document.getElementById("historial-mensajes") || document.querySelector(".historial-mensajes");
  if (!historial) return;

  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);

  onValue(mensajesRef, (snapshot) => {
    historial.innerHTML = "";
    const miUid = auth.currentUser ? auth.currentUser.uid : null;

    if (snapshot.exists()) {
      const mensajes = snapshot.val();
      Object.keys(mensajes).forEach((key) => {
        const msg = mensajes[key];
        const idEmisor = msg.emisor || msg.emisorUid;
        const esMio = idEmisor === miUid;

        let horaTxt = msg.hora || "00:00";
        if (!msg.hora && msg.timestamp) {
          horaTxt = new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        }

        const burbuja = document.createElement("div");
        burbuja.className = `mensaje-burbuja ${esMio ? 'enviado' : 'recibido'}`;
        
        let htmlContenido = `<p class="mensaje-texto">${msg.texto || ''}</p>`;
        
        if (msg.tipoAdjunto === 'foto' && msg.urlAdjunto) {
          htmlContenido = `<img src="${msg.urlAdjunto}" style="max-width:100%; border-radius:8px; margin-bottom:4px;">` + htmlContenido;
        }

        burbuja.innerHTML = `
          ${htmlContenido}
          <span class="mensaje-hora">${horaTxt}</span>
        `;

        historial.appendChild(burbuja);
      });

      if (window.lucide) {
        window.lucide.createIcons({ targets: [historial] });
      }

      historial.scrollTop = historial.scrollHeight;
    } else {
      historial.innerHTML = `<div style="text-align:center; color:rgba(255,255,255,0.4); padding:20px; font-size:0.85rem;">Inicia la conversación enviando un mensaje 👋</div>`;
    }
  });
};

// 3. Reconectar la Apertura de Chats con la Escucha de Mensajes
const funcionAbrirChatOriginal = window.abrirChatConUsuario;
window.abrirChatConUsuario = function(contactoUid, nombreContacto, fotoContacto) {
  if (typeof funcionAbrirChatOriginal === "function") {
    funcionAbrirChatOriginal(contactoUid, nombreContacto, fotoContacto);
  }

  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  if (miUid && contactoUid) {
    const chatId = typeof obtenerChatId === "function" 
      ? obtenerChatId(miUid, contactoUid) 
      : (miUid < contactoUid ? `${miUid}_${contactoUid}` : `${contactoUid}_${miUid}`);
      
    window.escucharMensajesChat(chatId);
  }
};