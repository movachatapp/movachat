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

// Capturar mensaje desde el Service Worker cuando la app ya está abierta
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.accion === 'ABRIR_CHAT' && event.data.chatId) {
      abrirConversacion(event.data.chatId);
    }
  });
}

// 🔄 Cargar preferencia de tema visual de forma segura
(function cargarTemaGuardado() {
  const aplicarTema = () => {
    const temaGuardado = localStorage.getItem("tema_app_pwa");
    if (document.body) {
      document.body.classList.toggle("tema-claro", temaGuardado === "claro");
    }
  };

  if (document.body) {
    aplicarTema();
  } else {
    document.addEventListener("DOMContentLoaded", aplicarTema);
  }
})();;

// Inicializar Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getDatabase(app);

// --- CONFIGURACIÓN DE SUPABASE (STORAGE) ---
const SUPABASE_URL = "https://tnzsdtmesqfcunqtoqyh.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_wLeldDB6ZazOpVq21_cg1A_P1ndcD-N";
// Inicializamos el cliente global de Supabase
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Sube un archivo a Supabase Storage y retorna la URL pública.
 * @param {File} archivo - El archivo File/Blob obtenido del input.
 * @param {string} bucket - Nombre de tu bucket en Supabase (ej: 'movachat-adjuntos').
 * @returns {Promise<string|null>} URL pública del archivo o null si ocurre un error.
 */
async function subirArchivoSupabase(archivo, bucket = "movachat-adjuntos") {
  try {
    if (!archivo) return null;

    // 1. Generar un nombre único basado en fecha y extensión
    const extension = archivo.name ? archivo.name.split('.').pop() : 'bin';
    const nombreUnico = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extension}`;
    const rutaArchivo = `adjuntos/${nombreUnico}`;

    // 2. Subir archivo a Supabase Storage
    const { data, error } = await supabaseClient
      .storage
      .from(bucket)
      .upload(rutaArchivo, archivo, {
        cacheControl: '3600',
        upsert: false
      });

    if (error) {
      console.error("❌ Error subiendo a Supabase Storage:", error.message);
      return null;
    }

    // 3. Obtener la URL pública del archivo subido
    const { data: publicUrlData } = supabaseClient
      .storage
      .from(bucket)
      .getPublicUrl(rutaArchivo);

    console.log("✅ Archivo subido con éxito a Supabase:", publicUrlData.publicUrl);
    return publicUrlData.publicUrl;

  } catch (err) {
    console.error("❌ Error inesperado en subirArchivoSupabase:", err);
    return null;
  }
}

/**
 * Borra un archivo físicamente de Supabase Storage usando su URL pública.
 * @param {string} urlPublica - La URL pública del archivo en Supabase.
 * @returns {Promise<boolean>} Devuelve true si se eliminó correctamente.
 */
async function borrarArchivoDeSupabase(urlPublica) {
  if (!urlPublica || typeof urlPublica !== "string" || !urlPublica.includes("supabase.co")) {
    return false;
  }

  try {
    // Extrae la ruta interna (ejemplo: "adjuntos/1723000000_abc123.m4a") desde la URL pública
    const urlObj = new URL(urlPublica);
    const partesPath = urlObj.pathname.split("/movachat-adjuntos/");

    if (partesPath.length < 2) return false;

    const rutaInternaArchivo = decodeURIComponent(partesPath[1]);

    // Usamos 'supabaseClient' igual que en tu función subirArchivoSupabase
    const { data, error } = await supabaseClient
      .storage
      .from("movachat-adjuntos")
      .remove([rutaInternaArchivo]);

    if (error) {
      console.error("❌ Error eliminando archivo de Supabase Storage:", error.message);
      return false;
    }

    console.log("🔥 Archivo eliminado físicamente de Supabase:", rutaInternaArchivo);
    return true;

  } catch (err) {
    console.error("❌ Excepción al procesar borrado en Supabase:", err);
    return false;
  }
}

/**
 * ⏱️ Verificador de caducidad para notas de voz
 * Si pasaron 12 días, destruye el archivo en Supabase y actualiza la BD.
 */
async function procesarCaducidadNotaVoz(idChat, idMensaje, msg) {
  if (!msg || msg.tipoAdjunto !== "audio") return false;

  const ahora = Date.now();
  const haCaducado = msg.caducado || (msg.expiraEn && ahora >= msg.expiraEn);

  if (haCaducado) {
    // 1. Si aún conserva la URL en Supabase, destruimos el archivo físico
    if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
      await borrarArchivoDeSupabase(msg.urlAdjunto);

      // 2. Actualizamos el registro en la BD para eliminar la URL y marcar como caducado
      try {
        const msgRef = ref(db, `chats/${idChat}/mensajes/${idMensaje}`);
        await update(msgRef, {
          caducado: true,
          urlAdjunto: null // Remueve la URL para liberar memoria
        });
      } catch (err) {
        console.error("❌ Error al actualizar estado caducado en Firebase:", err);
      }
    }
    return true;
  }

  return false;
}

// ⏱️ RUTINA DE PURGA DE MENSAJES TEMPORALES / EFÍMEROS
async function procesarLimpiezaMensajesTemporales(idChat) {
  if (!idChat) return;

  const mensajesRef = ref(db, `chats/${idChat}/mensajes`);
  const snap = await get(mensajesRef);

  if (!snap.exists()) return;

  const mensajes = snap.val();
  const ahora = Date.now();

  for (const idMensaje in mensajes) {
    const msg = mensajes[idMensaje];

    // Verificar si el mensaje ya expiró por tiempo temporal o caducidad
    if (msg.expiraEn && ahora >= msg.expiraEn) {

      // 💣 1. Destrucción física en Supabase si es nota de voz o adjunto
      if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
        await borrarArchivoDeSupabase(msg.urlAdjunto);
      }

      // 🗑️ 2. Eliminar el nodo por completo de Firebase Realtime Database
      const msgEspecificoRef = ref(db, `chats/${idChat}/mensajes/${idMensaje}`);
      await remove(msgEspecificoRef);

      console.log(`🔥 Mensaje temporal/audio ${idMensaje} eliminado de Supabase y Firebase.`);
    }
  }
}

/**
 * 🗜️ COMPRESOR GRADUADO DE IMÁGENES A WEBP (SIN RECORTES AGRESIVOS)
 * @param {File} archivoImagen - Archivo original.
 * @param {Object} opciones - Configuración de dimensiones y calidad.
 * @returns {Promise<File>} Archivo File comprimido en formato WebP.
 */
function comprimirImagenWebP(archivoImagen, opciones = { maxAncho: 1440, maxAlto: 1440, calidad: 0.82, esPerfil: false }) {
  return new Promise((resolve, reject) => {
    if (!archivoImagen || !archivoImagen.type.startsWith("image/")) {
      return resolve(archivoImagen);
    }

    const lector = new FileReader();
    lector.readAsDataURL(archivoImagen);

    lector.onload = (evento) => {
      const img = new Image();
      img.src = evento.target.result;

      img.onload = () => {
        const canvas = document.createElement("canvas");
        const ctx = canvas.getContext("2d");

        let ancho = img.width;
        let alto = img.height;

        if (opciones.esPerfil) {
          // 👤 FOTO DE PERFIL: 400x400px con calidad alta (0.85)
          const tamanoTarget = 400;
          canvas.width = tamanoTarget;
          canvas.height = tamanoTarget;

          const minLado = Math.min(ancho, alto);
          const srcX = (ancho - minLado) / 2;
          const srcY = (alto - minLado) / 2;

          ctx.drawImage(img, srcX, srcY, minLado, minLado, 0, 0, tamanoTarget, tamanoTarget);
        } else {
          // 💬 CHAT E HISTORIAS: Escalar respetando la proporción exactas sin recortar
          const maxAncho = opciones.maxAncho || 1440;
          const maxAlto = opciones.maxAlto || 1440;

          if (ancho > maxAncho || alto > maxAlto) {
            const proporcion = Math.min(maxAncho / ancho, maxAlto / alto);
            ancho = Math.round(ancho * proporcion);
            alto = Math.round(alto * proporcion);
          }

          canvas.width = ancho;
          canvas.height = alto;
          ctx.drawImage(img, 0, 0, ancho, alto);
        }

        // Exportar a WebP con calidad alta de 0.82
        canvas.toBlob(
          (blob) => {
            if (!blob) {
              console.warn("⚠️ No se pudo comprimir a WebP, usando archivo original.");
              return resolve(archivoImagen);
            }

            const nombreOriginal = archivoImagen.name ? archivoImagen.name.split('.')[0] : "foto";
            const nuevoArchivo = new File([blob], `${nombreOriginal}_comp.webp`, {
              type: "image/webp",
              lastModified: Date.now()
            });

            console.log(`🗜️ Imagen optimizada: ${(archivoImagen.size / 1024).toFixed(1)} KB ➔ ${(nuevoArchivo.size / 1024).toFixed(1)} KB (${ancho}x${alto}px)`);
            resolve(nuevoArchivo);
          },
          "image/webp",
          opciones.calidad || 0.82
        );
      };

      img.onerror = (err) => reject(err);
    };

    lector.onerror = (err) => reject(err);
  });
}

/**
 * 🗑️ ELIMINAR ARCHIVO FÍSICO DE SUPABASE STORAGE A PARTIR DE SU URL
 * @param {string} urlPublica - URL completa guardada en la nube.
 * @param {string} bucket - Nombre del bucket en Supabase.
 */
async function eliminarArchivoSupabase(urlPublica, bucket = "movachat-adjuntos") {
  try {
    if (!urlPublica || !urlPublica.includes("supabase.co")) return;

    // Extraer la ruta interna del archivo desde la URL pública
    const partesUrl = urlPublica.split(`${bucket}/`);
    if (partesUrl.length < 2) return;

    const rutaInterna = partesUrl[1];

    const { error } = await supabaseClient
      .storage
      .from(bucket)
      .remove([rutaInterna]);

    if (error) {
      console.error("❌ Error al eliminar archivo de Supabase:", error.message);
    } else {
      console.log("🗑️ Archivo antiguo eliminado de Supabase Storage:", rutaInterna);
    }
  } catch (err) {
    console.error("❌ Error inesperado en eliminarArchivoSupabase:", err);
  }
}

// ========================================================
// 👤 SUBIR Y REEMPLAZAR FOTO DE PERFIL CON COMPRESIÓN Y LIMPIEZA
// ========================================================
const inputFotoPerfil = document.getElementById("input-foto-perfil");

if (inputFotoPerfil) {
  inputFotoPerfil.addEventListener("change", async (e) => {
    const archivoSel = e.target.files && e.target.files[0];
    const usuarioActual = auth.currentUser;

    if (!archivoSel || !usuarioActual) return;

    try {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Optimizando y subiendo nueva foto de perfil... 👤", "☁️", "#00f2fe");
      }

      // 1. Obtener la foto de perfil actual desde Firebase para saber si debemos borrarla
      const userSnap = await get(ref(db, `usuarios/${usuarioActual.uid}`));
      const fotoUrlAnterior = userSnap.exists() ? userSnap.val().fotoUrl : null;

      // 2. Comprimir imagen a WebP de 250x250px (< 30 KB)
      const fotoPerfilComprimida = await comprimirImagenWebP(archivoSel, {
        esPerfil: true,
        calidad: 0.85
      });

      // 3. Subir la nueva foto a Supabase Storage
      const nuevaUrlFoto = await subirArchivoSupabase(fotoPerfilComprimida, "movachat-adjuntos");

      if (nuevaUrlFoto) {
        // 4. Si la subida fue exitosa, borrar la foto anterior de Supabase para evitar basura
        if (fotoUrlAnterior) {
          await eliminarArchivoSupabase(fotoUrlAnterior, "movachat-adjuntos");
        }

        // 5. Actualizar la nueva URL en Firebase y Auth
        await update(ref(db, `usuarios/${usuarioActual.uid}`), { fotoUrl: nuevaUrlFoto });
        await updateProfile(usuarioActual, { photoURL: nuevaUrlFoto });

        // ⚡ 6. REFRESCAR EN VIVO LOS ELEMENTOS VISUALES EN LA PANTALLA
        const elemFotoPerfil = document.querySelector(".avatar-perfil-img");
        const imgMiAvatarBandeja = document.getElementById("img-mi-avatar-bandeja");

        if (elemFotoPerfil) elemFotoPerfil.src = nuevaUrlFoto;
        if (imgMiAvatarBandeja) imgMiAvatarBandeja.src = nuevaUrlFoto;

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("¡Foto de perfil actualizada y optimizada! ✨", "📸", "#00f2fe");
        }
      }
    } catch (err) {
      console.error("❌ Error al actualizar foto de perfil:", err);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("No se pudo actualizar la foto de perfil.", "❌", "#ff4b2b");
      }
    }
  });
}

// ========================================================
// 📸 INTERACTIVIDAD DE FOTO DE PERFIL (VER HD Y CAMBIAR)
// ========================================================

// 1. Capturamos los elementos de tu HTML exacto
const imgAvatarPerfil = document.querySelector(".avatar-perfil-img"); // Atrapa tu imagen
const btnCamarita = document.querySelector(".overlay-camara"); // ¡Actualizado a tu clase overlay-camara!

// 2. Lógica para la Camarita (Abrir Galería y probar Supabase)
if (btnCamarita && inputFotoPerfil) {
  btnCamarita.addEventListener("click", (e) => {
    // Evita que el clic abra la foto en HD por accidente
    e.stopPropagation();

    // Simula un clic en el input oculto para abrir la galería del celular/PC
    inputFotoPerfil.click();
  });
}

// 3. Lógica para la Foto de Perfil (Abrir Modal HD)
if (imgAvatarPerfil) {
  imgAvatarPerfil.style.cursor = "pointer";

  imgAvatarPerfil.addEventListener("click", (e) => {
    e.stopPropagation();

    const urlMiFoto = imgAvatarPerfil.src;
    // Buscamos tu nombre en el perfil, si no lo encuentra dice "Mí"
    const miNombreNodo = document.querySelector("#texto-perfil-nombre span");
    const miNombre = miNombreNodo ? miNombreNodo.textContent : "Mí";

    // Reutilizamos el visor de historias
    const visor = document.getElementById("visor-historias-mova");
    const imgRender = document.getElementById("img-estado-render");
    const textoRender = document.getElementById("texto-estado-render");
    const lineaProg = document.getElementById("linea-progreso-estado");

    if (visor && imgRender && textoRender) {
      imgRender.src = urlMiFoto;
      textoRender.textContent = `Foto de perfil de ${miNombre}`;

      // Ocultamos la barrita de tiempo de las historias
      if (lineaProg && lineaProg.parentNode) {
        lineaProg.parentNode.style.visibility = "hidden";
      }

      visor.classList.remove("oculto");

      // Notificación estilo Glassmorphism
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Visualizando tu foto en Alta Definición 🌌", "📸", "#00f2fe");
      }
    }
  });
}

/**
 * ☁️ Subida a Supabase con progreso optimizado (Sin parpadeos)
 */
function subirArchivoSupabaseConProgreso(archivo, bucket = "movachat-adjuntos", enProgreso) {
  return new Promise((resolve) => {
    if (!archivo) return resolve(null);

    const extension = archivo.name ? archivo.name.split('.').pop() : 'bin';
    const nombreUnico = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${extension}`;
    const rutaArchivo = `adjuntos/${nombreUnico}`;
    const urlEndpoint = `${SUPABASE_URL}/storage/v1/object/${bucket}/${rutaArchivo}`;

    const xhr = new XMLHttpRequest();
    xhr.open("POST", urlEndpoint, true);

    xhr.setRequestHeader("Authorization", `Bearer ${SUPABASE_ANON_KEY}`);
    xhr.setRequestHeader("apikey", SUPABASE_ANON_KEY);
    xhr.setRequestHeader("Content-Type", archivo.type || "application/octet-stream");

    let ultimoPorcentaje = 0;

    // 📊 Escuchar avance limitando las actualizaciones a tramos de 20%
    xhr.upload.onprogress = (evento) => {
      if (evento.lengthComputable) {
        const porcentaje = Math.round((evento.loaded / evento.total) * 100);
        const subidoMB = (evento.loaded / (1024 * 1024)).toFixed(2);
        const totalMB = (evento.total / (1024 * 1024)).toFixed(2);

        // 🛡️ Actualizar solo cada 20% o al llegar a 100% para evitar saturar la UI
        if (porcentaje - ultimoPorcentaje >= 20 || porcentaje === 100) {
          ultimoPorcentaje = porcentaje;
          if (typeof enProgreso === "function") {
            enProgreso(porcentaje, subidoMB, totalMB);
          }
        }
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const urlPublica = `${SUPABASE_URL}/storage/v1/object/public/${bucket}/${rutaArchivo}`;
        resolve(urlPublica);
      } else {
        console.error("❌ Error XHR Supabase:", xhr.responseText);
        resolve(null);
      }
    };

    xhr.onerror = (err) => {
      console.error("❌ Error de red al subir a Supabase:", err);
      resolve(null);
    };

    xhr.send(archivo);
  });
}

const contactosRegistradosSet = new Set();

// 🌐 FORZAR IDIOMA ESPAÑOL EN FIREBASE
auth.languageCode = 'es';

// --- DECLARACIÓN DE VARIABLES GLOBALES DE ESTADO ---
let streamCamaraLive = null;
let segundosRestantes = 10;
window.contactoActivoUid = null;
let burbujaEnEdicion = null;
let mensajeEnEdicionId = null;
let archivoAdjuntoPendiente = null;
let ultimoArchivoFallido = null;

let bloquarClickFantasma = false;

// --- ESTADOS Y UMBRALES DEL MICRÓFONO ---
let inicioX = 0;
let inicioY = 0;
let grabacionActiva = false;
let candadoActivado = false;
let temporizadorToque = null;

// Umbrales matemáticos (píxeles)
const UMBRAL_CANCELAR = -80; // Hacia la izquierda
const UMBRAL_CANDADO = 80;   // Hacia arriba

// Configuración de constantes
const TIEMPO_MAXIMO_MS = 10000; // 10 segundos
const DIAS_EXPIRACION = 12;

// Variables globales de grabación
let mediaRecorder = null;
let fragmentosVideo = [];
let streamCamara = null;
let temporizadorGrabacion = null;

// 🔍 Verificar si le quedan envíos disponibles hoy (máximo 5)
function puedeEnviarVideoCircular(uidUsuario) {
  if (!uidUsuario) return true;
  const hoy = new Date().toISOString().split("T")[0];
  const clave = `videos_circulares_${uidUsuario}_${hoy}`;
  const contadorActual = parseInt(localStorage.getItem(clave) || "0", 10);
  return contadorActual < 5;
}

// 📈 Registrar envío exitoso
function registrarEnvioVideoCircular(uidUsuario) {
  if (!uidUsuario) return;
  const hoy = new Date().toISOString().split("T")[0];
  const clave = `videos_circulares_${uidUsuario}_${hoy}`;
  const contadorActual = parseInt(localStorage.getItem(clave) || "0", 10);
  localStorage.setItem(clave, contadorActual + 1);
}

// ========================================================
// 🎬 FUNCIONES DE VIDEO CIRCULAR (SIN FUNCIONES DUPLICADAS)
// ========================================================

// 1. Iniciar cámara frontal y grabación con modal/preview
async function abrirCamaraYGrabar() {
  try {
    const uidActual = typeof window.contactoActivoUid !== "undefined" ? window.contactoActivoUid : null;
    if (typeof puedeEnviarVideoCircular === "function" && !puedeEnviarVideoCircular(uidActual)) {
      alert("Has alcanzado el límite máximo de 5 videos circulares por día.");
      return;
    }

    fragmentosVideo = [];
    streamCamara = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
      audio: true
    });

    const videoPreview = document.querySelector('#modal-camara-circular video');
    if (videoPreview) {
      videoPreview.srcObject = streamCamara;
      videoPreview.play().catch(err => console.error("Error al reproducir preview:", err));
    }

    // Detección Inteligente de MIME Type (Priorizando MP4 para compatibilidad en Safari/iOS)
    let mimeElegido = '';
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeElegido = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeElegido = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeElegido = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeElegido = 'video/webm';
    }

    const opcionesRecorder = mimeElegido ? { mimeType: mimeElegido } : {};
    mediaRecorder = new MediaRecorder(streamCamara, opcionesRecorder);

    mediaRecorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) fragmentosVideo.push(e.data);
    };

    mediaRecorder.onstop = async () => {
      if (temporizadorGrabacion) clearTimeout(temporizadorGrabacion);

      // Apagar pistas de cámara directamente
      if (streamCamara) {
        streamCamara.getTracks().forEach((pista) => pista.stop());
        streamCamara = null;
      }

      // Se usa el MIME exacto negociado por el reproductor
      const tipoFinal = mediaRecorder.mimeType || mimeElegido || 'video/mp4';
      const blobVideo = new Blob(fragmentosVideo, { type: tipoFinal });

      if (typeof registrarEnvioVideoCircular === "function") {
        registrarEnvioVideoCircular(uidActual);
      }

      if (typeof previsualizarOProcesarVideo === "function") {
        previsualizarOProcesarVideo(blobVideo);
      } else if (typeof finalizarYEnviarVideoCircular === "function") {
        finalizarYEnviarVideoCircular(blobVideo);
      }
    };

    mediaRecorder.start();

    if (temporizadorGrabacion) clearTimeout(temporizadorGrabacion);
    temporizadorGrabacion = setTimeout(() => {
      detenerGrabacionCircular();
    }, TIEMPO_MAXIMO_MS);

  } catch (error) {
    console.error("Error al acceder a la cámara/micrófono:", error);
  }
}

// 2. Iniciar grabación si la cámara ya estaba activa
function iniciarGrabacionCircular() {
  if (!streamCamara) return;
  fragmentosVideo = [];

  // Detección Inteligente de MIME Type (Priorizando MP4 para compatibilidad en Safari/iOS)
  let mimeElegido = '';
  if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
    mimeElegido = 'video/mp4;codecs=avc1,mp4a.40.2';
  } else if (MediaRecorder.isTypeSupported('video/mp4')) {
    mimeElegido = 'video/mp4';
  } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
    mimeElegido = 'video/webm;codecs=vp8,opus';
  } else if (MediaRecorder.isTypeSupported('video/webm')) {
    mimeElegido = 'video/webm';
  }

  const opcionesRecorder = mimeElegido ? { mimeType: mimeElegido } : {};
  mediaRecorder = new MediaRecorder(streamCamara, opcionesRecorder);

  mediaRecorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) fragmentosVideo.push(e.data);
  };

  mediaRecorder.onstop = () => {
    // Generación segura del Blob de video con el MIME negociado
    const tipoFinal = mediaRecorder.mimeType || mimeElegido || 'video/mp4';
    const blobVideo = new Blob(fragmentosVideo, { type: tipoFinal });

    if (typeof finalizarYEnviarVideoCircular === "function") {
      finalizarYEnviarVideoCircular(blobVideo);
    }
  };

  mediaRecorder.start();

  if (temporizadorGrabacion) clearTimeout(temporizadorGrabacion);
  temporizadorGrabacion = setTimeout(() => {
    if (mediaRecorder && mediaRecorder.state === "recording") {
      detenerGrabacionCircular();
    }
  }, TIEMPO_MAXIMO_MS);
}

// 🛑 3. Detener grabación y apagar cámara
function detenerGrabacionCircular() {
  if (temporizadorGrabacion) {
    clearTimeout(temporizadorGrabacion);
    temporizadorGrabacion = null;
  }

  if (mediaRecorder && mediaRecorder.state !== "inactive") {
    mediaRecorder.stop();
  }

  if (streamCamara) {
    streamCamara.getTracks().forEach((pista) => pista.stop());
    streamCamara = null;
  }
}

// Apagar hardware de cámara y micrófono
function detenerTracksCamara() {
  if (streamCamara) {
    streamCamara.getTracks().forEach(track => track.stop());
    streamCamara = null;
  }
}

// Subir video a Supabase Storage con Timestamp de expiración
async function subirVideoCircularASupabase(blobVideo, idChat) {
  const nombreArchivo = `video_circular_${Date.now()}_${Math.random().toString(36).substring(7)}.webm`;
  const rutaArchivo = `chats/${idChat}/videos_circulares/${nombreArchivo}`;

  const { data, error } = await supabaseClient.storage
    .from('movachat-archivos')
    .upload(rutaArchivo, blobVideo, { contentType: 'video/webm' });

  if (error) throw error;

  const { data: urlData } = supabaseClient.storage
    .from('movachat-archivos')
    .getPublicUrl(rutaArchivo);

  return {
    urlPublica: urlData.publicUrl,
    rutaAlmacenamiento: rutaArchivo
  };
}

// Guardar mensaje en Firebase con cálculo de fecha límite (12 días)
async function enviarMensajeVideoCircular(idChat, idEmisor, blobVideo) {
  const datosNube = await subirVideoCircularASupabase(blobVideo, idChat);

  const fechaActual = Date.now();
  const fechaExpiracion = fechaActual + (DIAS_EXPIRACION * 24 * 60 * 60 * 1000); // +12 días en ms

  const nuevoMensaje = {
    emisorId: idEmisor,
    tipoAdjunto: 'video_circular',
    archivoUrl: datosNube.urlPublica,
    archivoRuta: datosNube.rutaAlmacenamiento,
    creadoEn: fechaActual,
    expiraEn: fechaExpiracion,
    eliminadoPara: [] // Array de IDs de usuarios
  };

  return await push(ref(db, `chats/${idChat}/mensajes`), nuevoMensaje);
}

// Generar DOM para la burbuja circular (Con SVG e inline-styles garantizados)
function crearElementoVideoCircular(mensaje) {
  const contenedor = document.createElement('div');
  contenedor.className = 'contenedor-video-circular-burbuja';
  contenedor.dataset.mensajeId = mensaje.id;

  // ⚡ Atributos stroke, stroke-width y fill integrados para asegurar visibilidad
  contenedor.innerHTML = `
    <div class="marco-video-redondo">
      <video src="${mensaje.archivoUrl}" playsinline webkit-playsinline preload="metadata" muted></video>
    </div>
    
    <!-- Anillo SVG Centrado con estilos forzados -->
    <svg class="anillo-progreso-svg" viewBox="0 0 150 150" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; transform: rotate(-90deg); z-index: 3;">
      <circle class="anillo-fondo" cx="75" cy="75" r="71" fill="none" stroke="rgba(255, 255, 255, 0.2)" stroke-width="4"></circle>
      <circle class="anillo-progreso progreso-anillo-nodo" cx="75" cy="75" r="71" fill="none" stroke="#00f2fe" stroke-width="4" stroke-linecap="round"></circle>
    </svg>
    
    <!-- Capa Play/Pausa -->
    <div class="capa-play-video-sim">
      <i class="icono-play">▶</i>
    </div>
  `;

  const video = contenedor.querySelector('video');
  const anilloProgreso = contenedor.querySelector('.anillo-progreso');
  const capaPlay = contenedor.querySelector('.capa-play-video-sim');

  const radio = 71;
  const circunferencia = 2 * Math.PI * radio; // ~446.11px

  if (anilloProgreso) {
    anilloProgreso.style.strokeDasharray = `${circunferencia}`;
    anilloProgreso.style.strokeDashoffset = `${circunferencia}`;
  }

  let animFrameId = null;

  // Función de actualización de progreso con protección NaN / Infinity
  const actualizarProgreso = () => {
    if (video && anilloProgreso && Number.isFinite(video.duration) && video.duration > 0) {
      const porcentaje = video.currentTime / video.duration;
      const offset = circunferencia - (porcentaje * circunferencia);
      anilloProgreso.style.strokeDashoffset = `${offset}`;
    }
  };

  const animarBucle = () => {
    if (!video.paused && !video.ended) {
      actualizarProgreso();
      animFrameId = requestAnimationFrame(animarBucle);
    }
  };

  const ocultarPlay = () => {
    if (capaPlay) capaPlay.style.setProperty('display', 'none', 'important');
  };

  const mostrarPlay = () => {
    if (capaPlay) capaPlay.style.setProperty('display', 'flex', 'important');
  };

  // Eventos de reproducción y tiempo
  video.addEventListener('timeupdate', actualizarProgreso);

  video.addEventListener('play', () => {
    ocultarPlay();
    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(animarBucle);
  });

  video.addEventListener('playing', () => {
    ocultarPlay();
  });

  video.addEventListener('pause', () => {
    mostrarPlay();
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });

  video.addEventListener('ended', () => {
    video.currentTime = 0;
    if (anilloProgreso) anilloProgreso.style.strokeDashoffset = `${circunferencia}`;
    mostrarPlay();
    if (animFrameId) cancelAnimationFrame(animFrameId);
  });

  // Evento Clic
  contenedor.addEventListener('click', (e) => {
    e.stopPropagation();

    if (typeof pausarOtrosAudiosYVideos === 'function') {
      pausarOtrosAudiosYVideos(video);
    } else {
      document.querySelectorAll('audio, video').forEach(m => {
        if (m !== video && !m.paused) m.pause();
      });
    }

    if (video.paused) {
      video.muted = false;
      video.play().then(() => {
        ocultarPlay();
      }).catch(err => console.error('Error al reproducir video circular:', err));
    } else {
      video.pause();
    }
  });

  return contenedor;
}

// Pausar cualquier otro elemento multimedia activo en el chat
function pausarOtrosAudiosYVideos(multimediaActual) {
  document.querySelectorAll('audio, video').forEach(media => {
    if (media !== multimediaActual && !media.paused) {
      media.pause();
    }
  });
}

// 1. Eliminar mensaje individual ("Eliminar para todos")
async function eliminarMensajeParaTodos(idChat, idMensaje, rutaArchivo = null) {
  try {
    const msgRef = ref(db, `chats/${idChat}/mensajes/${idMensaje}`);

    // Si no se pasó la ruta o URL por parámetro, la buscamos en Firebase
    if (!rutaArchivo) {
      const snap = await get(msgRef);
      if (snap.exists()) {
        const msg = snap.val();
        rutaArchivo = msg.urlAdjunto || null;
      }
    }

    // Si existe un archivo adjunto (audio, imagen, etc.), lo borramos físicamente de Supabase Storage
    if (rutaArchivo) {
      await borrarArchivoDeSupabase(rutaArchivo);
    }

    // Eliminamos el nodo del mensaje en Firebase Realtime Database
    await remove(msgRef);
    console.log("✅ Mensaje eliminado para todos correctamente.");

  } catch (error) {
    console.error("❌ Error al eliminar mensaje para todos:", error);
  }
}

// 2. Eliminar para mí
async function eliminarMensajeParaMi(idChat, idMensaje, idUsuarioActual, rutaArchivo) {
  const refMensaje = ref(db, `chats/${idChat}/mensajes/${idMensaje}`);
  const snapshot = await get(refMensaje); // <- Cambiado a v10
  if (!snapshot.exists()) return;

  const mensaje = snapshot.val();
  let eliminados = mensaje.eliminadoPara || [];
  if (!eliminados.includes(idUsuarioActual)) {
    eliminados.push(idUsuarioActual);
  }

  if (eliminados.length >= 2) {
    if (rutaArchivo) await borrarArchivoDeSupabase(rutaArchivo);
    await remove(refMensaje); // <- Cambiado a v10
  } else {
    await update(refMensaje, { eliminadoPara: eliminados }); // <- Cambiado a v10
  }
}

// 3. Vaciar Chat
async function vaciarChat(idChat) {
  const refMensajes = ref(db, `chats/${idChat}/mensajes`);
  const snapshot = await refMensajes.once('value');
  const mensajes = snapshot.val() || {};

  const promesasBorradoFisico = [];

  Object.keys(mensajes).forEach(key => {
    const msg = mensajes[key];
    if (msg.tipoAdjunto === 'video_circular' && msg.archivoRuta) {
      promesasBorradoFisico.push(borrarArchivoDeSupabase(msg.archivoRuta));
    }
  });

  await Promise.all(promesasBorradoFisico);
  await refMensajes.remove();
}

// 4. Eliminar Chat completo
async function eliminarChat(idChat) {
  await vaciarChat(idChat);
  await remove(ref(db, `chats/${idChat}`));
}

// 5. Autolimpieza programada / rutina de 12 Días (Versión Optimizada v10)
async function ejecutarAutolimpieza12Dias(idChat) {
  if (!idChat) return;

  const ahora = Date.now();
  const refMensajes = ref(db, `chats/${idChat}/mensajes`);

  try {
    const snapshot = await get(refMensajes);
    if (!snapshot.exists()) return;

    const mensajes = snapshot.val();
    const promesasBorrado = [];

    for (const [idMensaje, msg] of Object.entries(mensajes)) {
      // Verifica si tiene fecha de expiración configurada y ya se cumplió el plazo
      if (msg.expiraEn && ahora >= msg.expiraEn) {

        // 1. Limpieza de archivos físicos en Supabase Storage
        if (msg.tipoAdjunto === 'video_circular' && msg.archivoRuta) {
          promesasBorrado.push(borrarArchivoDeSupabase(msg.archivoRuta));
        } else if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
          promesasBorrado.push(eliminarArchivoSupabase(msg.urlAdjunto, "movachat-adjuntos"));
        }

        // 2. Eliminación del nodo en Firebase Realtime Database
        const msgRef = ref(db, `chats/${idChat}/mensajes/${idMensaje}`);
        promesasBorrado.push(remove(msgRef));
      }
    }

    // Ejecutar todas las eliminaciones en paralelo para no bloquear el hilo de ejecución
    await Promise.all(promesasBorrado);
    console.log(`🧹 Autolimpieza de 12 días ejecutada en chat: ${idChat}`);

  } catch (error) {
    console.error("❌ Error al ejecutar autolimpieza de 12 días:", error);
  }
}

