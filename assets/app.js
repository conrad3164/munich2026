import { initializeApp } from "https://www.gstatic.com/firebasejs/12.0.0/firebase-app.js";
import {
  getAuth,
  browserLocalPersistence,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  collection,
  getDocs,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/12.0.0/firebase-firestore.js";
import { mountTrip, toast } from "./render.js?v=15";

// Les SDK sont chargés : on rend le formulaire utilisable et on désamorce le
// garde-fou d'index.html.
document.documentElement.dataset.appReady = "1";
const loginButton = document.getElementById("login-btn");
loginButton.disabled = false;
loginButton.textContent = "Se connecter";

// La configuration Firebase n'est pas en clair dans ce dépôt : le dépôt GitHub
// étant public, l'y laisser revenait à publier l'identifiant du projet et
// l'e-mail de connexion. Elle y vit chiffrée (config.enc.json), sous une clé
// dérivée du mot de passe du compte : publique, mais illisible sans lui.
//
// Le NAS (munich-api) sait aussi la délivrer et reste le recours : c'était la
// solution d'origine, mais un réseau d'entreprise filtre couramment
// munich-api.jeppnas.fr — domaine personnel sur IP résidentielle — et la
// première connexion depuis le bureau devenait impossible. Le blob chiffré,
// servi par GitHub, ne dépend d'aucun réseau particulier.
//
// Elle est ensuite conservée en local : les visites suivantes ne déchiffrent
// plus rien et n'interrogent plus personne.
const CONFIG_BLOB_URL = "./config.enc.json";
const CONFIG_URL = "https://munich-api.jeppnas.fr/config";
const CONFIG_KEY = "munich2026.config";

const CACHE_KEY = "munich2026.plan";
const $ = (id) => document.getElementById(id);
const screens = { login: $("screen-login"), loading: $("screen-loading"), app: $("screen-app") };
const ticketCache = new Map();

// Journal visible à l'écran, activé par ?debug=1 dans l'adresse. Sans lui, une
// panne sur mobile ou chez quelqu'un d'autre est indiagnostiquable : la console
// du navigateur n'y est pas accessible. Déclaré avant tout appel à log().
const debugBox = new URLSearchParams(location.search).has("debug")
  ? document.getElementById("debug")
  : null;
if (debugBox) debugBox.hidden = false;

function log(message) {
  console.log("[munich2026]", message);
  if (!debugBox) return;
  const time = new Date().toLocaleTimeString("fr-FR");
  debugBox.textContent += time + "  " + message + "\n";
  debugBox.scrollTop = debugBox.scrollHeight;
}

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
  log("écran affiché : " + name);
}

/* ------------------------------------------------------------ configuration */

// Renseignés au démarrage de Firebase, donc pas avant d'avoir la configuration.
let auth = null;
let db = null;

// Erreur déjà rédigée pour l'utilisateur, par opposition aux codes « auth/… »
// que renvoie Firebase et qu'il faut traduire.
class ConfigError extends Error {}

function startFirebase(config) {
  const app = initializeApp(config);
  auth = getAuth(app);
  db = getFirestore(app);
  onAuthStateChanged(auth, handleAuthChange);
}

function fromBase64(value) {
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}

// Renvoie la configuration si le mot de passe ouvre une des entrées du blob,
// null sinon — blob absent, illisible, ou mot de passe qui ne correspond à
// aucune entrée. Aucune de ces situations n'est une erreur : il reste le NAS.
async function decryptLocalConfig(password) {
  let blob;
  try {
    const response = await fetch(CONFIG_BLOB_URL, { cache: "no-cache" });
    if (!response.ok) return null;
    blob = await response.json();
  } catch {
    return null;
  }
  if (!blob || !Array.isArray(blob.entries) || !blob.kdf) return null;

  const material = await crypto.subtle.importKey(
    "raw", new TextEncoder().encode(password), "PBKDF2", false, ["deriveKey"]
  );

  // Le blob ne nomme pas les comptes : on essaie chaque entrée. Chacune coûte
  // une dérivation PBKDF2 complète, d'où l'intérêt d'en avoir peu.
  for (const entry of blob.entries) {
    try {
      const key = await crypto.subtle.deriveKey(
        {
          name: "PBKDF2",
          salt: fromBase64(entry.salt),
          iterations: blob.kdf.iterations,
          hash: blob.kdf.hash
        },
        material,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"]
      );
      const clear = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: fromBase64(entry.iv) }, key, fromBase64(entry.ct)
      );
      return JSON.parse(new TextDecoder().decode(clear));
    } catch {
      // Entrée d'un autre compte, ou mauvais mot de passe : on passe à la
      // suivante. AES-GCM authentifie le chiffré, il n'y a pas de faux positif.
    }
  }
  return null;
}

