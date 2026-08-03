/**
 * Rendu du carnet de voyage. Aucune dépendance à Firebase : ce module reçoit
 * les données déjà chargées, plus une fonction de récupération des billets.
 * C'est ce qui permet de prévisualiser le site en local (private/preview.html)
 * sans projet Firebase.
 */

const $ = (id) => document.getElementById(id);

const TYPE_LABELS = {
  nature: "Nature",
  museum: "Musée",
  castle: "Château",
  city: "Ville",
  food: "Repas",
  transport: "Trajet",
  hotel: "Hôtel",
  memorial: "Mémorial"
};

const MODE_LABELS = {
  transit: "🚇 Transports en commun",
  car: "🚗 En voiture",
  walk: "🚶 À pied",
  train: "🚆 En train"
};

const MAPS_MODES = { transit: "transit", car: "driving", walk: "walking", train: "transit" };

let trip = null;
let loadTicket = async () => { throw new Error("billets indisponibles"); };
let selectedDay = 0;

export function toast(message, ms = 3600) {
  const el = $("toast");
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toast._t);
  toast._t = setTimeout(() => { el.hidden = true; }, ms);
}

/** Affiche le programme. `ticketLoader(id)` doit renvoyer { url, filename }. */
export function mountTrip(data, ticketLoader) {
  trip = data;
  if (ticketLoader) loadTicket = ticketLoader;

  $("trip-title").textContent = trip.meta.title;
  $("trip-sub").textContent = trip.meta.subtitle;
  $("foot-note").textContent = "Source : " + trip.meta.source;

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = trip.days.findIndex((d) => d.date >= today);
  selectedDay = upcoming >= 0 ? upcoming : 0;

  renderDocuments();
  renderDaybar();
  renderDay();
}

/** Documents utiles tout le séjour (plan du réseau…), accessibles depuis
 *  l'en-tête quelle que soit la journée affichée. */
function renderDocuments() {
  const box = $("doc-buttons");
  if (!box) return;
  box.replaceChildren();
  (trip.documents || []).forEach((document_) => {
    const btn = el("button", "ghost-btn", document_.button || document_.label);
    btn.type = "button";
    btn.title = document_.label;
    btn.addEventListener("click", () => openTicket(document_.id, btn));
    box.append(btn);
  });
}

function mapsUrl(travel) {
  const params = new URLSearchParams({
    api: "1",
    origin: travel.from,
    destination: travel.to,
    travelmode: MAPS_MODES[travel.mode] || "transit"
  });
  return "https://www.google.com/maps/dir/?" + params.toString();
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function renderDaybar() {
  const bar = $("daybar");
  bar.replaceChildren();
  trip.days.forEach((day, i) => {
    const chip = el("button", "daychip");
    chip.type = "button";
    chip.setAttribute("aria-selected", String(i === selectedDay));
    const [, month, dayNum] = day.date.split("-");
    chip.append(el("span", null, dayNum + "/" + month));
    const sub = el("small", null, day.weekday.slice(0, 3));
    if (day.kind === "car") {
      sub.append(document.createTextNode(" "));
      sub.append(el("span", "chip-car", "🚗"));
    }
    if (day.items.some((item) => (item.notes || []).length)) {
      sub.append(document.createTextNode(" "));
      sub.append(el("span", "chip-note", "✎"));
    }
    chip.append(sub);
    chip.addEventListener("click", () => {
      selectedDay = i;
      renderDaybar();
      renderDay();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    bar.append(chip);
  });
  const active = bar.children[selectedDay];
  if (active) active.scrollIntoView({ inline: "center", block: "nearest" });
}

function renderDay() {
  const day = trip.days[selectedDay];
  const panel = $("day-panel");
  panel.replaceChildren();

  const head = el("div", "day-head");
  head.append(el("h2", null, day.label));
  head.append(el("p", "day-title", day.title));

  const flags = el("div", "day-flags");
  if (day.kind === "car") flags.append(el("span", "flag car", "🚗 Voiture de location"));
  if (day.kind === "travel") flags.append(el("span", "flag", "🚆 Jour de voyage"));
  if (day.kind === "transit") flags.append(el("span", "flag", "🚇 Transports en commun"));
  head.append(flags);
  panel.append(head);

  (day.notices || []).forEach((notice) => {
    const box = el("div", "notice");
    box.append(el("span", "notice-title", notice.title));
    box.append(el("p", null, notice.body));
    panel.append(box);
  });

  day.items.forEach((item) => panel.append(renderItem(item)));
}

function renderItem(item) {
  const card = el("article", "card");

  const head = el("div", "card-head");
  head.append(el("span", "time", item.time || ""));
  const titleBox = el("div");
  titleBox.append(el("h3", null, item.title));
  if (item.type) titleBox.append(el("span", "badge " + item.type, TYPE_LABELS[item.type] || item.type));
  head.append(titleBox);
  card.append(head);

  if (item.desc) card.append(el("p", "desc", item.desc));
  if (item.warn) card.append(el("div", "warn", "⚠️ " + item.warn));

  (item.notes || []).forEach((note) => {
    const box = el("div", "note");
    box.append(el("span", "note-label", "Note"));
    box.append(document.createTextNode(note));
    card.append(box);
  });

  if (item.travel) card.append(renderTravel(item.travel));

  const actions = el("div", "actions");
  if (item.travel) {
    const link = el("a", "btn primary", "Ouvrir l'itinéraire");
    link.href = mapsUrl(item.travel);
    link.target = "_blank";
    link.rel = "noopener";
    actions.append(link);
  }
  if (item.place) {
    const link = el("a", "btn", "📍 Voir sur la carte");
    link.href = "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(item.place);
    link.target = "_blank";
    link.rel = "noopener";
    actions.append(link);
  }
  if (item.ticketId) {
    const btn = el("button", "btn ticket", "🎫 Billet");
    btn.type = "button";
    btn.addEventListener("click", () => openTicket(item.ticketId, btn));
    actions.append(btn);
  }
  if (actions.children.length) card.append(actions);

  return card;
}

function renderTravel(travel) {
  const box = el("div", "travel");
  const head = el("div", "travel-head");
  head.append(el("span", null, MODE_LABELS[travel.mode] || "Trajet"));
  if (travel.duration) head.append(el("span", "travel-dur", travel.duration));
  box.append(head);
  box.append(el("p", null, travel.summary));
  if (travel.caution) box.append(el("p", "caution", "⚠️ " + travel.caution));
  return box;
}

async function openTicket(id, btn) {
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = "Ouverture…";
  try {
    const { url, filename } = await loadTicket(id);
    const win = window.open(url, "_blank");
    if (!win) {
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
    }
  } catch (e) {
    console.error(e);
    toast("Billet indisponible : " + (e.message || e));
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}