// Objeto global de respaldo para mensajes efímeros temporales
window.chatsTemporalesBD = window.chatsTemporalesBD || {};

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

          // 🚀 FIX: Activar automáticamente la pantalla principal de chats al entrar
          if (typeof switchPantalla === "function" && pantallaChats && pantallaBienvenida && pantallaPerfil && pantallaChatPrivado) {
            switchPantalla(pantallaChats, pantallaBienvenida, pantallaPerfil, pantallaChatPrivado);
          } else if (pantallaChats) {
            pantallaChats.style.display = "flex";
            pantallaChats.style.flexDirection = "column";
            pantallaChats.style.alignItems = "stretch";
            if (pantallaBienvenida) pantallaBienvenida.style.display = "none";
          }

          // Activar visualmente el botón "Inicio" en el menú flotante
          if (btnInicioMenu && botonesMenu) {
            botonesMenu.forEach(b => b.classList.remove("activo"));
            btnInicioMenu.classList.add("activo");
          }

          if (typeof iniciarControlPresenciaReal === "function") {
            iniciarControlPresenciaReal();
          }

          // 🧹 PURGA AUTOMÁTICA DE GALERÍA AL INICIAR SESIÓN (FOTOS DE MÁS DE 7 DÍAS)
          if (typeof purgarFotosAntiguasGaleria === "function") {
            purgarFotosAntiguasGaleria(user.uid);
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

          // 🚀 CARGAR CONTACTOS Y LISTA
          if (typeof cargarContactosAprobados === "function") {
            cargarContactosAprobados(user.uid);

            // ⚡ Auto-sincronizador de respaldo para carga inicial lenta
            setTimeout(() => {
              if (typeof cargarContactosAprobados === "function") {
                cargarContactosAprobados(user.uid);
              }
            }, 1200);
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

          // 📩 REDIRECCIÓN AUTOMÁTICA DE NOTIFICACIONES (PWA CERRADA O SEGUNDO PLANO)
          const urlParams = new URLSearchParams(window.location.search);
          const chatId = urlParams.get('chatId');
          if (chatId && typeof abrirConversacion === 'function') {
            abrirConversacion(chatId);
            window.history.replaceState({}, document.title, window.location.pathname);
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

    // 🛡️ Limpiar formulario al quedar sin sesión activa
    const formAuth = document.getElementById("form-auth");
    if (formAuth) formAuth.reset();
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

    // ⚡ Optimización: Pasamos ÚNICAMENTE el botón afectado en los targets
    if (window.lucide) {
      window.lucide.createIcons({ targets: [btn] });
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

      const tieneEstado = tarjeta.dataset.estadoUrl;
      if (tieneEstado) {
        const contactoUid = tarjeta.dataset.uid || tarjeta.id.replace("tarjeta-chat-", "");
        abrirEstadoAmigo(tarjeta.dataset.estadoUrl, tarjeta.dataset.estadoTexto || "", contactoUid);
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
// 🧲 FUNCIÓN GLOBAL DE LIMPIEZA DEL BOTÓN (X)
// ========================================================
function cerrarMenuAdjuntar() {
  if (menuAdjuntar) menuAdjuntar.classList.add("oculto");
  if (btnAdjuntarTodo) {
    btnAdjuntarTodo.classList.remove("caiman-abierto");
    btnAdjuntarTodo.blur(); // Remueve el foco residual en dispositivos móviles
  }
}

// ========================================================
// 3. MENÚS DESPLEGABLES Y ARCHIVOS DE CÁMARA PRO
// ========================================================
if (btnOpcionesChat) {
  btnOpcionesChat.addEventListener("click", async (e) => {
    e.stopPropagation();

    const contactoUid = window.contactoActivoUid;

    const btnCtxSilenciar = document.getElementById("btn-ctx-silenciar");
    if (btnCtxSilenciar && contactoUid) {
      btnCtxSilenciar.innerHTML = `<i data-lucide="bell-off"></i> Silenciar / Notificacio..`;
    }

    if (typeof verificarEstadoBloqueo === "function" && contactoUid) {
      await verificarEstadoBloqueo(contactoUid);
    }

    menuCabecera.classList.toggle("oculto");
    cerrarMenuAdjuntar();
    if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

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

    const estaOculto = menuAdjuntar.classList.contains("oculto");

    if (estaOculto) {
      menuAdjuntar.classList.remove("oculto");
      btnAdjuntarTodo.classList.add("caiman-abierto");
    } else {
      cerrarMenuAdjuntar();
    }

    if (menuCabecera) menuCabecera.classList.add("oculto");
    if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

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
    cerrarMenuAdjuntar();
    if (menuCamaraPro) menuCamaraPro.classList.remove("oculto");

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
    if (menuCamaraPro) menuCamaraPro.classList.add("oculto");
    if (menuAdjuntar) menuAdjuntar.classList.remove("oculto");
    if (btnAdjuntarTodo) btnAdjuntarTodo.classList.add("caiman-abierto");
  });
}

const btnGaleriaMenu = document.querySelector("#menu-adjuntar-files button:nth-of-type(1)");
if (btnGaleriaMenu) {
  btnGaleriaMenu.addEventListener("click", () => {
    inputRealGaleria.click();
    cerrarMenuAdjuntar();
  });
}

const btnDocMenu = document.querySelector("#menu-adjuntar-files button:nth-of-type(2)");
if (btnDocMenu) {
  btnDocMenu.addEventListener("click", () => {
    inputRealDocumento.click();
    cerrarMenuAdjuntar();
  });
}

// ========================================================
// 🌐 CIERRE GLOBAL AL TOCAR EN CUALQUIER OTRA PARTE
// ========================================================
document.addEventListener("click", (e) => {
  if (typeof isLongPress !== "undefined" && isLongPress) return;

  // Cierra el menú de adjuntos y resetea el botón (X) a su estado normal
  if (menuAdjuntar && !menuAdjuntar.contains(e.target) && btnAdjuntarTodo && !btnAdjuntarTodo.contains(e.target)) {
    cerrarMenuAdjuntar();
  }

  if (typeof menuCabecera !== "undefined" && menuCabecera && !menuCabecera.contains(e.target) && typeof btnOpcionesChat !== "undefined" && e.target !== btnOpcionesChat) {
    menuCabecera.classList.add("oculto");
  }

  if (typeof menuCamaraPro !== "undefined" && menuCamaraPro && !menuCamaraPro.contains(e.target) && typeof btnCamaraMovaPro !== "undefined" && !btnCamaraMovaPro.contains(e.target)) {
    menuCamaraPro.classList.add("oculto");
  }
});

// ========================================================
// 🔄 FUNCIÓN AUXILIAR: MANTENER FOTO ORIGINAL SIN VOLTEAR
// ========================================================
function corregirEfectoEspejo(file) {
  return new Promise((resolve) => {
    const img = new Image();
    const urlTemp = URL.createObjectURL(file);
    img.src = urlTemp;

    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");

      // ✅ Dibuja la imagen directamente en orientación normal
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        URL.revokeObjectURL(urlTemp);
        const archivoCorregido = new File([blob], file.name || "foto.jpg", {
          type: file.type || "image/jpeg"
        });
        resolve(archivoCorregido);
      }, file.type || "image/jpeg", 0.95);
    };

    img.onerror = () => {
      URL.revokeObjectURL(urlTemp);
      resolve(file);
    };
  });
}

// ========================================================
// 🎥 MOTOR CÁMARA CIRCULAR CON RECORTADOR FÍSICO A 10S
// ========================================================
async function activarCamaraMovaPro(tipoMedia) {
  const menuCamaraPro = document.getElementById("menu-camara-pro");
  if (menuCamaraPro) menuCamaraPro.classList.add("oculto");

  // 📸 FOTO (Cámara frontal limpia sin duplicación de espejo)
  if (tipoMedia === "foto") {
    // 🛡️ 1. Verificar límite diario
    const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
    if (usuarioActual && typeof verificarLimiteDiarioFotos === "function") {
      const chequeoDiario = await verificarLimiteDiarioFotos(usuarioActual.uid);
      if (!chequeoDiario.permitido) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Has alcanzado tu límite diario de 12 fotos por hoy 🛑", "⚠️", "#ff4b2b");
        }
        return;
      }
    }

    const inputCamara = document.createElement("input");
    inputCamara.type = "file";
    inputCamara.accept = "image/*";
    inputCamara.setAttribute("capture", "user");

    inputCamara.onchange = async (evt) => {
      let archivo = evt.target.files && evt.target.files[0];
      if (archivo) {
        if (typeof corregirEfectoEspejo === "function") {
          archivo = await corregirEfectoEspejo(archivo);
        }

        archivoAdjuntoPendiente = archivo;
        tipoAdjuntoActivo = 'foto';

        if (typeof imgMiniaturaAdjunto !== "undefined" && imgMiniaturaAdjunto) {
          if (imgMiniaturaAdjunto.src && imgMiniaturaAdjunto.src.startsWith("blob:")) {
            URL.revokeObjectURL(imgMiniaturaAdjunto.src);
          }
          imgMiniaturaAdjunto.style.display = "block";
          imgMiniaturaAdjunto.src = URL.createObjectURL(archivo);
          imgMiniaturaAdjunto.style.transform = "none";
        }

        const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
        if (iconoPrevio) iconoPrevio.remove();

        if (typeof cajaVistaPrevia !== "undefined" && cajaVistaPrevia) {
          cajaVistaPrevia.classList.remove("oculto");
        }

        if (typeof inputChat !== "undefined" && inputChat) {
          inputChat.placeholder = "Añade un comentario a la imagen...";
          inputChat.focus();
        }

        if (typeof btnAccionChat !== "undefined" && btnAccionChat) {
          btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
          if (window.lucide) {
            window.lucide.createIcons({ targets: [btnAccionChat] });
          }
        }
      }
    };

    document.body.appendChild(inputCamara);
    inputCamara.click();
    document.body.removeChild(inputCamara);
    return;
  }

  // 🎥 VIDEO CIRCULAR: Modal en vivo
  const modalCamara = document.getElementById("modal-camara-circular");
  const videoVisor = document.getElementById("video-visor-camara");
  const btnGrabar = document.getElementById("btn-iniciar-grabar-live");
  const txtContador = document.getElementById("contador-camara-10s");

  if (modalCamara && videoVisor) {
    if (txtContador) txtContador.textContent = "00:10";
    if (btnGrabar) {
      btnGrabar.textContent = "● Grabar";
      btnGrabar.disabled = false;
      btnGrabar.style.opacity = "1";
    }
    modalCamara.classList.remove("oculto");
  }

  try {
    // Apagar streams previos de hardware si estuvieran abiertos
    if (typeof detenerTracksCamara === "function") {
      detenerTracksCamara();
    } else if (typeof streamCamaraLive !== "undefined" && streamCamaraLive) {
      streamCamaraLive.getTracks().forEach(track => track.stop());
      streamCamaraLive = null;
    }

    // Iniciar flujo de cámara frontal en tiempo real
    const streamObtenido = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "user", width: { ideal: 480 }, height: { ideal: 480 } },
      audio: true
    });

    // Sincronizar referencia global de hardware
    if (typeof streamCamaraLive !== "undefined") streamCamaraLive = streamObtenido;
    if (typeof streamCamara !== "undefined") streamCamara = streamObtenido;

    if (videoVisor) {
      videoVisor.srcObject = streamObtenido;
      videoVisor.play();
    }

  } catch (e) {
    console.warn("Entorno sin cámara directa o permisos. Usando captura con recorte físico:", e);
    if (modalCamara) modalCamara.classList.add("oculto");

    // ⚡ CAPTURA DEL TELÉFONO + RECORTADOR FÍSICO AUTOMÁTICO
    const inputVideoDirecto = document.createElement("input");
    inputVideoDirecto.type = "file";
    inputVideoDirecto.accept = "video/*";
    inputVideoDirecto.setAttribute("capture", "user");

    inputVideoDirecto.onchange = async (evt) => {
      const archivo = evt.target.files && evt.target.files[0];
      if (!archivo) return;

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Optimizando y recortando video a 10s... ⚡", "✂️", "#00f2fe");
      }

      // Cargamos el video capturado en memoria
      const videoTemp = document.createElement("video");
      videoTemp.src = URL.createObjectURL(archivo);
      videoTemp.muted = true;
      videoTemp.playsInline = true;

      videoTemp.onloadedmetadata = async () => {
        if (videoTemp.duration <= 10.5) {
          if (typeof asignarPreviewVideoCircular === "function") {
            asignarPreviewVideoCircular(videoTemp.src);
          }
          return;
        }

        try {
          if (typeof recortarVideoA10Segundos === "function") {
            const urlCortada = await recortarVideoA10Segundos(videoTemp);
            if (typeof asignarPreviewVideoCircular === "function") {
              asignarPreviewVideoCircular(urlCortada);
            }
          }
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Video recortado a 10s para ahorrar datos en la nube 🛡️", "🎬", "#00f2fe");
          }
        } catch (err) {
          console.warn("No se pudo re-codificar, asignando original con tope:", err);
          if (typeof asignarPreviewVideoCircular === "function") {
            asignarPreviewVideoCircular(videoTemp.src);
          }
        }
      };
    };

    document.body.appendChild(inputVideoDirecto);
    inputVideoDirecto.click();
    document.body.removeChild(inputVideoDirecto);
  }
}

// ========================================================
// 🎥 CONTROLADOR DE GRABACIÓN LIVE DE VIDEO CIRCULAR (10s)
// ========================================================
const btnGrabarLive = document.getElementById("btn-iniciar-grabar-live");
let mediaRecorderCamara = null;
let fragmentosVideoCamara = [];
let timerCamara10s = null;

if (btnGrabarLive) {
  btnGrabarLive.addEventListener("click", async () => {
    const streamActivo = typeof streamCamaraLive !== "undefined" && streamCamaraLive ? streamCamaraLive : streamCamara;
    if (!streamActivo) return;

    if (mediaRecorderCamara && mediaRecorderCamara.state === "recording") {
      detenerGrabacionVideoCircular();
      return;
    }

    fragmentosVideoCamara = [];

    // 1. Detección Inteligente de MIME (Damos prioridad a MP4 para compatibilidad universal)
    let mimeElegido = '';
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeElegido = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeElegido = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeElegido = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeElegido = 'video/webm';
    }

    const opcionesGrabacion = mimeElegido ? {
      mimeType: mimeElegido,
      videoBitsPerSecond: 1000000,
      audioBitsPerSecond: 64000
    } : {};

    try {
      mediaRecorderCamara = new MediaRecorder(streamActivo, opcionesGrabacion);

      mediaRecorderCamara.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) fragmentosVideoCamara.push(e.data);
      };

      mediaRecorderCamara.onstop = () => {
        // 2. Extraer el MIME real negociado por la instancia de MediaRecorder
        const tipoFinal = mediaRecorderCamara.mimeType || mimeElegido || 'video/mp4';
        const blobVideo = new Blob(fragmentosVideoCamara, { type: tipoFinal });
        const urlVideo = URL.createObjectURL(blobVideo);

        const ext = tipoFinal.includes('mp4') ? 'mp4' : 'webm';
        archivoAdjuntoPendiente = new File([blobVideo], `video_circular_${Date.now()}.${ext}`, { type: tipoFinal });

        if (typeof streamCamaraLive !== "undefined" && streamCamaraLive) {
          streamCamaraLive.getTracks().forEach(track => track.stop());
          streamCamaraLive = null;
        }
        if (typeof streamCamara !== "undefined" && streamCamara) {
          streamCamara.getTracks().forEach(track => track.stop());
          streamCamara = null;
        }

        const modalCamara = document.getElementById("modal-camara-circular");
        if (modalCamara) modalCamara.classList.add("oculto");

        asignarPreviewVideoCircular(urlVideo);
      };

      mediaRecorderCamara.start(100);
      btnGrabarLive.textContent = "■ Detener";
      btnGrabarLive.style.background = "#ff4b2b";

      segundosRestantes = 10;
      const txtContador = document.getElementById("contador-camara-10s");
      if (txtContador) txtContador.textContent = "00:10";

      if (timerCamara10s) clearInterval(timerCamara10s);
      timerCamara10s = setInterval(() => {
        segundosRestantes--;
        const secsStr = segundosRestantes.toString().padStart(2, '0');
        if (txtContador) txtContador.textContent = `00:${secsStr}`;

        if (segundosRestantes <= 0) {
          detenerGrabacionVideoCircular();
        }
      }, 1000);

    } catch (err) {
      console.error("❌ Error al iniciar grabación circular:", err);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("No se pudo iniciar la grabación de video.", "❌", "#ff4b2b");
      }
    }
  });
}

function detenerGrabacionVideoCircular() {
  if (timerCamara10s) {
    clearInterval(timerCamara10s);
    timerCamara10s = null;
  }
  if (mediaRecorderCamara && mediaRecorderCamara.state !== "inactive") {
    mediaRecorderCamara.stop();
  }
  if (btnGrabarLive) {
    btnGrabarLive.textContent = "● Grabar";
    btnGrabarLive.style.background = "";
  }
}

function recortarVideoA10Segundos(videoElem) {
  return new Promise((resolve) => {
    const canvas = document.createElement("canvas");
    canvas.width = 480;
    canvas.height = 480;
    const ctx = canvas.getContext("2d");

    // ⚡ Intentar capturar el stream del canvas de forma segura
    let streamCanvas = null;
    if (typeof canvas.captureStream === "function") {
      streamCanvas = canvas.captureStream(30);
    } else if (typeof canvas.mozCaptureStream === "function") {
      streamCanvas = canvas.mozCaptureStream(30);
    }

    // 🍎 Fallback para navegadores sin soporte de captureStream
    if (!streamCanvas) {
      console.warn("⚠️ captureStream no soportado en este navegador. Devolviendo video original.");
      resolve(videoElem.src);
      return;
    }

    // Intentar pasar las pistas de audio originales al nuevo stream
    try {
      const capturadorOriginal = videoElem.captureStream || videoElem.mozCaptureStream;
      if (capturadorOriginal) {
        const streamOriginal = capturadorOriginal.call(videoElem);
        const audioTracks = streamOriginal.getAudioTracks();
        if (audioTracks.length > 0) streamCanvas.addTrack(audioTracks[0]);
      }
    } catch (e) {
      console.warn("⚠️ No se pudo clonar la pista de audio:", e);
    }

    // Detección Inteligente de MIME Type (Priorizando MP4 para mayor compatibilidad)
    let mimeElegido = '';
    if (MediaRecorder.isTypeSupported('video/mp4;codecs=avc1,mp4a.40.2')) {
      mimeElegido = 'video/mp4;codecs=avc1,mp4a.40.2';
    } else if (MediaRecorder.isTypeSupported('video/mp4')) {
      mimeElegido = 'video/mp4';
    } else if (MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')) {
      mimeElegido = 'video/webm;codecs=vp8,opus';
    } else if (MediaRecorder.isTypeSupported('video/webm')) {
      mimeElegido = 'video/webm';
    }

    const opcionesRecorder = mimeElegido ? {
      mimeType: mimeElegido,
      videoBitsPerSecond: 1000000
    } : {};

    let recorder = null;
    try {
      recorder = new MediaRecorder(streamCanvas, opcionesRecorder);
    } catch (err) {
      console.error("❌ Falló la inicialización del MediaRecorder:", err);
      resolve(videoElem.src); // Fallback si falla el grabador
      return;
    }

    const chunks = [];
    recorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = () => {
      // Usar el MIME real asignado dinámicamente por la instancia de MediaRecorder
      const tipoFinal = recorder.mimeType || mimeElegido || 'video/mp4';
      const blobCortado = new Blob(chunks, { type: tipoFinal });
      resolve(URL.createObjectURL(blobCortado));
    };

    recorder.start(100);
    videoElem.currentTime = 0;
    videoElem.play().catch(e => console.warn("Error auto-play en recorte:", e));

    let animFrame = null;
    function renderFrame() {
      if (videoElem.currentTime < 10 && !videoElem.paused && !videoElem.ended) {
        ctx.drawImage(videoElem, 0, 0, canvas.width, canvas.height);
        animFrame = requestAnimationFrame(renderFrame);
      } else {
        videoElem.pause();
        if (animFrame) cancelAnimationFrame(animFrame);
        if (recorder && recorder.state !== "inactive") recorder.stop();
      }
    }
    renderFrame();

    setTimeout(() => {
      videoElem.pause();
      if (animFrame) cancelAnimationFrame(animFrame);
      if (recorder && recorder.state !== "inactive") recorder.stop();
    }, 10200);
  });
}

function asignarPreviewVideoCircular(urlFinal) {
  tipoAdjuntoActivo = 'video';

  if (typeof imgMiniaturaAdjunto !== "undefined" && imgMiniaturaAdjunto) {
    imgMiniaturaAdjunto.src = urlFinal;
    imgMiniaturaAdjunto.style.display = "none";
  }

  const wrapper = document.querySelector(".wrapper-miniatura");
  if (wrapper) {
    const iconoPrevio = wrapper.querySelector(".icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();

    wrapper.insertAdjacentHTML("beforeend", `
      <div class="icono-doc-preview" style="background: rgba(255, 75, 43, 0.15); color: #ff4b2b;">
        <i data-lucide="video" style="width: 28px; height: 28px;"></i>
      </div>
    `);
  }

  if (typeof cajaVistaPrevia !== "undefined" && cajaVistaPrevia) {
    cajaVistaPrevia.classList.remove("oculto");
  }

  if (typeof inputChat !== "undefined" && inputChat) {
    inputChat.placeholder = "Comentar video circular (Máx 10s)...";
    inputChat.focus();
  }

  if (typeof btnAccionChat !== "undefined" && btnAccionChat) {
    btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
    if (window.lucide) {
      // Filtrar elementos válidos para evitar errores si wrapper es null
      const objetivos = [btnAccionChat, wrapper].filter(Boolean);
      window.lucide.createIcons({ targets: objetivos });
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
  // 🟢 RESTRICCIÓN DE GALERÍA: Bloquea videos y solo permite seleccionar imágenes
  inputRealGaleria.setAttribute("accept", "image/*");

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

// Variables globales para los metadatos del documento
let pesoDocumentoFormateado = "";
let extensionDocumentoFormateada = "";

if (inputRealDocumento) {
  inputRealDocumento.addEventListener("change", (e) => {
    if (e.target.files && e.target.files[0]) {
      const archivoDoc = e.target.files[0];
      const limite15MB = 15 * 1024 * 1024; // 15 Megabytes

      // 🛡️ REGLA 1: Validar tamaño máximo de 15 MB
      if (archivoDoc.size > limite15MB) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("El documento supera el límite permitido de 15 MB 🛑", "⚠️", "#ff4b2b");
        }
        inputRealDocumento.value = "";
        return;
      }

      // 1. Extraer la extensión (ej. PDF, DOCX)
      extensionDocumentoFormateada = archivoDoc.name.split('.').pop().toUpperCase();

      // 2. Calcular peso en MB o KB
      if (archivoDoc.size >= 1024 * 1024) {
        pesoDocumentoFormateado = (archivoDoc.size / (1024 * 1024)).toFixed(2) + " MB";
      } else {
        pesoDocumentoFormateado = (archivoDoc.size / 1024).toFixed(1) + " KB";
      }

      nombreDocumentoSimulado = archivoDoc.name;
      tipoAdjuntoActivo = 'documento';
      imgMiniaturaAdjunto.style.display = "none";
      const wrapper = document.querySelector(".wrapper-miniatura");

      const iconoPrevio = wrapper ? wrapper.querySelector(".icono-doc-preview") : null;
      if (iconoPrevio) iconoPrevio.remove();

      if (wrapper) {
        wrapper.insertAdjacentHTML("beforeend", `
    <div class="icono-doc-preview">
      <i data-lucide="file-text" style="width: 30px; height: 30px;"></i>
    </div>
  `);

        // ⚡ Optimización: Se especifica 'wrapper' como target para renderizar solo el nuevo icono de documento
        if (window.lucide) window.lucide.createIcons({ targets: [wrapper] });
      }

      if (cajaVistaPrevia) cajaVistaPrevia.classList.remove("oculto");
      if (inputChat) {
        inputChat.placeholder = `Comentar ${extensionDocumentoFormateada} (${pesoDocumentoFormateado})...`;
        inputChat.focus();
      }

      if (btnAccionChat) {
        btnAccionChat.innerHTML = `<i data-lucide="send"></i>`;
        // ⚡ Esta llamada ya la tenías excelente
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

// ========================================================
// 🎙️ LÓGICA TÁCTIL Y MATEMÁTICA ADAPTADA A TU HTML
// ========================================================

function iniciarToque(e) {
  if (candadoActivado) return;

  const clienteX = e.touches ? e.touches[0].clientX : e.clientX;
  const clienteY = e.touches ? e.touches[0].clientY : e.clientY;

  inicioX = clienteX;
  inicioY = clienteY;

  const btnAccionChat = document.getElementById('btn-accion-chat');
  if (btnAccionChat) btnAccionChat.style.transform = 'translate(0px, 0px)';

  temporizadorToque = setTimeout(() => {
    grabacionActiva = true;

    if (typeof iniciarGrabacionVoz === "function") {
      iniciarGrabacionVoz(e);
    }

    const panelGrabacion = document.getElementById('panel-grabacion');
    const candado = document.getElementById('contenedor-candado-manoslibres');
    if (panelGrabacion) panelGrabacion.classList.remove('oculto');
    if (candado) candado.classList.remove('oculto');
  }, 200);
}

function moverDedo(e) {
  if (!grabacionActiva || candadoActivado) return;

  const actualX = e.touches ? e.touches[0].clientX : e.clientX;
  const actualY = e.touches ? e.touches[0].clientY : e.clientY;

  let deltaX = actualX - inicioX;
  let deltaY = inicioY - actualY; // Positivo hacia arriba

  if (deltaX > 0) deltaX = 0;
  if (deltaY < 0) deltaY = 0;

  const btnAccionChat = document.getElementById('btn-accion-chat');
  if (btnAccionChat) {
    btnAccionChat.style.transform = `translate(${deltaX}px, -${deltaY}px)`;
  }

  // 1. Umbral de Cancelación (Deslizar izquierda)
  if (deltaX <= UMBRAL_CANCELAR) {
    cancelarGrabacion();
    return;
  }

  // 2. Umbral de Candado (Deslizar arriba)
  if (deltaY >= UMBRAL_CANDADO) {
    activarManosLibres();
  }
}

function finalizarToque(e) {
  clearTimeout(temporizadorToque);

  const btnAccionChat = document.getElementById('btn-accion-chat');

  if (!grabacionActiva || candadoActivado) {
    if (btnAccionChat && !candadoActivado) {
      btnAccionChat.style.transform = 'translate(0px, 0px)';
    }
    return;
  }

  grabacionActiva = false;
  if (btnAccionChat) btnAccionChat.style.transform = 'translate(0px, 0px)';

  if (typeof finalizarGrabacionVoz === "function") {
    finalizarGrabacionVoz();
  }
}

// 📊 CONSULTAR LÍMITE DIARIO DE NOTAS DE VOZ (MÁXIMO 30)
async function verificarLimiteDiarioNotasVoz(uid) {
  if (!uid) return { permitido: false, conteo: 0 };

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/notas_voz`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    return { permitido: conteoActual < 30, conteo: conteoActual };
  } catch (err) {
    console.error("Error consultando límite de notas de voz:", err);
    // En caso de error de red, permitimos la acción para no bloquear al usuario
    return { permitido: true, conteo: 0 };
  }
}

// 📈 INCREMENTAR CONTADOR DE NOTAS DE VOZ (+1)
async function incrementarContadorNotasVoz(uid) {
  if (!uid) return;

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/notas_voz`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    await set(limiteRef, conteoActual + 1);
  } catch (err) {
    console.error("Error incrementando contador de notas de voz:", err);
  }
}

// ========================================================
// 🎙️ SISTEMA DE GRABACIÓN DE VOZ (COMPATIBLE IOS/ANDROID + SUPABASE + LÍMITES + CADUCIDAD)
// ========================================================

let temporizadorLimiteAudio = null;
const DURACION_MAXIMA_AUDIO = 180; // 3 minutos en segundos

async function iniciarGrabacionVoz(e) {
  // 🛡️ ESCUDO ANTI-GRABACIÓN: Si hay un reenvío pendiente, cancela el micrófono y envía el reenvío
  if (window.objetoPendienteReenviar) {
    if (typeof enviarMensajeNuevo === "function") {
      enviarMensajeNuevo();
    }
    return; // ⛔ Detiene por completo el inicio de la grabadora
  }

  window.grabacionCancelada = false;

  // 🛑 1. VERIFICAR LÍMITE DIARIO DE NOTAS DE VOZ ANTES DE ABRIR EL MICRÓFONO
  const usuarioActual = auth ? auth.currentUser : null;
  if (usuarioActual) {
    const chequeoDiario = await verificarLimiteDiarioNotasVoz(usuarioActual.uid);
    if (!chequeoDiario.permitido) {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Has alcanzado tu límite diario de 30 notas de voz por hoy 🛑", "⚠️", "#ff4b2b");
      } else {
        alert("Has alcanzado tu límite diario de 30 notas de voz por hoy 🛑");
      }
      return;
    }
  }

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

    // 🎯 Captura de audio optimizada: Mono + Supresión de ruido
    streamAudioLive = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1 // 👈 Se agrega mono para máxima compresión (32kbps)
      }
    });
    fragmentosAudio = [];

    // ⚡ Selección de MIME Type priorizando compatibilidad con iOS/Safari y Android
    let mimeAudio = '';
    if (MediaRecorder.isTypeSupported('audio/mp4')) {
      mimeAudio = 'audio/mp4';
    } else if (MediaRecorder.isTypeSupported('audio/aac')) {
      mimeAudio = 'audio/aac';
    } else if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
      mimeAudio = 'audio/webm;codecs=opus';
    } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
      mimeAudio = 'audio/ogg';
    } else if (MediaRecorder.isTypeSupported('audio/webm')) {
      mimeAudio = 'audio/webm';
    }

    const opcionesAudio = {
      audioBitsPerSecond: 32000 // 🎯 Compresión ultra liviana (32kbps mono)
    };
    if (mimeAudio) opcionesAudio.mimeType = mimeAudio;

    mediaRecorderAudio = new MediaRecorder(streamAudioLive, opcionesAudio);

    mediaRecorderAudio.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) fragmentosAudio.push(event.data);
    };

    // 🚀 EVENTO AL DETENER GRABACIÓN: SUBIDA A SUPABASE + GUARDADO EN BD
    mediaRecorderAudio.onstop = async () => {
      if (temporizadorLimiteAudio) {
        clearTimeout(temporizadorLimiteAudio);
        temporizadorLimiteAudio = null;
      }

      if (window.grabacionCancelada) {
        if (streamAudioLive) {
          streamAudioLive.getTracks().forEach(track => track.stop());
          streamAudioLive = null;
        }
        return;
      }

      if (streamAudioLive) {
        streamAudioLive.getTracks().forEach(track => track.stop());
        streamAudioLive = null;
      }

      if (typeof segundosGrabados !== 'undefined' && segundosGrabados >= 1 && fragmentosAudio.length > 0) {
        const tipoFinal = mediaRecorderAudio.mimeType || mimeAudio || 'audio/mp4';
        const blobAudio = new Blob(fragmentosAudio, { type: tipoFinal });

        const TAMANO_MAX_MB = 5 * 1024 * 1024;
        if (blobAudio.size > TAMANO_MAX_MB) {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("El audio supera el peso máximo permitido (5MB).", "⚠️", "#ff4b2b");
          }
          return;
        }

        const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
        if (usuarioActual) {
          await incrementarContadorNotasVoz(usuarioActual.uid);
        }

        const extensionAudio = tipoFinal.includes('mp4') || tipoFinal.includes('aac') || tipoFinal.includes('m4a') ? 'm4a' : 'webm';
        const archivoAudio = new File([blobAudio], `nota_voz_${Date.now()}.${extensionAudio}`, { type: tipoFinal });

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Subiendo nota de voz... 🎙️", "☁️", "#00f2fe");
        }

        // 1. Subir nota de voz a Supabase Storage usando tu cliente oficial
        let urlAudioSupabase = null;
        if (typeof subirArchivoSupabase === "function") {
          urlAudioSupabase = await subirArchivoSupabase(archivoAudio, "movachat-adjuntos");
        }

        const urlFinalAudio = urlAudioSupabase || URL.createObjectURL(blobAudio);
        const duracionTexto = contadorAudio ? contadorAudio.textContent : "0:01";

        // 2. Feedback inmediato en pantalla
        if (typeof inyectarNotaDeVozBurbuja === "function") {
          inyectarNotaDeVozBurbuja(duracionTexto, urlFinalAudio);
        }

        // 3. REGISTRO PERSISTENTE EN FIREBASE REALTIME DATABASE (CON SOPORTE DE MODO TEMPORAL/EFÍMERO)
        try {
          const miUid = usuarioActual ? usuarioActual.uid : (window.miUsuarioId || null);
          const contactoUid = window.contactoActivoUid || null;

          const idChat = (miUid && contactoUid)
            ? (typeof obtenerChatId === "function" ? obtenerChatId(miUid, contactoUid) : [miUid, contactoUid].sort().join("_"))
            : (window.chatActivoId || window.idChatActivo || null);

          if (idChat && miUid && urlAudioSupabase) {

            // ⏳ 1. CONSULTAR CONFIGURACIÓN DE MENSAJES TEMPORALES DEL CHAT EN FIREBASE
            let duracionEfimeraMs = 0;
            try {
              const tempSnap = await get(ref(db, `chats/${idChat}/config/temporales`));
              if (tempSnap.exists()) {
                const val = tempSnap.val();
                duracionEfimeraMs = typeof val === 'number' ? val : (val === true ? 10000 : 0);
              }
            } catch (errTemp) {
              console.error("Error al consultar configuración temporal para audio:", errTemp);
            }

            const ahora = Date.now();
            const DOCE_DIAS_MS = 12 * 24 * 60 * 60 * 1000;

            // ⏱️ Expiración: Si el modo temporal está activo usa duracionEfimeraMs, sino 12 días
            const tiempoExpiracionFinal = (duracionEfimeraMs > 0) ? duracionEfimeraMs : DOCE_DIAS_MS;

            const mensajesRef = ref(db, `chats/${idChat}/mensajes`);
            const nuevoMensajeRef = push(mensajesRef);

            // 🎯 2. GUARDAR CON LAS MISMAS PROPIEDADES QUE LOS MENSAJES DE TEXTO
            await set(nuevoMensajeRef, {
              emisor: miUid,
              emisorUid: miUid,
              receptor: contactoUid,
              texto: "",
              urlAdjunto: urlFinalAudio,
              tipoAdjunto: "audio",
              duracion: duracionTexto,
              creadoEn: ahora,
              timestamp: ahora,
              expiraEn: ahora + tiempoExpiracionFinal,
              caducado: false,
              // 💣 BANDERAS CLAVE PARA EL MOTOR DE MENSAJES TEMPORALES EN PANTALLA:
              esEfimero: duracionEfimeraMs > 0,
              duracionEfimeraMs: duracionEfimeraMs,
              fecha: new Date(ahora).toISOString()
            });

            console.log(`✅ Nota de voz registrada. ¿Es efímera?: ${duracionEfimeraMs > 0} (${duracionEfimeraMs}ms)`);
          }
        } catch (errorDB) {
          console.error("❌ Error al registrar el mensaje de audio en la BD:", errorDB);
        }
      }
    };

    mediaRecorderAudio.start(100);
    estaGrabandoAudio = true;
    if (btnAccionChat) btnAccionChat.classList.add("grabando-activo");
    if (cajaInputNormal) cajaInputNormal.classList.add("oculto");
    if (panelGrabacion) panelGrabacion.classList.remove("oculto");
    if (typeof arrancarCronometroAudio === "function") arrancarCronometroAudio();

    // 🚨 CORTE AUTOMÁTICO AL LLEGAR A 3 MINUTOS (180 segundos)
    if (temporizadorLimiteAudio) clearTimeout(temporizadorLimiteAudio);
    temporizadorLimiteAudio = setTimeout(() => {
      if (estaGrabandoAudio && typeof finalizarGrabacionVoz === "function") {
        finalizarGrabacionVoz();
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Límite de tiempo alcanzado (3 min). Nota procesada.", "⏱️", "#00f2fe");
        }
      }
    }, DURACION_MAXIMA_AUDIO * 1000);

  } catch (err) {
    console.error("Error al acceder al micrófono:", err);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Otorga permisos de micrófono para enviar notas de voz 🎤", "⚠️", "#ff4b2b");
    } else {
      alert("Por favor concede permisos de micrófono.");
    }
  }
}