// Le blob d'abord, le NAS ensuite. Le NAS reste utile quand le blob n'a pas été
// régénéré après un changement de mot de passe : il fait alors autorité.
async function obtainConfig(email, password) {
  const local = await decryptLocalConfig(password);
  if (local) {
    log("configuration déchiffrée depuis le dépôt");
    return local;
  }
  log("blob local inutilisable : recours au NAS");
  try {
    return await fetchConfig(email, password);
  } catch (e) {
    // Le NAS est injoignable et le blob n'a rien donné. Le mot de passe est de
    // très loin l'explication la plus probable : le dire, plutôt que d'envoyer
    // l'utilisateur enquêter sur un NAS dont il n'a pas besoin.
    if (e instanceof ConfigError && e.unreachable) {
      throw new ConfigError("E-mail ou mot de passe incorrect.");
    }
    throw e;
  }
}

async function fetchConfig(email, password) {
  let response;
  try {
    response = await fetch(CONFIG_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password })
    });
  } catch {
    // Panne réseau, NAS éteint, box coupée, filtrage d'entreprise :
    // indistinguables depuis ici. Le drapeau permet à obtainConfig() de
    // reformuler, puisque le blob chiffré a déjà échoué juste avant.
    const error = new ConfigError(
      "Service de configuration injoignable. Si c'est la première connexion sur "
      + "cet appareil, il faut que le NAS soit accessible."
    );
    error.unreachable = true;
    throw error;
  }
  if (response.status === 401) throw new ConfigError("E-mail ou mot de passe incorrect.");
  if (response.status === 429) {
    throw new ConfigError("Trop de tentatives. Réessayer dans un quart d'heure.");
  }
  if (!response.ok) {
    throw new ConfigError("Service de configuration en erreur (" + response.status + ").");
  }
  const data = await response.json();
  if (!data.firebaseConfig) throw new ConfigError("Configuration reçue illisible.");
  return data.firebaseConfig;
}

/* ---------------------------------------------------------------- connexion */

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = $("login-btn");
  const err = $("login-error");
  err.hidden = true;
  btn.disabled = true;
  const email = $("email").value.trim();
  const password = $("password").value;

  try {
    // Première connexion sur cet appareil : il faut d'abord obtenir la
    // configuration, en prouvant qu'on connaît le mot de passe.
    if (!auth) {
      btn.textContent = "Configuration…";
      log("obtention de la configuration…");
      const config = await obtainConfig(email, password);
      localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
      startFirebase(config);
      log("configuration obtenue et mémorisée");
    }

    btn.textContent = "Connexion…";
    // La persistance n'est qu'un confort : rester connecté d'une visite à
    // l'autre. Safari la refuse dans certaines configurations de
    // confidentialité, et ce n'est pas une raison pour empêcher la connexion.
    try {
      await setPersistence(auth, browserLocalPersistence);
      log("persistance activée");
    } catch (e) {
      log("persistance indisponible : " + (e.code || e.message) + " (sans conséquence)");
    }

    log("connexion en cours…");
    await signInWithEmailAndPassword(auth, email, password);
    log("connexion acceptée");
  } catch (e) {
    log("échec : " + (e.code || e.message));
    // Une configuration mémorisée qui ne correspond plus au projet Firebase
    // rendrait la connexion définitivement impossible : on l'oublie pour que la
    // tentative suivante reparte du NAS.
    if (e.code && e.code.startsWith("auth/") && e.code.includes("api-key")) {
      localStorage.removeItem(CONFIG_KEY);
      log("configuration mémorisée invalide : oubliée");
    }
    err.textContent = e instanceof ConfigError ? e.message : loginErrorMessage(e.code);
    err.hidden = false;
  } finally {
    btn.disabled = false;
    btn.textContent = "Se connecter";
  }
});

