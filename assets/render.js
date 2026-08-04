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
let selectedType = "";

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
  renderTypebar();
  renderDay();
}

/** Filtre transversal : voir toutes les visites d'un même type sur l'ensemble du
 *  séjour, pour juger de l'équilibre entre nature, musées et châteaux. */
const FILTERABLE = ["nature", "museum", "castle", "city"];

function renderTypebar() {
  const bar = $("typebar");
  if (!bar) return;
  bar.replaceChildren();

  const counts = new Map();
  trip.days.forEach((day) => day.items.forEach((item) => {
    if (FILTERABLE.includes(item.type)) counts.set(item.type, (counts.get(item.type) || 0) + 1);
  }));

  const chips = [["", "Par jour", trip.days.length]];
  FILTERABLE.forEach((type) => {
    if (counts.has(type)) chips.push([type, TYPE_LABELS[type], counts.get(type)]);
  });

  chips.forEach(([type, label, count]) => {
    const chip = el("button", "typechip");
    chip.type = "button";
    chip.setAttribute("aria-selected", String(type === selectedType));
    chip.append(el("span", null, label));
    chip.append(el("span", "typechip-count", String(count)));
    chip.addEventListener("click", () => {
      selectedType = type;
      renderTypebar();
      renderDay();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    bar.append(chip);
  });

  $("daybar").hidden = Boolean(selectedType);
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
  const panel = $("day-panel");
  panel.replaceChildren();

  if (selectedType) {
    renderFiltered(panel);
    return;
  }

  const day = trip.days[selectedDay];

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
    if (notice.link) {
      const row = el("div", "actions");
      const link = el("a", "btn", notice.link.label);
      link.href = notice.link.url;
      link.target = "_blank";
      link.rel = "noopener";
      row.append(link);
      box.append(row);
    }
    panel.append(box);
  });

  day.items.forEach((item) => panel.append(renderItem(item)));
}

/** Toutes les visites d'un type, sur l'ensemble du séjour, regroupées par jour. */
function renderFiltered(panel) {
  const head = el("div", "day-head");
  head.append(el("h2", null, TYPE_LABELS[selectedType]));
  const matching = trip.days
    .map((day) => ({ day, items: day.items.filter((item) => item.type === selectedType) }))
    .filter((group) => group.items.length);
  const total = matching.reduce((sum, group) => sum + group.items.length, 0);
  head.append(el("p", "day-title",
    total + (total > 1 ? " visites réparties sur " : " visite sur ") +
    matching.length + (matching.length > 1 ? " journées" : " journée")));
  panel.append(head);

  matching.forEach((group) => {
    panel.append(el("h3", "filter-day", group.day.label));
    group.items.forEach((item) => panel.append(renderItem(item)));
  });
}

/** Une étape mal formée ne doit jamais faire disparaître celles qui suivent.
 *  Les cartes sont construites dans une boucle unique : sans ce filet, une
 *  exception l'interrompt et la fin de la journée s'efface en silence — c'est
 *  ainsi que les deux châteaux du 30 août ont disparu, alors que les données
 *  étaient correctes. On isole donc chaque carte, en conservant l'essentiel,
 *  heure et titre, même quand le détail est illisible. */
function renderItem(item) {
  try {
    return buildItem(item);
  } catch (error) {
    console.error("[munich2026] étape illisible :", item && item.title, error);
    const card = el("article", "card");
    const head = el("div", "card-head");
    head.append(el("span", "time", (item && item.time) || ""));
    const titleBox = el("div");
    titleBox.append(el("h3", null, (item && item.title) || "Étape"));
    head.append(titleBox);
    card.append(head);
    card.append(el("div", "warn",
      "⚠️ Le détail de cette étape n'a pas pu s'afficher. L'heure et le titre sont conservés."));
    return card;
  }
}

function buildItem(item) {
  const card = el("article", "card");

  const head = el("div", "card-head");
  head.append(el("span", "time", item.time || ""));
  const titleBox = el("div");
  titleBox.append(el("h3", null, item.title));
  if (item.type) titleBox.append(el("span", "badge " + item.type, TYPE_LABELS[item.type] || item.type));
  head.append(titleBox);
  card.append(head);

  if (item.desc) card.append(el("p", "desc", item.desc));

  // Adresse mise en évidence : elle est faite pour être montrée telle quelle à
  // un chauffeur de taxi ou à un passant, donc écrite en grand, en allemand.
  if (item.address) {
    const box = el("div", "address");
    box.append(el("span", "address-label", item.address.label || "Adresse"));
    if (item.address.name) box.append(el("strong", null, item.address.name));
    (item.address.lines || []).forEach((line) => box.append(el("span", null, line)));
    card.append(box);
  }

  if (item.info) card.append(renderInfo(item.info));

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

/** Horaires, tarifs et durée d'un lieu. Les chiffres viennent des sites
 *  officiels et sont datés de la préparation du voyage : à revérifier sur place
 *  pour un tarif au centime près. */
function renderInfo(info) {
  const box = el("div", "info");
  const rows = [
    ["🕐", info.hours],
    ["💶", info.price],
    ["⏱️", info.duration]
  ];
  rows.forEach(([icon, text]) => {
    if (!text) return;
    const row = el("div", "info-row");
    row.append(el("span", "info-icon", icon));
    row.append(el("span", null, text));
    box.append(row);
  });
  if (info.link) {
    const link = el("a", "info-link", info.link.label || "Site officiel");
    link.href = info.link.url;
    link.target = "_blank";
    link.rel = "noopener";
    box.append(link);
  }
  return box;
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