// ========================================================
// 🎙️ MOTOR TÁCTIL Y MANOS LIBRES MEJORADO (MOVACHAT PRO)
// ========================================================

function iniciarControlTactilMic(e) {
  const tieneIconoSend = btnAccionChat ? btnAccionChat.querySelector("[data-lucide='send']") : null;

  if (candadoActivado) {
    finalizarGrabacionVoz();
    return;
  }

  if (tieneIconoSend || (inputChat && inputChat.value.trim().length > 0)) {
    return;
  }

  if (e && e.preventDefault) e.preventDefault();

  inicioX = e.touches ? e.touches[0].clientX : e.clientX;
  inicioY = e.touches ? e.touches[0].clientY : e.clientY;

  grabacionActiva = false;

  if (temporizadorToque) clearTimeout(temporizadorToque);

  temporizadorToque = setTimeout(() => {
    grabacionActiva = true;
    iniciarGrabacionVoz(e);

    if (btnAccionChat) {
      btnAccionChat.style.transition = "none";
      btnAccionChat.style.transform = "scale(1.2)";
    }
  }, 180);
}

function moverControlTactilMic(e) {
  // 🛡️ BLOQUEO: Si la grabación no está activa o si ya se enganchó el candado, no mueve el botón ni evalúa gestos
  if (!grabacionActiva || !estaGrabandoAudio || candadoActivado) {
    return;
  }

  const actualX = e.touches ? e.touches[0].clientX : e.clientX;
  const actualY = e.touches ? e.touches[0].clientY : e.clientY;

  let deltaX = actualX - inicioX;
  let deltaY = inicioY - actualY; // Positivo hacia arriba

  if (deltaX > 0) deltaX = 0;
  if (deltaY < 0) deltaY = 0;

  // Solo desplaza visualmente el botón si la grabación ya está en curso
  if (btnAccionChat) {
    btnAccionChat.style.transform = `translate(${deltaX}px, -${deltaY}px) scale(1.2)`;
  }

  // 1. Umbral para Cancelar (Solo funciona con grabación activa)
  if (deltaX <= -40) {
    cancelarGrabacion();
    return;
  }

  // 2. Umbral para activar Candado (Solo funciona con grabación activa)
  if (deltaY >= 60) {
    activarManosLibres();
  }
}

function finalizarControlTactilMic(e) {
  if (temporizadorToque) {
    clearTimeout(temporizadorToque);
    temporizadorToque = null;
  }

  // 🛡️ SI NO HABÍA GRABACIÓN ACTIVA NI CANDADO, NO HACE NADA NI DISPARA CANCELACIONES
  if (!grabacionActiva && !estaGrabandoAudio) {
    return;
  }

  if (candadoActivado) return;

  finalizarGrabacionVoz();
}

function activarManosLibres() {
  candadoActivado = true;

  // 1. Restaurar posición del botón y cambiar icono a enviar ("avioncito")
  if (btnAccionChat) {
    btnAccionChat.style.transition = "transform 0.2s ease";
    btnAccionChat.style.transform = "translate(0px, 0px) scale(1)";
    btnAccionChat.classList.remove("grabando-activo");
    btnAccionChat.setAttribute("data-modo", "enviar-manoslibres");

    btnAccionChat.innerHTML = '<i data-lucide="send"></i>';
    if (window.lucide) lucide.createIcons();
  }

  // 2. Iluminar candado en modo bloqueado
  const candado = document.getElementById('contenedor-candado-manoslibres');
  if (candado) {
    candado.classList.remove('oculto');
    candado.classList.add('candado-bloqueado');
  }

  // 3. Garantizar que el panel con el cronómetro siga visible
  const panelGrabacion = document.getElementById('panel-grabacion');
  if (panelGrabacion) panelGrabacion.classList.remove('oculto');

  console.log("🔒 Manos libres activado. El usuario ya puede soltar el dedo.");
}

function restaurarBotonUI() {
  if (btnAccionChat) {
    btnAccionChat.style.transition = "transform 0.2s ease";
    btnAccionChat.style.transform = "translate(0px, 0px) scale(1)";
    btnAccionChat.classList.remove("grabando-activo");
    btnAccionChat.removeAttribute("data-modo");

    // Devolver el icono original de micrófono
    btnAccionChat.innerHTML = '<i data-lucide="mic"></i>';
    if (window.lucide) lucide.createIcons();
  }

  const candado = document.getElementById('contenedor-candado-manoslibres');
  if (candado) {
    candado.classList.remove('candado-bloqueado');
    candado.classList.add('oculto');
  }
}

function finalizarGrabacionVoz() {
  if (!estaGrabandoAudio && !grabacionActiva && !candadoActivado) return;

  // 🛡️ 1. Cancelar el temporizador de 3 minutos para evitar disparos dobles
  if (typeof temporizadorLimiteAudio !== "undefined" && temporizadorLimiteAudio) {
    clearTimeout(temporizadorLimiteAudio);
    temporizadorLimiteAudio = null;
  }

  estaGrabandoAudio = false;
  grabacionActiva = false;
  candadoActivado = false;

  if (typeof frenarCronometroAudio === "function") frenarCronometroAudio();

  // 2. Limpiar interfaz visual inmediatamente
  if (panelGrabacion) panelGrabacion.classList.add("oculto");
  if (cajaInputNormal) cajaInputNormal.classList.remove("oculto");

  if (typeof restaurarBotonUI === "function") restaurarBotonUI();

  // 3. Detener MediaRecorder (esto dispara automáticamente el evento .onstop que sube a Supabase)
  if (mediaRecorderAudio && mediaRecorderAudio.state !== "inactive") {
    mediaRecorderAudio.stop();
  }

  // 4. Apagado forzado e inmediato del micrófono físico
  if (typeof apagarMicrofonoFisico === "function") {
    apagarMicrofonoFisico();
  }
}

function cancelarGrabacion() {
  // 🛡️ 1. Cancelar temporizador de pulsación (si existe)
  if (typeof temporizadorToque !== "undefined" && temporizadorToque) {
    clearTimeout(temporizadorToque);
    temporizadorToque = null;
  }

  // 🛡️ 2. Cancelar el límite de 3 minutos para que no dispare avisos en segundo plano
  if (typeof temporizadorLimiteAudio !== "undefined" && temporizadorLimiteAudio) {
    clearTimeout(temporizadorLimiteAudio);
    temporizadorLimiteAudio = null;
  }

  estaGrabandoAudio = false;
  grabacionActiva = false;
  candadoActivado = false;
  window.grabacionCancelada = true; // 🚫 Activa el escudo para ignorar la subida en .onstop

  if (typeof frenarCronometroAudio === "function") frenarCronometroAudio();

  if (typeof restaurarBotonUI === "function") restaurarBotonUI();

  if (panelGrabacion) panelGrabacion.classList.add('oculto');
  if (cajaInputNormal) cajaInputNormal.classList.remove('oculto');

  // Detener el grabador (disparará el .onstop, pero al ver grabacionCancelada = true, lo abortará)
  if (mediaRecorderAudio && mediaRecorderAudio.state !== "inactive") {
    mediaRecorderAudio.stop();
  }

  // 🛡️ Apagado forzado e inmediato del micrófono físico
  if (typeof apagarMicrofonoFisico === "function") {
    apagarMicrofonoFisico();
  }

  fragmentosAudio = [];
  console.log("🚫 Grabación cancelada, temporizadores limpios y micrófono liberado por completo.");
}

function apagarMicrofonoFisico() {
  if (streamAudioLive) {
    streamAudioLive.getTracks().forEach(pista => {
      pista.stop();
      pista.enabled = false;
    });
    streamAudioLive = null;
  }
}

// ========================================================
// ASIGNACIÓN DE EVENTOS (Reemplaza los antiguos)
// ========================================================
if (btnAccionChat) {
  // Remover eventos anteriores por si acaso
  btnAccionChat.removeEventListener("mousedown", iniciarGrabacionVoz);
  btnAccionChat.removeEventListener("touchstart", iniciarGrabacionVoz);

  // Agregar los nuevos eventos táctiles
  btnAccionChat.addEventListener("mousedown", iniciarControlTactilMic);
  btnAccionChat.addEventListener("touchstart", iniciarControlTactilMic, { passive: false });
}

// Escuchar movimiento y liberación de forma global para no perder el rastro del dedo
window.addEventListener("mousemove", moverControlTactilMic);
window.addEventListener("touchmove", moverControlTactilMic, { passive: false });
window.addEventListener("mouseup", finalizarControlTactilMic);
window.addEventListener("touchend", finalizarControlTactilMic);

// Agrega esto justo debajo del bloque anterior

function cancelarGrabacionVozTotal() {
  if (timerGrabacionAudio) clearInterval(timerGrabacionAudio);
  estaGrabandoAudio = false;

  if (mediaRecorderAudio && mediaRecorderAudio.state === "recording") {
    mediaRecorderAudio.stop();
  }

  // Vaciamos el array de fragmentos para evitar envíos fantasmas
  fragmentosAudio = [];

  // Restaurar UI
  if (panelGrabacion) panelGrabacion.classList.add("oculto");
  if (cajaInputNormal) cajaInputNormal.classList.remove("oculto");

  if (typeof mostrarAvisoPremium === "function") {
    mostrarAvisoPremium("Nota de voz cancelada 🗑️", "🗑️", "#ff4b2b");
  }
}

function activarCandadoManosLibres() {
  grabacionBloqueada = true;

  // Aquí puedes agregar lógica UI para mostrar que está bloqueado
  // Ej: Cambiar el botón del micrófono por un icono de "Enviar" y mostrar un botón de "Eliminar" rojo al lado del tiempo.

  if (typeof mostrarAvisoPremium === "function") {
    mostrarAvisoPremium("Manos libres activado 🔓", "🔒", "#00f2fe");
  }
}

window.addEventListener("mouseup", finalizarGrabacionVoz);
window.addEventListener("touchend", finalizarGrabacionVoz);

function inyectarNotaDeVozBurbuja(duracion, urlAudio, estaCaducado = false, idChat = null, idMensaje = null, arrayOndas = []) {
  const ahora = new Date();
  const horaFormateada = ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  const nuevaBurbujaHTML = document.createElement("div");
  nuevaBurbujaHTML.className = "mensaje-burbuja enviado";

  // 🚨 1. SI EL MENSAJE YA CADUCÓ
  if (estaCaducado || !urlAudio) {
    if (idChat && idMensaje) {
      procesarCaducidadNotaVoz(idChat, idMensaje, { tipoAdjunto: "audio", caducado: true, urlAdjunto: urlAudio });
    }

    nuevaBurbujaHTML.innerHTML = `
      <div class="reproductor-audio-burbuja caducado" style="display: flex; align-items: center; gap: 8px; opacity: 0.75; padding: 6px 10px;">
        <span style="font-size: 1.1rem;">⏱️</span>
        <span style="font-weight: 600; font-size: 0.9rem;">Mensaje Caducado</span>
      </div>
      <span class="mensaje-hora" style="margin-top: 4px;">${horaFormateada}</span>
    `;

    if (historialMensajes) {
      historialMensajes.appendChild(nuevaBurbujaHTML);
      historialMensajes.scrollTop = historialMensajes.scrollHeight;
    }
    return;
  }

  // 🎯 2. GENERAR 30 BARRAS HOMOGÉNEAS (Para que llene el reproductor tanto en PC como Móvil)
  const ondasEstandar = (typeof normalizarOndas === "function") 
    ? normalizarOndas(arrayOndas, 30) 
    : new Array(30).fill(20);

  const htmlBarras = ondasEstandar
    .map(() => `<span class="onda-barra"></span>`)
    .join("");

  // Convertir texto de duración (ej. "00:15") a segundos reales de respaldo
  let segundosRespaldo = 0;
  if (typeof duracion === "string" && duracion.includes(":")) {
    const partes = duracion.split(":");
    segundosRespaldo = (parseInt(partes[0], 10) * 60) + parseInt(partes[1], 10);
  } else if (typeof duracion === "number") {
    segundosRespaldo = duracion;
  }

  // 🟢 3. SI EL MENSAJE ES VÁLIDO (REPRODUCTOR NORMAL)
  nuevaBurbujaHTML.innerHTML = `
    <div class="reproductor-audio-burbuja" data-duracion-segundos="${segundosRespaldo}">
      <button class="btn-play-audio" type="button"><i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i></button>
      <div class="ondas-audio-preview" style="position: relative; cursor: pointer;">
        <div class="aguja-reproduccion-roja"></div>
        ${htmlBarras}
      </div>
      <span class="tiempo-texto-nodo" style="font-size:0.75rem; font-family:monospace; opacity:0.8; margin-right:4px;">${duracion}</span>
      <audio class="audio-elemento-nativo" src="${urlAudio}" preload="metadata" data-duracion="${segundosRespaldo}"></audio>
      <button type="button" class="btn-velocidad-audio" data-velocidad="1">1x</button>
    </div>
    <span class="mensaje-hora" style="margin-top: 4px;">${horaFormateada}</span>
  `;

  if (historialMensajes) {
    historialMensajes.appendChild(nuevaBurbujaHTML);
    if (typeof aplicarRelojArenaEfecto === "function") aplicarRelojArenaEfecto(nuevaBurbujaHTML);

    if (window.lucide) {
      window.lucide.createIcons({ targets: [nuevaBurbujaHTML] });
    }
    historialMensajes.scrollTop = historialMensajes.scrollHeight;
  }

  const btnPlay = nuevaBurbujaHTML.querySelector(".btn-play-audio");
  const audioElem = nuevaBurbujaHTML.querySelector(".audio-elemento-nativo");
  const agujaRoja = nuevaBurbujaHTML.querySelector(".aguja-reproduccion-roja");
  const pistaOndas = nuevaBurbujaHTML.querySelector(".ondas-audio-preview");
  const btnVelocidad = nuevaBurbujaHTML.querySelector(".btn-velocidad-audio");

  // 🔘 CONTROL DE REPRODUCCIÓN (PLAY / PAUSA)
  if (btnPlay && audioElem) {
    btnPlay.addEventListener("click", function () {
      // Pausar cualquier otro audio en reproducción
      document.querySelectorAll(".audio-elemento-nativo").forEach(a => {
        if (a !== audioElem) {
          a.pause();
          a.currentTime = 0;
        }
      });

      if (audioElem.paused) {
        audioElem.play();
        btnPlay.innerHTML = `<i data-lucide="square" style="width:14px; height:14px;"></i>`;
      } else {
        audioElem.pause();
        btnPlay.innerHTML = `<i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i>`;
      }

      if (window.lucide) {
        window.lucide.createIcons({ targets: [btnPlay] });
      }
    });
  }

  // ⚡ CONTROL DE VELOCIDAD (1x, 1.5x, 2x)
  if (btnVelocidad && audioElem) {
    btnVelocidad.addEventListener("click", function (e) {
      e.stopPropagation();
      let vel = parseFloat(btnVelocidad.getAttribute("data-velocidad") || "1");
      if (vel === 1) vel = 1.5;
      else if (vel === 1.5) vel = 2;
      else vel = 1;

      btnVelocidad.setAttribute("data-velocidad", vel.toString());
      btnVelocidad.textContent = `${vel}x`;
      audioElem.playbackRate = vel;
    });
  }

  // 🎯 CLIC EN LA PISTA DE ONDAS PARA ADELANTAR / REBOBINAR
  if (pistaOndas && audioElem) {
    pistaOndas.addEventListener("click", function (e) {
      const rectPista = pistaOndas.getBoundingClientRect();
      const clickX = e.clientX - rectPista.left;
      let porcentaje = (clickX / rectPista.width);

      if (porcentaje < 0) porcentaje = 0;
      if (porcentaje > 1) porcentaje = 1;

      let duracionReal = audioElem.duration;
      if (!duracionReal || isNaN(duracionReal) || !isFinite(duracionReal)) {
        duracionReal = segundosRespaldo;
      }

      if (duracionReal > 0) {
        audioElem.currentTime = porcentaje * duracionReal;
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

// 📊 1. CONSULTAR LÍMITE DIARIO (MÁXIMO 12 FOTOS)
async function verificarLimiteDiarioFotos(uid) {
  if (!uid) return { permitido: false, conteo: 0 };

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/fotos`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;

    // Retorna 'permitido: true' si lleva menos de 12 fotos
    return { permitido: conteoActual < 12, conteo: conteoActual };
  } catch (err) {
    console.error("Error consultando límite de fotos:", err);
    return { permitido: true, conteo: 0 };
  }
}

// 📈 2. INCREMENTAR CONTADOR (+1 TRAS SUBIDA EXITOSA)
async function incrementarContadorFotos(uid) {
  if (!uid) return;

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/fotos`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    await set(limiteRef, conteoActual + 1);
  } catch (err) {
    console.error("Error incrementando contador de fotos:", err);
  }
}

// 📊 CONSULTAR LÍMITE DIARIO DE DOCUMENTOS (MÁXIMO 5)
async function verificarLimiteDiarioDocumentos(uid) {
  if (!uid) return { permitido: false, conteo: 0 };

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/documentos`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    return { permitido: conteoActual < 5, conteo: conteoActual };
  } catch (err) {
    console.error("Error consultando límite de documentos:", err);
    return { permitido: true, conteo: 0 };
  }
}

// 📈 INCREMENTAR CONTADOR DE DOCUMENTOS (+1)
async function incrementarContadorDocumentos(uid) {
  if (!uid) return;

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/documentos`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    await set(limiteRef, conteoActual + 1);
  } catch (err) {
    console.error("Error incrementando contador de documentos:", err);
  }
}

// 🧹 PURGA AUTOMÁTICA DE GALERÍA (7 DÍAS)
async function purgarFotosAntiguasGaleria(uid) {
  if (!uid) return;

  const SIETE_DIAS_MS = 7 * 24 * 60 * 60 * 1000;
  const ahora = Date.now();
  const fotosRef = ref(db, `galeria/${uid}`);

  try {
    const snap = await get(fotosRef);
    if (!snap.exists()) return;

    snap.forEach((child) => {
      const foto = child.val();
      if (foto.fechaSubida && (ahora - foto.fechaSubida > SIETE_DIAS_MS)) {
        // 1. Borrar archivo físico de Supabase Storage
        if (foto.pathSupabase) {
          supabaseClient.storage.from('galeria').remove([foto.pathSupabase]);
        }
        // 2. Borrar registro en Firebase Realtime Database
        remove(ref(db, `galeria/${uid}/${child.key}`));
      }
    });
  } catch (error) {
    console.error("Error al purgar fotos antiguas de la galería:", error);
  }
}

// ========================================================
// 5. ENVÍO Y EDICIÓN DE MENSAJES (PROTEGIDO ANTI-DUPLICADOS + MODO EFÍMERO + VERIFICACIÓN DE BLOQUEOS + LÍMITE DIARIO + REENVÍO + SUPABASE STORAGE)
// ========================================================
async function enviarMensajeNuevo() {
  // 🛡️ CANDADO: Si ya se está procesando un envío, bloquea cualquier intento secundario
  if (estaEnviandoMensaje) return;

  const usuarioActual = auth.currentUser;
  const miUid = usuarioActual ? usuarioActual.uid : null;
  const contactoUid = window.contactoActivoUid;

  if (!miUid || !contactoUid) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Selecciona un contacto para chatear.", "⚠️", "#ff4b2b");
    }
    return;
  }

  // ↪️ CAPTURA DE CONTENIDO PENDIENTE POR REENVIAR (TEXTO O ADJUNTO/AUDIO)
  let paqueteReenvio = window.objetoPendienteReenviar || window.mensajeReenviadoActivo || null;

  let textoInput = inputChat ? inputChat.value.trim() : "";
  let tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

  // Si no hay texto digitado, ni adjunto visual, ni paquete de reenvío, cancela el proceso
  if (textoInput === "" && !tieneAdjunto && !paqueteReenvio) return;

  // Activar candado
  estaEnviandoMensaje = true;

  const chatId = typeof obtenerChatId === "function"
    ? obtenerChatId(miUid, contactoUid)
    : [miUid, contactoUid].sort().join("_");

  // 🧹 PURGA AUTOMÁTICA DE MENSAJES TEMPORALES Y ADJUNTOS EN SUPABASE ANTES DE ENVIAR
  if (typeof procesarLimpiezaMensajesTemporales === "function") {
    procesarLimpiezaMensajesTemporales(chatId);
  }

  // 🛡️ 1. VERIFICACIÓN DE BLOQUEO EN FIREBASE (AMBAS DIRECCIONES)
  try {
    const snapBloqueoReceptor = await get(ref(db, `bloqueos/${contactoUid}/${miUid}`));
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

      estaEnviandoMensaje = false;
      return;
    }
  } catch (errBloqueo) {
    console.error("Error al consultar bloqueos antes de enviar:", errBloqueo);
  }

  const ahora = new Date();
  const timestampAhora = Date.now();
  const horaFormateada = ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // 🔴 CASO: EDICIÓN DE MENSAJE EN FIREBASE
  if (window.burbujaEnEdicion && window.mensajeEnEdicionId) {
    const mensajeRef = ref(db, `chats/${chatId}/mensajes/${window.mensajeEnEdicionId}`);
    try {
      await update(mensajeRef, {
        texto: textoInput,
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

    window.burbujaEnEdicion = null;
    window.mensajeEnEdicionId = null;
    if (inputChat) inputChat.value = "";
    if (typeof actualizarIconoBotonAccion === "function") actualizarIconoBotonAccion();

    estaEnviandoMensaje = false;
    return;
  }

  // ⏳ VERIFICAR DURACIÓN DE MODO TEMPORAL / EFÍMERO EN ESTE CHAT
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

  // 🎯 CALCULAR CADUCIDAD FINAL (Prioridad: Mensajes Temporales > 12 días Estándar)
  const DOCE_DIAS_MS = 12 * 24 * 60 * 60 * 1000;
  const expiracionMs = (duracionEfimeraMs > 0) ? duracionEfimeraMs : DOCE_DIAS_MS;

  // 🟢 CASO: NUEVO MENSAJE (INCLUYE SOPORTE DE REENVÍO Y ESTADOS DE ENTREGA)
  let objetoMensaje = {
    emisor: miUid,
    emisorUid: miUid,
    receptor: contactoUid,
    texto: paqueteReenvio ? (paqueteReenvio.texto || "") : textoInput,
    hora: horaFormateada,
    timestamp: timestampAhora,
    creadoEn: timestampAhora,
    expiraEn: timestampAhora + expiracionMs,
    esEfimero: duracionEfimeraMs > 0,
    duracionEfimeraMs: duracionEfimeraMs,

    // 🟢 ESTADOS DE ENTREGA Y LECTURA INICIALES
    entregado: false,
    leido: false,

    // ↪️ METADATOS DE REENVÍO
    esReenviado: paqueteReenvio ? true : false,
    autorOriginal: paqueteReenvio ? paqueteReenvio.autorOriginal : null,

    // Adjuntos y audios
    tipoAdjunto: paqueteReenvio ? paqueteReenvio.tipoAdjunto : null,
    urlAdjunto: paqueteReenvio ? paqueteReenvio.urlAdjunto : null,
    duracion: paqueteReenvio ? paqueteReenvio.duracion : null,
    nombreDoc: null
  };

  // 🧹 Limpiar la barra/memoria visual de reenvío
  window.objetoPendienteReenviar = null;
  window.mensajeReenviadoActivo = null;
  const vistaPreviaReenvio = document.getElementById("vista-previa-reenvio");
  if (vistaPreviaReenvio) vistaPreviaReenvio.remove();

  // 🔴 Variables globales del ámbito de envío para subida diferida
  let archivoParaSubir = null;
  let tipoAdjuntoParaSubir = null;

  // 📦 SUBIDA DE ARCHIVOS ADJUNTOS DESDE LA CAJA DE ENTRADA
  if (tieneAdjunto && !paqueteReenvio) {
    objetoMensaje.tipoAdjunto = typeof tipoAdjuntoActivo !== 'undefined' ? tipoAdjuntoActivo : null;
    tipoAdjuntoParaSubir = objetoMensaje.tipoAdjunto;

    try {
      // 📸 1. FOTO
      const archivoFoto = archivoAdjuntoPendiente || (inputRealGaleria && inputRealGaleria.files ? inputRealGaleria.files[0] : null);

      if (objetoMensaje.tipoAdjunto === 'foto' && archivoFoto) {
        const chequeoDiario = await verificarLimiteDiarioFotos(miUid);
        if (!chequeoDiario.permitido) {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Has alcanzado tu límite de 12 fotos por hoy 🛑", "⚠️", "#ff4b2b");
          }
          estaEnviandoMensaje = false;
          return;
        }

        archivoParaSubir = await comprimirImagenWebP(archivoFoto, {
          maxAncho: 1440,
          maxAlto: 1440,
          calidad: 0.82,
          esPerfil: false
        });

        objetoMensaje.urlAdjunto = "subiendo";

        // 📄 2. DOCUMENTO
      } else if (objetoMensaje.tipoAdjunto === 'documento' && inputRealDocumento && inputRealDocumento.files[0]) {
        const chequeoDocs = await verificarLimiteDiarioDocumentos(miUid);
        if (!chequeoDocs.permitido) {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Has alcanzado tu límite diario de 5 documentos 🛑", "⚠️", "#ff4b2b");
          }
          estaEnviandoMensaje = false;
          return;
        }

        archivoParaSubir = inputRealDocumento.files[0];
        objetoMensaje.nombreDoc = typeof nombreDocumentoSimulado !== 'undefined' ? nombreDocumentoSimulado : archivoParaSubir.name;
        objetoMensaje.pesoDoc = typeof pesoDocumentoFormateado !== 'undefined' ? pesoDocumentoFormateado : null;
        objetoMensaje.extDoc = typeof extensionDocumentoFormateada !== 'undefined' ? extensionDocumentoFormateada : null;
        objetoMensaje.urlAdjunto = "subiendo";

        // 🎥 3. VIDEO CIRCULAR
      } else if (objetoMensaje.tipoAdjunto === 'video' && imgMiniaturaAdjunto && imgMiniaturaAdjunto.src) {
        if (imgMiniaturaAdjunto.src.startsWith("blob:")) {
          const respuestaBlob = await fetch(imgMiniaturaAdjunto.src);
          const blobVideo = await respuestaBlob.blob();
          archivoParaSubir = new File([blobVideo], `video_${Date.now()}.mp4`, { type: blobVideo.type || 'video/mp4' });
        }
        objetoMensaje.urlAdjunto = "subiendo";
      }
    } catch (errSubida) {
      console.error("❌ Error al preparar adjunto para subida:", errSubida);
    }

    // Limpieza de vista previa de adjuntos
    if (cajaVistaPrevia) cajaVistaPrevia.classList.add("oculto");
    if (imgMiniaturaAdjunto) imgMiniaturaAdjunto.src = "";
    if (inputRealGaleria) inputRealGaleria.value = "";
    if (inputRealDocumento) inputRealDocumento.value = "";
    archivoAdjuntoPendiente = null;

    const iconoPrevio = document.querySelector(".wrapper-miniatura .icono-doc-preview");
    if (iconoPrevio) iconoPrevio.remove();
    if (typeof tipoAdjuntoActivo !== 'undefined') tipoAdjuntoActivo = null;
    if (inputChat) inputChat.placeholder = "Escribe un mensaje privado...";
  }

  // 💬 LIMPIEZA DE ENTRADA EN PANTALLA (Restaura opacidad y estilo normal)
  if (inputChat) {
    inputChat.value = "";
    inputChat.style.opacity = "1";
    inputChat.style.fontStyle = "normal";
    inputChat.readOnly = false;
  }

  if (miUid && contactoUid) {
    set(ref(db, `escribiendo/${chatId}/${miUid}`), false);
  }

  // 🚀 REGISTRO EN FIREBASE REALTIME DATABASE
  try {
    const listaMensajesRef = ref(db, `chats/${chatId}/mensajes`);
    const nuevoMensajeRef = push(listaMensajesRef);
    const mensajeKey = nuevoMensajeRef.key;

    // 1. Guardar mensaje en la BD
    await set(nuevoMensajeRef, objetoMensaje);

    // Sonido e icono
    if (typeof reproducirSonidoEnviado === "function") reproducirSonidoEnviado();
    if (typeof actualizarIconoBotonAccion === "function") actualizarIconoBotonAccion();

    // 2. Subida en segundo plano si hay un archivo físico adjunto nuevo
    if (archivoParaSubir) {
      subirArchivoSupabaseConProgreso(
        archivoParaSubir,
        "movachat-adjuntos",
        async (porcentaje, subidoMB, totalMB) => {
          await update(ref(db, `chats/${chatId}/mensajes/${mensajeKey}`), {
            progresoSubida: porcentaje,
            textoSubida: `${subidoMB} MB / ${totalMB} MB`
          });
        }
      ).then(async (urlPublica) => {
        if (urlPublica) {
          await update(ref(db, `chats/${chatId}/mensajes/${mensajeKey}`), {
            urlAdjunto: urlPublica,
            progresoSubida: null,
            textoSubida: null
          });

          if (tipoAdjuntoParaSubir === 'documento') {
            await incrementarContadorDocumentos(miUid);
          } else if (tipoAdjuntoParaSubir === 'foto') {
            await incrementarContadorFotos(miUid);
          }
        } else {
          await update(ref(db, `chats/${chatId}/mensajes/${mensajeKey}`), {
            urlAdjunto: "error"
          });
        }
      }).catch(async (err) => {
        console.error("❌ Error en subida con progreso:", err);

        window.ultimoArchivoFallido = {
          archivo: archivoParaSubir,
          chatId: chatId,
          mensajeKey: mensajeKey,
          tipo: tipoAdjuntoParaSubir
        };

        await update(ref(db, `chats/${chatId}/mensajes/${mensajeKey}`), {
          urlAdjunto: "error"
        });

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Error de red al subir la imagen. Toca la burbuja para reintentar 🔄", "⚠️", "#ff4b2b");
        }
      });
    }

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
// 🧹 LIMPIEZA DE ADJUNTOS PENDIENTES CON LIBERACIÓN DE MEMORIA RAM
// ========================================================
function limpiarAdjuntoPendiente() {
  archivoAdjuntoPendiente = null;

  // 1. 🚀 Liberar memoria RAM de vista previa de imágenes
  if (typeof imgMiniaturaAdjunto !== 'undefined' && imgMiniaturaAdjunto && imgMiniaturaAdjunto.src) {
    if (imgMiniaturaAdjunto.src.startsWith("blob:")) {
      URL.revokeObjectURL(imgMiniaturaAdjunto.src);
    }
    imgMiniaturaAdjunto.src = '';
    imgMiniaturaAdjunto.style.display = 'none';
  }

  // 2. 🚀 Liberar memoria RAM de previsualizaciones de Audio o Video
  const reproductoresPrevios = document.querySelectorAll('.wrapper-miniatura video, .wrapper-miniatura audio');
  reproductoresPrevios.forEach((elem) => {
    if (elem.src && elem.src.startsWith("blob:")) {
      URL.revokeObjectURL(elem.src);
      elem.src = '';
    }
    elem.remove();
  });

  // 3. Limpiar inputs de archivos
  if (typeof inputRealGaleria !== 'undefined' && inputRealGaleria) inputRealGaleria.value = '';
  if (typeof inputRealDocumento !== 'undefined' && inputRealDocumento) inputRealDocumento.value = '';

  // 4. Ocultar contenedor y restablecer placeholder
  if (typeof cajaVistaPrevia !== 'undefined' && cajaVistaPrevia) cajaVistaPrevia.classList.add('oculto');
  if (typeof inputChat !== 'undefined' && inputChat) inputChat.placeholder = 'Escribe un mensaje privado...';

  // 5. Remover elementos de preview secundarios e íconos de documentos
  const iconoPrevio = document.querySelector('.wrapper-miniatura .icono-doc-preview');
  if (iconoPrevio) iconoPrevio.remove();
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

// 📸 ESCUCHADOR DE CLICS EN HISTORIAL (VIDEOS CIRCULARES, CONTACTOS Y FOTOS)
if (historialMensajes) {
  historialMensajes.addEventListener("click", (e) => {
    if (isLongPress) return;

    // 🎥 1. Clic en Video Circular (Reproducir / Pausar / Control de Anillo y Botón Play)
    const contenedorVideo = e.target.closest(".contenedor-video-circular-burbuja");
    if (contenedorVideo) {
      e.stopPropagation();
      const video = contenedorVideo.querySelector("video");
      const capaPlay = contenedorVideo.querySelector(".capa-play-video-sim");
      const anilloProgreso = contenedorVideo.querySelector(".progreso-anillo-nodo");

      if (!video) return;

      const radio = 71;
      const circunferencia = 2 * Math.PI * radio; // ~446.11px

      // Configurar trazo inicial del anillo SVG
      if (anilloProgreso && !anilloProgreso.style.strokeDasharray) {
        anilloProgreso.style.strokeDasharray = `${circunferencia}`;
        anilloProgreso.style.strokeDashoffset = `${circunferencia}`;
      }

      // Enlazar eventos dinámicos al video una sola vez
      if (!video.dataset.eventosConectados) {
        video.dataset.eventosConectados = "true";

        // 1. Avance continuo de la barra circular
        video.addEventListener("timeupdate", () => {
          if (anilloProgreso && Number.isFinite(video.duration) && video.duration > 0) {
            const porcentaje = video.currentTime / video.duration;
            const offset = circunferencia - (porcentaje * circunferencia);
            anilloProgreso.style.strokeDashoffset = `${offset}`;
          }
        });

        // 2. Ocultar el botón Play cuando el video arranca
        video.addEventListener("play", () => {
          if (capaPlay) capaPlay.style.setProperty("display", "none", "important");
        });

        // 3. Mostrar el botón Play si se pausa
        video.addEventListener("pause", () => {
          if (capaPlay) capaPlay.style.setProperty("display", "flex", "important");
        });

        // 4. Reiniciar al finalizar para permitir reproducir de nuevo
        video.addEventListener("ended", () => {
          video.currentTime = 0;
          if (anilloProgreso) anilloProgreso.style.strokeDashoffset = `${circunferencia}`;
          if (capaPlay) capaPlay.style.setProperty("display", "flex", "important");
        });
      }

      // Pausar cualquier otro audio o video activo
      if (typeof pausarOtrosAudiosYVideos === "function") {
        pausarOtrosAudiosYVideos(video);
      } else {
        document.querySelectorAll("audio, video").forEach(m => {
          if (m !== video && !m.paused) m.pause();
        });
      }

      // Si el video llegó al final antes de presionar play, forzar reinicio a 0
      if (video.ended) {
        video.currentTime = 0;
      }

      // Alternar reproducción y activar sonido
      if (video.paused) {
        video.muted = false; // 🔊 Activar sonido
        video.play().catch(err => console.error("Error al reproducir video circular:", err));
      } else {
        video.pause();
      }
      return;
    }

    // 📇 2. Clic en la tarjeta de contacto
    const btnContacto = e.target.closest(".btn-mensaje-contacto, .btn-accion-contacto-card");
    if (btnContacto) {
      e.stopPropagation();
      e.preventDefault();
      const uid = btnContacto.getAttribute("data-uid");
      if (uid && typeof window.abrirChatDesdeContacto === "function") {
        window.abrirChatDesdeContacto(uid);
      }
      return;
    }

    // 📸 3. Clic en la foto enviada
    const contenedorFoto = e.target.closest(".contenedor-foto-enviada");
    if (contenedorFoto) {
      e.stopPropagation();
      const urlFoto = contenedorFoto.getAttribute("data-foto-hd") || contenedorFoto.querySelector("img")?.src;

      if (urlFoto && typeof abrirFotoChatHD === "function") {
        abrirFotoChatHD(urlFoto);
      }
    }
  });
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
    // 🛡️ Determinar si el mensaje fue enviado por el usuario actual
    const esMio = burbuja.classList.contains("enviado");
    const btnEliminarTodos = menuMensajes.querySelector('[data-accion="eliminar-todos"]');

    // Si el mensaje es de la otra persona, ocultar la opción "Eliminar para todos"
    if (btnEliminarTodos) {
      btnEliminarTodos.style.display = esMio ? "flex" : "none";
    }

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

    // ↪️ OPCIÓN 3: REENVIAR MENSAJE (SOPORTE MULTI-VARIABLE + DISPARO DE EVENTO VISUAL)
    else if (accion === "reenviar") {
      try {
        const miUid = (typeof auth !== "undefined" && auth.currentUser) ? auth.currentUser.uid : null;
        const contactoUid = window.contactoActivoUid;
        const idChat = (miUid && contactoUid)
          ? (typeof obtenerChatId === "function" ? obtenerChatId(miUid, contactoUid) : [miUid, contactoUid].sort().join("_"))
          : (window.chatActivoId || null);

        let idMensaje = msgId
          || window.mensajeSeleccionadoId
          || (nodoMensaje ? (nodoMensaje.getAttribute("data-msg-id") || nodoMensaje.getAttribute("data-id")) : null);

        if (!idMensaje && nodoMensaje) {
          const contenedorPadre = nodoMensaje.closest("[data-msg-id]") || nodoMensaje.closest("[data-id]");
          if (contenedorPadre) {
            idMensaje = contenedorPadre.getAttribute("data-msg-id") || contenedorPadre.getAttribute("data-id");
          }
        }

        if (!idChat || !idMensaje) {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("No se pudo identificar el mensaje a reenviar.", "⚠️", "#ff4b2b");
          }
          return;
        }

        const mensajeRef = ref(db, `chats/${idChat}/mensajes/${idMensaje}`);
        const snapshot = await get(mensajeRef);

        if (!snapshot.exists()) {
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("No se encontró el mensaje en la base de datos.", "⚠️", "#ff4b2b");
          }
          return;
        }

        const msg = snapshot.val();
        const tieneTexto = msg.texto && msg.texto.trim().length > 0;
        const tieneAdjunto = msg.urlAdjunto || msg.tipoAdjunto === "audio";

        if (!tieneTexto && !tieneAdjunto) return;

        const esMioReal = (msg.emisor || msg.emisorUid) === miUid;
        let autorOriginal = msg.autorOriginal;

        if (!autorOriginal) {
          if (esMioReal) {
            // 👤 Captura tu nombre de usuario real para que al receptor le aparezca tu nombre
            autorOriginal = (auth.currentUser && auth.currentUser.displayName)
              || window.miNombreUsuario
              || (window.miPerfil && window.miPerfil.nombre)
              || "Tú";
          } else {
            const elemNombreContacto = document.querySelector(".amigo-nombre-chat");
            autorOriginal = elemNombreContacto ? elemNombreContacto.textContent.trim() : "Contacto";
          }
        }

        // 📦 1. Armar el paquete de datos del reenvío
        const paqueteReenvio = {
          texto: msg.texto || "",
          urlAdjunto: msg.urlAdjunto || null,
          tipoAdjunto: msg.tipoAdjunto || (msg.urlAdjunto ? "audio" : null),
          duracion: msg.duracion || null,
          autorOriginal: autorOriginal
        };

        // 🛡️ Asignar en AMBAS variables globales por compatibilidad
        window.objetoPendienteReenviar = paqueteReenvio;
        window.mensajeReenviadoActivo = paqueteReenvio;

        // ✍️ 2. INYECTAR TEXTO COMODÍN Y DISPARAR EVENTO 'INPUT'
        const inputChat = document.getElementById("input-chat-privado");
        if (inputChat) {
          if (msg.tipoAdjunto === "audio" || msg.urlAdjunto) {
            inputChat.value = "🎙️ Nota de voz";
          } else {
            inputChat.value = msg.texto || "";
          }

          inputChat.style.opacity = "0.6";
          inputChat.style.fontStyle = "italic";

          // ⚡ Disparar evento input para activar los listeners del DOM
          inputChat.dispatchEvent(new Event("input", { bubbles: true }));
        }

        // 🔄 3. Forzar cambio de icono a Avioncito
        if (typeof actualizarIconoBotonAccion === "function") {
          actualizarIconoBotonAccion();
        }

        // 📱 4. Volver a la lista de chats
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

        const tipoEtiqueta = tieneAdjunto ? "Nota de voz" : "Mensaje";
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`${tipoEtiqueta} de ${autorOriginal} lista. Selecciona el chat ↪️`, "✨", "#00f2fe");
        }

      } catch (err) {
        console.error("❌ Error al reenviar:", err);
      }
    }

    // 🗑️ OPCIÓN 4: ELIMINAR (Para todos o solo para mí)
    else if (accion === "eliminar-todos" || accion === "eliminar-mi") {
      // 1. Ocultar el menú contextual inmediatamente
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
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("No se encontró el ID del mensaje.", "⚠️", "#ff4b2b");
        }
        return;
      }

      function desaparecerBurbuja() {
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
      }

      const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
      const miUid = usuarioActual ? usuarioActual.uid : null;
      const contactoUid = window.contactoActivoUid;

      if (miUid && contactoUid) {
        const chatId = typeof obtenerChatId === "function"
          ? obtenerChatId(miUid, contactoUid)
          : [miUid, contactoUid].sort().join("_");

        const mensajeRef = ref(db, `chats/${chatId}/mensajes/${idParaBorrar}`);

        if (accion === "eliminar-todos") {
          // 🛡️ REGLA 1: Bloqueo inmediato en interfaz si no es tu mensaje
          if (!esMio) {
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("Solo el emisor puede eliminar este mensaje para todos.", "⚠️", "#ff4b2b");
            }
            return;
          }

          get(mensajeRef).then(async (snapshot) => {
            if (snapshot.exists()) {
              const datosMensaje = snapshot.val();
              const emisorReal = datosMensaje.emisor || datosMensaje.emisorUid;

              // 🛡️ REGLA 2: Verificación estricta del ID del emisor en la base de datos
              if (emisorReal !== miUid) {
                if (typeof mostrarAvisoPremium === "function") {
                  mostrarAvisoPremium("No tienes permiso para eliminar este mensaje para todos.", "🚫", "#ff4b2b");
                }
                return;
              }

              const tiempoMensaje = datosMensaje.timestamp || 0;
              const diferenciaMinutos = (Date.now() - tiempoMensaje) / 60000;

              if (diferenciaMinutos > 15) {
                if (typeof mostrarAvisoPremium === "function") {
                  mostrarAvisoPremium("Pasaron más de 15 minutos. Ya no puedes eliminarlo para todos.", "⏱️", "#ff4b2b");
                }
                return; // 🛑 Frenar proceso si excedió el tiempo límite
              }

              // 🗑️ Destrucción física del adjunto (audio/imagen) en Supabase Storage
              if (datosMensaje.urlAdjunto && datosMensaje.urlAdjunto.includes("supabase.co")) {
                await borrarArchivoDeSupabase(datosMensaje.urlAdjunto);
              }

              // Eliminar el registro en Realtime Database
              await set(mensajeRef, null);

              if (typeof mostrarAvisoPremium === "function") {
                mostrarAvisoPremium("Mensaje e imagen eliminados de la nube.", "🗑️", "#ff4b2b");
              }
              desaparecerBurbuja();
            }
          });
        } else if (accion === "eliminar-mi") {
          // 🛡️ ELIMINAR PARA MÍ CON VERIFICACIÓN CRUZADA
          get(mensajeRef).then(async (snap) => {
            if (snap.exists()) {
              const datos = snap.val();
              const emisorId = datos.emisor || datos.emisorUid;
              const receptorId = datos.receptor || datos.receptorUid || contactoUid;
              const otroUid = miUid === emisorId ? receptorId : emisorId;

              // Marcar como oculto para mí
              await update(mensajeRef, {
                [`eliminadoPara/${miUid}`]: true,
                [`ocultoPara/${miUid}`]: true
              });

              // Verificar si la otra persona YA lo había ocultado/eliminado para sí misma
              const yaLoOcultoOtro = (datos.ocultoPara && datos.ocultoPara[otroUid]) ||
                (datos.eliminadoPara && datos.eliminadoPara[otroUid]);

              // Si ambos lo ocultaron, realizar la purga física definitiva de Supabase Storage
              if (yaLoOcultoOtro) {
                if (datos.urlAdjunto && datos.urlAdjunto.includes("supabase.co")) {
                  await borrarArchivoDeSupabase(datos.urlAdjunto);
                }
                // Purga final del nodo en Realtime Database
                await set(mensajeRef, null);
              }

              if (typeof mostrarAvisoPremium === "function") {
                mostrarAvisoPremium("Mensaje eliminado de tu vista.", "🗑️", "#ff4b2b");
              }
              desaparecerBurbuja();
            }
          });
        }
      }
    }

    // Ocultar menú contextual de mensajes al terminar
    if (typeof menuMensajes !== "undefined" && menuMensajes) {
      menuMensajes.classList.add("oculto");
    }
  });
});

