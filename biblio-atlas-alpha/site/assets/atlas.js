import { RenderLab } from "./render-lab.js";
const $ = (s) => document.querySelector(s),
  el = (tag, txt = "") =>
    Object.assign(document.createElement(tag), { textContent: txt }),
  button = (s, fn) => {
    const b = el("button", s);
    b.type = "button";
    b.onclick = fn;
    return b;
  };
const cfg = window.ATLAS_SETTINGS,
  slug = new URLSearchParams(location.search).get("atlas") || "volcans";
let schema,
  project,
  base,
  rows = [],
  matches = [],
  lab,
  tree,
  grouped = true,
  current,
  parent,
  serial = 0,
  visibleLimit = 1000;
const norm = (s) =>
  String(s ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
const label = (r) => r.name || "Repère sans nom · " + r.id;
const byName = (a, b) => label(a).localeCompare(label(b), "fr");
const schemas = { "volcan-v1": () => import("./volcan-v1.js") };
const status = (s) => ($("#mapState").textContent = s);
function modal(title) {
  const d = $("#content");
  d.replaceChildren(el("h2", title));
  if (!$("#modal").open) $("#modal").showModal();
  return d;
}
$("#dismiss").onclick = () => $("#modal").close();
$("#showList").onclick = () => $("#panel").classList.add("show");
$("#hideList").onclick = () => $("#panel").classList.remove("show");
async function json(path) {
  const r = await fetch(path);
  if (!r.ok) throw Error("Fichier indisponible : " + path);
  return r.json();
}
function filterValue(r, k) {
  return k === "incomplete"
    ? r.incomplete
      ? "À compléter"
      : "Autres fiches"
    : r[k];
}
function buildFilters() {
  for (const [k, title] of Object.entries(schema.filters)) {
    const l = el("label", title),
      s = el("select");
    s.dataset.key = k;
    s.append(new Option("Tous", ""));
    const values = Array.from(
      new Set(rows.flatMap((r) => filterValue(r, k) || [])),
    ).sort((a, b) => a.localeCompare(b, "fr"));
    values.forEach((v) => s.append(new Option(v, v)));
    s.onchange = filter;
    l.append(s);
    $("#filters").append(l);
  }
  for (const [s, c] of Object.entries(schema.colors)) {
    const wrap = el("span", s),
      dot = el("i");
    dot.className = "dot";
    dot.style.background = c;
    wrap.prepend(dot);
    $("#legend").append(wrap);
  }
  for (const kind of Object.keys(schema.shapes)) {
    const span = el("span", kind),
      im = el("img");
    im.src = schema.marker({ kind, status: "Inconnu" });
    im.width = 18;
    im.style.verticalAlign = "middle";
    span.prepend(im);
    $("#shapes").append(span);
  }
}
function filter() {
  const words = norm($("#q").value).trim().split(/\s+/).filter(Boolean),
    filters = [...document.querySelectorAll("#filters select")].filter(
      (s) => s.value,
    );
  matches = rows.filter(
    (r) =>
      words.every((w) => r.search.includes(w)) &&
      filters.every((s) =>
        [filterValue(r, s.dataset.key)].flat().includes(s.value),
      ),
  );
  visibleLimit = 1000;
  renderList();
  if (current && !matches.some((r) => r.id === (parent || current).id))
    closeCard();
  tree = new Supercluster({ radius: 52, maxZoom: 16, minPoints: 2 }).load(
    matches.map((r) => ({
      type: "Feature",
      properties: { id: r.id },
      geometry: { type: "Point", coordinates: [r.lon, r.lat] },
    })),
  );
  lab?.setCollection(tree, matches, grouped);
}
function renderList() {
  const host = $("#results");
  host.replaceChildren();
  $("#total").textContent = matches.length + " éléments principaux";
  const groups = new Map();
  for (const r of matches.slice(0, visibleLimit)) {
    const levels = [
      r.continent || "Continent à préciser",
      r.country || "Pays à préciser",
      r.region,
      r.subregion,
    ].filter(Boolean);
    let owner = host;
    const path = [];
    for (const part of levels) {
      path.push(part);
      const key = JSON.stringify(path);
      if (!groups.has(key)) {
        const group = el("details");
        group.open =
          Boolean($("#q").value) || matches.length <= 30 || levels.length === 1;
        group.append(el("summary", part));
        owner.append(group);
        groups.set(key, group);
      }
      owner = groups.get(key);
    }
    const b = button(label(r), () => openCard(r.id, true));
    b.className = "result";
    b.append(
      el("small", r.id + " · " + (r.incomplete ? "À compléter" : r.status)),
    );
    owner.append(b);
  }
  if (matches.length > visibleLimit)
    host.append(
      button("Afficher les suivants", () => {
        visibleLimit += 100;
        renderList();
      }),
    );
  if (!matches.length)
    host.append(el("p", "Aucun repère pour cette recherche."));
}
$("#q").oninput = filter;
$("#reset").onclick = () => {
  $("#q").value = "";
  $("#filters select")?.blur();
  document.querySelectorAll("#filters select").forEach((s) => (s.value = ""));
  filter();
};
const lookup = new Map();
async function initGlobe() {
  lab = new RenderLab(schema, (item) => {
    if (!item.count) {
      openCard(
        item.key,
        false,
        lookup.has(item.key) ? null : parent || current,
      );
      return;
    }
    const leaves = tree.getLeaves(item.cluster, Infinity),
      z = tree.getClusterExpansionZoom(item.cluster);
    if (
      z > 16 ||
      leaves.every(
        (f) =>
          f.geometry.coordinates.join() ===
          leaves[0].geometry.coordinates.join(),
      )
    ) {
      const host = modal("Repères de ce groupe");
      for (const f of leaves) {
        const r = lookup.get(f.properties.id);
        host.append(
          button(label(r), () => {
            $("#modal").close();
            openCard(r.id, true);
          }),
        );
      }
    } else lab.focus(item.lon, item.lat, z + 0.4);
  });
  lab.setCollection(tree, matches, grouped);
  await lab.start();
}
$("#world").onclick = () => lab?.world();
$("#clusters").onclick = () => {
  grouped = !grouped;
  $("#clusters").setAttribute("aria-pressed", grouped);
  $("#clusters").textContent = "Groupes · " + (grouped ? "ON" : "OFF");
  lab?.setCollection(tree, matches, grouped);
};
function closeCard() {
  serial++;
  current = parent = null;
  $("#detail").hidden = true;
  lab?.selectFeature(null, []);
}
function safe(url, media = false) {
  if (media && /^media\/[a-f0-9]{64}\.(png|jpe?g|webp|gif)$/.test(url))
    return base + "/" + url;
  try {
    const u = new URL(url);
    if (["http:", "https:"].includes(u.protocol)) return u.href;
  } catch {}
  return "";
}
async function openCard(id, fly, ancestor = null) {
  const request = ++serial;
  let r;
  try {
    r = await json(base + "/fiches/" + encodeURIComponent(id) + ".json");
  } catch (e) {
    if (request === serial) status(e.message);
    return;
  }
  if (request !== serial) return;
  current = r;
  parent = ancestor;
  $("#panel").classList.remove("show");
  const host = $("#detail");
  host.hidden = false;
  host.classList.remove("compactCard");
  host.scrollTop = 0;
  host.replaceChildren();
  const b = button("×", closeCard);
  b.className = "close";
  b.ariaLabel = "Fermer la fiche";
  host.append(b, el("small", r.id), el("h2", label(r)));
  const relief = button("Vue relief", () => {
    host.classList.add("compactCard");
    lab?.relief(r);
  });
  relief.className = "reliefAction";
  host.append(
    relief,
    button("Développer la fiche", () => host.classList.remove("compactCard")),
  );
  host.lastElementChild.className = "expandCard";
  if (r.aliases.length) host.append(el("p", r.aliases.join(" · ")));
  if (r.review || r.incomplete)
    host.append(
      el(
        "small",
        [r.review ? "À vérifier" : "", r.incomplete ? "À compléter" : ""]
          .filter(Boolean)
          .join(" · "),
      ),
    );
  const dl = el("dl");
  for (const [k, title] of Object.entries(schema.labels)) {
    let v = r[k];
    if (Array.isArray(v)) v = v.join(", ");
    dl.append(
      el("dt", title),
      el(
        "dd",
        v === "" || v == null
          ? "Non renseigné"
          : String(v) + (k === "altitude" ? " m" : ""),
      ),
    );
  }
  dl.append(
    el("dt", "Coordonnées"),
    el("dd", r.lat.toFixed(5) + "°, " + r.lon.toFixed(5) + "°"),
  );
  host.append(dl);
  if (r.description) {
    const p = el("p", r.description);
    p.className = "bodyText";
    host.append(p);
  }
  for (const im of r.images) {
    const url = safe(im.url, true);
    if (!url) continue;
    const f = el("figure"),
      image = el("img");
    image.className = "detailImg";
    image.loading = "lazy";
    image.referrerPolicy = "no-referrer";
    image.alt = im.caption || "Image associée à " + label(r);
    image.onerror = () => image.replaceWith(el("small", "Image indisponible"));
    image.src = url;
    f.append(
      image,
      el("figcaption", [im.caption, im.credit].filter(Boolean).join(" · ")),
    );
    host.append(f);
  }
  if (r.sources.length) {
    host.append(el("h3", "Sources"));
    const ul = el("ul");
    ul.className = "sources";
    for (const s of r.sources) {
      const li = el("li"),
        url = safe(s.url),
        a = url ? el("a", s.title || s.url) : el("span", s.title || "Source");
      if (url) {
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
      }
      li.append(
        a,
        el("small", " " + [s.author, s.note].filter(Boolean).join(" · ")),
      );
      ul.append(li);
    }
    host.append(ul);
  }
  const family = ancestor || r;
  lab?.selectFeature(r, ancestor ? family.children || [] : []);
  if (r.children.length) {
    const branch = el("details");
    branch.append(el("summary", "Sous-édifices (" + r.children.length + ")"));
    branch.ontoggle = () => {
      if (current === r) lab?.selectFeature(r, branch.open ? r.children : []);
    };
    const list = el("div");
    list.className = "detailsList";
    for (const c of r.children)
      list.append(button(label(c), () => openCard(c.id, true, r)));
    branch.append(list);
    host.append(branch);
  }
  if (ancestor)
    host.append(
      button("↰ " + label(ancestor), () => openCard(ancestor.id, true)),
    );
  host.append(
    el("hr"),
    button("Signaler une erreur sur cette fiche", () => form(r)),
  );
  if (fly) lab?.focus(r.lon, r.lat, ancestor ? 12.5 : 10);
}
function form(r) {
  const host = modal(r ? "Signaler une erreur" : "Proposer un volcan"),
    f = el("form");
  if (r) host.append(el("p", r.id + " · " + label(r)));
  const fields = r
    ? {
        commentaire: "Correction proposée",
        sources: "Sources",
        email: "E-mail facultatif",
      }
    : {
        nom: "Nom du volcan",
        localisation: "Localisation",
        latitude: "Latitude",
        longitude: "Longitude",
        type: "Type supposé",
        statut: "Statut supposé",
        description: "Description",
        sources: "Sources",
        commentaire: "Commentaire",
        email: "E-mail facultatif",
      };
  for (const [k, title] of Object.entries(fields)) {
    const l = el("label", title),
      i = el(
        ["description", "commentaire", "sources"].includes(k)
          ? "textarea"
          : "input",
      );
    i.name = k;
    i.required = k === "nom" || (r && k === "commentaire");
    if (k === "email") i.type = "email";
    if (["latitude", "longitude"].includes(k)) {
      i.type = "number";
      i.step = "any";
      i.max = k === "latitude" ? 90 : 180;
      i.min = -i.max;
    }
    l.append(i);
    f.append(l);
  }
  const trap = el("input");
  trap.name = "_gotcha";
  trap.tabIndex = -1;
  trap.setAttribute("aria-hidden", "true");
  trap.className = "hiddenTrap";
  trap.autocomplete = "off";
  f.append(trap);
  const send = el("button", "Envoyer pour vérification"),
    feedback = el("p");
  feedback.setAttribute("role", "status");
  f.append(send, feedback);
  host.append(f);
  if (!cfg.formEndpoint) {
    send.disabled = true;
    feedback.textContent =
      "La réception des contributions sera disponible après configuration par le responsable de l’atlas.";
  }
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (!cfg.formEndpoint || trap.value) return;
    send.disabled = true;
    try {
      const payload = new FormData(f);
      payload.append("atlas", slug);
      payload.append("fiche", r?.id || "");
      payload.append("objet", r ? "Correction" : "Proposition");
      const res = await fetch(cfg.formEndpoint, {
        method: "POST",
        headers: { Accept: "application/json" },
        body: payload,
      });
      if (!res.ok) throw Error();
      f.replaceChildren(
        el("p", "Merci. Votre contribution a été transmise pour vérification."),
      );
    } catch {
      feedback.textContent = "Échec de l’envoi. Votre saisie est conservée.";
      send.disabled = false;
    }
  };
}
$("#propose").onclick = () => form(null);
try {
  project = (await json("data/projects.json")).find((x) => x.slug === slug);
  if (!project || !schemas[project.schema]) throw Error("Atlas indisponible.");
  schema = await schemas[project.schema]();
  base = "data/" + encodeURIComponent(slug);
  $("#title").textContent = project.name;
  rows = await json(base + "/index.json");
  rows.sort(
    (a, b) =>
      [a.continent, a.country, a.region, a.subregion]
        .join("/")
        .localeCompare(
          [b.continent, b.country, b.region, b.subregion].join("/"),
          "fr",
        ) || byName(a, b),
  );
  for (const r of rows) {
    lookup.set(r.id, r);
    r.search = norm(
      [
        r.id,
        r.name,
        r.country,
        r.region,
        r.subregion,
        r.kind,
        r.status,
        ...r.aliases,
        ...r.morphology,
        ...r.style,
        ...r.context,
        ...r.tags,
      ].join(" "),
    );
  }
  buildFilters();
  filter();
  await initGlobe();
} catch (e) {
  status(e.message);
}
