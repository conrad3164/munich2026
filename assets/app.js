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
import { firebaseConfig } from "../firebase-config.js";
import { mountTrip, toast } from "./render.js";

// Les SDK sont chargés : on rend le formulaire utilisable et on désamorce le
// garde-fou d'index.html.
document.documentElement.dataset.appReady = "1";
const loginButton = document.getElementById("login-btn");
loginButton.disabled = false;
loginButton.textContent = "Se connecter";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

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

/* ---------------------------------------------------------------- connexion */

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = $("login-btn");
  const err = $("login-error");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Connexion…";
  // La persistance n'est qu'un confort : rester connecté d'une visite à
  // l'autre. Safari la refuse dans certaines configurations de confidentialité,
  // et ce n'est pas une raison pour empêcher la connexion.
  try {
    await setPersistence(auth, browserLocalPersistence);
    log("persistance activée");
  } catch (e) {
    log("persistance indisponible : " + (e.code || e.message) + " (sans conséquence)");
  }

  try {
    log("connexion en cours…");
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
    log("connexion acceptée");
  } catch (e) {
    log("connexion refusée : " + (e.code || e.message));
    err.textContent = loginErrorMessage(e.code);
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

onAuthStateChanged(auth, async (user) => {
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
});

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