function actualizarIconoBotonAccion() {
  const btnAccionChat = document.getElementById("btn-accion-chat") || document.querySelector(".btn-enviar-mensaje");
  const inputChat = document.getElementById("input-chat-privado");

  if (!btnAccionChat) return;

  const tieneTexto = inputChat && inputChat.value.trim().length > 0;

  // 🎯 DETECCIÓN TOTAL DE REENVÍO: Busca en variables JS O en la barra visible del HTML
  const vistaPreviaDOM = document.getElementById("vista-previa-reenvio") || document.querySelector(".barra-reenvio") || document.querySelector("[class*='reenvi']");
  const tieneReenvioPendiente = !!(window.objetoPendienteReenviar || window.mensajeReenviadoActivo || (vistaPreviaDOM && vistaPreviaDOM.offsetHeight > 0));

  const tieneVistaPreviaAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");

  // 🚀 Si hay Texto, Adjunto O Reenvío Pendiente (en JS o HTML) -> Mostrar Avión / Send
  if (tieneTexto || tieneReenvioPendiente || tieneVistaPreviaAdjunto) {
    btnAccionChat.setAttribute("data-modo", "enviar");
    btnAccionChat.innerHTML = `<i data-lucide="send" style="width:20px; height:20px; margin-left: 2px;"></i>`;
  } else {
    // 🎙️ Solo si NO hay absolutamente nada -> Mostrar Micrófono
    btnAccionChat.setAttribute("data-modo", "grabar");
    btnAccionChat.innerHTML = `<i data-lucide="mic" style="width:20px; height:20px;"></i>`;
  }

  // Redibujar icono con Lucide
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

// 🔄 Control de visibilidad del botón flotante según la pantalla activa
function actualizarVisibilidadBtnFlotante(pantallaActiva) {
  const btnFlotante = document.getElementById("btn-abrir-contactos");
  if (!btnFlotante) return;

  if (pantallaActiva === "chats" || pantallaActiva === "bienvenida") {
    btnFlotante.classList.remove("oculto");
    btnFlotante.style.display = "flex";
  } else {
    btnFlotante.classList.add("oculto");
    btnFlotante.style.display = "none";
  }
}

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

  // Captura del menú inferior y la cabecera
  const menuFlotante = document.querySelector(".menu-flotante");
  const encabezado = document.querySelector(".encabezado-inicio");

  if (mostrar === pantallaChats || mostrar === pantallaPerfil) {
    mostrar.style.flexDirection = "column";
    mostrar.style.alignItems = "stretch";

    // 🟢 Restaura la barra de navegación y cabecera en vistas principales
    if (menuFlotante) menuFlotante.style.display = "flex";
    if (encabezado) encabezado.style.display = "flex";
  } else if (mostrar === pantallaChatPrivado) {
    // 🔴 Oculta la barra de navegación y cabecera dentro de un chat individual
    if (menuFlotante) menuFlotante.style.display = "none";
    if (encabezado) encabezado.style.display = "none";
  }

  // 3. CONTROL DE BOTÓN FLOTANTE (Actualizado)
  if (mostrar === pantallaChats) {
    actualizarVisibilidadBtnFlotante("chats");
  } else if (mostrar === pantallaPerfil) {
    actualizarVisibilidadBtnFlotante("perfil");
  } else if (mostrar === pantallaChatPrivado) {
    actualizarVisibilidadBtnFlotante("chatPrivado");
  } else {
    actualizarVisibilidadBtnFlotante("bienvenida");
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

    // 🚀 RESTAURAR MI PROPIO PERFIL AL TOCAR EL MENÚ INFERIOR
    if (auth.currentUser && typeof window.cargarPerfilUsuario === "function") {
      window.cargarPerfilUsuario(auth.currentUser.uid);
    }

    // 🔮 Reflejar la cápsula Aura al entrar a mi perfil
    setTimeout(() => {
      const auraGuardada = localStorage.getItem("movachat-aura-tema") || "cyber";
      const valorAttrHTML = (auraGuardada === "cyber") ? "cyan-morado" : auraGuardada;
      if (typeof window.cambiarAura === "function") {
        window.cambiarAura(valorAttrHTML);
      }

      // ⚡ Optimización: Se acota al contenedor del perfil o pantalla de ajustes activa
      const contenedorPerfil = document.getElementById("pantalla-perfil") ||
        document.getElementById("modal-perfil") ||
        document.querySelector(".contenedor-capsula-aura");

      if (window.lucide) {
        if (contenedorPerfil) {
          window.lucide.createIcons({ targets: [contenedorPerfil] });
        } else {
          // Fallback si no encuentra el contenedor específico
          const btnAura = document.querySelector(".btn-capsula-aura");
          if (btnAura) window.lucide.createIcons({ targets: [btnAura] });
        }
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
        if (!miUid) return;

        // 1. Ocultar el chat privado y la vista de perfil de contacto si estaban abiertos
        const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
        const vistaPerfilContacto = document.getElementById("vista-perfil-usuario") || document.getElementById("perfil-contacto");

        if (pantallaChatPrivado) pantallaChatPrivado.style.display = "none";
        if (vistaPerfilContacto) vistaPerfilContacto.style.display = "none";

        // 2. Forzar el renderizado explícito de TUS datos propios
        if (typeof cargarDatosPerfilPropio === "function") {
          cargarDatosPerfilPropio(miUid);
        } else if (typeof cargarMiPerfil === "function") {
          cargarMiPerfil(miUid);
        } else if (typeof renderizarMiPerfil === "function") {
          renderizarMiPerfil();
        }

        // 3. Activar la pestaña de "Perfil" en la navegación inferior
        const elementosNav = document.querySelectorAll(".barra-navegacion *, footer *, .menu-flotante *");
        const btnPerfilInferior = Array.from(elementosNav).find((el) =>
          el.textContent && el.textContent.trim().toLowerCase() === "perfil"
        );

        if (btnPerfilInferior) {
          btnPerfilInferior.click();
        } else {
          const pantallaPerfil = document.getElementById("pantalla-perfil") || document.querySelector(".pantalla-perfil");
          const pantallaChats = document.getElementById("pantalla-chats") || document.querySelector(".pantalla-chats");

          if (pantallaPerfil && pantallaChats) {
            pantallaChats.style.display = "none";
            pantallaPerfil.style.display = "flex";
          }
        }

        // 4. Restaurar la visibilidad del encabezado principal
        const encabezadoInicio = document.querySelector(".encabezado-inicio");
        if (encabezadoInicio) encabezadoInicio.style.display = "flex";
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

            // Disparar correo de restablecimiento seguro desde Firebase
            await sendPasswordResetEmail(auth, usuarioActual.email);

            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium(`Enlace enviado a <b>${usuarioActual.email}</b> 🔑`, "✉️", "#00f2fe");
            }
          } catch (error) {
            console.error("Error al enviar correo de cambio:", error);
            if (typeof mostrarAvisoPremium === "function") {
              mostrarAvisoPremium("No se pudo enviar el correo de restablecimiento ⚠️", "❌", "#ff4b2b");
            }
          }
        }
      }

      else if (accion === "cerrar-sesion") {
        const modalLogout = document.getElementById("modal-confirmar-cerrar-sesion");
        if (modalLogout) {
          modalLogout.classList.remove("oculto");
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
    if (typeof window.contactoActivoUid !== "undefined") window.contactoActivoUid = null;

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
    // 👤 Tocar el NOMBRE abre la pantalla de Perfil del visitante
    if (window.contactoActivoUid) {
      window.cargarPerfilUsuario(window.contactoActivoUid);
    }
  });
}

if (fotoCabeceraPrivada) {
  fotoCabeceraPrivada.style.cursor = "pointer";
  fotoCabeceraPrivada.addEventListener("click", (e) => {
    e.stopPropagation();

    // 📸 Tocar la FOTO abre el visor en pantalla completa / HD
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
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Visualizando imagen de perfil en Alta Definición 🌌", "📸", "#00f2fe");
      }
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

// ========================================================
// 📸 VISOR HD EN MODAL PARA FOTOS DE CHAT
// ========================================================
function abrirFotoChatHD(urlFoto) {
  if (!urlFoto) return;

  const visor = document.getElementById("visor-historias-mova");
  const imgRender = document.getElementById("img-estado-render");
  const textoRender = document.getElementById("texto-estado-render");
  const lineaProg = document.getElementById("linea-progreso-estado");

  if (visor && imgRender && textoRender) {
    imgRender.src = urlFoto;
    textoRender.textContent = "Vista previa en Alta Definición";

    if (lineaProg && lineaProg.parentNode) {
      lineaProg.parentNode.style.visibility = "hidden";
    }

    visor.classList.remove("oculto");

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Visualizando imagen completa en HD 🌌", "📸", "#00f2fe");
    }
  }
}

// 🌐 HACER LA FUNCIÓN ACCESIBLE DE FORMA GLOBAL PARA LOS ONCLICK EN HTML
window.abrirFotoChatHD = abrirFotoChatHD;

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

let unsubscribeConnected = null;
let funcionVisibility = null;

// 📡 1. GESTIÓN AUTOMÁTICA DEL LED SUPERIOR (PRESENCIA REAL)
function iniciarControlPresenciaReal() {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual) return;

  const userRef = ref(db, `usuarios/${usuarioActual.uid}`);
  const connectedRef = ref(db, ".info/connected");

  // Al desconectarse bruscamente, apagar el LED superior
  onDisconnect(userRef).update({ presenciaReal: false });

  // Guardar listener de conexión para poder destruirlo al salir
  unsubscribeConnected = onValue(connectedRef, (snap) => {
    if (snap.val() === true && !document.hidden && auth.currentUser) {
      update(userRef, { presenciaReal: true });
    }
  });

  // Listener para cuando minimiza o maximiza la app
  funcionVisibility = () => {
    if (document.hidden) {
      update(userRef, { presenciaReal: false });
    } else if (auth.currentUser) {
      update(userRef, { presenciaReal: true });
    }
  };

  document.addEventListener("visibilitychange", funcionVisibility);

  if (typeof iniciarEscuchaMiEstado === "function") {
    iniciarEscuchaMiEstado();
  }
}

// 🛑 DETENER DETECCIÓN Y APAGAR LED AL CERRAR SESIÓN
async function detenerControlPresenciaReal() {
  const usuarioActual = auth.currentUser;

  // 1. Remover escuchador del ciclo de vida de la ventana
  if (funcionVisibility) {
    document.removeEventListener("visibilitychange", funcionVisibility);
    funcionVisibility = null;
  }

  // 2. Apagar escuchador de conexión Firebase
  if (unsubscribeConnected) {
    unsubscribeConnected();
    unsubscribeConnected = null;
  }

  // 3. Forzar apagado de presencia en la BD
  if (usuarioActual) {
    const userRef = ref(db, `usuarios/${usuarioActual.uid}`);
    await update(userRef, { presenciaReal: false });
  }
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

// ⏱️ VARIABLES PARA CONTROLAR LA PAUSA AL MANTENER PRESIONADO
let tiempoTotalHistoria = 10000; // 10 segundos por defecto
let tiempoRestante = 10000;
let tiempoInicioEstado = 0;
let historiaPausada = false;

function iniciarTemporizadorVisor(duracionMs) {
  tiempoInicioEstado = Date.now();
  tiempoRestante = duracionMs;
  historiaPausada = false;

  // Animación suave de la barra de progreso
  if (intervaloBarraProgreso) clearInterval(intervaloBarraProgreso);
  intervaloBarraProgreso = setInterval(() => {
    if (historiaPausada) return;

    const transcurridoSegmento = Date.now() - tiempoInicioEstado;
    const tiempoConsumidoTotal = (tiempoTotalHistoria - tiempoRestante) + transcurridoSegmento;
    let porcentaje = (tiempoConsumidoTotal / tiempoTotalHistoria) * 100;

    if (porcentaje > 100) porcentaje = 100;
    if (lineaProgreso) lineaProgreso.style.width = `${porcentaje}%`;
  }, 50);

  // Programar cierre cuando acabe el tiempo restante
  if (temporizadorEstado) clearTimeout(temporizadorEstado);
  temporizadorEstado = setTimeout(() => {
    cerrarEstadoMova();
  }, duracionMs);
}

function pausarVisorHistoria() {
  if (historiaPausada) return;
  historiaPausada = true;

  // Congelar timers
  if (temporizadorEstado) clearTimeout(temporizadorEstado);

  // Calcular exactamente cuánto tiempo queda
  const transcurrido = Date.now() - tiempoInicioEstado;
  tiempoRestante = Math.max(0, tiempoRestante - transcurrido);
}

function reanudarVisorHistoria() {
  if (!historiaPausada) return;
  if (tiempoRestante <= 0) {
    cerrarEstadoMova();
    return;
  }
  iniciarTemporizadorVisor(tiempoRestante);
}

function abrirEstadoAmigo(urlFoto, fraseInicial, uidAutor = null) {
  if (!visorEstados) return;
  if (lineaProgreso && lineaProgreso.parentNode) {
    lineaProgreso.parentNode.style.visibility = "visible";
  }

  imgEstadoRender.src = urlFoto;
  textoEstadoRender.textContent = fraseInicial;

  window.autorHistoriaActivaUid = uidAutor;

  const miUid = auth.currentUser ? auth.currentUser.uid : null;
  const btnVerLikes = document.getElementById("btn-ver-likes-estado");

  // 👁️ Mostrar el ojo de visualización SOLO si es tu propia historia
  if (btnVerLikes) {
    if (uidAutor && miUid && uidAutor === miUid) {
      btnVerLikes.classList.remove("oculto");
    } else {
      btnVerLikes.classList.add("oculto");
    }
  }

  // Sincronizar escucha en Firebase
  if (uidAutor) {
    escucharLikesHistoria(uidAutor);
  } else {
    if (contadorLikesEstado) contadorLikesEstado.textContent = "0";
    if (btnCorazonEstado) btnCorazonEstado.classList.remove("activo");
  }

  visorEstados.classList.remove("oculto");

  // Resetear estados de tiempo e iniciar contador a 10s
  tiempoTotalHistoria = 10000;
  if (lineaProgreso) lineaProgreso.style.width = "0%";
  iniciarTemporizadorVisor(tiempoTotalHistoria);
}

function cerrarEstadoMova() {
  if (visorEstados) visorEstados.classList.add("oculto");
  if (temporizadorEstado) clearTimeout(temporizadorEstado);
  if (intervaloBarraProgreso) clearInterval(intervaloBarraProgreso);

  historiaPausada = false;

  // 🟢 RESTAURAR VISIBILIDAD DE LA BARRA
  if (lineaProgreso && lineaProgreso.parentNode) {
    lineaProgreso.parentNode.style.visibility = "visible";
    lineaProgreso.style.width = "0%";
  }

  window.autorHistoriaActivaUid = null;
  if (typeof desuscribirLikesHistoria === "function" && desuscribirLikesHistoria) {
    desuscribirLikesHistoria();
    desuscribirLikesHistoria = null;
  }
}

if (btnCerrarEstado) {
  btnCerrarEstado.addEventListener("click", () => {
    cerrarEstadoMova();
  });
}

// 👆 LISTENERS PARA MANTENER PRESIONADO Y PAUSAR LA HISTORIA (CON PROTECCIÓN MENÚ CONTEXTUAL)
if (visorEstados) {
  // 🚨 Prevenir el menú contextual (menú emergente del móvil/navegador)
  visorEstados.addEventListener("contextmenu", (e) => {
    e.preventDefault();
  });

  // Listener de mantener presionado
  visorEstados.addEventListener("pointerdown", (e) => {
    // Si toca algún botón interactivo, no pausamos para permitir el clic normal
    if (e.target.closest("button") || e.target.closest(".btn-accion") || e.target.closest("#menu-vistas-likes")) {
      return;
    }
    pausarVisorHistoria();
  });

  // Al soltar el toque/clic
  visorEstados.addEventListener("pointerup", () => {
    reanudarVisorHistoria();
  });

  // Si arrastra el dedo o puntero fuera de la pantalla
  visorEstados.addEventListener("pointerleave", () => {
    reanudarVisorHistoria();
  });
}

// ❤️ 1. DAR O QUITAR "ME GUSTA" EN LA HISTORIA (FIREBASE)
async function toggleLikeHistoria(uidAutorHistoria) {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual || !uidAutorHistoria) return;

  const miUid = usuarioActual.uid;
  const likeRef = ref(db, `historias_likes/${uidAutorHistoria}/${miUid}`);

  if (btnCorazonEstado) {
    btnCorazonEstado.classList.toggle("activo");
  }

  try {
    const snap = await get(likeRef);

    if (snap.exists()) {
      await remove(likeRef);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Has quitado tu me gusta 💔", "💔", "#ff4b2b");
      }
    } else {
      // 🚀 Obtener foto y nombre actualizados directamente de la base de datos
      const snapUser = await get(ref(db, `usuarios/${miUid}`));
      const datosUser = snapUser.exists() ? snapUser.val() : {};
      const fotoPerfilReal = datosUser.fotoUrl || usuarioActual.photoURL || "";
      const nombreReal = datosUser.nombre || usuarioActual.displayName || "Usuario Mova";

      await set(likeRef, {
        nombre: nombreReal,
        fotoUrl: fotoPerfilReal,
        timestamp: Date.now()
      });

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("¡Te ha gustado esta historia! ❤️", "❤️", "#ff4b2b");
      }
    }
  } catch (err) {
    console.error("Error al actualizar me gusta:", err);
    if (btnCorazonEstado) {
      btnCorazonEstado.classList.toggle("activo");
    }
  }
}

