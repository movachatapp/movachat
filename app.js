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
        // 1. Crear usuario en Firebase Auth
        const userCredential = await createUserWithEmailAndPassword(auth, correo, password);
        const user = userCredential.user;

        // 2. Guardar nombre en Auth
        await updateProfile(user, { displayName: nombre });

        // 3. Guardar datos iniciales en Database
        await set(ref(db, 'usuarios/' + user.uid), {
          uid: user.uid,
          nombre: nombre,
          correo: correo,
          estado: "🚀 Nuevo en MovaChat",
          fotoUrl: "",
          rol: "usuario",
          estadoAcceso: "pendiente",
          fechaRegistro: Date.now()
        });

        // 4. 🔴 CERRAR SESIÓN DE INMEDIATO
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
  const chatPantalla = document.querySelector(".contenedor-chat") || document.body;

  if (user) {
    try {
      // 1. Ocultar la app inmediatamente mientras se verifica el acceso
      const snapshot = await get(ref(db, 'usuarios/' + user.uid));

      if (snapshot.exists()) {
        const datosUsuario = snapshot.val();
        const estadoAcceso = datosUsuario.estadoAcceso || "pendiente";

        if (estadoAcceso === "aprobado") {
          // 🟢 ACCESO AUTORIZADO -> Entra a MovaChat
          if (authPantalla) authPantalla.style.display = "none";
          console.log("🟢 Acceso concedido:", datosUsuario.nombre || user.email);
          // 🚀 CARGAR LISTA DE CONTACTOS EN TIEMPO REAL
          cargarContactosAprobados(user.uid);

          // Lógica de Panel Admin
          const btnAdmin = document.getElementById("btn-abrir-admin");
          const modalAdmin = document.getElementById("modal-admin");
          const btnCerrarAdmin = document.getElementById("btn-cerrar-admin");

          if (datosUsuario.rol === "admin") {
            if (btnAdmin) btnAdmin.style.display = "inline-block";

            if (btnAdmin && modalAdmin) {
              btnAdmin.onclick = () => {
                modalAdmin.style.display = "flex";
                cargarUsuariosPendientes();
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
          // 🔴 SI NO ESTÁ APROBADO ("pendiente" o "baneado") -> EXPULSAR
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
        // Si por alguna razón el registro no se guardó a tiempo en /usuarios, expulsar por seguridad
        await signOut(auth);
        if (authPantalla) authPantalla.style.display = "flex";
      }
    } catch (error) {
      console.error("❌ Error al verificar acceso:", error);
      await signOut(auth);
      if (authPantalla) authPantalla.style.display = "flex";
    }
  } else {
    // Usuario no autenticado -> Mostrar login
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

// --- SISTEMA DE EFECTOS DE SONIDO NATIVOS ---
const sonidosApp = {
  enviado: new Audio('assets/sounds/enviado.mp3'),
  recibido: new Audio('assets/sounds/recibido.mp3'),
  grabando: new Audio('assets/sounds/grabando.mp3')
};

// Función global para reproducir sonidos sin interrupciones
function reproducirSonido(tipo) {
  if (sonidosApp[tipo]) {
    sonidosApp[tipo].currentTime = 0; // Reinicia el audio para reproducir rápido si se presiona seguido
    sonidosApp[tipo].play().catch(() => {
      // Los navegadores bloquean audio automático si el usuario no ha interactuado aún
    });
  }
}

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

  // 1. Calcular total real de mensajes no leídos
  let totalNoLeidos = 0;

  // Contar no leídos de los chats dinámicos
  chatsFalsosData.forEach(chat => {
    if (chat.unread) totalNoLeidos++;
  });

  // Contar no leídos de los HTML originales si tienen badge
  chatsOriginalesHTML.forEach(tarjeta => {
    if (tarjeta.querySelector(".badge-mensaje")) totalNoLeidos++;
  });

  // Actualizar el número en el botón de filtro
  const badgeFiltro = document.querySelector(".caja-filtros .badge-filtro");
  if (badgeFiltro) {
    badgeFiltro.textContent = totalNoLeidos;
  }

  // 2. Renderizar tarjetas HTML originales
  chatsOriginalesHTML.forEach((tarjeta) => {
    const nombre = tarjeta.querySelector(".chat-nombre").textContent.toLowerCase();
    const tieneBadge = tarjeta.querySelector(".badge-mensaje") !== null;

    let pasaFiltro = false;
    if (filtroActual === "todos") pasaFiltro = true;
    if (filtroActual === "no-leidos" && tieneBadge) pasaFiltro = true;

    if (pasaFiltro && nombre.includes(textoBusqueda)) {
      contenedorChats.appendChild(tarjeta);
    }
  });

  // 3. Renderizar chats de la base de datos (chatsFalsosData)
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
        <div class="tarjeta-chat">
          <div class="chat-avatar-caja">
            ${avatarHTML}
            ${chat.group ? "" : `<span class="punto-online-chat" style="--led-color: ${chat.led};"></span>`}
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

  if (window.lucide) window.lucide.createIcons();
}

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
  btnOpcionesChat.addEventListener("click", (e) => {
    e.stopPropagation();
    menuCabecera.classList.toggle("oculto");
    menuAdjuntar.classList.add("oculto");
    menuCamaraPro.classList.add("oculto");

    const rect = btnOpcionesChat.getBoundingClientRect();
    const marcoRect = document.querySelector(".contenedor-chat").getBoundingClientRect();
    menuCabecera.style.right = "20px";
    menuCabecera.style.left = "auto";
    menuCabecera.style.top = `${rect.bottom - marcoRect.top + 10}px`;
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

  // 📸 FOTO
  if (tipoMedia === "foto") {
    const inputCamara = document.createElement("input");
    inputCamara.type = "file";
    inputCamara.accept = "image/*";
    inputCamara.capture = "user";

    inputCamara.onchange = (evt) => {
      const archivo = evt.target.files[0];
      if (archivo) {
        tipoAdjuntoActivo = 'foto';
        imgMiniaturaAdjunto.style.display = "block";
        imgMiniaturaAdjunto.src = URL.createObjectURL(archivo);

        const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
        if (iconoPrevio) iconoPrevio.remove();

        cajaVistaPrevia.classList.remove("oculto");
        inputChat.placeholder = "Añade un comentario a la imagen...";
        inputChat.focus();

        if (btnAccionChat) btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
        if (window.lucide) window.lucide.createIcons();
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
  imgMiniaturaAdjunto.src = urlFinal;
  imgMiniaturaAdjunto.style.display = "none";

  const wrapper = document.querySelector(".wrapper-miniatura");
  const iconoPrevio = wrapper ? wrapper.querySelector(".icono-doc-preview") : null;
  if (iconoPrevio) iconoPrevio.remove();

  if (wrapper) {
    wrapper.insertAdjacentHTML("beforeend", `
      <div class="icono-doc-preview" style="background: rgba(255, 75, 43, 0.15); color: #ff4b2b;">
        <i data-lucide="video" style="width: 28px; height: 28px;"></i>
      </div>
    `);
  }
  if (window.lucide) window.lucide.createIcons();

  cajaVistaPrevia.classList.remove("oculto");
  inputChat.placeholder = "Comentar video circular (Máx 10s)...";
  inputChat.focus();

  if (btnAccionChat) btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
  if (window.lucide) window.lucide.createIcons();
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
        const iconoPrevio = wrapper.querySelector(".icono-doc-preview");
        if (iconoPrevio) iconoPrevio.remove();
        imgMiniaturaAdjunto.style.display = "block";

        imgMiniaturaAdjunto.src = evt.target.result;
        tipoAdjuntoActivo = 'foto';
        cajaVistaPrevia.classList.remove("oculto");
        inputChat.placeholder = "Añade un comentario a la imagen...";
        inputChat.focus();

        btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
        if (window.lucide) window.lucide.createIcons();
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
    cajaVistaPrevia.classList.add("oculto");
    imgMiniaturaAdjunto.src = "";
    const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();

    tipoAdjuntoActivo = null;
    inputChat.placeholder = "Escribe un mensaje privado...";
    btnAccionChat.innerHTML = `<i data-lucide="mic"></i>`;
    if (window.lucide) window.lucide.createIcons();
  });
}

// ========================================================
// 4. LÓGICA DE APERTURA Y NAVEGACIÓN DE CHATS
// ========================================================

function abrirChatConUsuario(contactoUid, nombreContacto, fotoContacto) {
  window.contactoActivoUid = contactoUid; // Guardar el contacto activo globalmente

  // 1. Actualizar el header del chat (Nombre y Foto)
  const nombreHeader = document.querySelector(".amigo-nombre-chat");
  if (nombreHeader) nombreHeader.textContent = nombreContacto;

  const imgHeader = document.querySelector(".amigo-avatar-chat"); // Ajusta el selector si varía en tu HTML
  if (imgHeader && fotoContacto) imgHeader.src = fotoContacto;

  // 2. Obtener mi UID y generar el ID de sala compartido
  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  if (!miUid) return;

  const chatId = obtenerChatId(miUid, contactoUid);

  // 3. Empezar a escuchar mensajes en tiempo real desde Firebase
  if (typeof escucharMensajesChat === "function") {
    escucharMensajesChat(chatId);
  }
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
  const tieneIconoSend = btnAccionChat.querySelector("[data-lucide='send']");
  if (tieneIconoSend || inputChat.value.trim().length > 0 || !cajaVistaPrevia.classList.contains("oculto")) {
    return;
  }

  e.preventDefault();

  try {
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

      if (segundosGrabados >= 1 && fragmentosAudio.length > 0) {
        const blobAudio = new Blob(fragmentosAudio, { type: mimeAudio });
        const urlAudioReal = URL.createObjectURL(blobAudio);

        inyectarNotaDeVozBurbuja(contadorAudio.textContent, urlAudioReal);
      }
    };

    mediaRecorderAudio.start();
    estaGrabandoAudio = true;
    btnAccionChat.classList.add("grabando-activo");
    cajaInputNormal.classList.add("oculto");
    panelGrabacion.classList.remove("oculto");
    arrancarCronometroAudio();

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

  historialMensajes.appendChild(nuevaBurbujaHTML);
  if (typeof aplicarRelojArenaEfecto === "function") aplicarRelojArenaEfecto(nuevaBurbujaHTML);
  if (window.lucide) window.lucide.createIcons();
  historialMensajes.scrollTop = historialMensajes.scrollHeight;

  const btnPlay = nuevaBurbujaHTML.querySelector(".btn-play-audio");
  const audioElem = nuevaBurbujaHTML.querySelector(".audio-elemento-nativo");
  const agujaRoja = nuevaBurbujaHTML.querySelector(".aguja-reproduccion-roja");
  const nodoTextoTiempo = nuevaBurbujaHTML.querySelector(".tiempo-texto-nodo");
  const pistaOndas = nuevaBurbujaHTML.querySelector(".ondas-audio-preview");
  const barras = nuevaBurbujaHTML.querySelectorAll(".onda-barra");

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
    if (window.lucide) window.lucide.createIcons();
  });

  audioElem.ontimeupdate = function () {
    if (audioElem.duration) {
      const porcentaje = (audioElem.currentTime / audioElem.duration) * 100;
      agujaRoja.style.left = `${porcentaje}%`;

      const segsActuales = Math.floor(audioElem.currentTime);
      let mins = Math.floor(segsActuales / 60).toString().padStart(2, '0');
      let secs = (segsActuales % 60).toString().padStart(2, '0');
      nodoTextoTiempo.textContent = `${mins}:${secs}`;
    }
  };

  audioElem.onended = function () {
    btnPlay.innerHTML = `<i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i>`;
    barras.forEach(b => b.style.backgroundColor = "rgba(255,255,255,0.2)");
    agujaRoja.style.left = "0%";
    nodoTextoTiempo.textContent = duracion;
    if (window.lucide) window.lucide.createIcons();
  };

  pistaOndas.addEventListener("click", function (e) {
    const rectPista = pistaOndas.getBoundingClientRect();
    const clickX = e.clientX - rectPista.left;
    let porcentaje = (clickX / rectPista.width);

    if (porcentaje < 0) porcentaje = 0;
    if (porcentaje > 1) porcentaje = 1;

    if (audioElem.duration) {
      audioElem.currentTime = porcentaje * audioElem.duration;
      agujaRoja.style.left = `${porcentaje * 100}%`;
    }
  });

  const nombreAmigoActual = document.querySelector(".amigo-nombre-chat").textContent;
  if (typeof guardarMensajesEnMemoria === "function") {
    guardarMensajesEnMemoria(nombreAmigoActual, historialMensajes);
  }
}

// ========================================================
// 5. ENVÍO Y EDICIÓN DE MENSAJES (CONECTADO A FIREBASE)
// ========================================================
async function enviarMensajeNuevo() {
  const texto = inputChat.value.trim();
  const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

  if (texto === "" && !tieneAdjunto) return;

  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  // Guardamos el UID del contacto con el que estamos chateando actualmente
  const contactoUid = window.contactoActivoUid; 

  if (!miUid || !contactoUid) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Selecciona un contacto para chatear.", "⚠️", "#ff4b2b");
    }
    return;
  }

  const chatId = obtenerChatId(miUid, contactoUid);
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
    inputChat.value = "";
    actualizarIconoBotonAccion();
    return;
  }

  // 🟢 CASO: NUEVO MENSAJE (PREPARAR DATOS)
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
    objetoMensaje.tipoAdjunto = tipoAdjuntoActivo;

    if (tipoAdjuntoActivo === 'foto') {
      objetoMensaje.urlAdjunto = imgMiniaturaAdjunto.src;
    } else if (tipoAdjuntoActivo === 'documento') {
      objetoMensaje.nombreDoc = typeof nombreDocumentoSimulado !== 'undefined' ? nombreDocumentoSimulado : "Documento_Mova.pdf";
      objetoMensaje.urlAdjunto = imgMiniaturaAdjunto.src || "";
    } else if (tipoAdjuntoActivo === 'video') {
      const urlVideoCapturado = imgMiniaturaAdjunto.src && imgMiniaturaAdjunto.src.startsWith("blob:")
        ? imgMiniaturaAdjunto.src
        : "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";
      objetoMensaje.urlAdjunto = urlVideoCapturado;
    }

    // Limpiar caja de vista previa de adjuntos
    cajaVistaPrevia.classList.add("oculto");
    imgMiniaturaAdjunto.src = "";
    const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();
    tipoAdjuntoActivo = null;
    inputChat.placeholder = "Escribe un mensaje privado...";
  }

  // 🚀 SUBIR MENSAJE A FIREBASE REALTIME DATABASE
  try {
    const listaMensajesRef = ref(db, `chats/${chatId}/mensajes`);
    const nuevoMensajeRef = push(listaMensajesRef);
    await set(nuevoMensajeRef, objetoMensaje);

    // Limpiar input
    inputChat.value = "";
    actualizarIconoBotonAccion();
  } catch (error) {
    console.error("Error al enviar mensaje a Firebase:", error);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("No se pudo enviar el mensaje.", "❌", "#ff4b2b");
    }
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

document.querySelectorAll(".opcion-menu-ctx").forEach(boton => {
  boton.addEventListener("click", () => {
    const accion = boton.getAttribute("data-accion");

    const nodoMensaje = (typeof mensajeSeleccionadoNode !== "undefined") ? mensajeSeleccionadoNode : null;
    const nodoTexto = nodoMensaje ? nodoMensaje.querySelector(".mensaje-texto") : null;
    const textoMensaje = nodoTexto ? nodoTexto.textContent : "";

    if (accion === "copiar" && textoMensaje) {
      navigator.clipboard.writeText(textoMensaje);
    } else if (accion === "eliminar" && nodoMensaje) {
      nodoMensaje.style.transition = "all 0.2s ease-out";
      nodoMensaje.style.opacity = "0";
      nodoMensaje.style.transform = "scale(0.9)";
      setTimeout(() => { if (nodoMensaje) nodoMensaje.remove(); }, 200);
    } else if (accion === "editar" && textoMensaje && typeof inputChat !== "undefined") {
      inputChat.value = textoMensaje;
      inputChat.focus();

      window.burbujaEnEdicion = nodoMensaje;

      if (typeof btnAccionChat !== "undefined") {
        btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
      }
      if (window.lucide) window.lucide.createIcons();
    }

    if (typeof menuMensajes !== "undefined" && menuMensajes) {
      menuMensajes.classList.add("oculto");
    }
  });
});

function actualizarIconoBotonAccion() {
  if (!btnAccionChat) return;
  const tieneTexto = inputChat.value.trim().length > 0;
  const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

  if (!tieneTexto && window.burbujaEnEdicion) {
    window.burbujaEnEdicion = null;
  }

  if (tieneTexto || tieneAdjunto) {
    btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
  } else {
    btnAccionChat.innerHTML = `<i data-lucide="mic"></i>`;
  }
  if (window.lucide) window.lucide.createIcons();
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

// Evento para filtrar contactos con el buscador en tiempo real
const inputBuscadorModal = document.getElementById("input-buscar-contacto");

if (inputBuscador) {
  inputBuscador.addEventListener("input", (e) => {
    const textoBusqueda = e.target.value.toLowerCase();
    const items = document.querySelectorAll(".contacto-item");

    items.forEach((item) => {
      const nombre = item.querySelector(".nombre-contacto").textContent.toLowerCase();
      if (nombre.includes(textoBusqueda)) {
        item.style.display = "flex";
      } else {
        item.style.display = "none";
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

// --- MENÚ DINÁMICO DE 3 PUNTOS PARA LA CABECERA ---
const btnOpcionesCabecera = document.getElementById("btn-opciones-cabecera");
const menuCabeceraFlotante = document.getElementById("menu-desplegable-cabecera");
const listaOpcionesCabecera = document.getElementById("lista-opciones-cabecera");

if (btnOpcionesCabecera && menuCabeceraFlotante && listaOpcionesCabecera) {
  btnOpcionesCabecera.addEventListener("click", (e) => {
    e.stopPropagation();

    const estaOculto = menuCabeceraFlotante.classList.contains("oculto");

    if (estaOculto) {
      // Detección directa de si el perfil está visible
      const estaEnPerfil = pantallaPerfil && (pantallaPerfil.style.display === "flex" || pantallaPerfil.classList.contains("activa"));

      // Inyección dinámica de las opciones
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

      if (window.lucide) window.lucide.createIcons();
      asignarEventosMenuCabecera();

      menuCabeceraFlotante.classList.remove("oculto");
    } else {
      menuCabeceraFlotante.classList.add("oculto");
    }
  });
}

function asignarEventosMenuCabecera() {
  // --- 1. OPCIÓN: MI PERFIL ---
  const opcionMiPerfil = document.getElementById("opcion-mi-perfil");
  if (opcionMiPerfil) {
    opcionMiPerfil.addEventListener("click", () => {
      menuCabeceraFlotante.classList.add("oculto");
      if (btnPerfilMenu) btnPerfilMenu.click();
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Abriendo tu Perfil... 👤", "✨", "#00f2fe");
      }
    });
  }

  // --- 2. OPCIÓN: CAMBIAR CONTRASEÑA (Envía correo de recuperación) ---
  const opcionCambiarPassword = document.getElementById("opcion-cambiar-password");
  if (opcionCambiarPassword) {
    opcionCambiarPassword.addEventListener("click", async () => {
      menuCabeceraFlotante.classList.add("oculto");

      const usuarioActual = auth.currentUser;
      if (usuarioActual && usuarioActual.email) {
        try {
          // Importar dinámicamente o usar sendPasswordResetEmail de Firebase
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

  // --- 3. OPCIÓN: CERRAR SESIÓN (Desconexión Real) ---
  const opcionCerrarSesion = document.getElementById("opcion-cerrar-sesion");
  if (opcionCerrarSesion) {
    opcionCerrarSesion.addEventListener("click", async () => {
      menuCabeceraFlotante.classList.add("oculto");
      try {
        const { signOut } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        await signOut(auth); // Cierra sesión en Firebase

        mostrarAvisoPremium("Sesión cerrada correctamente 👋", "🚪", "#ff4b2b");
        // El listener onAuthStateChanged que ya tienes mostrará pantalla-auth automáticamente
      } catch (error) {
        console.error("Error al cerrar sesión:", error);
      }
    });
  }
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

// --- 3. EDITAR ESTADO DE PERFIL Y LED ---
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

if (toggleNotificaciones) {
  toggleNotificaciones.addEventListener("change", () => {
    if (toggleNotificaciones.checked) {
      localStorage.setItem("movachat-notificaciones", "activado");
      mostrarAvisoPremium("¡Notificaciones activadas con éxito! 🚀");
    } else {
      localStorage.setItem("movachat-notificaciones", "desactivado");
      if (badgeCampanita) badgeCampanita.classList.add("oculto");
      mostrarAvisoPremium("Notificaciones silenciadas por el usuario. 🔕");
    }
  });
}

// --- 5. MODO SIGILO (INVISIBLE) ---
const toggleSigilo = document.getElementById("check-sigilo");
const ledPerfilIdentidad = document.querySelector(".btn-estado-sutil .punto-online");
const textoEstadoIdentidad = document.querySelector(".texto-estado");

// Cargar estado inicial guardado de Sigilo
const estadoSigiloGuardado = localStorage.getItem("movachat-sigilo");
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
      mostrarAvisoPremium("Has entrado en Modo Sigilo. Presencia oculta. 🌌");
    } else {
      localStorage.setItem("movachat-sigilo", "inactivo");
      if (ledPerfilIdentidad) {
        ledPerfilIdentidad.style.backgroundColor = "#00f2fe";
        ledPerfilIdentidad.style.boxShadow = "0 0 10px #00f2fe";
      }
      if (textoEstadoIdentidad) {
        textoEstadoIdentidad.textContent = "Disponible. Toca para añadir estado...";
      }
      mostrarAvisoPremium("Modo Sigilo desactivado. Estás visible de nuevo. 📡");
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

const chatsSilenciadosBD = {};
const btnCtxSilenciar = document.getElementById("btn-ctx-silenciar");

if (btnCtxSilenciar) {
  btnCtxSilenciar.addEventListener("click", (e) => {
    e.stopPropagation();

    const nombreAmigoActual = document.querySelector(".amigo-nombre-chat").textContent;

    if (menuCabecera) menuCabecera.classList.add("oculto");

    let tarjetaAmigoNodo = null;
    document.querySelectorAll(".lista-chats .tarjeta-chat").forEach(tarjeta => {
      if (tarjeta.querySelector(".chat-nombre").textContent === nombreAmigoActual) {
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

    if (window.lucide) window.lucide.createIcons();
  });
}

const chatsTemporalesBD = {};
const btnCtxTemporales = document.getElementById("btn-ctx-temporales");

if (btnCtxTemporales) {
  btnCtxTemporales.addEventListener("click", (e) => {
    e.stopPropagation();

    const nombreAmigoActual = document.querySelector(".amigo-nombre-chat").textContent;

    if (menuCabecera) menuCabecera.classList.add("oculto");

    if (!chatsTemporalesBD[nombreAmigoActual]) {
      chatsTemporalesBD[nombreAmigoActual] = true;
      btnCtxTemporales.innerHTML = `<i data-lucide="hourglass"></i> Mensajes normales`;
      mostrarAvisoPremium(`Modo efímero activo con <b>${nombreAmigoActual}</b>. Los mensajes nuevos durarán 10s.`, "⏳", "#00f2fe");
    } else {
      chatsTemporalesBD[nombreAmigoActual] = false;
      btnCtxTemporales.innerHTML = `<i data-lucide="hourglass"></i> Mensajes temporales`;
      mostrarAvisoPremium(`Modo permanente restaurado con <b>${nombreAmigoActual}</b>.`, "📡", "#00f2fe");
    }

    if (window.lucide) window.lucide.createIcons();
  });
}

function aplicarRelojArenaEfecto(burbujaNodo) {
  const nombreAmigoActual = document.querySelector(".amigo-nombre-chat").textContent;

  if (chatsTemporalesBD[nombreAmigoActual]) {
    burbujaNodo.classList.add("mensaje-efimero");

    const horaNodo = burbujaNodo.querySelector(".mensaje-hora");
    if (horaNodo && !horaNodo.querySelector("[data-lucide='hourglass']")) {
      horaNodo.insertAdjacentHTML("afterbegin", `<i data-lucide="hourglass" style="width:10px; height:10px; display:inline-block; margin-right:4px; opacity:0.6; vertical-align:middle;"></i>`);
      if (window.lucide) window.lucide.createIcons();
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

const chatsBloqueadosBD = {};
const btnCtxBloquear = document.getElementById("btn-ctx-bloquear");

if (btnCtxBloquear) {
  btnCtxBloquear.addEventListener("click", (e) => {
    e.stopPropagation();

    const nombreAmigoActual = document.querySelector(".amigo-nombre-chat").textContent;

    if (menuCabecera) menuCabecera.classList.add("oculto");

    let tarjetaAmigoNodo = null;
    document.querySelectorAll(".lista-chats .tarjeta-chat").forEach(tarjeta => {
      if (tarjeta.querySelector(".chat-nombre").textContent === nombreAmigoActual) {
        tarjetaAmigoNodo = tarjeta;
      }
    });

    if (!chatsBloqueadosBD[nombreAmigoActual]) {
      chatsBloqueadosBD[nombreAmigoActual] = true;

      btnCtxBloquear.innerHTML = `<i data-lucide="shield-check"></i> Desbloquear usuario`;
      btnCtxBloquear.classList.remove("texto-rojo");
      btnCtxBloquear.style.color = "#00f2fe";

      if (inputChat) {
        inputChat.disabled = true;
        inputChat.placeholder = "Has bloqueado a este usuario.";
        inputChat.style.opacity = "0.5";
      }
      if (btnAccionChat) {
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

      if (inputChat) {
        inputChat.disabled = false;
        inputChat.placeholder = "Escribe un mensaje privado...";
        inputChat.style.opacity = "1";
      }
      if (btnAccionChat) {
        btnAccionChat.style.pointerEvents = "auto";
        btnAccionChat.style.opacity = "1";
      }

      if (tarjetaAmigoNodo) {
        tarjetaAmigoNodo.style.opacity = "1";
        tarjetaAmigoNodo.style.filter = "none";
      }

      mostrarAvisoPremium(`Has desbloqueado a <b>${nombreAmigoActual}</b>. Conexión restaurada.`, "📡", "#00f2fe");
    }

    if (window.lucide) window.lucide.createIcons();
  });
}

const btnCtxVaciar = document.getElementById("btn-ctx-vaciar");
if (btnCtxVaciar) {
  btnCtxVaciar.addEventListener("click", (e) => {
    e.stopPropagation();

    const nombreAmigoActual = document.querySelector(".amigo-nombre-chat").textContent;
    if (menuCabecera) menuCabecera.classList.add("oculto");

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
  const esFijado = tarjeta.classList.contains("tarjeta-fijada");

  // 📐 Referencia del contenedor principal para evitar overflow en PC y móvil
  const marcoApp = document.querySelector(".contenedor-chat").getBoundingClientRect();

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

  // 📍 Posicionamiento absoluto seguro
  menuTarjetas.style.position = "absolute";
  menuTarjetas.style.top = `${posY}px`;
  menuTarjetas.style.left = `${posX}px`;
  menuTarjetas.style.zIndex = "99999";
  menuTarjetas.style.display = "block"; // Rompe el bloqueo de pantalla

  if (btnCtxFijar) {
    btnCtxFijar.innerHTML = `<i data-lucide="pin"></i> <span>${esFijado ? 'Desfijar chat' : 'Fijar chat arriba'}</span>`;
    if (window.lucide) window.lucide.createIcons();
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

// 📌 Lógica para Fijar / Desfijar Chat
function alternarFijarChat(tarjeta) {
  const cabecera = tarjeta.querySelector(".chat-cabecera");
  let pinIcono = tarjeta.querySelector(".indicador-pin-neon");

  if (tarjeta.classList.contains("tarjeta-fijada")) {
    tarjeta.classList.remove("tarjeta-fijada");
    tarjeta.style.order = "";
    if (pinIcono) pinIcono.remove();
  } else {
    tarjeta.classList.add("tarjeta-fijada");
    tarjeta.style.order = "-1";

    if (!pinIcono && cabecera) {
      cabecera.insertAdjacentHTML(
        "beforeend",
        `<span class="indicador-pin-neon"><i data-lucide="pin" style="width:14px; height:14px;"></i></span>`
      );
      if (window.lucide) window.lucide.createIcons();
    }
  }
}

// 🗑️ Lógica para Eliminar Chat con Animación
function eliminarChatAnimado(tarjeta) {
  tarjeta.classList.add("tarjeta-eliminar-anim");
  setTimeout(() => {
    tarjeta.remove();
  }, 300);
}

// ========================================================
// 13. GESTIÓN DE CONTACTOS Y MODALES
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

const listaContactosBD = [];

// 🟢 LÓGICA CONECTADA A FIREBASE (Contactos reales + Apertura de chat directa)
async function renderizarListaContactosModal(filtro = "") {
  if (!contenedorListaContactos) return;
  contenedorListaContactos.innerHTML = "";

  const textoFiltro = filtro.toLowerCase().trim();
  const miUid = auth.currentUser ? auth.currentUser.uid : null;

  if (!miUid) return;

  try {
    // 1. Obtener los contactos del usuario desde Firebase Realtime Database
    const misContactosRef = ref(db, `mis_contactos/${miUid}`);
    const snapshotContactos = await get(misContactosRef);

    if (snapshotContactos.exists()) {
      const contactosUids = Object.keys(snapshotContactos.val());

      // 2. Traer los datos reales de la colección 'usuarios'
      for (const targetUid of contactosUids) {
        const usuarioRef = ref(db, `usuarios/${targetUid}`);
        const snapUsuario = await get(usuarioRef);

        if (snapUsuario.exists()) {
          const usuario = snapUsuario.val();
          const nombreContacto = usuario.nombre || "Usuario";

          // Filtro por texto de búsqueda
          if (nombreContacto.toLowerCase().includes(textoFiltro)) {
            const filaHTML = document.createElement("div");
            filaHTML.className = "item-contacto-fila";

            // Foto real subida a Firebase o avatar con la inicial del nombre
            const primerLetra = nombreContacto.charAt(0).toUpperCase();
            const fotoHTML = usuario.fotoUrl 
              ? `<img src="${usuario.fotoUrl}" alt="${nombreContacto}" class="avatar-contacto-mini">`
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

            // 🟢 EVENTO PARA ABRIR CHAT EN TIEMPO REAL AL TOCAR EL CONTACTO
            const infoIzq = filaHTML.querySelector(".info-contacto-izq");
            if (infoIzq) {
              infoIzq.addEventListener("click", () => {
                // Abrir sala con este usuario
                if (typeof abrirChatConUsuario === "function") {
                  abrirChatConUsuario(targetUid, nombreContacto, usuario.fotoUrl || "");
                }

                // Cerrar el modal de contactos
                const modalContactos = document.getElementById("modal-contactos");
                if (modalContactos) modalContactos.classList.add("oculto");

                // Activar pantalla de chat en móviles
                const panelChat = document.querySelector(".panel-chat");
                if (panelChat) panelChat.classList.add("activo");
              });
            }

            // 🔴 EVENTO PARA ELIMINAR CONTACTO
            const btnZafacon = filaHTML.querySelector(".btn-eliminar-contacto-item");
            if (btnZafacon) {
              btnZafacon.addEventListener("click", (e) => {
                e.stopPropagation(); // Impide que abra el chat al tocar la papelera
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
      }

      if (window.lucide) window.lucide.createIcons();
    } else {
      contenedorListaContactos.innerHTML = `<p style="color:rgba(255,255,255,0.5); font-size:12px; text-align:center; padding:10px;">No tienes contactos agregados aún.</p>`;
    }
  } catch (error) {
    console.error("Error al cargar la lista de contactos:", error);
  }
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

  nuevaBurbujaHTML.innerHTML = `
    <div class="tarjeta-contacto-compartido">
      <div class="cabecera-contacto-card">
        <img src="${avatar}" alt="${nombre}" class="avatar-contacto-card">
        <div class="info-contacto-card">
          <span class="nombre-contacto-card">${nombre}</span>
          <span class="subtexto-contacto-card">
            <i data-lucide="shield-check" style="width:12px; height:12px;"></i> Contacto MovaChat
          </span>
        </div>
      </div>
      <button class="btn-accion-contacto-card" onclick="mostrarAvisoPremium('Iniciando conversación con ${nombre}...', '💬', '#00f2fe')">
        <i data-lucide="message-square" style="width:14px; height:14px;"></i> Chatear
      </button>
    </div>
    <span class="mensaje-hora" style="margin-top: 4px;">${horaFormateada}</span>
  `;

  if (historialMensajes) {
    historialMensajes.appendChild(nuevaBurbujaHTML);
    aplicarRelojArenaEfecto(nuevaBurbujaHTML);
    if (window.lucide) window.lucide.createIcons();
    historialMensajes.scrollTop = historialMensajes.scrollHeight;

    mostrarAvisoPremium(`Contacto <b>${nombre}</b> compartido con éxito.`, "📇", "#00f2fe");
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

document.addEventListener("DOMContentLoaded", () => {
  conectarBotonEmoji();

  const menuTarjetas = document.getElementById("menu-tarjetas-chat");

  window.addEventListener("scroll", cerrarMenuContextualMova, true);

  if (window.lucide) {
    window.lucide.createIcons();
  }
});

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

function mostrarToast(mensaje) {
  // Comprobar si el usuario desactivó las notificaciones
  const notifEstado = localStorage.getItem("movachat-notificaciones");
  if (notifEstado === "desactivado") return; // No muestra la alerta flotante

  const toast = document.getElementById("toast-notificacion");
  const texto = document.getElementById("toast-texto");
  if (!toast) return;

  if (texto) texto.textContent = mensaje;
  toast.classList.remove("oculto");
  if (window.lucide) window.lucide.createIcons();

  setTimeout(() => {
    toast.classList.add("oculto");
  }, 2500);
}

// --- REGISTRO DE SERVICE WORKER PARA PWA ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then((reg) => console.log('✅ PWA Service Worker registrado con éxito:', reg.scope))
      .catch((err) => console.warn('❌ Error al registrar Service Worker:', err));
  });
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

// Función global para cambiar el estado de acceso desde los botones
window.cambiarEstadoAcceso = async function (uid, nuevoEstado) {
  try {
    await update(ref(db, 'usuarios/' + uid), {
      estadoAcceso: nuevoEstado
    });

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Usuario ${nuevoEstado === 'aprobado' ? 'aprobado' : 'rechazado'} con éxito`, "✅", "#2ec4b6");
    }
  } catch (error) {
    console.error("Error al actualizar acceso:", error);
    alert("Error al actualizar el estado del usuario.");
  }
};

// Variable global para guardar el contacto seleccionado actualmente
let contactoSeleccionado = null;

// Función para cargar los contactos aprobados en tiempo real
function cargarContactosAprobados(usuarioActualUid) {
  const contenedorContactos = document.getElementById("lista-chats-principal");
  if (!contenedorContactos) return;

  const usuariosRef = ref(db, 'usuarios');

  onValue(usuariosRef, (snapshot) => {
    try {
      const tarjetaMiEstado = document.getElementById("tarjeta-mi-estado-propio");

      // Limpiar lista anterior
      contenedorContactos.innerHTML = "";

      // Preservar la tarjeta de "Mi Estado" arriba del todo
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

            // Evento optimizado para PC y móviles
            itemContacto.addEventListener("click", (e) => {
              e.stopPropagation();

              document.querySelectorAll(".tarjeta-chat").forEach(el => el.classList.remove("activo"));
              itemContacto.classList.add("activo");

              contactoSeleccionado = usuario;

              if (typeof abrirChatConUsuario === "function") {
                abrirChatConUsuario(usuario);
              } else if (window.abrirChatConUsuario) {
                window.abrirChatConUsuario(usuario);
              }
            });

            contenedorContactos.appendChild(itemContacto);
          }
        });
      }
    } catch (e) {
      console.error("Error al cargar la lista de contactos:", e);
    }
  });
}

// Función para abrir la ventana de chat con el usuario seleccionado
function abrirChatConUsuario(usuario) {
  // 1. Mostrar la cabecera/chat activo
  const nombreChatActivo = document.getElementById("nombre-chat-activo"); // Ajusta el ID según tu HTML
  const fotoChatActivo = document.getElementById("foto-chat-activo");     // Ajusta el ID según tu HTML

  if (nombreChatActivo) nombreChatActivo.textContent = usuario.nombre;

  if (fotoChatActivo) {
    if (usuario.fotoUrl) {
      fotoChatActivo.src = usuario.fotoUrl;
      fotoChatActivo.style.display = "block";
    } else {
      fotoChatActivo.style.display = "none";
    }
  }

  console.log("💬 Chat abierto con:", usuario.nombre);

  // 2. Aquí escucharemos los mensajes en vivo entre tú y este usuario
  cargarMensajesChat(usuario.uid);
}

// Función para enviar un mensaje al contacto activo
async function enviarMensaje() {
  const inputMensaje = document.getElementById("input-chat-privado");
  if (!inputMensaje) return;

  const texto = inputMensaje.value.trim();
  const usuarioActual = auth.currentUser;

  // Validar que haya texto, usuario logueado y contacto seleccionado
  if (!texto || !usuarioActual || !contactoSeleccionado) return;

  const chatId = obtenerChatId(usuarioActual.uid, contactoSeleccionado.uid);
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);

  try {
    const nuevoMensajeRef = push(mensajesRef);

    await set(nuevoMensajeRef, {
      emisorUid: usuarioActual.uid,
      receptorUid: contactoSeleccionado.uid,
      texto: texto,
      fecha: Date.now(),
      leido: false
    });

    // Limpiar input
    inputMensaje.value = "";
    inputMensaje.focus();

  } catch (error) {
    console.error("❌ Error al enviar mensaje:", error);
  }
}

// 📌 ESCUCHAR EVENTOS (Click en el botón y tecla Enter en el teclado móvil/PC)
const inputChatPrivado = document.getElementById("input-chat-privado");

if (btnAccionChat) {
  btnAccionChat.addEventListener("click", (e) => {
    e.preventDefault(); // Impide recargas accidentales en móviles
    if (typeof enviarMensaje === "function") {
      enviarMensaje();
    }
  });
}

if (inputChatPrivado) {
  // 'keydown' es compatible con todos los teclados virtuales de Android y iOS
  inputChatPrivado.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault(); // Evita el salto de línea y el envío doble
      if (typeof enviarMensaje === "function") {
        enviarMensaje();
      }
    }
  });
}

// 📌 Escuchar mensajes en tiempo real desde Firebase
function escucharMensajesChat(chatId) {
  if (!historialMensajes) return;
  
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);

  // Escuchar cambios en la base de datos de Firebase
  onValue(mensajesRef, (snapshot) => {
    historialMensajes.innerHTML = ""; // Limpiar lista antes de redibujar
    const miUid = auth.currentUser ? auth.currentUser.uid : null;

    if (snapshot.exists()) {
      const mensajes = snapshot.val();

      Object.keys(mensajes).forEach((msgId) => {
        const msg = mensajes[msgId];
        const esMio = msg.emisor === miUid;

        let contenidoBurbuja = "";
        let estiloEspecialBurbuja = "";

        // Adjunto Imagen
        if (msg.tipoAdjunto === 'foto') {
          contenidoBurbuja = `
            <div class="contenedor-foto-enviada" style="max-width: 100%; margin-bottom: 6px; border-radius: 10px; overflow: hidden; cursor: pointer;">
              <img src="${msg.urlAdjunto}" style="width: 100%; display: block; border-radius: 8px;">
            </div>
            ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
            <span class="mensaje-hora">${msg.hora}${msg.editado ? ' <span style="font-size:0.65rem; opacity:0.6;">(editado)</span>' : ''}</span>
          `;
        } 
        // Adjunto Documento
        else if (msg.tipoAdjunto === 'documento') {
          contenidoBurbuja = `
            <div class="contenedor-documento-enviado" style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.05); padding: 10px; border-radius: 10px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.1); cursor: pointer;">
              <i data-lucide="file-text" style="color: #00f2fe; width:24px; height:24px;"></i>
              <span style="font-size: 0.85rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 150px;">${msg.nombreDoc || "Documento"}</span>
            </div>
            ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
            <span class="mensaje-hora">${msg.hora}${msg.editado ? ' <span style="font-size:0.65rem; opacity:0.6;">(editado)</span>' : ''}</span>
          `;
        }
        // Adjunto Video Circular
        else if (msg.tipoAdjunto === 'video') {
          estiloEspecialBurbuja = "padding: 10px;";
          contenidoBurbuja = `
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
            <span class="mensaje-hora" style="margin-top: 6px; display: block; text-align: center;">${msg.hora}${msg.editado ? ' (editado)' : ''}</span>
          `;
        } 
        // Mensaje de solo texto
        else {
          contenidoBurbuja = `
            <p class="mensaje-texto">${msg.texto}</p>
            <span class="mensaje-hora">${msg.hora}${msg.editado ? ' <span style="font-size:0.65rem; opacity:0.6;">(editado)</span>' : ''}</span>
          `;
        }

        // Crear contenedor HTML de la burbuja
        const burbujaHTML = document.createElement("div");
        burbujaHTML.className = `mensaje-burbuja ${esMio ? 'enviado' : 'recibido'}`;
        burbujaHTML.setAttribute("data-msg-id", msgId);
        if (estiloEspecialBurbuja) burbujaHTML.style.cssText = estiloEspecialBurbuja;
        burbujaHTML.innerHTML = contenidoBurbuja;

        historialMensajes.appendChild(burbujaHTML);
      });

      // Refrescar iconos y hacer scroll hacia el último mensaje
      if (window.lucide) window.lucide.createIcons();
      historialMensajes.scrollTop = historialMensajes.scrollHeight;
    }
  });
}