function loginErrorMessage(code) {
  switch (code) {
    case "auth/invalid-email":
      return "Adresse e-mail mal formée.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "E-mail ou mot de passe incorrect.";
    case "auth/too-many-requests":
      return "Trop de tentatives. Réessayer dans quelques minutes.";
    case "auth/network-request-failed":
      return "Pas de connexion réseau.";
    default:
      return "Connexion impossible (" + code + ").";
  }
}

$("logout-btn").addEventListener("click", async () => {
  localStorage.removeItem(CACHE_KEY);
  ticketCache.clear();
  await signOut(auth);
});

async function handleAuthChange(user) {
  log("état d'authentification : " + (user ? "connecté (" + user.email + ")" : "déconnecté"));
  if (!user) {
    $("password").value = "";
    show("login");
    return;
  }
  show("loading");
  let trip;
  try {
    log("lecture du programme dans Firestore…");
    trip = await loadTrip();
    log("programme lu : " + trip.days.length + " jours");
  } catch (e) {
    console.error(e);
    log("lecture impossible : " + (e.code || e.message));
    const cached = localStorage.getItem(CACHE_KEY);
    if (!cached) {
      show("login");
      $("login-error").textContent = "Données inaccessibles : " + (e.message || e);
      $("login-error").hidden = false;
      return;
    }
    trip = JSON.parse(cached);
    toast("Hors ligne : programme affiché depuis le cache.");
  }

  // Une exception ici laisserait l'écran de chargement tourner indéfiniment,
  // sans rien dire.
  try {
    mountTrip(trip, loadTicket);
    log("programme affiché");
  } catch (e) {
    console.error(e);
    log("affichage impossible : " + e.message);
    show("login");
    $("login-error").textContent = "Affichage impossible : " + e.message;
    $("login-error").hidden = false;
    return;
  }
  show("app");
}

/* ------------------------------------------------------------------ données */

async function loadTrip() {
  const snap = await getDoc(doc(db, "trip", "plan"));
  if (!snap.exists()) throw new Error("le programme n'a pas encore été importé dans Firestore");
  const data = JSON.parse(snap.data().json);
  localStorage.setItem(CACHE_KEY, JSON.stringify(data));
  return data;
}

async function loadTicket(id) {
  if (ticketCache.has(id)) return ticketCache.get(id);

  const metaSnap = await getDoc(doc(db, "tickets", id));
  if (!metaSnap.exists()) throw new Error("billet introuvable");
  const meta = metaSnap.data();

  const partsSnap = await getDocs(query(collection(db, "tickets", id, "parts"), orderBy("index")));
  let b64 = "";
  partsSnap.forEach((part) => { b64 += part.data().b64; });
  if (!b64) throw new Error("billet vide");

  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const url = URL.createObjectURL(new Blob([bytes], { type: meta.mime || "application/pdf" }));
  const entry = { url, filename: meta.filename || id + ".pdf" };
  ticketCache.set(id, entry);
  return entry;
}

/* ----------------------------------------------------------------- démarrage */

// Placé en dernier : startFirebase() déclenche immédiatement handleAuthChange,
// qui a besoin que tout le reste du module soit défini.
//
// Si la configuration a déjà été obtenue sur cet appareil, on redémarre Firebase
// sans rien demander au NAS — c'est ce qui permet au site de fonctionner quand
// le NAS est éteint, et de restaurer la session automatiquement.
const savedConfig = localStorage.getItem(CONFIG_KEY);
if (savedConfig) {
  try {
    startFirebase(JSON.parse(savedConfig));
    log("configuration reprise de la mémoire locale");
  } catch (e) {
    log("configuration mémorisée illisible : " + e.message);
    localStorage.removeItem(CONFIG_KEY);
    show("login");
  }
} else {
  log("aucune configuration mémorisée : première connexion sur cet appareil");
  show("login");
}