// 📊 2. ESCUCHAR CORAZONES Y CONTADOR EN TIEMPO REAL
let desuscribirLikesHistoria = null;

// ❤️ 3. EVENTO DE CLIC EN EL CORAZÓN CONECTADO A FIREBASE
if (btnCorazonEstado) {
  btnCorazonEstado.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.autorHistoriaActivaUid) {
      toggleLikeHistoria(window.autorHistoriaActivaUid);
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
  // 1. Buscar explícitamente por clase o ID
  let btn = e.target.closest(".btn-compartir") || e.target.closest("#btn-compartir-mova");

  // 2. Si no tiene ID/Clase, buscamos por texto PERO estrictamente dentro de un botón real
  if (!btn) {
    const botonCercano = e.target.closest("button");
    if (botonCercano && botonCercano.textContent.includes("Compartir MovaChat")) {
      btn = botonCercano;
    }
  }

  if (btn) {
    e.preventDefault();
    e.stopPropagation();
    ejecutarCompartirMova(); // Esta es tu función original, que ahora se llamará correctamente
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
  // 1. Buscar explícitamente por clase o ID
  let btnQr = e.target.closest(".btn-qr") || e.target.closest("#btn-qr-mova");

  // 2. Si no tiene ID/Clase, buscamos por texto PERO estrictamente dentro de un botón real
  if (!btnQr) {
    const botonCercano = e.target.closest("button");
    if (botonCercano && botonCercano.textContent.includes("QR Pro")) {
      btnQr = botonCercano;
    }
  }

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

// ========================================================
// 3. EDITAR ESTADO DE PERFIL Y LED (SIN CONFLICHO DE HISTORIAS)
// ========================================================
const btnEditarEstado = document.getElementById("btn-editar-estado");
const modalEstado = document.getElementById("modal-estado");
const btnCerrarModal = document.getElementById("btn-cerrar-modal");
const btnGuardarEstado = document.getElementById("btn-guardar-estado");
const inputNuevoEstado = document.getElementById("input-nuevo-estado");
const textoEstadoPerfil = document.querySelector(".texto-estado");
const ledPerfil = document.querySelector(".btn-estado-sutil .punto-online");
const botonesLed = document.querySelectorAll(".selector-led .btn-led");

let colorLedSeleccionado = "#00f2fe";
let tipoEstadoSeleccionado = "online";
let nombreEstadoSeleccionado = "Disponible";

// Variable de control de contexto del modal
let modoModalEstado = "perfil"; // 'perfil' o 'historia'

// A) Abrir modal desde PERFIL
if (btnEditarEstado && modalEstado) {
  btnEditarEstado.addEventListener("click", () => {
    const pantallaPerfil = document.getElementById("pantalla-perfil");

    // 🛡️ Si la pantalla de perfil está en modo visitante, bloquea la edición del estado
    if (pantallaPerfil && pantallaPerfil.classList.contains("modo-visitante")) return;

    modoModalEstado = "perfil";

    // Mostrar selectores de LED
    const selectorLed = modalEstado.querySelector(".selector-led");
    const labelsModal = modalEstado.querySelectorAll(".modal-label");
    if (selectorLed) selectorLed.style.display = "flex";
    if (labelsModal[1]) labelsModal[1].style.display = "block";

    // Pre-llenar la caja con la frase actual si no es un texto genérico
    if (inputNuevoEstado) {
      const textoActual = textoEstadoPerfil ? textoEstadoPerfil.textContent.trim() : "";
      inputNuevoEstado.value = (textoActual.includes("Disponible") || textoActual.includes("Ocupado") || textoActual.includes("Invisible")) ? "" : textoActual;
      inputNuevoEstado.focus();
    }

    modalEstado.classList.remove("oculto");
  });
}

if (btnCerrarModal && modalEstado) {
  btnCerrarModal.addEventListener("click", () => {
    modalEstado.classList.add("oculto");
  });
}

// Seleccionar color de LED
botonesLed.forEach(boton => {
  boton.addEventListener("click", () => {
    botonesLed.forEach(b => b.classList.remove("activo"));
    boton.classList.add("activo");

    colorLedSeleccionado = boton.style.getPropertyValue("--led-color").trim() || "#00f2fe";

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

// B) Guardar Cambios UNIFICADO (Diferencia Perfil de Historias)
if (btnGuardarEstado && modalEstado) {
  btnGuardarEstado.onclick = async () => {
    // 🛡️ 1. Prevenir clics dobles / fantasma mientras se procesa la petición
    if (btnGuardarEstado.disabled) return;
    btnGuardarEstado.disabled = true;

    try {
      const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
      const fraseIngresada = inputNuevoEstado ? inputNuevoEstado.value.trim() : "";

      if (modoModalEstado === "historia") {
        // --- GUARDAR COMENTARIO DE HISTORIA ("Mi Estado") ---
        if (typeof fraseEstadoGuardada !== "undefined") {
          fraseEstadoGuardada = fraseIngresada;
        }

        if (usuarioActual) {
          await update(ref(db, `usuarios/${usuarioActual.uid}`), {
            estadoHistoriaTexto: fraseIngresada
          });
        }

        if (avatarMiEstadoClick) avatarMiEstadoClick.classList.add("con-estado-activo");
        if (textoSubtituloMiEstado) {
          textoSubtituloMiEstado.textContent = "👁️ Toca para ver tu estado activo";
          textoSubtituloMiEstado.classList.add("texto-cyan");
        }
        if (tiempoMiEstado) tiempoMiEstado.textContent = "Hace un momento";

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("¡Tu historia ya está publicada en la nube! 🚀", "🛸", "#00f2fe");
        }

      } else {
        // --- GUARDAR PERFIL GENERAL (Frase + LED) ---
        const nombreSel = typeof nombreEstadoSeleccionado !== "undefined" ? nombreEstadoSeleccionado : "En línea";
        const colorSel = typeof colorLedSeleccionado !== "undefined" ? colorLedSeleccionado : "#00f2fe";
        const tipoSel = typeof tipoEstadoSeleccionado !== "undefined" ? tipoEstadoSeleccionado : "online";

        const textoFinal = fraseIngresada !== "" ? fraseIngresada : `${nombreSel}. Toca para añadir estado...`;

        if (textoEstadoPerfil) textoEstadoPerfil.textContent = textoFinal;
        if (ledPerfil) {
          ledPerfil.style.backgroundColor = colorSel;
          ledPerfil.style.boxShadow = `0 0 10px ${colorSel}`;
        }

        if (usuarioActual) {
          await update(ref(db, `usuarios/${usuarioActual.uid}`), {
            estadoTexto: textoFinal,
            estado: textoFinal,
            estadoConexion: tipoSel,
            estadoPresencia: tipoSel
          });
        }

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`Perfil actualizado: ${nombreSel} ✨`, "👤", "#00f2fe");
        }
      }

      // Ocultar modal solo si todo se guardó correctamente
      modalEstado.classList.add("oculto");

      if (typeof actualizarDobleLedCabecera === "function") {
        actualizarDobleLedCabecera("perfil");
      }

    } catch (error) {
      console.error("Error al actualizar el estado:", error);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Error de conexión al guardar el estado ⚠️", "❌", "#ff4b2b");
      }
    } finally {
      // 🔓 Reorganizar el botón para futuros usos
      btnGuardarEstado.disabled = false;
    }
  };
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
// 🔔 1. FUNCIÓN UNIFICADA PARA LA CAMPANITA, PWA Y FILTROS
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

      if (num > 0) {
        badge.classList.remove("oculto");
        totalNoLeidos += num;
      } else {
        badge.classList.add("oculto");
      }
    }
  });

  // 🔔 Actualizar insignia de la campanita
  if (elemBadgeCampanita) {
    if (totalNoLeidos > 0) {
      elemBadgeCampanita.textContent = totalNoLeidos > 99 ? "99+" : totalNoLeidos.toString();
      elemBadgeCampanita.classList.remove("oculto");
    } else {
      elemBadgeCampanita.textContent = "0";
      elemBadgeCampanita.classList.add("oculto");
    }
  }

  // 🏷️ Actualizar filtro de "No leídos"
  if (elemBadgeFiltroNoLeidos) {
    elemBadgeFiltroNoLeidos.textContent = totalNoLeidos.toString();
  }

  // 📱 Sincronizar marcador nativo PWA / Icono en pantalla de inicio del teléfono
  if ("setAppBadge" in navigator) {
    if (totalNoLeidos > 0) {
      navigator.setAppBadge(totalNoLeidos).catch(() => { });
    } else {
      if ("clearAppBadge" in navigator) {
        navigator.clearAppBadge().catch(() => { });
      }
    }
  }
};

// Map global para evitar escuchadores duplicados por contacto
window.desuscripcionesUltimoMsg = window.desuscripcionesUltimoMsg || {};

