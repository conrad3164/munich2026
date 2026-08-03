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

// Signale que le module a bien été chargé (voir le garde-fou dans index.html).
document.documentElement.dataset.appReady = "1";

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const CACHE_KEY = "munich2026.plan";
const $ = (id) => document.getElementById(id);
const screens = { login: $("screen-login"), loading: $("screen-loading"), app: $("screen-app") };
const ticketCache = new Map();

function show(name) {
  for (const [key, el] of Object.entries(screens)) el.hidden = key !== name;
}

/* ---------------------------------------------------------------- connexion */

$("login-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const btn = $("login-btn");
  const err = $("login-error");
  err.hidden = true;
  btn.disabled = true;
  btn.textContent = "Connexion…";
  try {
    await setPersistence(auth, browserLocalPersistence);
    await signInWithEmailAndPassword(auth, $("email").value.trim(), $("password").value);
  } catch (e) {
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
  if (!user) {
    $("password").value = "";
    show("login");
    return;
  }
  show("loading");
  let trip;
  try {
    trip = await loadTrip();
  } catch (e) {
    console.error(e);
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
  mountTrip(trip, loadTicket);
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