function escucharUltimoMensajeContacto(miUid, contactoUid, datosUsuario, fijadosBD = {}) {
  const chatId = obtenerChatId(miUid, contactoUid);
  const mensajesRef = ref(db, `chats/${chatId}/mensajes`);
  const lecturaRef = ref(db, `lecturas/${miUid}/${contactoUid}`);
  const vaciadoRef = ref(db, `vaciados/${miUid}/${contactoUid}`);
  const ocultoRef = ref(db, `chats_ocultos/${miUid}/${contactoUid}`);

  if (window.desuscripcionesUltimoMsg[contactoUid]) {
    window.desuscripcionesUltimoMsg[contactoUid]();
    delete window.desuscripcionesUltimoMsg[contactoUid];
  }

  let timerExpiracionEfimera = null;
  let esPrimeraCargaGlobal = true;

  const unsubscribe = onValue(mensajesRef, async (snapshot) => {
    const contenedorLista = document.getElementById("lista-chats-principal");
    if (!contenedorLista) return;

    if (timerExpiracionEfimera) clearTimeout(timerExpiracionEfimera);

    let tarjetaContacto = document.getElementById(`tarjeta-chat-${contactoUid}`);

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
    let ultimoMsg = null;
    let ultimoMsgKey = null;
    let mensajes = {};
    let mensajesOrdenados = [];

    if (hayMensajesHistoricos) {
      mensajes = snapshot.val();
      const ahora = Date.now();

      mensajesOrdenados = Object.keys(mensajes)
        .map(key => ({ key, ...mensajes[key] }))
        .filter(m => {
          const esPosteriorVaciado = (m.timestamp || 0) > timestampUltimoVaciado;
          if (m.eliminadoPara && m.eliminadoPara[miUid]) return false;
          if (m.esEfimero) {
            const limiteMs = m.duracionEfimeraMs || 10000;
            const transcurrido = ahora - (m.timestamp || ahora);
            if (transcurrido >= limiteMs) {
              set(ref(db, `chats/${chatId}/mensajes/${m.key}`), null);
              return false;
            }
          }
          return esPosteriorVaciado;
        })
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

      if (mensajesOrdenados.length > 0) {
        ultimoMsg = mensajesOrdenados[mensajesOrdenados.length - 1];
        ultimoMsgKey = ultimoMsg.key;
      }
    }

    // Notificaciones y audio
    window.mensajesNotificadosUnificados = window.mensajesNotificadosUnificados || new Set();

    if (!esPrimeraCargaGlobal && ultimoMsg && ultimoMsgKey) {
      const idEmisor = ultimoMsg.emisor || ultimoMsg.emisorUid || ultimoMsg.remitente || ultimoMsg.remitenteId || ultimoMsg.uid;
      const haceCuanto = Date.now() - (ultimoMsg.timestamp || 0);

      if (idEmisor === contactoUid && haceCuanto < 12000 && !window.mensajesNotificadosUnificados.has(ultimoMsgKey)) {
        window.mensajesNotificadosUnificados.add(ultimoMsgKey);

        if (typeof window.reproducirSonidoRecibido === "function") {
          window.reproducirSonidoRecibido(contactoUid);
        }

        const nombreContacto = datosUsuario ? (datosUsuario.nombre || "MovaChat") : "MovaChat";

        let textoContacto = (ultimoMsg.texto || "").trim();
        if (!textoContacto) {
          if (ultimoMsg.tipoAdjunto === "audio") textoContacto = "🎙️ Nota de voz";
          else if (ultimoMsg.tipoAdjunto === "foto" || ultimoMsg.tipoAdjunto === "imagen") textoContacto = "📷 Foto";
          else if (ultimoMsg.tipoAdjunto === "video") textoContacto = "🎥 Video";
          else if (ultimoMsg.tipoAdjunto === "documento") textoContacto = "📄 Documento";
          else if (ultimoMsg.tipoAdjunto) textoContacto = "📎 Archivo adjunto";
          else textoContacto = "Nuevo mensaje";
        }

        const fotoContacto = datosUsuario ? datosUsuario.fotoUrl : "";

        if (typeof window.notificarNuevoMensaje === "function") {
          window.notificarNuevoMensaje(nombreContacto, textoContacto, fotoContacto);
        }
      }
    }

    esPrimeraCargaGlobal = false;

    // Si ocultó o vació el chat completamente
    if ((timestampOculto > 0 && timestampOculto >= timestampUltimoVaciado && (ultimoMsg?.timestamp || 0) <= timestampOculto) ||
      (!hayMensajesHistoricos && timestampUltimoVaciado === 0 && timestampOculto === 0)) {
      if (tarjetaContacto) tarjetaContacto.remove();
      if (typeof actualizarEstadoPantallaInicio === "function") actualizarEstadoPantallaInicio();
      if (typeof window.actualizarBadgesNotificaciones === "function") window.actualizarBadgesNotificaciones();
      reordenarListaChats();
      return;
    }

    // Crear la tarjeta si no existe
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

      const estaSilenciadoInicial = localStorage.getItem(`silenciado_${contactoUid}`) === "true";
      const esFijadoInicial = fijadosBD[contactoUid] === true || localStorage.getItem(`fijado_${contactoUid}`) === "true";

      if (estaSilenciadoInicial) {
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
            ${esFijadoInicial ? `<span class="indicador-pin-neon" title="Chat fijado"><i data-lucide="pin" style="width:14px; height:14px;"></i></span>` : ''}
            ${estaSilenciadoInicial ? `<span class="indicador-silencio-neon" title="Chat silenciado"><i data-lucide="bell-off"></i></span>` : ''}
          </div>
          <div class="chat-mensaje-caja">
            <p class="chat-texto"></p>
            <div class="badge-chat-no-leido badge-mensaje oculto">0</div>
          </div>
        </div>
      `;

      tarjetaContacto.addEventListener("click", (e) => {
        e.stopPropagation();

        if (e.target.closest(".chat-avatar-caja") && tarjetaContacto.dataset.estadoUrl) {
          if (typeof abrirEstadoAmigo === "function") {
            abrirEstadoAmigo(tarjetaContacto.dataset.estadoUrl, tarjetaContacto.dataset.estadoTexto || "", contactoUid);
          }
          return;
        }

        window.contactoActivoUid = contactoUid;

        const badge = tarjetaContacto.querySelector(".badge-chat-no-leido");
        const elemTexto = tarjetaContacto.querySelector(".chat-texto");

        if (badge) {
          badge.textContent = "0";
          badge.classList.add("oculto");
        }
        if (elemTexto) elemTexto.classList.remove("texto-resaltado");

        if (typeof window.actualizarBadgesNotificaciones === "function") {
          window.actualizarBadgesNotificaciones();
        }

        document.querySelectorAll(".tarjeta-chat").forEach(el => el.classList.remove("activo"));
        tarjetaContacto.classList.add("activo");

        if (typeof abrirChatConUsuario === "function") {
          abrirChatConUsuario(contactoUid, nombreContacto, (datosUsuario ? datosUsuario.fotoUrl : ""));
        }
      });

      contenedorLista.appendChild(tarjetaContacto);
      if (window.lucide) window.lucide.createIcons({ targets: [tarjetaContacto] });

      const datosFresh = (window.usuariosCacheGlobal && window.usuariosCacheGlobal[contactoUid]) || datosUsuario;
      if (window.actualizarTarjetaContactoUI && datosFresh) {
        window.actualizarTarjetaContactoUI(contactoUid, datosFresh);
      }
    }

    // 🏆 ASIGNACIÓN DE ESTADO Y TIMESTAMP
    const timestampMsg = ultimoMsg ? (ultimoMsg.timestamp || Date.now()) : 0;
    const esFijado = fijadosBD[contactoUid] === true || localStorage.getItem(`fijado_${contactoUid}`) === "true";

    tarjetaContacto.dataset.timestamp = timestampMsg;

    if (esFijado) {
      tarjetaContacto.classList.add("tarjeta-fijada");
    } else {
      tarjetaContacto.classList.remove("tarjeta-fijada");
    }

    // Limpiar propiedad order si existía previamente
    tarjetaContacto.style.removeProperty("order");

    // Actualizar contenido del mensaje
    const elemTexto = tarjetaContacto.querySelector(".chat-texto");
    const elemHora = tarjetaContacto.querySelector(".chat-hora");
    const elemBadge = tarjetaContacto.querySelector(".badge-chat-no-leido") || tarjetaContacto.querySelector(".badge-mensaje");

    if (ultimoMsg) {
      if (elemTexto) {
        const textoMsg = (ultimoMsg.texto || "").trim();
        const tipoAdj = ultimoMsg.tipoAdjunto || (ultimoMsg.urlAdjunto ? (ultimoMsg.urlAdjunto.includes("audio") ? "audio" : "adjunto") : null);

        if (tipoAdj === "audio") {
          elemTexto.innerHTML = `<span class="preview-adjunto"><i data-lucide="mic" style="width:14px; height:14px; margin-right:3px; vertical-align:middle;"></i> ${textoMsg || "Nota de voz"}</span>`;
        } else if (tipoAdj === "foto" || tipoAdj === "imagen") {
          elemTexto.innerHTML = `<span class="preview-adjunto"><i data-lucide="camera" style="width:14px; height:14px; margin-right:3px; vertical-align:middle;"></i> ${textoMsg || "Foto"}</span>`;
        } else if (tipoAdj === "video") {
          elemTexto.innerHTML = `<span class="preview-adjunto"><i data-lucide="video" style="width:14px; height:14px; margin-right:3px; vertical-align:middle;"></i> ${textoMsg || "Video"}</span>`;
        } else if (tipoAdj === "documento") {
          elemTexto.innerHTML = `<span class="preview-adjunto"><i data-lucide="file-text" style="width:14px; height:14px; margin-right:3px; vertical-align:middle;"></i> ${textoMsg || "Documento"}</span>`;
        } else if (tipoAdj) {
          elemTexto.innerHTML = `<span class="preview-adjunto"><i data-lucide="paperclip" style="width:14px; height:14px; margin-right:3px; vertical-align:middle;"></i> ${textoMsg || "Adjunto"}</span>`;
        } else {
          elemTexto.textContent = textoMsg;
        }

        if (window.lucide) {
          window.lucide.createIcons({ targets: [elemTexto] });
        }
      }
      if (elemHora) elemHora.textContent = ultimoMsg.hora || "";
    } else {
      if (elemTexto) elemTexto.textContent = "Conversación vaciada";
      if (elemHora) elemHora.textContent = "--:--";
    }

    // Conteo de mensajes no leídos
    const pantallaChat = document.getElementById("pantalla-chat-privado");
    const estaAbierto = (window.contactoActivoUid === contactoUid) &&
      pantallaChat &&
      (pantallaChat.style.display === "flex" || pantallaChat.classList.contains("pantalla-completa"));

    if (estaAbierto) {
      if (ultimoMsgKey) set(lecturaRef, ultimoMsgKey);
      if (elemBadge) {
        elemBadge.textContent = "0";
        elemBadge.classList.add("oculto");
      }
      if (elemTexto) elemTexto.classList.remove("texto-resaltado");

      if (typeof window.actualizarBadgesNotificaciones === "function") {
        window.actualizarBadgesNotificaciones();
      }
    } else {
      get(lecturaRef).then((lecturaSnap) => {
        const ultimoLeidoKey = lecturaSnap.exists() ? lecturaSnap.val() : "";

        const objUltimoLeido = mensajesOrdenados.find(m => m.key === ultimoLeidoKey);
        const timestampUltimoLeido = objUltimoLeido ? (objUltimoLeido.timestamp || 0) : 0;

        let nuevos = 0;

        mensajesOrdenados.forEach((m) => {
          const idEmisor = m.emisor || m.emisorUid || m.remitente || m.remitenteId || m.uid;
          if (idEmisor === contactoUid && (m.timestamp || 0) > timestampUltimoLeido) {
            nuevos++;
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

    // 🔄 EJECUTAR EL REORDENAMIENTO REAL EN EL DOM
    reordenarListaChats();

    if (typeof actualizarEstadoPantallaInicio === "function") actualizarEstadoPantallaInicio();
  });

  window.desuscripcionesUltimoMsg[contactoUid] = unsubscribe;
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && auth.currentUser) {
    if (typeof cargarContactosAprobados === "function") {
      cargarContactosAprobados(auth.currentUser.uid);
    }
  }
});

function reordenarListaChats() {
  const contenedor = document.getElementById("lista-chats-principal");
  if (!contenedor) return;

  // 1. Obtener exactamente la tarjeta de Mi Estado
  const miEstado = document.getElementById("tarjeta-mi-estado-propio");

  // 2. Obtener SOLO los chats de contactos (excluyendo Mi Estado explícitamente)
  const tarjetasChat = Array.from(contenedor.querySelectorAll(".tarjeta-chat"))
    .filter(t => !t.classList.contains("tarjeta-estado-propio") && t.id !== "tarjeta-mi-estado-propio");

  const fijados = [];
  const normales = [];

  tarjetasChat.forEach(tarjeta => {
    // Quitar cualquier 'order' de CSS viejo que pueda romper el DOM
    tarjeta.style.removeProperty("order");

    const esFijado = tarjeta.classList.contains("tarjeta-fijada") || 
                     tarjeta.querySelector(".indicador-pin-neon") !== null;
    const timestamp = Number(tarjeta.dataset.timestamp) || 0;

    if (esFijado) {
      fijados.push({ elem: tarjeta, timestamp });
    } else {
      normales.push({ elem: tarjeta, timestamp });
    }
  });

  // 3. Ordenar de más reciente a más antiguo dentro de cada bloque
  fijados.sort((a, b) => b.timestamp - a.timestamp);
  normales.sort((a, b) => b.timestamp - a.timestamp);

  // 4. REINSERCIÓN FÍSICA EN EL DOM (JERARQUÍA ESTRICTA)
  
  // Posición 1: Mi Estado SIEMPRE de primero
  if (miEstado) {
    miEstado.style.removeProperty("order");
    contenedor.appendChild(miEstado);
  }

  // Posición 2: Chats fijados
  fijados.forEach(item => contenedor.appendChild(item.elem));

  // Posición 3: Chats normales
  normales.forEach(item => contenedor.appendChild(item.elem));
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
// 10. ESTADO PROPIO Y HISTORIAS (24H + SUPABASE + FIREBASE)
// ========================================================
const tarjetaMiEstado = document.getElementById("tarjeta-mi-estado-propio");
const avatarMiEstadoClick = document.getElementById("avatar-mi-estado-click");
const textoSubtituloMiEstado = document.getElementById("texto-subtitulo-mi-estado");
const tiempoMiEstado = document.getElementById("tiempo-mi-estado");
const inputSubirEstadoReal = document.getElementById("input-subir-estado");

let imagenEstadoGuardada = null;
let fraseEstadoGuardada = "";
let fechaEstadoGuardada = null;

const TIEMPO_EXPIRACION_24H = 24 * 60 * 60 * 1000; // 24 horas en milisegundos

// 🧹 Función auxiliar para limpiar la historia en Supabase, Firebase e interfaz
async function borrarMiEstadoCompleto(usuarioUid, urlFotoBorrar) {
  try {
    // 1. Borrar la imagen física del bucket de Supabase
    if (urlFotoBorrar) {
      await eliminarArchivoSupabase(urlFotoBorrar, "movachat-adjuntos");
    }

    // 2. Limpiar los datos del estado en el perfil del usuario en Firebase
    await update(ref(db, `usuarios/${usuarioUid}`), {
      estadoHistoriaUrl: null,
      estadoHistoriaFecha: null,
      estadoHistoriaTexto: null
    });

    // 🚨 3. ELIMINAR CORAZONES Y VISTAS ASOCIADOS A ESTE ESTADO EN FIREBASE
    await remove(ref(db, `historias_likes/${usuarioUid}`));
    await remove(ref(db, `historias_vistas/${usuarioUid}`));

    // 4. Resetear variables globales
    imagenEstadoGuardada = null;
    fraseEstadoGuardada = "";
    fechaEstadoGuardada = null;

    // 5. Restaurar el diseño original de la tarjeta en la interfaz
    if (avatarMiEstadoClick) avatarMiEstadoClick.classList.remove("con-estado-activo");
    if (textoSubtituloMiEstado) {
      textoSubtituloMiEstado.textContent = "Comparte imágenes con tus amigos...";
      textoSubtituloMiEstado.classList.remove("texto-cyan");
    }
    if (tiempoMiEstado) tiempoMiEstado.textContent = "Toca para subir foto";

    const miniBotonMas = avatarMiEstadoClick ? avatarMiEstadoClick.querySelector(".punto-online-chat-plus") : null;
    if (miniBotonMas) {
      miniBotonMas.textContent = "+";
      miniBotonMas.style.boxShadow = "none";
    }

    // 6. Resetear y ocultar badges/contadores visuales en la tarjeta de Mi Estado
    const badgeVistas = document.getElementById("badge-vistas-mi-estado");
    const cantVistas = document.getElementById("cant-vistas-tarjeta");
    if (badgeVistas) badgeVistas.classList.add("oculto");
    if (cantVistas) cantVistas.textContent = "0";

    // Remover botón de eliminar del visor si existía
    const btnBorrarVisor = document.getElementById("btn-borrar-mi-estado-visor");
    if (btnBorrarVisor) btnBorrarVisor.remove();

  } catch (err) {
    console.error("❌ Error al borrar la historia:", err);
  }
}

// ⏰ Verificar si la historia del usuario ya pasó de 24 horas
async function verificarExpiracion24Horas() {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual) return;

  try {
    const userSnap = await get(ref(db, `usuarios/${usuarioActual.uid}`));
    if (userSnap.exists()) {
      const datos = userSnap.val();

      if (datos.estadoHistoriaUrl && datos.estadoHistoriaFecha) {
        const tiempoTranscurrido = Date.now() - datos.estadoHistoriaFecha;

        if (tiempoTranscurrido >= TIEMPO_EXPIRACION_24H) {
          console.log("⏰ Historia expirada (+24h). Limpiando Supabase y Firebase...");

          // 👁️ Ocultar y reiniciar el contador de vistas en la tarjeta "Mi Estado"
          const badgeTarjeta = document.getElementById("badge-vistas-mi-estado");
          const cantTarjeta = document.getElementById("cant-vistas-tarjeta");

          if (badgeTarjeta) {
            badgeTarjeta.classList.add("oculto");
          }
          if (cantTarjeta) {
            cantTarjeta.textContent = "0";
          }

          // 🧹 Borrar datos de Supabase y Firebase
          await borrarMiEstadoCompleto(usuarioActual.uid, datos.estadoHistoriaUrl);

          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("Tu historia anterior superó las 24 horas y fue eliminada de la nube ⌛", "🧹", "#00f2fe");
          }
        } else {
          // Si aún no vence, cargamos los datos en la memoria
          imagenEstadoGuardada = datos.estadoHistoriaUrl;
          fraseEstadoGuardada = datos.estadoHistoriaTexto || "";
          fechaEstadoGuardada = datos.estadoHistoriaFecha;

          // Reflejar estado activo visualmente
          if (avatarMiEstadoClick) avatarMiEstadoClick.classList.add("con-estado-activo");
          if (textoSubtituloMiEstado) {
            textoSubtituloMiEstado.textContent = "👁️ Toca para ver tu estado activo";
            textoSubtituloMiEstado.classList.add("texto-cyan");
          }
          if (tiempoMiEstado) tiempoMiEstado.textContent = "Estado activo (24h)";
        }
      }
    }
  } catch (err) {
    console.error("Error al consultar expiración de estado:", err);
  }
}

// Escuchar inicio de sesión para comprobar expiración al entrar
onAuthStateChanged(auth, (user) => {
  if (user) {
    verificarExpiracion24Horas();
    iniciarEscuchaMiEstado(); // 👁️ Carga automática del contador
  }
});

// 1. Clic en la tarjeta "Mi Estado"
if (tarjetaMiEstado) {
  tarjetaMiEstado.addEventListener("click", (e) => {
    e.stopPropagation();

    if (imagenEstadoGuardada) {
      const textoFinal = fraseEstadoGuardada || "¡Compartiendo mi día en MovaChat! 🌌🔥";
      const miUid = auth.currentUser ? auth.currentUser.uid : null;
      if (typeof abrirEstadoAmigo === "function") {
        abrirEstadoAmigo(imagenEstadoGuardada, textoFinal, miUid);
        inyectarBotonBorrarManualVisor();
      }
    } else {
      if (inputSubirEstadoReal) inputSubirEstadoReal.click();
    }
  });
}

// 2. Subida con compresión WebP, reemplazo automático y registro en Firebase
if (inputSubirEstadoReal) {
  inputSubirEstadoReal.addEventListener("change", async (e) => {
    const archivoSel = e.target.files && e.target.files[0];
    const usuarioActual = auth.currentUser;

    if (!archivoSel || !usuarioActual) return;

    // 🚨 FILTRO DE RESPALDO: Rechazar videos si se seleccionan por error
    if (!archivoSel.type.startsWith("image/")) {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Solo se permiten imágenes en los estados 📷", "⚠️", "#ff4b2b");
      }
      inputSubirEstadoReal.value = "";
      return;
    }

    try {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Comprimiendo y subiendo tu estado a la nube... 🪐", "☁️", "#00f2fe");
      }

      // 🚨 A) SI YA EXISTÍA UNA FOTO ACTIVA, SE BORRA COMPLETAMENTE (INCLUYENDO LIKES Y VISTAS)
      if (imagenEstadoGuardada) {
        await borrarMiEstadoCompleto(usuarioActual.uid, imagenEstadoGuardada);
      }

      // B) Comprimir imagen a WebP (1080x1920 máx)
      const estadoComprimido = await comprimirImagenWebP(archivoSel, {
        maxAncho: 1080,
        maxAlto: 1920,
        calidad: 0.82,
        esPerfil: false
      });

      // C) Subir al bucket movachat-adjuntos en Supabase
      const urlEstadoSupabase = await subirArchivoSupabase(estadoComprimido, "movachat-adjuntos");

      if (urlEstadoSupabase) {
        imagenEstadoGuardada = urlEstadoSupabase;
        fechaEstadoGuardada = Date.now();

        // D) Guardar URL y timestamp en Firebase
        await update(ref(db, `usuarios/${usuarioActual.uid}`), {
          estadoHistoriaUrl: urlEstadoSupabase,
          estadoHistoriaFecha: fechaEstadoGuardada
        });

        // E) Abrir modal para añadir comentario opcional a la Historia
        modoModalEstado = "historia";

        // Ocultar sección de LEDs en el modal para no confundir al subir historias
        const selectorLed = modalEstado ? modalEstado.querySelector(".selector-led") : null;
        const labelsModal = modalEstado ? modalEstado.querySelectorAll(".modal-label") : [];
        if (selectorLed) selectorLed.style.display = "none";
        if (labelsModal[1]) labelsModal[1].style.display = "none";

        if (modalEstado) modalEstado.classList.remove("oculto");
        if (inputNuevoEstado) {
          inputNuevoEstado.value = "";
          inputNuevoEstado.focus();
        }

        const interceptarGuardado = async () => {
          if (inputNuevoEstado) fraseEstadoGuardada = inputNuevoEstado.value.trim();

          await update(ref(db, `usuarios/${usuarioActual.uid}`), {
            estadoHistoriaTexto: fraseEstadoGuardada
          });

          // Actualización de interfaz
          if (avatarMiEstadoClick) avatarMiEstadoClick.classList.add("con-estado-activo");
          if (textoSubtituloMiEstado) {
            textoSubtituloMiEstado.textContent = "👁️ Toca para ver tu estado activo";
            textoSubtituloMiEstado.classList.add("texto-cyan");
          }
          if (tiempoMiEstado) tiempoMiEstado.textContent = "Hace un momento";

          const miniBotonMas = avatarMiEstadoClick ? avatarMiEstadoClick.querySelector(".punto-online-chat-plus") : null;
          if (miniBotonMas) {
            miniBotonMas.textContent = "";
            miniBotonMas.style.boxShadow = "0 0 10px #00f2fe";
          }

          // Cierre automático del modal al guardar
          if (modalEstado) modalEstado.classList.add("oculto");

          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium("¡Tu historia ya está publicada en la nube (24h)! 🚀", "🛸", "#00f2fe");
          }

          if (btnGuardarEstado) btnGuardarEstado.removeEventListener("click", interceptarGuardado);
        };

        // Asignación limpia del evento de clic
        if (btnGuardarEstado) {
          btnGuardarEstado.removeEventListener("click", interceptarGuardado);
          btnGuardarEstado.addEventListener("click", interceptarGuardado, { once: true });
        }
      }
    } catch (err) {
      console.error("❌ Error al publicar historia:", err);
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("No se pudo publicar la historia.", "❌", "#ff4b2b");
      }
    } finally {
      inputSubirEstadoReal.value = "";
    }
  });
}

// 🗑️ Inyectar botón de eliminación manual dentro del Visor de Historias
function inyectarBotonBorrarManualVisor() {
  const visor = document.getElementById("visor-historias-mova");
  if (!visor) return;

  if (document.getElementById("btn-borrar-mi-estado-visor")) return;

  const btnBorrar = document.createElement("button");
  btnBorrar.id = "btn-borrar-mi-estado-visor";
  btnBorrar.title = "Eliminar mi historia";
  btnBorrar.innerHTML = `<i data-lucide="trash-2"></i>`;
  btnBorrar.style.cssText = `
    position: absolute;
    top: 25px;
    left: 20px;
    background: rgba(255, 75, 43, 0.25);
    border: 1px solid rgba(255, 75, 43, 0.5);
    color: #ff4b2b;
    border-radius: 50%;
    width: 40px;
    height: 40px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    z-index: 9999;
    backdrop-filter: blur(10px);
  `;

  btnBorrar.addEventListener("click", async (e) => {
    e.stopPropagation();

    const usuarioActual = typeof auth !== "undefined" ? auth.currentUser : null;
    if (!usuarioActual || !imagenEstadoGuardada) return;

    // 🚀 AHORA USA EL MODAL CON FLOW DE MOVACHAT EN LUGAR DEL CONFIRM ANCIANO
    const confirmado = await mostrarConfirmacionMova({
      titulo: "¿Eliminar historia?",
      mensaje: "¿Deseas eliminar tu historia de la nube ahora mismo?",
      icono: "🗑️",
      textoAceptar: "Eliminar",
      textoCancelar: "Cancelar",
      colorAceptar: "#ff4b2b"
    });

    if (confirmado) {
      const urlBorrar = imagenEstadoGuardada;

      if (typeof cerrarEstadoMova === "function") cerrarEstadoMova();

      await borrarMiEstadoCompleto(usuarioActual.uid, urlBorrar);

      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Historia eliminada de Supabase y Firebase 🧹", "🗑️", "#ff4b2b");
      }
    }
  });

  visor.appendChild(btnBorrar);

  if (window.lucide) {
    window.lucide.createIcons({ targets: [btnBorrar] });
  }
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

  // 🟢 2. Aceptar Modal (Vaciar Chat INDIVIDUAL interno con Borrado Físico en Supabase)
  if (btnAceptarVaciar) {
    btnAceptarVaciar.addEventListener("click", async () => {
      const miUid = auth.currentUser ? auth.currentUser.uid : null;
      const contactoUid = window.contactoActivoUid;
      const elemNombre = document.querySelector(".amigo-nombre-chat");
      const nombreAmigoActual = elemNombre ? elemNombre.textContent.trim() : "este usuario";

      if (modalVaciar) modalVaciar.classList.add("oculto");
      if (!miUid || !contactoUid) return;

      try {
        const chatId = typeof obtenerChatId === "function"
          ? obtenerChatId(miUid, contactoUid)
          : [miUid, contactoUid].sort().join("_");

        // 🗑️ 1. BORRADO FÍSICO EN SUPABASE: Obtener mensajes y destruir adjuntos de la nube
        const snapshotMsgs = await get(ref(db, `chats/${chatId}/mensajes`));
        if (snapshotMsgs.exists()) {
          const mensajesMap = snapshotMsgs.val();
          const promesasBorradoFisico = [];

          Object.values(mensajesMap).forEach((msg) => {
            if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
              // Usa la función helper oficial del proyecto
              promesasBorradoFisico.push(borrarArchivoDeSupabase(msg.urlAdjunto));
            }
          });

          // Destrucción en paralelo de todos los archivos
          await Promise.all(promesasBorradoFisico);
        }

        // 2. Guardar la marca de vaciado personal en Firebase
        const timestampVaciado = Date.now();
        await set(ref(db, `vaciados/${miUid}/${contactoUid}`), timestampVaciado);

        // 3. Limpiar visualmente la pantalla del chat
        const contenedorHistorial = document.querySelector(".historial-mensajes");
        if (contenedorHistorial) {
          contenedorHistorial.innerHTML = "";
        }

        // 4. Limpiar inmediatamente la tarjeta de la lista de chats principal
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

        // 5. Notificación de confirmación
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`Se ha limpiado tu historial y archivos en la nube con <b>${nombreAmigoActual}</b>.`, "🗑️", "#ff4b2b");
        }
      } catch (err) {
        console.error("Error al vaciar el chat en Firebase y Supabase:", err);
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

// 🧹 OPCIÓN 1: VACIAL CONVERSACIÓN (Mantiene la tarjeta, borra archivos físicos de la nube)
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
      const chatId = typeof obtenerChatId === "function"
        ? obtenerChatId(miUid, contactoUid)
        : [miUid, contactoUid].sort().join("_");

      // 🛡️ REGLA 3: Destruir archivos en Supabase
      const snapshotMsgs = await get(ref(db, `chats/${chatId}/mensajes`));
      if (snapshotMsgs.exists()) {
        const mensajesMap = snapshotMsgs.val();
        const promesasBorrado = [];
        Object.values(mensajesMap).forEach((msg) => {
          if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
            promesasBorrado.push(eliminarArchivoSupabase(msg.urlAdjunto, "movachat-adjuntos"));
          }
        });
        await Promise.all(promesasBorrado);
      }

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

// 🗑️ OPCIÓN 2: ELIMINAR CHAT (Borra archivos físicos de la nube y oculta conversación)
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
      const chatId = typeof obtenerChatId === "function"
        ? obtenerChatId(miUid, contactoUid)
        : [miUid, contactoUid].sort().join("_");

      // 🛡️ REGLA 3: Borrar archivos físicos de Supabase al eliminar el chat
      const snapshotMsgs = await get(ref(db, `chats/${chatId}/mensajes`));
      if (snapshotMsgs.exists()) {
        const mensajesMap = snapshotMsgs.val();
        const promesasBorrado = [];
        Object.values(mensajesMap).forEach((msg) => {
          if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
            promesasBorrado.push(eliminarArchivoSupabase(msg.urlAdjunto, "movachat-adjuntos"));
          }
        });
        await Promise.all(promesasBorrado);
      }

      const ahora = Date.now();
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
            filaHTML.dataset.uid = targetUid; // 👈 Importante: Guarda el UID del contacto en la fila

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
    if (contactoParaEliminarNodo && contactoParaEliminarNodo.nodo) {
      const nodoFila = contactoParaEliminarNodo.nodo;

      nodoFila.style.transition = "all 0.25s ease";
      nodoFila.style.opacity = "0";
      nodoFila.style.transform = "scale(0.9)";

      setTimeout(() => {
        nodoFila.remove();
        if (capaConfirmarEliminar) capaConfirmarEliminar.classList.add("oculto");
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`Contacto <b>${contactoParaEliminarNodo.nombre || ''}</b> eliminado.`, "🗑️", "#ff4b2b");
        }
        contactoParaEliminarNodo = null;
      }, 250);
    }
  });
}

/**
 * ☁️ Guarda el contacto compartido en Firebase (Con límite diario, expiración a 15 días y ocultoPara)
 */
async function enviarContactoAFirebase(uidContacto, nombreContacto, fotoContacto) {
  const usuarioActual = auth.currentUser;
  const miUid = usuarioActual ? usuarioActual.uid : null;
  const contactoUid = window.contactoActivoUid;

  if (!miUid || !contactoUid) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Debes estar dentro de un chat activo para enviar el contacto.", "⚠️", "#ff4b2b");
    }
    return;
  }

  // 🛡️ VERIFICAR LÍMITE DIARIO (MÁXIMO 10 CONTACTOS COMPARTIDOS)
  if (typeof verificarLimiteDiarioContactos === "function") {
    const chequeoContactos = await verificarLimiteDiarioContactos(miUid);
    if (!chequeoContactos.permitido) {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Has alcanzado tu límite diario de 10 contactos compartidos 🛑", "⚠️", "#ff4b2b");
      }
      return;
    }
  }

  // 🟢 CERRAR MODAL DE CONTACTOS DE INMEDIATO
  const modalContactos = document.getElementById("modal-seleccionar-contacto") || document.getElementById("modal-contactos");
  if (modalContactos) modalContactos.classList.add("oculto");

  const chatId = typeof obtenerChatId === "function"
    ? obtenerChatId(miUid, contactoUid)
    : [miUid, contactoUid].sort().join("_");

  const ahora = new Date();
  const horaFormateada = ahora.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });

  // ⏱️ Expiración de 15 días en milisegundos
  const TIEMPO_15_DIAS_MS = 15 * 24 * 60 * 60 * 1000;
  const fechaExpiracion = Date.now() + TIEMPO_15_DIAS_MS;

  const objetoMensaje = {
    emisor: miUid,
    emisorUid: miUid,
    receptor: contactoUid,
    tipoAdjunto: 'contacto',
    contactoInfo: {
      uid: uidContacto,
      nombre: nombreContacto || "Contacto",
      foto: (fotoContacto && !fotoContacto.includes("assets/")) ? fotoContacto : ""
    },
    texto: "",
    hora: horaFormateada,
    timestamp: Date.now(),
    expiraEn: fechaExpiracion, // ⌛ Expiración a los 15 días
    ocultoPara: {}             // 🙈 Registro para "Eliminar para mí"
  };

  try {
    const listaMensajesRef = ref(db, `chats/${chatId}/mensajes`);
    const nuevoMensajeRef = push(listaMensajesRef);
    await set(nuevoMensajeRef, objetoMensaje);

    // 📈 Actualizar el resumen del último mensaje en la conversación
    const resumenChatRef = ref(db, `chats/${chatId}/ultimoMensaje`);
    await set(resumenChatRef, {
      texto: `📇 Contacto: ${nombreContacto}`,
      timestamp: Date.now(),
      emisor: miUid
    });

    // Incrementar contador diario tras el envío exitoso
    if (typeof incrementarContadorContactos === "function") {
      await incrementarContadorContactos(miUid);
    }

    if (typeof reproducirSonidoEnviado === "function") {
      reproducirSonidoEnviado();
    }

    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium(`Contacto <b>${nombreContacto}</b> compartido con éxito.`, "📇", "#00f2fe");
    }

  } catch (err) {
    console.error("❌ Error al enviar tarjeta de contacto a Firebase:", err);
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("Error de red al intentar enviar el contacto.", "⚠️", "#ff4b2b");
    }
  }
}

// 📇 BOTÓN COMPARTIR CONTACTO EN EL CHAT
const btnAdjuntarContacto = document.getElementById("btn-adjuntar-contacto");

if (btnAdjuntarContacto) {
  btnAdjuntarContacto.addEventListener("click", async (e) => {
    e.stopPropagation();

    // 1. Cerrar menú flotante de adjuntos
    const menuAdjuntar = document.getElementById("menu-adjuntar-files");
    if (menuAdjuntar) menuAdjuntar.classList.add("oculto");

    // 2. Buscar e identificar el modal de contactos en el DOM
    const elemModal = document.getElementById("modal-seleccionar-contacto")
      || document.getElementById("modal-contactos")
      || document.querySelector(".modal-contactos");

    if (!elemModal) {
      console.error("❌ No se encontró el modal de contactos en el DOM.");
      return;
    }

    // 3. Cargar la lista de contactos
    if (typeof renderizarListaContactosModal === "function") {
      await renderizarListaContactosModal();
    }

    // 4. Asignar evento de clic único a cada fila
    const filasContactos = document.querySelectorAll(".item-contacto-fila");

    filasContactos.forEach(fila => {
      fila.style.cursor = "pointer";

      // Clonar nodo para evitar escuchadores duplicados
      const nuevaFila = fila.cloneNode(true);
      if (fila.parentNode) fila.parentNode.replaceChild(nuevaFila, fila);

      nuevaFila.addEventListener("click", async (evt) => {
        evt.stopPropagation();
        evt.preventDefault();

        if (evt.target.closest(".btn-eliminar-contacto-item")) return;

        // Ocultar modal inmediatamente
        elemModal.classList.add("oculto");

        const elemNombre = nuevaFila.querySelector(".nombre-contacto-texto");
        const elemAvatar = nuevaFila.querySelector(".avatar-contacto-mini");

        const nombreContacto = elemNombre ? elemNombre.textContent.trim() : "Contacto";
        const srcAvatar = elemAvatar ? elemAvatar.src : "";
        const targetUid = nuevaFila.dataset.uid || fila.dataset.uid || "";

        // Enviar único a Firebase
        await enviarContactoAFirebase(targetUid, nombreContacto, srcAvatar);
      });
    });

    // 5. Abrir el modal
    elemModal.classList.remove("oculto");
  });
}

// ========================================================
// 📊 VALIDACIÓN Y CONTROL DE LÍMITE DIARIO DE CONTACTOS (MÁXIMO 10)
// ========================================================

/**
 * Consulta y valida si el usuario ha superado su límite de 10 contactos compartidos por día.
 * @param {string} uid - ID del usuario actual.
 * @returns {Promise<{permitido: boolean, conteo: number}>}
 */
async function verificarLimiteDiarioContactos(uid) {
  if (!uid) return { permitido: false, conteo: 0 };

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/contactos_compartidos`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    return { permitido: conteoActual < 10, conteo: conteoActual };
  } catch (err) {
    console.error("Error consultando límite diario de contactos:", err);
    return { permitido: true, conteo: 0 };
  }
}

/**
 * Incremente en +1 el contador de contactos compartidos del día tras un envío exitoso.
 * @param {string} uid - ID del usuario actual.
 */
async function incrementarContadorContactos(uid) {
  if (!uid) return;

  const hoy = new Date().toISOString().split('T')[0];
  const limiteRef = ref(db, `limites_diarios/${uid}/${hoy}/contactos_compartidos`);

  try {
    const snap = await get(limiteRef);
    const conteoActual = snap.exists() ? snap.val() : 0;
    await set(limiteRef, conteoActual + 1);
  } catch (err) {
    console.error("Error incrementando contador de contactos:", err);
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

// ========================================================
// 🔙 RESTAURAR ELEMENTOS Y REGRESAR A LA LISTA DE CHATS
// ========================================================
document.addEventListener("click", (e) => {
  // 1. Si se presiona regresar desde el Perfil de usuario hacia el Chat Privado
  if (e.target.closest("#vista-perfil-usuario .btn-volver") || e.target.closest("#btn-volver-al-chat")) {
    const encabezadoInicio = document.querySelector(".encabezado-inicio");
    if (encabezadoInicio) {
      encabezadoInicio.style.display = "none"; // 🚨 Mantiene oculto el header superior en el chat
    }
    return;
  }

  // 2. Si presiona el botón de flecha atrás en el chat privado para ir a la LISTA GENERAL
  if (e.target.closest("#pantalla-chat-privado .btn-volver") || e.target.closest("#btn-volver-chats")) {

    // Ocultar la pantalla de chat privado
    const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
    if (pantallaChatPrivado) {
      pantallaChatPrivado.style.display = "none";
      pantallaChatPrivado.classList.remove("pantalla-completa");
    }

    // Mostrar la lista de chats principal
    const pantallaChats = document.getElementById("pantalla-chats");
    if (pantallaChats) {
      pantallaChats.style.display = "flex";
    }

    // Restaurar encabezado global, menú inferior y botón flotante solo al estar en la lista principal
    const encabezadoInicio = document.querySelector(".encabezado-inicio");
    const menuFlotante = document.querySelector(".menu-flotante");
    const btnFlotanteContacto = document.querySelector(".btn-flotante-contacto") || document.getElementById("btn-abrir-contactos");

    if (encabezadoInicio) encabezadoInicio.style.display = "flex";
    if (menuFlotante) menuFlotante.style.display = "flex";

    if (btnFlotanteContacto) {
      btnFlotanteContacto.style.display = "flex";
      btnFlotanteContacto.classList.remove("oculto");
    }

    // Limpiar cualquier grabación pendiente
    if (typeof cancelarGrabacion === "function" && (typeof grabacionActiva !== "undefined" && grabacionActiva)) {
      cancelarGrabacion();
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

// 1. Abrir Modal al hacer clic en el nombre (Solo si NO es visitante)
document.addEventListener("click", (e) => {
  const btnNombre = e.target.closest("#texto-perfil-nombre");
  const pantallaPerfil = document.getElementById("pantalla-perfil");

  // 🛡️ Si la pantalla de perfil está en modo visitante, bloquea la edición
  if (pantallaPerfil && pantallaPerfil.classList.contains("modo-visitante")) return;

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

// 🌐 SISTEMA DE REDES SOCIALES CON MODAL GLASSMORPHISM (Firebase v10)
let redSocialActiva = null;

function conectarRedesSociales() {
  const botonesRedes = document.querySelectorAll(".red-enlace");
  const modalRedes = document.getElementById("modal-redes-bento");
  const btnCerrarRedes = document.getElementById("btn-cerrar-redes");
  const btnGuardarRed = document.getElementById("btn-guardar-red-bento");
  const inputUsuarioRed = document.getElementById("input-usuario-red");
  const tituloModalRed = document.getElementById("titulo-modal-red");
  const prefijoRed = document.getElementById("prefijo-red-social");

  const configuracionRedes = {
    instagram: { titulo: "Instagram", prefijo: "@" },
    tiktok: { titulo: "TikTok", prefijo: "@" },
    facebook: { titulo: "Facebook", prefijo: "fb/" }
  };

  // 1. Abrir Modal Bento Personalizado al hacer clic en un icono
  botonesRedes.forEach(btn => {
    btn.addEventListener("click", async (e) => {
      e.preventDefault();
      e.stopPropagation();

      const user = auth ? auth.currentUser : null;
      if (!user) return;

      const tipoRed = btn.dataset.red; // 'instagram', 'tiktok', 'facebook'
      if (!tipoRed) return;

      redSocialActiva = tipoRed;
      const redRef = ref(db, `usuarios/${user.uid}/redes/${tipoRed}`);

      try {
        const snap = await get(redRef);
        const urlExistente = snap.exists() ? snap.val() : "";

        // Personalizar títulos y prefijo según la red tocada
        if (tituloModalRed) {
          const info = configuracionRedes[tipoRed] || { titulo: tipoRed.toUpperCase(), prefijo: "@" };
          tituloModalRed.textContent = `Vincular ${info.titulo}`;
          if (prefijoRed) prefijoRed.textContent = info.prefijo;
        }

        if (inputUsuarioRed) {
          inputUsuarioRed.value = urlExistente;
          inputUsuarioRed.placeholder = "ej: elena_rostova";
        }

        if (modalRedes) {
          modalRedes.classList.remove("oculto");
          setTimeout(() => inputUsuarioRed && inputUsuarioRed.focus(), 60);
        }
      } catch (error) {
        console.error("Error al abrir red social:", error);
      }
    });
  });

  // 2. Guardar o Borrar en Firebase desde la ventana Glassmorphism
  if (btnGuardarRed && modalRedes && inputUsuarioRed) {
    btnGuardarRed.onclick = async () => {
      const user = auth ? auth.currentUser : null;
      if (!user || !redSocialActiva) return;

      const valorLimpio = inputUsuarioRed.value.trim().replace(/^[@/]+/, "");
      const redRef = ref(db, `usuarios/${user.uid}/redes/${redSocialActiva}`);

      try {
        if (valorLimpio === "") {
          await remove(redRef);
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium(`Red ${redSocialActiva} desvinculada`, "🗑️", "#ff4b2b");
          }
        } else {
          await set(redRef, valorLimpio);
          if (typeof mostrarAvisoPremium === "function") {
            mostrarAvisoPremium(`¡${redSocialActiva.toUpperCase()} vinculada con éxito! 🚀`, "✅", "#00f2fe");
          }
        }
        modalRedes.classList.add("oculto");
      } catch (err) {
        console.error("Error al guardar en Firebase:", err);
      }
    };
  }

  // 3. Cerrar el modal al presionar X o tocar el fondo
  if (btnCerrarRedes && modalRedes) {
    btnCerrarRedes.onclick = () => modalRedes.classList.add("oculto");
  }

  if (modalRedes) {
    modalRedes.onclick = (e) => {
      if (e.target === modalRedes) modalRedes.classList.add("oculto");
    };
  }
}

// 🌐 Cargar estado neón de las redes en la interfaz
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

// ========================================================
// 🔊 CONTROL DE SONIDOS Y VIBRACIÓN (MOVACHAT)
// ========================================================

// 🔓 Desbloquea el audio en la primera interacción del usuario (Requerido por Chrome/Safari)
window.despertarAudioForzado = function () {
  const sonidoRecibido = document.getElementById("sonido-recibido");
  const sonidoEnviado = document.getElementById("sonido-enviado");

  [sonidoRecibido, sonidoEnviado].forEach((audio) => {
    if (audio) {
      audio.play().then(() => {
        audio.pause();
        audio.currentTime = 0;
      }).catch(() => { });
    }
  });
};

// Escuchar el primer clic/toque en la pantalla para desbloquear el sonido
document.addEventListener("click", function desbloquear() {
  window.despertarAudioForzado();
}, { once: true });

// 🔔 Función para reproducir sonido al RECIBIR mensaje (CORREGIDO ANTI-AUTOPLAY)
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

  // 3. VIBRACIÓN HÁPTICA (Solo si el usuario interactuó primero con la pantalla)
  if ("vibrate" in navigator && (!navigator.userActivation || navigator.userActivation.hasBeenActive)) {
    try {
      navigator.vibrate([200, 100, 200]);
      console.log("📳 Vibración ejecutada.");
    } catch (e) {
      console.warn("⚠️ No se pudo activar la vibración:", e);
    }
  }

  // 4. REPRODUCCIÓN DE AUDIO (Manejo silencioso del bloqueo de Chrome)
  const audioRecibido = document.getElementById("sonido-recibido");
  if (audioRecibido) {
    audioRecibido.currentTime = 0;
    audioRecibido.play()
      .then(() => console.log("🔊 ¡Sonido reproducido con éxito!"))
      .catch((err) => {
        if (err.name === "NotAllowedError") {
          console.warn("🔇 Reproducción diferida: esperando interacción previa del usuario.");
        } else {
          console.warn("⚠️ Error de reproducción de audio:", err);
        }
      });
  } else {
    console.warn("❌ No se encontró el elemento HTML <audio id='sonido-recibido'>");
  }
};

// 📤 Función para reproducir sonido al ENVIAR mensaje
window.reproducirSonidoEnviado = function () {
  const audioEnviado = document.getElementById("sonido-enviado");
  if (audioEnviado) {
    audioEnviado.currentTime = 0;
    audioEnviado.play().catch(() => {
      window.despertarAudioForzado();
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

      // ⚡ Optimización: Se especifica 'iconoOjito' para renderizar solo ese elemento
      if (window.lucide) {
        window.lucide.createIcons({ targets: [iconoOjito] });
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
              <p style="margin: 0; font-size: 0.8rem; color: #aaa;">${u.correo || 'Sin correo'}</p>
            </div>
            <div style="display: flex; gap: 8px;">
              <button class="btn-aprobar" style="background: #2ec4b6; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">Aprobar 🟢</button>
              <button class="btn-rechazar" style="background: #e71d36; border: none; color: #fff; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-weight: 600;">Rechazar 🔴</button>
            </div>
          `;

          // Evento al presionar "Aprobar"
          tarjeta.querySelector(".btn-aprobar").addEventListener("click", () => {
            cambiarEstadoAcceso(uid, "aprobado");
          });

          // Evento al presionar "Rechazar"
          tarjeta.querySelector(".btn-rechazar").addEventListener("click", () => {
            cambiarEstadoAcceso(uid, "baneado");
          });

          contenedorPendientes.appendChild(tarjeta);
        }
      });
    }

    if (!hayPendientes) {
      contenedorPendientes.innerHTML = `<p style="color: #aaa; font-size: 0.9rem; text-align: center;">No hay solicitudes pendientes ✨</p>`;
    }
  });
}

// --- FUNCIÓN PARA CAMBIAR EL ESTADO EN FIREBASE ---
async function cambiarEstadoAcceso(uid, nuevoEstado) {
  try {
    await update(ref(db, `usuarios/${uid}`), {
      estadoAcceso: nuevoEstado
    });

    if (typeof mostrarAvisoPremium === "function") {
      const msj = nuevoEstado === "aprobado" ? "Usuario aprobado exitosamente 🟢" : "Usuario rechazado 🔴";
      const color = nuevoEstado === "aprobado" ? "#2ec4b6" : "#e71d36";
      mostrarAvisoPremium(msj, "👤", color);
    }
  } catch (error) {
    console.error("Error al actualizar estado del usuario:", error);
  }
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

// 🌟 FUNCIÓN AUXILIAR PARA ACTUALIZAR ANILLO DE HISTORIA Y LEDS EN LA TARJETA
window.actualizarTarjetaContactoUI = function (uid, usuario) {
  if (!uid || !usuario) return;

  // 1. Guardar siempre en la caché global aunque la tarjeta aún no exista en el DOM
  window.usuariosCacheGlobal = window.usuariosCacheGlobal || {};
  window.usuariosCacheGlobal[uid] = usuario;

  const tarjeta = document.getElementById(`tarjeta-chat-${uid}`);
  if (!tarjeta) return; // Si la tarjeta aún se está creando, se pintará cuando termine escucharUltimoMensajeContacto

  const avatarCaja = tarjeta.querySelector('.chat-avatar-caja');
  const imgAvatar = tarjeta.querySelector('.chat-avatar-caja img');
  const led = tarjeta.querySelector('.punto-online-chat');
  const TIEMPO_24H = 24 * 60 * 60 * 1000;
  const ahora = Date.now();

  // A) Verificar si tiene historia activa (< 24 horas)
  const tieneHistoriaUrl = usuario.estadoHistoriaUrl;
  const fechaHistoria = usuario.estadoHistoriaFecha || 0;
  const esHistoriaValida = tieneHistoriaUrl && (ahora - fechaHistoria < TIEMPO_24H);

  if (esHistoriaValida) {
    tarjeta.dataset.estadoUrl = usuario.estadoHistoriaUrl;
    tarjeta.dataset.estadoTexto = usuario.estadoHistoriaTexto || "";
    if (avatarCaja) avatarCaja.classList.add("con-estado-activo");
  } else {
    delete tarjeta.dataset.estadoUrl;
    delete tarjeta.dataset.estadoTexto;
    if (avatarCaja) avatarCaja.classList.remove("con-estado-activo");
  }

  // B) Actualizar foto de perfil
  if (imgAvatar && usuario.fotoUrl && imgAvatar.src !== usuario.fotoUrl) {
    imgAvatar.src = usuario.fotoUrl;
  }

  // C) Actualizar LED de conexión
  if (led) {
    const estadoManual = usuario.estadoConexion || usuario.estadoPresencia || "online";
    let colorLed = "#00f2fe";
    let sombraLed = "0 0 8px #00f2fe";

    if (estadoManual === "ocupado") {
      colorLed = "#ef4444";
      sombraLed = "0 0 8px #ef4444";
    } else if (estadoManual === "offline" || estadoManual === "invisible") {
      colorLed = "#888888";
      sombraLed = "0 0 8px #888888";
    }

    led.style.backgroundColor = colorLed;
    led.style.boxShadow = sombraLed;
  }
};

// Variable global o fuera de la función para almacenar la desuscripción y evitar duplicados
let desuscribirContactosAprobados = null;

// 🟢 CARGAR CONTACTOS Y SINCRONIZAR HISTORIAS (24H) EN TIEMPO REAL
function cargarContactosAprobados(usuarioActualUid) {
  const contenedorContactos = document.getElementById("lista-chats-principal");
  if (!contenedorContactos) return;

  // 🧹 Si ya existía un escuchador activo previo, lo apagamos para evitar duplicados en memoria
  if (typeof desuscribirContactosAprobados === "function") {
    desuscribirContactosAprobados();
    desuscribirContactosAprobados = null;
  }

  const usuariosRef = ref(db, 'usuarios');
  const fijadosRef = ref(db, `fijados/${usuarioActualUid}`);

  get(fijadosRef).then((snapFijados) => {
    const fijadosBD = snapFijados.exists() ? snapFijados.val() : {};

    // Almacenamos el método de apagado devuelto por onValue
    desuscribirContactosAprobados = onValue(usuariosRef, (snapshot) => {
      try {
        if (snapshot.exists()) {
          const usuarios = snapshot.val();
          window.usuariosCacheGlobal = usuarios;

          Object.keys(usuarios).forEach((uid) => {
            const usuario = usuarios[uid];

            if (usuario && uid !== usuarioActualUid && usuario.estadoAcceso === "aprobado") {
              if (typeof contactosRegistradosSet !== "undefined" && !contactosRegistradosSet.has(uid)) {
                contactosRegistradosSet.add(uid);

                if (typeof escucharUltimoMensajeContacto === "function") {
                  escucharUltimoMensajeContacto(usuarioActualUid, uid, usuario, fijadosBD);
                }
              }

              // Intentar actualizar la tarjeta en la interfaz
              if (typeof window.actualizarTarjetaContactoUI === "function") {
                window.actualizarTarjetaContactoUI(uid, usuario);
              }
            }
          });
        }
      } catch (e) {
        console.error("Error al sincronizar contactos e historias:", e);
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

    // 🧹 EJECUTAR LIMPIEZA AUTOMÁTICA DE MENSAJES VIEJOS EN ESTE CHAT
    if (typeof ejecutarAutolimpieza12Dias === "function") {
      ejecutarAutolimpieza12Dias(chatId);
    }

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

// 🟢 CONECTOR ÚNICO Y OFICIAL PARA ENVIAR MENSAJES Y GRABAR VOZ
const inputChatPrivado = document.getElementById("input-chat-privado");

if (btnAccionChat) {
  btnAccionChat.onclick = (e) => {
    e.preventDefault();

    const tieneTexto = inputChatPrivado && inputChatPrivado.value.trim().length > 0;
    const tieneAdjunto = cajaVistaPrevia && !cajaVistaPrevia.classList.contains("oculto");
    const tieneReenvioPendiente = !!window.objetoPendienteReenviar;
    const modoBoton = btnAccionChat.getAttribute("data-modo");

    // 🛡️ PRIORIDAD ABSOLUTA: Si hay reenvío, texto o adjunto, ENVIAR MENSAJE
    if (tieneReenvioPendiente || tieneTexto || tieneAdjunto || modoBoton === "enviar") {
      enviarMensajeNuevo();
    } else {
      // 🎙️ Control de grabación de voz seguro
      if (typeof toggleGrabacionVoz === "function") {
        toggleGrabacionVoz(e);
      } else if (typeof estaGrabandoAudio !== "undefined" && estaGrabandoAudio) {
        if (typeof finalizarGrabacionVoz === "function") finalizarGrabacionVoz();
      } else {
        if (typeof iniciarGrabacionVoz === "function") iniciarGrabacionVoz(e);
      }
    }
  };
}

// 🔄 1. Cambiar icono (Micrófono <-> Avión) dinámicamente al escribir/borrar
if (inputChatPrivado) {
  inputChatPrivado.addEventListener("input", () => {
    if (typeof actualizarIconoBotonAccion === "function") {
      actualizarIconoBotonAccion();
    }
  });
}

// 📩 2. Enviar mensaje al presionar la tecla "Enter"
if (inputChatPrivado) {
  inputChatPrivado.onkeydown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviarMensajeNuevo();
    }
  };
}

// ⌨️ 3. Cancelar edición al presionar la tecla "Escape"
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
let listenerEscribiendoActivo = null;
let listenerLecturaActivo = null;
let listenerPresenciaContactoActivo = null;

// 🧹 FUNCIÓN GLOBAL PARA CANCELAR TODOS LOS ESCUCHADORES ACTIVOS
function limpiarListenersActivos() {
  if (typeof listenerChatActivo === "function") { listenerChatActivo(); listenerChatActivo = null; }
  if (typeof listenerConfigActivo === "function") { listenerConfigActivo(); listenerConfigActivo = null; }
  if (typeof listenerEscribiendoActivo === "function") { listenerEscribiendoActivo(); listenerEscribiendoActivo = null; }
  if (typeof listenerLecturaActivo === "function") { listenerLecturaActivo(); listenerLecturaActivo = null; }
  if (typeof listenerPresenciaContactoActivo === "function") { listenerPresenciaContactoActivo(); listenerPresenciaContactoActivo = null; }
}

// 🟢 FUNCIÓN AUXILIAR DE SCROLL AUTOMÁTICO PARA MULTIMEDIA
function hacerScrollAlFinalHistorial() {
  const elemHistorial = document.querySelector(".historial-mensajes");
  if (!elemHistorial) return;

  requestAnimationFrame(() => {
    elemHistorial.scrollTop = elemHistorial.scrollHeight;
  });
}
// 👈 HACER DISPONIBLE EN WINDOW PARA LOS ATRIBUTOS ONLOAD DEL HTML
window.hacerScrollAlFinalHistorial = hacerScrollAlFinalHistorial;

// 📌 ESCUCHAR MENSAJES Y CHECKS DE LECTURA EN TIEMPO REAL (OPTIMIZADO)
function escucharMensajesChat(chatId) {
  const contenedorHistorial = document.querySelector(".historial-mensajes");
  if (!contenedorHistorial) return;

  // 1. 🧹 CANCELAR SUSCRIPCIONES ANTERIORES
  limpiarListenersActivos();

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
          hacerScrollAlFinalHistorial();
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

  // 🟢 5. ESCUCHAR LA PRESENCIA EN VIVO DEL RECEPTOR (PERSISTENCIA TOTAL EN FIREBASE)
  let estaEnAppReceptorLive = false;
  if (contactoUid) {
    const presenciaContactoRef = ref(db, `usuarios/${contactoUid}/presenciaReal`);
    listenerPresenciaContactoActivo = onValue(presenciaContactoRef, (snapPresencia) => {
      estaEnAppReceptorLive = snapPresencia.exists() && snapPresencia.val() === true;

      const elemHistorial = document.querySelector(".historial-mensajes");
      if (!elemHistorial) return;

      elemHistorial.querySelectorAll(".indicador-checks-mova").forEach((contenedor) => {
        const esLeido = contenedor.classList.contains("leido");
        const yaFueEntregado = contenedor.classList.contains("entregado");
        const msgId = contenedor.getAttribute("data-msg-id");

        if (!esLeido) {
          // Si entra a la app O ya se entregó antes, se mantienen las 2 palomitas
          if (estaEnAppReceptorLive || yaFueEntregado) {
            contenedor.className = "indicador-checks-mova entregado";
            contenedor.innerHTML = `<i data-lucide="check-check"></i>`;

            // Guardar en Firebase para que persista al recargar o salir del chat
            if (estaEnAppReceptorLive && !yaFueEntregado && msgId && window.idChatActual) {
              const msgRef = ref(db, `chats/${window.idChatActual}/mensajes/${msgId}`);
              update(msgRef, { entregado: true }).catch(() => { });
            }
          } else {
            contenedor.className = "indicador-checks-mova enviado";
            contenedor.innerHTML = `<i data-lucide="check-check"></i>`;
          }
        }
      });

      if (window.lucide) {
        window.lucide.createIcons({ targets: [elemHistorial] });
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

        const pantallaChat = document.getElementById("pantalla-chat-privado");
        const chatEstaAbierto = (window.contactoActivoUid === contactoUid) &&
          pantallaChat &&
          (pantallaChat.style.display === "flex" || pantallaChat.classList.contains("pantalla-completa"));

        const ultimoMsgKey = keysMensajes[keysMensajes.length - 1];
        const ultimoMsgObj = mensajes[ultimoMsgKey];

        if (chatEstaAbierto && ultimoMsgObj && (ultimoMsgObj.emisor || ultimoMsgObj.emisorUid) !== miUid && miUid && contactoUid) {
          set(ref(db, `lecturas/${miUid}/${contactoUid}`), ultimoMsgKey);
        }

        const TIEMPO_12_DIAS_MS = 12 * 24 * 60 * 60 * 1000; // 🛡️ REGLA 4: Purga automática a los 12 días
        const ahoraMs = Date.now();

        keysMensajes.forEach((msgId) => {
          const msg = mensajes[msgId];
          if (!msg) return;

          if (msg.eliminadoPara && msg.eliminadoPara[miUid]) return;

          const msgTimestamp = msg.timestamp || 0;
          if (msgTimestamp <= timestampUltimoVaciado) return;

          const idEmisorReal = msg.emisor || msg.emisorUid || msg.remitente || msg.remitenteId || msg.uid;
          const esMio = idEmisorReal === miUid;

          if (estaBloqueadoElContacto && !esMio) return;

          // 🙈 REGLA: Si el usuario actual usó "Eliminar para mí" en esta tarjeta/mensaje
          if ((msg.ocultoPara && msg.ocultoPara[miUid]) || (msg.eliminadoPara && msg.eliminadoPara[miUid])) {
            return;
          }

          // ⌛ REGLA AUTOMÁTICA: Expira a los 15 días (Tarjetas de contactos u otros elementos con expiraEn)
          if (msg.expiraEn && Date.now() >= msg.expiraEn) {
            set(ref(db, `chats/${chatId}/mensajes/${msgId}`), null);
            return;
          }

          // 🗑️ BORRADO FÍSICO EN MENSAJES TEMPORALES (EFÍMEROS)
          if (msg.esEfimero) {
            const limiteMs = msg.duracionEfimeraMs || 10000;
            const transcurrido = Date.now() - (msg.timestamp || Date.now());
            const tiempoRestante = limiteMs - transcurrido;

            const autoDestruirEfimero = async () => {
              if (msg.urlAdjunto && msg.urlAdjunto.includes("supabase.co")) {
                await eliminarArchivoSupabase(msg.urlAdjunto, "movachat-adjuntos");
              }
              set(ref(db, `chats/${chatId}/mensajes/${msgId}`), null);
            };

            if (tiempoRestante <= 0) {
              autoDestruirEfimero();
              return;
            } else {
              setTimeout(autoDestruirEfimero, tiempoRestante);
            }
          }

          // ⏳ VERIFICACIÓN Y LIMPIEZA AUTOMÁTICA A LOS 12 DÍAS (FOTOS Y DOCUMENTOS)
          if ((msg.tipoAdjunto === 'foto' || msg.tipoAdjunto === 'documento') && msg.urlAdjunto && !msg.expirado && (ahoraMs - msgTimestamp) >= TIEMPO_12_DIAS_MS) {
            eliminarArchivoSupabase(msg.urlAdjunto, "movachat-adjuntos");
            update(ref(db, `chats/${chatId}/mensajes/${msgId}`), {
              expirado: true,
              urlAdjunto: null
            });
            msg.expirado = true;
            msg.urlAdjunto = null;
          }

          const haceCuantoEnviado = Date.now() - (msg.timestamp || 0);
          const esMensajeNuevoEnVivo = haceCuantoEnviado < 5000;
          const esElUltimoMensaje = (msgId === keysMensajes[keysMensajes.length - 1]);

          window.mensajesNotificadosUnificados = window.mensajesNotificadosUnificados || new Set();
          const yaSono = window.mensajesNotificadosUnificados.has(msgId);

          if (!esCargaInicial && !esMio && esMensajeNuevoEnVivo && !estaBloqueadoElContacto && esElUltimoMensaje && !yaSono) {
            window.mensajesNotificadosUnificados.add(msgId);

            const textoNotif = msg.texto || msg.contenido || "Te envió un mensaje";
            const nombreRemitente = msg.nombreEmisor || msg.remitente || "Amigo";
            const fotoRemitente = msg.avatar || msg.fotoUrl || "assets/logo.png";

            if (typeof notificarNuevoMensaje === "function") {
              notificarNuevoMensaje(nombreRemitente, textoNotif, fotoRemitente);
            }

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

          // 🟢 GENERACIÓN UNIFICADA DE CHECKS CON DATA-MSG-ID Y PERSISTENCIA
          let htmlChecks = "";
          if (esMio) {
            let claseChecks = "enviado";
            let iconoLucide = "check";

            const esLeido = ultimoLeidoKeyReceptor && (keysMensajes.indexOf(msgId) <= keysMensajes.indexOf(ultimoLeidoKeyReceptor));

            if (esLeido) {
              claseChecks = "leido";
              iconoLucide = "check-check";
            } else if (estaEnAppReceptorLive || msg.entregado) {
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

          // 📷 RENDERING DE FOTO
          if (msg.tipoAdjunto === 'foto') {
            const esSubiendo = msg.urlAdjunto === "subiendo";
            const esError = msg.urlAdjunto === "error";

            if (esSubiendo) {
              const porcentaje = msg.progresoSubida || 0;
              contenidoBurbuja = `
                ${htmlReenviado}
                <div style="width: 210px; height: 270px; background: rgba(255,255,255,0.05); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 10px; margin: 0 auto 6px auto; border: 1px solid rgba(0, 242, 254, 0.3);">
                  <div style="width: 24px; height: 24px; border: 2px solid rgba(0, 242, 254, 0.2); border-top: 2px solid #00f2fe; border-radius: 50%; animation: spinMova 0.8s linear infinite;"></div>
                  <span style="font-size: 0.75rem; color: #00f2fe; font-weight: 600;">Subiendo imagen... ${porcentaje}%</span>
                </div>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            } else if (esError) {
              contenidoBurbuja = `
                ${htmlReenviado}
                <div style="width: 210px; padding: 20px; background: rgba(255, 75, 43, 0.1); border-radius: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; margin: 0 auto 6px auto; border: 1px solid rgba(255, 75, 43, 0.3);">
                  <i data-lucide="alert-circle" style="color: #ff4b2b; width: 24px; height: 24px;"></i>
                  <span style="font-size: 0.75rem; color: #ff4b2b; font-weight: 600;">Error al subir la imagen</span>
                </div>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            } else if (msg.expirado || !msg.urlAdjunto) {
              contenidoBurbuja = `
                ${htmlReenviado}
                <div style="padding: 10px 14px; background: rgba(255,255,255,0.03); border-radius: 12px; border: 1px dashed rgba(255,255,255,0.15); text-align: center; color: rgba(255,255,255,0.5); font-size: 0.8rem; margin-bottom: 6px;">
                  <i data-lucide="clock" style="width: 14px; height: 14px; vertical-align: middle; margin-right: 4px;"></i> Foto expirada (7 días transcurridos)
                </div>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            } else {
              contenidoBurbuja = `
                ${htmlReenviado}
                <div class="contenedor-foto-enviada" data-foto-hd="${msg.urlAdjunto}" style="max-width: 100%; margin-bottom: 6px; border-radius: 12px; overflow: hidden; cursor: pointer; position: relative;">
                  <img src="${msg.urlAdjunto}" onload="hacerScrollAlFinalHistorial()" style="width: 100%; max-height: 280px; object-fit: cover; display: block; border-radius: 12px;">
                </div>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            }

          } else if (msg.tipoAdjunto === 'documento') {
            const extension = msg.extDoc || "DOC";
            const peso = msg.pesoDoc || "";
            const esSubiendo = msg.urlAdjunto === "subiendo";
            const esError = msg.urlAdjunto === "error";

            if (esSubiendo) {
              const porcentaje = msg.progresoSubida || 0;
              const textoMB = msg.textoSubida || "Cargando...";

              contenidoBurbuja = `
                ${htmlReenviado}
                <div class="tarjeta-documento-link" style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.06); padding: 10px 12px; border-radius: 12px; margin-bottom: 6px; border: 1px solid rgba(0, 242, 254, 0.3); pointer-events: none; user-select: none;">
                  <div style="background: rgba(0, 242, 254, 0.15); width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <div style="width: 18px; height: 18px; border: 2px solid rgba(0, 242, 254, 0.2); border-top: 2px solid #00f2fe; border-radius: 50%; animation: spinMova 0.8s linear infinite;"></div>
                  </div>
                  <div style="display: flex; flex-direction: column; overflow: hidden; flex-grow: 1;">
                    <span style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; color: #fff;">${msg.nombreDoc || "Documento"}</span>
                    <span style="font-size: 0.72rem; color: #00f2fe; font-weight: 600;">Subiendo... ${porcentaje}% (${textoMB})</span>
                  </div>
                </div>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;

            } else if (esError) {
              contenidoBurbuja = `
                ${htmlReenviado}
                <div class="tarjeta-documento-link" style="display: flex; align-items: center; gap: 10px; background: rgba(255, 75, 43, 0.1); padding: 10px 12px; border-radius: 12px; margin-bottom: 6px; border: 1px solid rgba(255, 75, 43, 0.3);">
                  <div style="background: rgba(255, 75, 43, 0.2); width: 36px; height: 36px; border-radius: 8px; display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                    <i data-lucide="alert-circle" style="color: #ff4b2b; width: 20px; height: 20px;"></i>
                  </div>
                  <div style="display: flex; flex-direction: column; overflow: hidden; flex-grow: 1;">
                    <span style="font-size: 0.85rem; font-weight: 600; color: #fff;">${msg.nombreDoc || "Documento"}</span>
                    <span style="font-size: 0.72rem; color: #ff4b2b;">Error en la subida</span>
                  </div>
                </div>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;

            } else {
              contenidoBurbuja = `
                ${htmlReenviado}
                <a href="${msg.urlAdjunto}" target="_blank" rel="noopener noreferrer" class="tarjeta-documento-link" style="display: flex; align-items: center; gap: 10px; background: rgba(255,255,255,0.08); padding: 10px 12px; border-radius: 12px; margin-bottom: 6px; border: 1px solid rgba(255,255,255,0.12); text-decoration: none; color: #fff;">
                  <div style="background: rgba(0, 242, 254, 0.15); padding: 8px; border-radius: 8px; display: flex; align-items: center; justify-content: center;">
                    <i data-lucide="file-text" style="color: #00f2fe; width: 22px; height: 22px;"></i>
                  </div>
                  <div style="display: flex; flex-direction: column; overflow: hidden; flex-grow: 1;">
                    <span style="font-size: 0.85rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 160px; color: #fff;">${msg.nombreDoc || "Documento"}</span>
                    <span style="font-size: 0.72rem; opacity: 0.7; color: rgba(255,255,255,0.7);">${extension} ${peso ? '• ' + peso : ''}</span>
                  </div>
                  <i data-lucide="download" style="width: 18px; height: 18px; opacity: 0.8; color: #00f2fe;"></i>
                </a>
                ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
                <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            }

          } else if (msg.tipoAdjunto === 'video') {
            const esSubiendo = msg.urlAdjunto === "subiendo";
            const esError = msg.urlAdjunto === "error";

            if (esSubiendo) {
              const porcentaje = msg.progresoSubida || 0;
              contenidoBurbuja = `
                ${htmlReenviado}
                <div style="width: 140px; height: 140px; border-radius: 50%; background: rgba(255,255,255,0.05); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 8px; margin: 0 auto 6px auto; border: 1px solid rgba(0, 242, 254, 0.3);">
                  <div style="width: 22px; height: 22px; border: 2px solid rgba(0, 242, 254, 0.2); border-top: 2px solid #00f2fe; border-radius: 50%; animation: spinMova 0.8s linear infinite;"></div>
                  <span style="font-size: 0.7rem; color: #00f2fe; font-weight: 600;">${porcentaje}%</span>
                </div>
                ${msg.texto ? `<p class="mensaje-texto" style="text-align: center; margin-top: 6px;">${msg.texto}</p>` : ""}
                <span class="mensaje-hora" style="margin-top: 6px; display: block; text-align: center;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            } else if (esError) {
              contenidoBurbuja = `
                ${htmlReenviado}
                <div style="width: 140px; height: 140px; border-radius: 50%; background: rgba(255, 75, 43, 0.1); display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; margin: 0 auto 6px auto; border: 1px solid rgba(255, 75, 43, 0.3);">
                  <i data-lucide="alert-circle" style="color: #ff4b2b; width: 22px; height: 22px;"></i>
                  <span style="font-size: 0.68rem; color: #ff4b2b; font-weight: 600;">Error video</span>
                </div>
                ${msg.texto ? `<p class="mensaje-texto" style="text-align: center; margin-top: 6px;">${msg.texto}</p>` : ""}
                <span class="mensaje-hora" style="margin-top: 6px; display: block; text-align: center;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            } else {
              estiloEspecialBurbuja = "padding: 10px;";
              contenidoBurbuja = `
                ${htmlReenviado}
                <div class="contenedor-video-circular-burbuja" style="cursor: pointer; position: relative; width: 140px; height: 140px; margin: 0 auto; display: block;">
                  <svg class="anillo-progreso-svg" viewBox="0 0 150 150" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none; transform: rotate(-90deg); z-index: 3;">
                     <circle cx="75" cy="75" r="71" class="anillo-fondo"></circle>
                       <circle cx="75" cy="75" r="71" class="anillo-progreso progreso-anillo-nodo" stroke-dasharray="446.1" stroke-dashoffset="446.1"></circle>
                   </svg>
                  <div class="capa-play-video-sim" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; z-index: 2; background: rgba(0,0,0,0.35); border-radius: 50%;">
                    <i data-lucide="play" style="width: 28px; height: 28px; fill: white; color: white;"></i>
                  </div>
                  <div class="marco-video-redondo" style="width: 100%; height: 100%; border-radius: 50%; overflow: hidden; position: relative; z-index: 1; background: #000;">
                    <video src="${msg.urlAdjunto}" onloadeddata="hacerScrollAlFinalHistorial()" playsinline webkit-playsinline preload="auto" muted style="width: 100%; height: 100%; object-fit: cover; display: block;"></video>
                  </div>
                </div>
                ${msg.texto ? `<p class="mensaje-texto" style="text-align: center; margin-top: 6px;">${msg.texto}</p>` : ""}
                <span class="mensaje-hora" style="margin-top: 6px; display: block; text-align: center;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
              `;
            }

          } else if (msg.tipoAdjunto === 'audio') {
            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="reproductor-audio-burbuja">
                <button type="button" class="btn-play-audio">
                  <i data-lucide="play" style="width:16px; height:16px; margin-left: 2px;"></i>
                </button>

                <div class="ondas-audio-preview" style="position: relative; cursor: pointer;">
                  <div class="aguja-reproduccion-roja"></div>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                  <span class="onda-barra"></span><span class="onda-barra"></span>
                </div>

                <span class="tiempo-texto-nodo">${msg.duracion || '0:00'}</span>

                <audio class="audio-elemento-nativo" src="${msg.urlAdjunto}" preload="metadata" style="display: none;"></audio>

                <button type="button" class="btn-velocidad-audio" data-velocidad="1">1x</button>
              </div>
              <span class="mensaje-hora" style="margin-top: 4px;">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
            `;
          } else if (msg.tipoAdjunto === 'contacto') {
            const contacto = msg.contactoInfo || {};
            const nombreContacto = contacto.nombre || "Contacto";
            const fotoContacto = contacto.foto || `https://ui-avatars.com/api/?name=${encodeURIComponent(nombreContacto)}&background=00f2fe&color=000`;
            const uidContacto = contacto.uid || "";

            contenidoBurbuja = `
              ${htmlReenviado}
              <div class="tarjeta-contacto-adjunto" style="display: flex; align-items: center; gap: 12px; background: rgba(255,255,255,0.08); padding: 10px 12px; border-radius: 12px; border: 1px solid rgba(0, 242, 254, 0.25); margin-bottom: 8px; min-width: 210px;">
                <img src="${fotoContacto}" style="width: 42px; height: 42px; border-radius: 50%; object-fit: cover; border: 2px solid #00f2fe;" onerror="this.src='https://ui-avatars.com/api/?name=${encodeURIComponent(nombreContacto)}&background=00f2fe&color=000'">
                <div style="display: flex; flex-direction: column; overflow: hidden; flex-grow: 1;">
                  <span style="font-size: 0.88rem; font-weight: 700; color: #fff; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${nombreContacto}</span>
                  <span style="font-size: 0.72rem; color: #00f2fe;">Contacto de MovaChat</span>
                </div>
              </div>
              <button type="button" class="btn-mensaje-contacto" data-uid="${uidContacto}" onclick="(window.abrirChatDesdeContacto || window.abrirChatConUsuario || function(){})('${uidContacto}')" style="width: 100%; background: linear-gradient(135deg, #00f2fe, #4facfe); border: none; padding: 7px; border-radius: 8px; color: #000; font-weight: 700; font-size: 0.8rem; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; margin-bottom: 6px;">
                <i data-lucide="message-square" style="width: 15px; height: 15px; fill: black;"></i> Mensaje
              </button>
              ${msg.texto ? `<p class="mensaje-texto">${msg.texto}</p>` : ""}
              <span class="mensaje-hora">${iconoRelojHTML}${horaFormateada}${textoEditadoHTML}${htmlChecks}</span>
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

        // 🟢 Scroll inmediato + diferidos para multimedia y ajuste de teclado
        hacerScrollAlFinalHistorial();
        setTimeout(hacerScrollAlFinalHistorial, 150);
        setTimeout(hacerScrollAlFinalHistorial, 400);
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
  const pantallaBienvenida = document.getElementById("pantalla-bienvenida");
  const pantallaChats = document.getElementById("pantalla-chats");
  const pantallaPerfil = document.getElementById("pantalla-perfil"); // 🚀 NUEVO: Capturamos la pantalla de perfil

  if (!listaChats) return;

  // Contamos cuántas tarjetas de chat reales hay cargadas
  const tarjetasReales = listaChats.querySelectorAll(".tarjeta-chat");

  if (tarjetasReales.length === 0) {
    // 📭 SIN CHATS: Mostramos la tarjeta de bienvenida / buscar amigos
    if (contenedorVacio) contenedorVacio.classList.remove("oculto");
  } else {
    // 💬 CON CHATS: Ocultamos la bienvenida y garantizamos que la lista se muestre limpia
    if (contenedorVacio) contenedorVacio.classList.add("oculto");

    const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
    const estaEnChatPrivado = pantallaChatPrivado && (pantallaChatPrivado.style.display === "flex" || pantallaChatPrivado.classList.contains("pantalla-completa"));

    // 🚀 NUEVO: Detectar si el usuario está actualmente viendo su Perfil
    const estaEnPerfil = pantallaPerfil && (pantallaPerfil.style.display === "flex" || pantallaPerfil.classList.contains("activa"));

    // Si no está en un chat privado Y TAMPOCO está en el perfil, entonces sí mostramos el Inicio
    if (!estaEnChatPrivado && !estaEnPerfil) {
      if (pantallaBienvenida) pantallaBienvenida.style.display = "none";
      if (pantallaChats) {
        pantallaChats.style.display = "flex";
        pantallaChats.style.flexDirection = "column";
        pantallaChats.style.alignItems = "stretch";
      }
    }
  }
}

// 🗑️ Liberación explícita de memoria RAM para vistas previas
function limpiarPreviewBlob(elementoImg) {
  if (elementoImg && elementoImg.src && elementoImg.src.startsWith("blob:")) {
    URL.revokeObjectURL(elementoImg.src);
    elementoImg.src = "";
  }
}

// ⚡ Inicialización principal y eventos al cargar el DOM
document.addEventListener("DOMContentLoaded", () => {

  // 1️⃣ Ajustes iniciales (Emojis, scroll y Lucide Icons)
  conectarBotonEmoji();
  const menuTarjetas = document.getElementById("menu-tarjetas-chat");
  window.addEventListener("scroll", cerrarMenuContextualMova, true);

  // 🟢 ÚNICO CASO PERMITIDO: Carga inicial global del HTML estático
  if (window.lucide) {
    window.lucide.createIcons();
  }

  // 🔍 Búsqueda en Firebase optimizada con debounce de 300ms
  const inputNuevoContacto = document.getElementById("input-nuevo-contacto");
  let timerBusquedaInput = null;

  if (inputNuevoContacto) {
    inputNuevoContacto.addEventListener("input", (e) => {
      clearTimeout(timerBusquedaInput);
      timerBusquedaInput = setTimeout(async () => {
        const textoConsulta = e.target.value.trim().toLowerCase();
        if (!textoConsulta) return;

        // AQUÍ VA TU LÓGICA DE BÚSQUEDA EN FIREBASE
      }, 300);
    });
  }

  // 🔙 BOTÓN VOLVER / CERRAR CHAT (Limpia los listeners de Firebase y oculta el chat)
  const btnVolverChat = document.getElementById("btn-volver-chat") || document.querySelector(".btn-volver-chat");
  if (btnVolverChat) {
    btnVolverChat.addEventListener("click", () => {
      if (typeof limpiarListenersActivos === "function") {
        limpiarListenersActivos(); // 🧹 Detiene las lecturas en tiempo real de Firebase
      }
      const pantallaChat = document.getElementById("pantalla-chat-privado");
      if (pantallaChat) {
        pantallaChat.style.display = "none";
        pantallaChat.classList.remove("pantalla-completa");
      }
      window.contactoActivoUid = null; // Resetea el contacto activo
    });
  }

  // 🌐 Enlazar los botones de redes sociales del perfil
  conectarRedesSociales();

  const btnCamaraVideo = document.querySelector('[data-camara="video"]');
  const btnCamaraFoto = document.querySelector('[data-camara="foto"]');

  if (btnCamaraVideo) {
    btnCamaraVideo.addEventListener('click', () => abrirCamaraYGrabar('video'));
  }

  if (btnCamaraFoto) {
    btnCamaraFoto.addEventListener('click', () => abrirCamaraYGrabar('foto'));
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

window.notificarNuevoMensaje = function (nombreRemitente, textoMensaje, avatarUrl) {
  const estaSilenciado = localStorage.getItem("movachat-notificaciones") === "desactivado";
  if (estaSilenciado) return;

  // 1. Sincronizar badges en pantalla e icono flotante PWA
  if (typeof window.actualizarBadgesNotificaciones === "function") {
    window.actualizarBadgesNotificaciones();
  }

  // 2. Disparar notificación nativa de Android/Windows
  if (Notification.permission === "granted") {
    const opciones = {
      body: textoMensaje || "Te ha enviado un mensaje.",
      icon: avatarUrl || "./assets/logo/icon-192.png",
      badge: "./assets/logo/badge-72.png",
      vibrate: [100, 50, 100],
      // 🚀 CLAVE FIX: Usamos timestamp como tag para que CADA MENSAJE abra su propio globo y se acumule en la barra de notificaciones de Android
      tag: "msg-" + Date.now(),
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

// 🚪 CONTROL DEL MODAL DE CERRAR SESIÓN
document.addEventListener("DOMContentLoaded", () => {
  const modalLogout = document.getElementById("modal-confirmar-cerrar-sesion");
  const btnCancelarLogout = document.getElementById("btn-cancelar-logout-modal");
  const btnAceptarLogout = document.getElementById("btn-aceptar-logout-modal");

  // A) Cancelar y cerrar modal
  if (btnCancelarLogout && modalLogout) {
    btnCancelarLogout.onclick = () => {
      modalLogout.classList.add("oculto");
    };
  }

  // Cerrar si toca la capa oscura exterior
  if (modalLogout) {
    modalLogout.onclick = (e) => {
      if (e.target === modalLogout) modalLogout.classList.add("oculto");
    };
  }

  // B) Confirmar salida real
  if (btnAceptarLogout && modalLogout) {
    btnAceptarLogout.onclick = async () => {
      modalLogout.classList.add("oculto");

      try {
        const usuarioActual = auth.currentUser;

        // 🛑 1. Detener listeners y apagar el LED de presencia en Firebase antes de salir
        if (usuarioActual) {
          const userRef = ref(db, `usuarios/${usuarioActual.uid}`);
          await update(userRef, { presenciaReal: false });
        }

        if (typeof detenerControlPresenciaReal === "function") {
          await detenerControlPresenciaReal();
        }

        // 🚀 2. Cierre de sesión directo usando la función global ya importada
        await signOut(auth);

        // 🧹 FIX DE PRIVACIDAD: Borra inmediatamente correo y contraseña del formulario
        const formAuth = document.getElementById("form-auth");
        if (formAuth) formAuth.reset();

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Sesión cerrada correctamente 👋", "🚪", "#ff4b2b");
        }
      } catch (error) {
        console.error("Error al cerrar sesión:", error);
      }
    };
  }
});

// 🔑 LÓGICA DE RECUPERACIÓN DE CONTRASEÑA EN LOGIN
document.addEventListener("DOMContentLoaded", () => {
  const btnOlvidePass = document.getElementById("btn-olvide-password");
  const modalRecuperar = document.getElementById("modal-recuperar-pass");
  const btnCancelarRecuperar = document.getElementById("btn-cancelar-recuperar");
  const btnEnviarRecuperar = document.getElementById("btn-enviar-recuperar");
  const inputCorreoRecuperar = document.getElementById("input-correo-recuperar");

  // A) Abrir modal
  if (btnOlvidePass && modalRecuperar) {
    btnOlvidePass.onclick = (e) => {
      e.preventDefault();
      // Si ya había escrito su correo en el login, se auto-completa aquí
      const correoLogin = document.getElementById("auth-email")?.value || "";
      if (inputCorreoRecuperar) inputCorreoRecuperar.value = correoLogin;

      modalRecuperar.classList.remove("oculto");
    };
  }

  // B) Cerrar modal al cancelar o tocar fondo
  if (btnCancelarRecuperar && modalRecuperar) {
    btnCancelarRecuperar.onclick = () => modalRecuperar.classList.add("oculto");
  }
  if (modalRecuperar) {
    modalRecuperar.onclick = (e) => {
      if (e.target === modalRecuperar) modalRecuperar.classList.add("oculto");
    };
  }

  // C) Enviar correo de restablecimiento desde Firebase
  if (btnEnviarRecuperar && modalRecuperar) {
    btnEnviarRecuperar.onclick = async () => {
      const email = inputCorreoRecuperar?.value?.trim();

      if (!email) {
        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium("Por favor ingresa tu correo ⚠️", "✉️", "#ff4b2b");
        }
        return;
      }

      try {
        const { sendPasswordResetEmail } = await import("https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js");
        await sendPasswordResetEmail(auth, email);

        modalRecuperar.classList.add("oculto");

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(`Enlace enviado a <b>${email}</b> 🔑`, "✉️", "#00f2fe");
        }
      } catch (error) {
        console.error("Error al enviar recuperación:", error);
        let msg = "No se pudo enviar el correo ❌";
        if (error.code === "auth/user-not-found") msg = "Este correo no está registrado ⚠️";
        if (error.code === "auth/invalid-email") msg = "El correo no es válido ⚠️";

        if (typeof mostrarAvisoPremium === "function") {
          mostrarAvisoPremium(msg, "❌", "#ff4b2b");
        }
      }
    };
  }
});

// 🔮 MODAL DE CONFIRMACIÓN CON ESTILO MOVACHAT (GLASSMORPHISM)
function mostrarConfirmacionMova({
  titulo = "¿Estás seguro?",
  mensaje = "",
  icono = "🗑️",
  textoAceptar = "Eliminar",
  textoCancelar = "Cancelar",
  colorAceptar = "#ff4b2b"
}) {
  return new Promise((resolve) => {
    // Eliminar modal previo si existía
    const modalPrevio = document.getElementById("modal-confirmacion-mova");
    if (modalPrevio) modalPrevio.remove();

    const modal = document.createElement("div");
    modal.id = "modal-confirmacion-mova";
    modal.style.cssText = `
      position: fixed;
      top: 0; left: 0; width: 100vw; height: 100vh;
      background: rgba(5, 8, 20, 0.75);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999999;
      animation: fadeInMova 0.2s ease-out;
    `;

    modal.innerHTML = `
      <div style="
        background: rgba(18, 24, 38, 0.85);
        border: 1px solid rgba(255, 255, 255, 0.12);
        box-shadow: 0 0 30px rgba(0, 0, 0, 0.5), inset 0 0 15px rgba(255, 255, 255, 0.05);
        backdrop-filter: blur(20px);
        -webkit-backdrop-filter: blur(20px);
        border-radius: 24px;
        padding: 24px 20px;
        width: 88%;
        max-width: 340px;
        text-align: center;
        color: #ffffff;
        font-family: inherit;
        transform: scale(0.95);
        animation: popInMova 0.2s ease-out forwards;
      ">
        <div style="font-size: 38px; margin-bottom: 10px; filter: drop-shadow(0 0 10px ${colorAceptar});">${icono}</div>
        <h3 style="margin: 0 0 8px 0; font-size: 1.1rem; font-weight: 700; color: #fff;">${titulo}</h3>
        <p style="margin: 0 0 20px 0; font-size: 0.88rem; color: rgba(255,255,255,0.7); line-height: 1.4;">${mensaje}</p>
        <div style="display: flex; gap: 10px; justify-content: center;">
          <button id="btn-mova-cancelar" style="
            flex: 1;
            padding: 12px 14px;
            border-radius: 14px;
            border: 1px solid rgba(255, 255, 255, 0.15);
            background: rgba(255, 255, 255, 0.08);
            color: rgba(255, 255, 255, 0.8);
            font-weight: 600;
            font-size: 0.88rem;
            cursor: pointer;
            transition: all 0.2s;
          ">${textoCancelar}</button>
          <button id="btn-mova-aceptar" style="
            flex: 1;
            padding: 12px 14px;
            border-radius: 14px;
            border: none;
            background: ${colorAceptar};
            color: #ffffff;
            font-weight: 700;
            font-size: 0.88rem;
            box-shadow: 0 0 15px ${colorAceptar}88;
            cursor: pointer;
            transition: all 0.2s;
          ">${textoAceptar}</button>
        </div>
      </div>
    `;

    document.body.appendChild(modal);

    const btnCancelar = modal.querySelector("#btn-mova-cancelar");
    const btnAceptar = modal.querySelector("#btn-mova-aceptar");

    btnCancelar.onclick = () => {
      modal.remove();
      resolve(false);
    };

    btnAceptar.onclick = () => {
      modal.remove();
      resolve(true);
    };
  });
}

// 1. Detectar cuando cambia el Hash en la URL (ej. #perfil/ID_USUARIO)
window.addEventListener('hashchange', () => {
  const hash = window.location.hash;

  if (hash.startsWith('#perfil/')) {
    const uidTarget = hash.replace('#perfil/', '');
    cargarPerfilUsuario(uidTarget);
  }
});

// ==========================================================
// 🔙 BOTÓN VOLVER / CERRAR DESDE LA PANTALLA DE PERFIL
// ==========================================================
document.addEventListener("click", (e) => {
  const btnVolver = e.target.closest("#btn-volver-perfil") ||
    e.target.closest("#btn-cerrar-perfil") ||
    e.target.closest("#pantalla-perfil .btn-volver");

  if (btnVolver) {
    e.preventDefault();
    e.stopPropagation();

    const pantallaPerfil = document.getElementById("pantalla-perfil");
    const pantallaChatPrivado = document.getElementById("pantalla-chat-privado");
    const pantallaChats = document.getElementById("pantalla-chats");
    const menuFlotante = document.querySelector(".menu-flotante");

    // 1. Si regresas al chat activo, ocultamos el menú flotante para liberar la barra de mensajes
    if (window.contactoActivoUid && pantallaChatPrivado) {
      if (pantallaPerfil) pantallaPerfil.style.display = "none";
      if (menuFlotante) menuFlotante.style.display = "none"; // 🚀 Oculta el menú inferior

      pantallaChatPrivado.style.display = "flex";
      pantallaChatPrivado.classList.add("pantalla-completa");
    }
    // 2. Si regresas a la lista general, mostramos el menú flotante
    else if (pantallaChats) {
      if (pantallaPerfil) pantallaPerfil.style.display = "none";
      if (menuFlotante) menuFlotante.style.display = "flex";

      pantallaChats.style.display = "flex";

      const botonesMenu = document.querySelectorAll(".menu-flotante .menu-btn");
      if (botonesMenu.length > 0) {
        botonesMenu.forEach(b => b.classList.remove("activo"));
        botonesMenu[0].classList.add("activo");
      }
    }
  }
});

// ==========================================================
// 👤 CARGAR PERFIL DE USUARIO (MODO PROPIETARIO VS VISITANTE EN TIEMPO REAL)
// ==========================================================
window.cargarPerfilUsuario = function cargarPerfilUsuario(uidTarget) {
  const usuarioActual = auth.currentUser;
  const pantallaPerfil = document.getElementById('pantalla-perfil');
  const menuFlotante = document.querySelector(".menu-flotante");

  if (!pantallaPerfil || !uidTarget) return;

  // 1. Apagar escuchador previo si estábamos viendo otro perfil
  if (window.desuscribirPerfilEnVivo) {
    window.desuscribirPerfilEnVivo();
    window.desuscribirPerfilEnVivo = null;
  }

  // 2. Mostrar pantalla de perfil y asegurar menú inferior
  if (typeof switchPantalla === "function") {
    switchPantalla(pantallaPerfil, pantallaChats, pantallaBienvenida, pantallaChatPrivado);
  } else {
    pantallaPerfil.style.display = 'flex';
  }

  if (menuFlotante) menuFlotante.style.display = "flex";

  // 3. Evaluar Modo Visitante vs Mi Perfil
  const esMiPerfil = (usuarioActual && uidTarget === usuarioActual.uid);

  if (esMiPerfil) {
    pantallaPerfil.classList.remove('modo-visitante');
  } else {
    pantallaPerfil.classList.add('modo-visitante');
  }

  // 4. ESCUCHADOR EN TIEMPO REAL CON onValue
  const userRef = ref(db, `usuarios/${uidTarget}`);

  window.desuscribirPerfilEnVivo = onValue(userRef, (snapshot) => {
    const datosUsuario = snapshot.exists() ? snapshot.val() : null;

    if (!datosUsuario) {
      if (typeof mostrarAvisoPremium === "function") {
        mostrarAvisoPremium("Usuario no encontrado.", "⚠️", "#ff4b2b");
      }
      return;
    }

    // --- 1. FOTO DE PERFIL / HISTORIA ---
    const elemFoto = document.querySelector(".avatar-perfil-img");
    const avatarWrapper = document.querySelector(".avatar-perfil-wrapper");
    const urlFoto = datosUsuario.fotoUrl || 'https://api.dicebear.com/7.x/bottts/svg?seed=' + uidTarget;

    if (elemFoto) {
      elemFoto.src = urlFoto;
      elemFoto.onclick = (e) => {
        e.stopPropagation();
        const ahora = Date.now();
        const TIEMPO_24H = 24 * 60 * 60 * 1000;
        const esHistoriaValida = datosUsuario.estadoHistoriaUrl && (ahora - (datosUsuario.estadoHistoriaFecha || 0) < TIEMPO_24H);

        const imgTarget = esHistoriaValida ? datosUsuario.estadoHistoriaUrl : urlFoto;
        const textoTarget = esHistoriaValida ? (datosUsuario.estadoHistoriaTexto || "") : `Foto de perfil de ${datosUsuario.nombre || 'Usuario'}`;
        const uidAutorTarget = esHistoriaValida ? uidTarget : null;

        if (typeof abrirEstadoAmigo === "function") {
          abrirEstadoAmigo(imgTarget, textoTarget, uidAutorTarget);
        }
      };
    }

    // Aro de neón si tiene historia activa (< 24h)
    const TIEMPO_24H = 24 * 60 * 60 * 1000;
    if (avatarWrapper) {
      if (datosUsuario.estadoHistoriaUrl && (Date.now() - (datosUsuario.estadoHistoriaFecha || 0) < TIEMPO_24H)) {
        avatarWrapper.classList.add("con-estado-activo");
      } else {
        avatarWrapper.classList.remove("con-estado-activo");
      }
    }

    // --- 2. NOMBRE DE PERFIL ---
    const elemNombre = document.querySelector("#texto-perfil-nombre span");
    if (elemNombre) elemNombre.textContent = datosUsuario.nombre || 'Usuario Mova';

    // --- 3. FRASE DE ESTADO ---
    const btnEstadoSutil = document.querySelector(".btn-estado-sutil");
    const elemTextoEstado = document.querySelector(".texto-estado");
    const fraseGuardada = datosUsuario.estadoTexto || datosUsuario.estado || "";

    if (elemTextoEstado) {
      if (!esMiPerfil && (!fraseGuardada || fraseGuardada.includes("Disponible. Toca para añadir"))) {
        const estadoConexion = datosUsuario.estadoConexion || datosUsuario.estadoPresencia || "online";
        elemTextoEstado.textContent = estadoConexion === "ocupado" ? "Ocupado" : (estadoConexion === "offline" ? "Invisible" : "Disponible");
      } else {
        elemTextoEstado.textContent = fraseGuardada;
      }
    }

    if (btnEstadoSutil) {
      btnEstadoSutil.style.cursor = esMiPerfil ? "pointer" : "default";
    }

    // --- 4. INDICADOR DE CONEXIÓN (LED EN TIEMPO REAL) ---
    const elemLedPerfil = document.querySelector(".btn-estado-sutil .punto-online");
    if (elemLedPerfil) {
      const estadoConexion = datosUsuario.estadoConexion || datosUsuario.estadoPresencia || "online";
      let colorLed = "#00f2fe";
      let sombraLed = "0 0 10px #00f2fe";

      if (estadoConexion === "ocupado") {
        colorLed = "#ef4444";
        sombraLed = "0 0 10px #ef4444";
      } else if (estadoConexion === "offline" || estadoConexion === "invisible") {
        colorLed = "#888888";
        sombraLed = "none";
      }

      elemLedPerfil.style.backgroundColor = colorLed;
      elemLedPerfil.style.boxShadow = sombraLed;
    }

    // --- 5. BOTÓN ENVIAR MENSAJE ---
    const btnMensaje = document.getElementById('btn-enviar-mensaje-perfil');
    if (btnMensaje) {
      btnMensaje.onclick = (e) => {
        e.stopPropagation();
        if (typeof abrirChatConUsuario === "function") {
          abrirChatConUsuario(uidTarget, datosUsuario.nombre, datosUsuario.fotoUrl);
        }
      };
    }

    // --- 5.B. BOTÓN TOGGLE (AGREGAR / ELIMINAR CONTACTO) ---
    const btnAgregarContacto = document.getElementById("btn-agregar-contacto-perfil");

    if (btnAgregarContacto) {
      if (esMiPerfil) {
        btnAgregarContacto.style.display = "none";
      } else {
        btnAgregarContacto.style.display = "flex";
        const miUid = usuarioActual ? usuarioActual.uid : null;

        if (miUid) {
          btnAgregarContacto.disabled = true;

          // Consultar estado en Firebase
          get(ref(db, `mis_contactos/${miUid}/${uidTarget}`)).then((snap) => {
            let yaEsContacto = snap.exists();
            btnAgregarContacto.disabled = false;
            actualizarEstadoBotonContacto(btnAgregarContacto, yaEsContacto);

            btnAgregarContacto.onclick = async (e) => {
              e.stopPropagation();
              e.preventDefault();
              btnAgregarContacto.disabled = true;

              try {
                if (yaEsContacto) {
                  // ❌ SI YA ES CONTACTO -> ELIMINAR DE FIREBASE
                  await remove(ref(db, `mis_contactos/${miUid}/${uidTarget}`));
                  yaEsContacto = false;
                  actualizarEstadoBotonContacto(btnAgregarContacto, false);

                  if (typeof mostrarAvisoPremium === "function") {
                    mostrarAvisoPremium(
                      `<b>${datosUsuario.nombre || "Usuario"}</b> eliminado de tus contactos`,
                      "🗑️",
                      "#ff4b2b"
                    );
                  }
                } else {
                  // ➕ SI NO ES CONTACTO -> AGREGAR A FIREBASE
                  await set(ref(db, `mis_contactos/${miUid}/${uidTarget}`), true);
                  yaEsContacto = true;
                  actualizarEstadoBotonContacto(btnAgregarContacto, true);

                  if (typeof mostrarAvisoPremium === "function") {
                    mostrarAvisoPremium(
                      `<b>${datosUsuario.nombre || "Usuario"}</b> guardado en tu lista ✨`,
                      "👤",
                      "#00f2fe"
                    );
                  }
                }
              } catch (err) {
                console.error("Error al actualizar contacto:", err);
              } finally {
                btnAgregarContacto.disabled = false;
              }
            };
          }).catch(() => {
            btnAgregarContacto.disabled = false;
          });
        }
      }
    }

    // Función helper para cambiar estética entre activo/inactivo
    function actualizarEstadoBotonContacto(btn, esContacto) {
      if (!btn) return;

      if (esContacto) {
        // Apariencia desactivada / guardado (no ilumina)
        btn.innerHTML = `<i data-lucide="user-check"></i> Contacto en tu lista`;
        btn.style.background = "rgba(255, 255, 255, 0.05)";
        btn.style.color = "rgba(255, 255, 255, 0.7)";
        btn.style.border = "1px solid rgba(255, 255, 255, 0.15)";
        btn.style.boxShadow = "none";
      } else {
        // Apariencia activa / iluminada para agregar
        btn.innerHTML = `<i data-lucide="user-plus"></i> Agregar a mi lista`;
        btn.style.background = "linear-gradient(135deg, #00f2fe, #4facfe)";
        btn.style.color = "#000000";
        btn.style.border = "none";
        btn.style.boxShadow = "0 4px 15px rgba(0, 242, 254, 0.3)";
      }

      if (window.lucide) {
        window.lucide.createIcons({ targets: [btn] });
      }
    }

    // --- 6. CÓDIGO QR PRO ---
    const btnQr = document.getElementById('btn-abrir-qr');
    if (btnQr) {
      btnQr.onclick = () => {
        const urlBase = window.location.origin && window.location.origin !== "null" ? window.location.origin : window.location.href;
        const urlPerfilTarget = `${urlBase}?user=${uidTarget}`;
        const imgQr = document.getElementById("img-qr-dinamico");
        const modalQr = document.getElementById("modal-qr-mova");

        if (imgQr) {
          imgQr.src = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(urlPerfilTarget)}&color=00f2fe&bgcolor=0a0a12`;
        }
        if (modalQr) {
          modalQr.classList.remove("oculto");
          modalQr.style.display = "flex";
        }
      };
    }

    // --- 7. REDES SOCIALES ---
    const redes = datosUsuario.redes || {};
    const contenedorComunidad = document.querySelector(".tarjeta-bento.comunidad");
    const botonesRedes = document.querySelectorAll(".red-enlace");

    const tieneRedesActivas = Object.keys(redes).some(key => redes[key] && redes[key].trim() !== "");

    let avisoSinRedes = document.getElementById("aviso-sin-redes-mova");
    if (!avisoSinRedes && contenedorComunidad) {
      avisoSinRedes = document.createElement("p");
      avisoSinRedes.id = "aviso-sin-redes-mova";
      avisoSinRedes.style.cssText = "font-size: 0.82rem; color: rgba(255, 255, 255, 0.4); text-align: center; margin-top: 10px; font-style: italic;";
      avisoSinRedes.textContent = "no hay enlace agregado";
      contenedorComunidad.appendChild(avisoSinRedes);
    }

    if (!esMiPerfil && !tieneRedesActivas) {
      if (avisoSinRedes) avisoSinRedes.style.display = "block";
    } else {
      if (avisoSinRedes) avisoSinRedes.style.display = "none";
    }

    botonesRedes.forEach(btn => {
      const tipoRed = btn.dataset.red;
      const cuentaUsuario = redes[tipoRed];

      if (cuentaUsuario && cuentaUsuario.trim() !== "") {
        btn.style.display = "flex";
        btn.style.opacity = "1";
        btn.style.borderColor = "#00f2fe";
        btn.style.boxShadow = "0 0 10px rgba(0, 242, 254, 0.3)";

        btn.onclick = (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (!esMiPerfil) {
            let urlFinal = "";
            if (tipoRed === "instagram") urlFinal = `https://instagram.com/${cuentaUsuario}`;
            if (tipoRed === "tiktok") urlFinal = `https://tiktok.com/@${cuentaUsuario}`;
            if (tipoRed === "facebook") urlFinal = `https://facebook.com/${cuentaUsuario}`;

            if (urlFinal) window.open(urlFinal, '_blank');
          }
        };
      } else {
        if (!esMiPerfil) {
          btn.style.display = "none";
        } else {
          btn.style.display = "flex";
          btn.style.opacity = "0.35";
          btn.style.borderColor = "rgba(255, 255, 255, 0.08)";
          btn.style.boxShadow = "none";
        }
      }
    });
  });
};

// 🔍 ESCUCHAR VISTAS / LIKES Y MOSTRAR NOMBRES
function escucharLikesHistoria(uidAutor) {
  const contadorLikesEstado = document.getElementById("contador-likes-estado");
  const btnCorazonEstado = document.getElementById("btn-corazon-estado");
  const contadorTotal = document.getElementById("contador-total-likes");
  const contenedor = document.getElementById("contenedor-usuarios-likes");

  // Elementos de la tarjeta principal
  const badgeTarjeta = document.getElementById("badge-vistas-mi-estado");
  const cantTarjeta = document.getElementById("cant-vistas-tarjeta");
  const miUid = auth.currentUser ? auth.currentUser.uid : null;

  if (typeof desuscribirLikesHistoria === "function" && desuscribirLikesHistoria) {
    desuscribirLikesHistoria();
  }

  const likesRef = ref(db, `historias_likes/${uidAutor}`);

  desuscribirLikesHistoria = onValue(likesRef, (snap) => {
    if (snap.exists()) {
      const likesData = snap.val();
      const listaUids = Object.keys(likesData);
      const usuarios = Object.values(likesData);
      const totalCount = listaUids.length;

      // 1. Actualizar contadores en la historia
      if (contadorLikesEstado) contadorLikesEstado.textContent = totalCount;
      if (contadorTotal) contadorTotal.textContent = totalCount;

      // 2. Actualizar ojito en la tarjeta "Mi Estado" si es tuya
      if (miUid && uidAutor === miUid) {
        if (badgeTarjeta) badgeTarjeta.classList.remove("oculto");
        if (cantTarjeta) cantTarjeta.textContent = totalCount;
      }

      // 3. Activar corazón si tú ya le diste me gusta
      if (btnCorazonEstado) {
        if (miUid && likesData[miUid]) {
          btnCorazonEstado.classList.add("activo");
        } else {
          btnCorazonEstado.classList.remove("activo");
        }
      }

      // 4. Renderizar lista de nombres en el modal con respaldo de imagen seguro
      if (contenedor) {
        contenedor.innerHTML = "";
        usuarios.forEach((user) => {
          const fotoValida = (user.fotoUrl && user.fotoUrl.trim() !== "")
            ? user.fotoUrl
            : 'assets/logo/icon-192.png';

          const item = document.createElement("div");
          item.className = "item-usuario-like";
          item.innerHTML = `
            <img src="${fotoValida}" 
                 class="avatar-contacto-mini" 
                 alt="${user.nombre || 'Usuario'}" 
                 onerror="this.onerror=null; this.src='assets/logo/icon-192.png';" />
            <span class="nombre-contacto-texto">${user.nombre || 'Usuario Mova'}</span>
          `;
          contenedor.appendChild(item);
        });
      }
    } else {
      // Sin reacciones
      if (contadorLikesEstado) contadorLikesEstado.textContent = "0";
      if (contadorTotal) contadorTotal.textContent = "0";
      if (cantTarjeta) cantTarjeta.textContent = "0";
      if (badgeTarjeta && miUid && uidAutor === miUid) badgeTarjeta.classList.add("oculto");

      if (btnCorazonEstado) btnCorazonEstado.classList.remove("activo");

      if (contenedor) {
        contenedor.innerHTML = `<p style="color: rgba(255,255,255,0.5); font-size: 13px; text-align: center; padding: 15px;">Nadie ha reaccionado aún</p>`;
      }
    }
  });
}

// 🚀 ESCUCHAR LIKES Y CARGAR FOTO REAL EN MI ESTADO (VALIDACIÓN VÍA USUARIO)
function iniciarEscuchaMiEstado() {
  const usuarioActual = auth.currentUser;
  if (!usuarioActual) return;

  const miUid = usuarioActual.uid;

  // 🖼️ 1. Cargar foto de perfil en la tarjeta con logo de respaldo
  const imgMiAvatar = document.getElementById("img-mi-avatar-bandeja");
  if (imgMiAvatar) {
    const fotoUser = (usuarioActual.photoURL && usuarioActual.photoURL.trim() !== "")
      ? usuarioActual.photoURL
      : 'assets/logo/icon-192.png';
    imgMiAvatar.src = fotoUser;
  }

  const badgeTarjeta = document.getElementById("badge-vistas-mi-estado");
  const cantTarjeta = document.getElementById("cant-vistas-tarjeta");
  const usuarioRef = ref(db, `usuarios/${miUid}`);
  const likesRef = ref(db, `historias_likes/${miUid}`);

  const TIEMPO_24H = 24 * 60 * 60 * 1000;

  // 👁️ 2. Escuchar en tiempo real el nodo real del usuario
  onValue(usuarioRef, (snapUser) => {
    if (snapUser.exists()) {
      const datos = snapUser.val();
      const tieneHistoria = datos.estadoHistoriaUrl;
      const fecha = datos.estadoHistoriaFecha || 0;
      const esValida = tieneHistoria && (Date.now() - fecha < TIEMPO_24H);

      if (esValida) {
        // La historia está ACTIVA -> Escuchar reacciones
        onValue(likesRef, (snapLikes) => {
          if (snapLikes.exists()) {
            const totalCount = Object.keys(snapLikes.val()).length;
            if (cantTarjeta) cantTarjeta.textContent = totalCount;
            if (badgeTarjeta) badgeTarjeta.classList.remove("oculto");
          } else {
            if (cantTarjeta) cantTarjeta.textContent = "0";
            if (badgeTarjeta) badgeTarjeta.classList.add("oculto");
          }
        });
      } else {
        // 🚫 NO hay historia o ya expiró (+24h) -> Ocultar badge de inmediato
        if (cantTarjeta) cantTarjeta.textContent = "0";
        if (badgeTarjeta) badgeTarjeta.classList.add("oculto");
      }
    } else {
      if (cantTarjeta) cantTarjeta.textContent = "0";
      if (badgeTarjeta) badgeTarjeta.classList.add("oculto");
    }
  });
}

// 👁️ ABRIR Y CERRAR MODAL DE LIKES / REACCIONES (SINCRONIZACIÓN INSTANTÁNEA)
const btnVerLikes = document.getElementById("btn-ver-likes-estado");
const badgeTarjeta = document.getElementById("badge-vistas-mi-estado");
const modalListaLikes = document.getElementById("modal-lista-likes");
const btnCerrarListaLikes = document.getElementById("btn-cerrar-lista-likes");

// Abrir modal desde el ojito del visor de historias
if (btnVerLikes && modalListaLikes) {
  btnVerLikes.addEventListener("click", (e) => {
    e.stopPropagation();
    if (window.autorHistoriaActivaUid) {
      escucharLikesHistoria(window.autorHistoriaActivaUid);
    }
    modalListaLikes.classList.remove("oculto");
  });
}

// Abrir modal al tocar el ojito en la tarjeta "Mi Estado"
if (badgeTarjeta && modalListaLikes) {
  badgeTarjeta.addEventListener("click", (e) => {
    e.stopPropagation();
    const usuarioActual = auth.currentUser;
    if (usuarioActual) {
      // 🚀 Fuerza la lectura inmediata de la lista al tocar el ojito
      escucharLikesHistoria(usuarioActual.uid);
    }
    modalListaLikes.classList.remove("oculto");
  });
}

// Cerrar modal con la X
if (btnCerrarListaLikes && modalListaLikes) {
  btnCerrarListaLikes.addEventListener("click", (e) => {
    e.stopPropagation();
    modalListaLikes.classList.add("oculto");
  });
}

// 🔄 Animación para el círculo giratorio de subida
if (!document.getElementById("anim-spin-mova")) {
  const estiloSpin = document.createElement("style");
  estiloSpin.id = "anim-spin-mova";
  estiloSpin.textContent = `
    @keyframes spinMova {
      0% { transform: rotate(0deg); }
      100% { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(estiloSpin);
}

// Global para abrir chat desde el botón de la tarjeta
window.abrirChatDesdeContacto = function (uidContacto, nombreContacto = "", fotoContacto = "") {
  if (!uidContacto) {
    if (typeof mostrarAvisoPremium === "function") {
      mostrarAvisoPremium("No se encontró el ID del contacto.", "⚠️", "#ff4b2b");
    }
    return;
  }

  // Buscar datos en la caché de usuarios si no vienen informados explícitamente
  if (window.usuariosCacheGlobal && window.usuariosCacheGlobal[uidContacto]) {
    const usuario = window.usuariosCacheGlobal[uidContacto];
    nombreContacto = nombreContacto || usuario.nombre || "Contacto";
    fotoContacto = fotoContacto || usuario.fotoUrl || usuario.fotoPerfil || usuario.photoURL || "";
  }

  // Llamada a la función real que abre la pantalla de chat privado
  if (typeof abrirChatConUsuario === "function") {
    abrirChatConUsuario(uidContacto, nombreContacto, fotoContacto);

    // ✈️ REVISIÓN Y TRANSFORMACIÓN DE BOTÓN (Acción -> Avión/Send si hay reenvío pendiente)
    if (typeof actualizarIconoBotonAccion === "function") {
      setTimeout(() => {
        actualizarIconoBotonAccion();
      }, 50); // Ligero retardo para asegurar que el DOM del chat ya fue renderizado
    }
  } else {
    console.error("❌ La función abrirChatConUsuario no está disponible.");
  }
};

// ========================================================
// 🎧 LISTENERS FINALES PARA EL BOTÓN DE ACCIÓN
// ========================================================
if (btnAccionChat) {
  // Eventos para Celular/Tablet
  btnAccionChat.addEventListener('touchstart', iniciarControlTactilMic, { passive: false });
  document.addEventListener('touchmove', moverControlTactilMic, { passive: false });
  document.addEventListener('touchend', finalizarControlTactilMic);

  // Eventos para Computadora (Ratón)
  btnAccionChat.addEventListener('mousedown', iniciarControlTactilMic);
  document.addEventListener('mousemove', moverControlTactilMic);
  document.addEventListener('mouseup', finalizarControlTactilMic);
}

// ========================================================
// ⚡ CAMBIO DE VELOCIDAD DE NOTAS DE VOZ (1x -> 1.5x -> 2x)
// ========================================================
document.addEventListener("click", (e) => {
  const btnVelocidad = e.target.closest(".btn-velocidad-audio");
  if (!btnVelocidad) return;

  e.preventDefault();
  e.stopPropagation();

  // 1. Obtener la burbuja contenedora y el audio nativo
  const reproductor = btnVelocidad.closest(".reproductor-audio-burbuja");
  const audioNativo = reproductor ? reproductor.querySelector(".audio-elemento-nativo") : null;

  let velocidad = parseFloat(btnVelocidad.getAttribute("data-velocidad") || "1");

  // 2. Alternar velocidad (1x -> 1.5x -> 2x -> 1x)
  if (velocidad === 1) {
    velocidad = 1.5;
  } else if (velocidad === 1.5) {
    velocidad = 2;
  } else {
    velocidad = 1;
  }

  // 3. Aplicar velocidad al reproductor de audio
  if (audioNativo) {
    audioNativo.playbackRate = velocidad;
  }

  // 4. Actualizar visualmente el botón
  btnVelocidad.setAttribute("data-velocidad", velocidad);
  btnVelocidad.textContent = `${velocidad}x`;
});

// Resetear o gestionar al terminar la reproducción
document.addEventListener("ended", (e) => {
  if (e.target && e.target.classList.contains("audio-elemento-nativo")) {
    const reproductor = e.target.closest(".reproductor-audio-burbuja");
    const btnVelocidad = reproductor ? reproductor.querySelector(".btn-velocidad-audio") : null;

    // Opcional: Volver a 1x al finalizar
    if (btnVelocidad) {
      e.target.playbackRate = 1;
      btnVelocidad.setAttribute("data-velocidad", "1");
      btnVelocidad.textContent = "1x";
    }
  }
}, true);

// ========================================================
// ▶️ CONTROLADOR DE PLAY / PAUSA PARA LAS NOTAS DE VOZ
// ========================================================
document.addEventListener("click", async (e) => {
  // 1. Detectar clic en el botón Play/Pausa o su ícono
  const btnPlay = e.target.closest(".btn-play-audio") || e.target.closest("[data-accion='play']");
  if (!btnPlay) return;

  e.preventDefault();
  e.stopPropagation();

  // 2. Localizar el contenedor de la burbuja y el elemento <audio>
  const contenedor = btnPlay.closest(".reproductor-audio-burbuja") || btnPlay.closest(".mensaje-burbuja");
  const audioElem = contenedor ? contenedor.querySelector("audio") : null;

  if (!audioElem) {
    console.error("❌ No se encontró la etiqueta <audio> dentro del contenedor.");
    return;
  }

  // 3. Verificar si el audio tiene una fuente válida
  if (!audioElem.src || audioElem.src === window.location.href) {
    console.error("❌ El elemento <audio> no tiene un atributo 'src' o URL válida.");
    return;
  }

  // 4. Pausar los demás audios que se estén reproduciendo actualmente
  document.querySelectorAll("audio").forEach((a) => {
    if (a !== audioElem && !a.paused) {
      a.pause();
    }
  });

  // 5. Alternar Reproducción / Pausa
  try {
    if (audioElem.paused) {
      await audioElem.play();
      btnPlay.classList.add("reproduciendo"); // Para cambiar el ícono a Pausa en CSS/JS
    } else {
      audioElem.pause();
      btnPlay.classList.remove("reproduciendo");
    }
  } catch (error) {
    console.error("⚠️ Error al intentar reproducir el audio:", error);
  }
});

// ========================================================
// 🎵 ANIMACIÓN DE WAVEFORM + AGUJA EN TIEMPO REAL
// ========================================================
document.addEventListener("timeupdate", (e) => {
  const audio = e.target;
  if (audio.tagName !== "AUDIO") return;

  const contenedor = audio.closest(".reproductor-audio-burbuja") || audio.closest(".mensaje-burbuja");
  if (!contenedor) return;

  // Localizar elementos
  const aguja = contenedor.querySelector(".aguja-reproduccion-roja") ||
    contenedor.querySelector(".aguja-progreso") ||
    contenedor.querySelector(".linea-reproduccion");

  const barras = contenedor.querySelectorAll(".onda-barra");

  const textoTiempo = contenedor.querySelector(".tiempo-texto-nodo") ||
    contenedor.querySelector(".tiempo-audio") ||
    contenedor.querySelector(".duracion");

  // 🛠️ 1. SOLUCIÓN AL BUG DE DURACIÓN (WebM / Ogg / Infinity)
  let duracion = audio.duration;

  // Si audio.duration falla, intenta leer la duración guardada en un data-attribute del contenedor o del audio
  if (!duracion || isNaN(duracion) || !isFinite(duracion)) {
    const duracionGuardada = contenedor.dataset.duracionSegundos || audio.dataset.duracion;
    duracion = Number(duracionGuardada) || 0;
  }

  // Si después del respaldo la duración sigue siendo inválida o 0, no continuamos
  if (duracion <= 0) return;

  // 🎯 2. Porcentaje de reproducción exacto y acotado (0% a 100%)
  const progresoDecimal = Math.min(Math.max(audio.currentTime / duracion, 0), 1);
  const porcentaje = progresoDecimal * 100;

  // 3. Mover la aguja roja a lo largo de toda la longitud del reproductor
  if (aguja) {
    aguja.style.left = `${porcentaje}%`;
  }

  // 4. 🌟 Encender/iluminar barras de forma proporcional al progreso real
  if (barras.length > 0) {
    const totalBarrasAColorear = Math.round(progresoDecimal * barras.length);

    barras.forEach((barra, index) => {
      if (index < totalBarrasAColorear) {
        barra.classList.add("activa");
      } else {
        barra.classList.remove("activa");
      }
    });
  }

  // 5. Actualizar el tiempo transcurrido en pantalla
  if (textoTiempo) {
    const min = Math.floor(audio.currentTime / 60);
    const seg = Math.floor(audio.currentTime % 60);
    textoTiempo.textContent = `${min.toString().padStart(2, '0')}:${seg.toString().padStart(2, '0')}`;
  }
}, true);

// Reiniciar aguja y apagar barras al terminar la nota de voz
document.addEventListener("ended", (e) => {
  const audio = e.target;
  if (audio.tagName !== "AUDIO") return;

  const contenedor = audio.closest(".reproductor-audio-burbuja") || audio.closest(".mensaje-burbuja");
  if (!contenedor) return;

  const aguja = contenedor.querySelector(".aguja-reproduccion-roja") ||
    contenedor.querySelector(".aguja-progreso") ||
    contenedor.querySelector(".linea-reproduccion");

  const barras = contenedor.querySelectorAll(".onda-barra");
  const btnPlay = contenedor.querySelector(".btn-play-audio");

  if (aguja) aguja.style.left = "0%";
  if (barras) barras.forEach(b => b.classList.remove("activa"));
  if (btnPlay) btnPlay.classList.remove("reproduciendo");
}, true);

// 🚪 FUNCIÓN GLOBAL PARA CERRAR SESIÓN LIMPIANDO LA PRESENCIA REAL
async function cerrarSesionLimpia() {
  const usuarioActual = auth.currentUser;

  if (usuarioActual) {
    try {
      // 1. Apagamos explícitamente el LED 2 en Firebase
      const userRef = ref(db, `usuarios/${usuarioActual.uid}`);
      await update(userRef, { presenciaReal: false });
    } catch (error) {
      console.error("Error al apagar presencia al cerrar sesión:", error);
    }
  }

  try {
    // 2. Cerramos la sesión en Firebase
    await signOut(auth);

    // 3. Ocultamos el modal y reiniciamos
    const modalLogout = document.getElementById("modal-confirmar-cerrar-sesion");
    if (modalLogout) modalLogout.classList.add("oculto");

    window.location.reload();
  } catch (error) {
    console.error("Error al cerrar sesión:", error);
  }
}

// Hacerla accesible globalmente
window.cerrarSesionLimpia = cerrarSesionLimpia;

// 🎯 VINCULAR LOS BOTONES DEL MODAL AL CARGAR EL SCRIPT
const btnAceptarLogout = document.getElementById("btn-aceptar-logout-modal");
if (btnAceptarLogout) {
  btnAceptarLogout.addEventListener("click", cerrarSesionLimpia);
}

const btnCancelarLogout = document.getElementById("btn-cancelar-logout-modal");
if (btnCancelarLogout) {
  btnCancelarLogout.addEventListener("click", () => {
    const modalLogout = document.getElementById("modal-confirmar-cerrar-sesion");
    if (modalLogout) modalLogout.classList.add("oculto");
  });
}