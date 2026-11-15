const $ = (s) => document.querySelector(s),
  key = location.hash.slice(1) || sessionStorage.atlasKey;
sessionStorage.atlasKey = key;
history.replaceState(null, "", location.pathname);
const el = (tag, text = "") =>
  Object.assign(document.createElement(tag), { textContent: text });
const names = {
  name: "Nom principal",
  aliases: "Noms alternatifs",
  continent: "Continent",
  country: "Pays",
  region: "Région",
  subregion: "Sous-région",
  lat: "Latitude",
  lon: "Longitude",
  altitude: "Altitude (m)",
  status: "Activité",
  kind: "Pictogramme",
  morphology: "Morphologies",
  style: "Styles volcaniques",
  context: "Contextes",
  tags: "Tags",
  age: "Âge",
  period: "Période géologique",
  eruption: "Dernière éruption",
  description: "Description publique",
  notes: "Notes internes",
  published: "Publiée",
  review: "À vérifier",
  incomplete: "À compléter",
  parent: "Fiche parente",
};
const enums = {
  status: ["Actif", "Dormant", "Éteint", "Incertain", "Inconnu"],
  kind: ["Volcan", "Maar", "Montagne", "Croix", "Source chaude"],
};
const arrays = ["aliases", "morphology", "style", "context", "tags"],
  flags = ["published", "review", "incomplete"],
  numbers = ["lat", "lon", "altitude"];
let rows = [],
  current = null,
  visible = [],
  chosen = new Set(),
  timer,
  dirty = false;
const confirmLeave = () =>
  !dirty || confirm("Abandonner les modifications de cette fiche ?");
window.onbeforeunload = (e) => {
  if (dirty) {
    e.preventDefault();
    e.returnValue = "";
  }
};
const norm = (v) =>
  String(v ?? "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase();
async function api(cmd, params = {}) {
  const res = await fetch("/api", {
    method: "POST",
    headers: { "X-Atlas-Key": key, "Content-Type": "application/json" },
    body: JSON.stringify({ cmd, ...params }),
  });
  const out = await res.json();
  if (!res.ok) throw Error(out.error || "Action impossible");
  return out.value;
}
function notice(s) {
  $("#notice").textContent = s;
  clearTimeout(timer);
  timer = setTimeout(() => ($("#notice").textContent = ""), 7000);
}
window.onunhandledrejection = (e) =>
  notice(e.reason.message || String(e.reason));
function btn(text, fn) {
  const b = el("button", text);
  b.type = "button";
  b.onclick = fn;
  return b;
}
function opt(v, label = v) {
  return new Option(label, v);
}
function modal(title) {
  const d = $("#dialogBody");
  d.replaceChildren(el("h2", title));
  if (!$("#dialog").open) $("#dialog").showModal();
  return d;
}
$("#close").onclick = () => $("#dialog").close();
async function refresh() {
  rows = await api("list");
  chosen = new Set([...chosen].filter((id) => rows.some((r) => r.id === id)));
  render();
}
function render() {
  const q = norm($("#search").value),
    f = $("#filter").value;
  visible = rows.filter(
    (r) =>
      norm(
        [
          r.id,
          r.name,
          r.country,
          r.region,
          ...r.aliases,
          ...r.tags,
          r.status,
          ...r.morphology,
          ...r.context,
          ...r.style,
        ].join(" "),
      ).includes(q) &&
      (!f ||
        {
          Publiées: r.published,
          Brouillons: !r.published,
          "À vérifier": r.review,
          "À compléter": r.incomplete,
          "Sans nom": !r.name,
        }[f]),
  );
  $("#count").textContent =
    visible.length + " fiches · " + chosen.size + " sélectionnées";
  $("#all").checked =
    visible.length > 0 && visible.every((r) => chosen.has(r.id));
  const list = $("#list"),
    groups = new Map(),
    expanded = new Set(
      [...list.querySelectorAll("details[open]")].map((d) => d.dataset.group),
    );
  list.replaceChildren();
  for (const r of visible) {
    let title = [r.country || "Pays à préciser", r.region]
        .filter(Boolean)
        .join(" / "),
      g = groups.get(title);
    if (!g) {
      g = el("details");
      g.dataset.group = title;
      g.open = expanded.has(title) || !!q;
      g.append(el("summary", title));
      groups.set(title, g);
      list.append(g);
    }
    let line = el("div");
    line.className = "row" + (current?.id === r.id ? " on" : "");
    const c = el("input");
    c.type = "checkbox";
    c.checked = chosen.has(r.id);
    c.ariaLabel = "Sélectionner " + r.id;
    c.onchange = () => {
      if (c.checked) chosen.add(r.id);
      else chosen.delete(r.id);
      render();
    };
    let b = btn((r.parent_id ? "↳ " : "") + (r.name || "Sans nom"), () => {
      if (confirmLeave()) openRecord(r.id);
    });
    b.append(el("small", r.id + (r.published ? "" : " · Brouillon")));
    line.append(c, b);
    g.append(line);
  }
}
$("#search").oninput = render;
$("#filter").onchange = render;
$("#all").onchange = (e) => {
  for (const r of visible) {
    if (e.target.checked) chosen.add(r.id);
    else chosen.delete(r.id);
  }
  render();
};
function field(k, v, host) {
  const label = el("label", names[k]),
    input = el(
      enums[k] || k === "parent"
        ? "select"
        : ["description", "notes"].includes(k)
          ? "textarea"
          : "input",
    );
  input.name = k;
  if (enums[k]) input.append(...enums[k].map((x) => opt(x)));
  if (k === "parent")
    input.append(
      opt("", "Élément principal"),
      ...rows
        .filter((x) => x.id !== current?.id && !x.parent_id)
        .map((x) => opt(x.id, (x.name || "Sans nom") + " · " + x.id)),
    );
  if (flags.includes(k)) {
    input.type = "checkbox";
    input.checked = !!v;
    label.prepend(input);
  } else {
    if (numbers.includes(k)) {
      input.type = "number";
      input.step = "any";
    }
    input.value = Array.isArray(v) ? v.join(", ") : (v ?? "");
    if (arrays.includes(k))
      input.placeholder = "Valeurs séparées par des virgules";
    label.append(input);
  }
  host.append(label);
  return input;
}
function value(k, i) {
  return flags.includes(k)
    ? i.checked
    : numbers.includes(k)
      ? i.value === ""
        ? null
        : Number(i.value)
      : arrays.includes(k)
        ? i.value
            .split(",")
            .map((s) => s.trim())
            .filter(Boolean)
        : i.value;
}
function mediaFields(host, k, values) {
  const wrap = el("fieldset"),
    list = el("div"),
    entries = [];
  wrap.append(el("legend", k === "sources" ? "Sources" : "Images"), list);
  host.append(wrap);
  function add(item) {
    let line = el("div");
    line.className = "entry";
    let data = { ...item };
    let labels =
      k === "sources"
        ? {
            title: "Titre",
            url: "URL",
            author: "Auteur ou organisme",
            note: "Note",
          }
        : {
            url: "URL ou chemin du média",
            caption: "Légende",
            credit: "Crédit",
          };
    for (const [key, hint] of Object.entries(labels)) {
      let l = el("label", hint),
        i = el("input");
      i.value = data[key] || "";
      i.oninput = () => (data[key] = i.value);
      l.append(i);
      line.append(l);
    }
    line.append(
      btn("Retirer", () => {
        entries.splice(entries.indexOf(data), 1);
        line.remove();
        dirty = true;
      }),
    );
    entries.push(data);
    list.append(line);
  }
  values.forEach(add);
  wrap.append(
    btn(k === "sources" ? "Ajouter une source" : "Ajouter une URL", () => {
      add({});
      dirty = true;
    }),
  );
  if (k === "images") {
    let i = el("input");
    i.type = "file";
    i.accept = "image/jpeg,image/png,image/webp,image/gif";
    i.onchange = async () => {
      if (i.files[0]) {
        const url = await api("media", { raw: await as64(i.files[0]) });
        add({ url });
        dirty = true;
      }
    };
    let l = el("label", "Joindre une image locale");
    l.append(i);
    wrap.append(l);
  }
  return () => entries.filter((x) => Object.values(x).some(Boolean));
}
async function openRecord(id, parent) {
  const r = id
    ? await api("detail", { id })
    : {
        parent_id: parent,
        status: "Inconnu",
        kind: "Volcan",
        review: true,
        incomplete: true,
      };
  current = r;
  dirty = false;
  render();
  const host = $("#editor");
  host.replaceChildren(
    el("small", r.id || "NOUVELLE FICHE"),
    el("h2", r.name || (id ? "Repère sans nom" : "Créer un élément")),
  );
  const form = el("form");
  host.append(form);
  form.oninput = () => (dirty = true);
  let controls = {};
  for (const [label, keys] of Object.entries({
    Identité: ["name", "aliases", "parent"],
    Localisation: [
      "continent",
      "country",
      "region",
      "subregion",
      "lat",
      "lon",
      "altitude",
    ],
    Classification: [
      "kind",
      "status",
      "morphology",
      "style",
      "context",
      "tags",
    ],
    Chronologie: ["age", "period", "eruption"],
    Rédaction: ["description", "notes"],
    Administration: ["published", "review", "incomplete"],
  })) {
    const fs = el("fieldset"),
      grid = el("div");
    grid.className = "grid";
    fs.append(el("legend", label), grid);
    form.append(fs);
    for (const k of keys)
      controls[k] = field(k, k === "parent" ? r.parent_id : r[k], grid);
  }
  const sources = mediaFields(form, "sources", r.sources || []),
    images = mediaFields(form, "images", r.images || []);
  if (r.legacy?.candidates && Object.keys(r.legacy.candidates).length) {
    const fs = el("fieldset");
    fs.append(el("legend", "Valeurs proposées par le KML"));
    const targets = {
      âge: "age",
      "dernière éruption": "eruption",
      type: "morphology",
      altitude: "altitude",
      activité: "status",
    };
    for (const [source, values] of Object.entries(r.legacy.candidates))
      for (const raw of values) {
        const line = el("div", source + " · " + raw + " "),
          target = targets[source];
        let v = raw;
        if (target === "altitude") {
          const m = /^(-?[\d ]+(?:[.,]\d+)?)\s*m?$/.exec(raw);
          v = m ? Number(m[1].replaceAll(" ", "").replace(",", ".")) : null;
        }
        if (target === "status")
          v = enums.status.find((x) => norm(x) === norm(raw));
        if (target && v != null && !/^(n\/?a|inconnu[e]?|\?)$/i.test(raw))
          line.append(
            btn("Reprendre", () => {
              if (
                controls[target].value &&
                !confirm(
                  "Remplacer la valeur actuelle de " + names[target] + " ?",
                )
              )
                return;
              controls[target].value = v;
              dirty = true;
              notice(
                "Valeur reprise. Enregistrez la fiche après vérification.",
              );
            }),
          );
        fs.append(line);
      }
    form.append(fs);
  }
  if (r.legacy) {
    const det = el("details"),
      pre = el("pre", JSON.stringify(r.legacy, null, 2));
    det.append(
      el("summary", "Provenance · suggestions et données originales"),
      pre,
    );
    form.append(det);
  }
  const bar = el("div");
  bar.className = "actions";
  let submit = el("button", "Enregistrer");
  submit.className = "primary";
  bar.append(submit);
  form.append(bar);
  form.onsubmit = async (e) => {
    e.preventDefault();
    let data = Object.fromEntries(
      Object.entries(controls)
        .filter(([k]) => k !== "parent")
        .map(([k, i]) => [k, value(k, i)]),
    );
    data.sources = sources();
    data.images = images();
    const saved = await api(id ? "save" : "create", {
      id,
      updated: r.updated,
      parent: controls.parent.value || null,
      data,
    });
    dirty = false;
    await refresh();
    await openRecord(saved);
    notice("Fiche enregistrée · " + saved);
  };
  if (id) {
    bar.append(
      btn("Dupliquer", async () => {
        if (!confirmLeave()) return;
        const n = await api("duplicate", { id });
        await refresh();
        await openRecord(n);
      }),
    );
    if (!r.parent_id)
      bar.append(
        btn("Ajouter un sous-édifice", () => {
          if (confirmLeave()) openRecord(null, id);
        }),
      );
    bar.append(
      btn("Supprimer", async () => {
        if (confirm("Supprimer " + id + " ?")) {
          await api("delete", { id });
          current = null;
          dirty = false;
          await refresh();
          host.replaceChildren(el("h2", "Fiche supprimée"));
        }
      }),
    );
  }
  host.scrollTop = 0;
}
$("#new").onclick = () => {
  if (confirmLeave()) openRecord();
};
$("#bulk").onclick = () => {
  if (!chosen.size) return notice("Sélectionnez des fiches dans la liste.");
  if (!confirmLeave()) return;
  const host = modal("Modifier " + chosen.size + " fiches"),
    select = el("select"),
    area = el("div");
  let input;
  const options = [
    "country",
    "region",
    "status",
    "morphology",
    "style",
    "context",
    "published",
    "review",
    "incomplete",
  ];
  select.append(...options.map((k) => opt(k, names[k])));
  host.append(select, area);
  select.onchange = () => {
    area.replaceChildren();
    input = field(select.value, enums[select.value]?.[0], area);
  };
  select.onchange();
  host.append(
    btn("Appliquer à la sélection", async () => {
      if (!confirm("Remplacer ce champ sur " + chosen.size + " fiches ?"))
        return;
      await api("bulk", {
        ids: [...chosen],
        patch: { [select.value]: value(select.value, input) },
      });
      $("#dialog").close();
      await refresh();
      if (current?.id) await openRecord(current.id);
      notice("Sélection mise à jour.");
    }),
  );
};
function as64(f) {
  if (f.size > 46 * 1024 * 1024)
    throw Error("Fichier trop volumineux (46 Mo maximum).");
  return new Promise((ok, no) => {
    let r = new FileReader();
    r.onerror = no;
    r.onload = () => ok(r.result.split(",")[1]);
    r.readAsDataURL(f);
  });
}
function report(r) {
  const host = modal("Rapport d’import");
  host.append(
    el(
      "p",
      r.detected +
        " repères détectés · " +
        r.inserted +
        " ajoutés à cet import · " +
        r.errors.length +
        " erreurs",
    ),
    el("p", r.alreadyImported ? "Ce fichier a déjà été importé." : ""),
    el("pre", JSON.stringify(r, null, 2)),
  );
}
$("#reports").onclick = async () => {
  let reports = await api("reports"),
    h = modal("Historique des imports");
  reports.forEach((r, i) =>
    h.append(
      btn(
        "Import " + (reports.length - i) + " · " + r.detected + " repères",
        () => report(r),
      ),
    ),
  );
};
$("#import").onclick = () => $("#file").click();
$("#file").onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = "";
  if (f) {
    const r = await api("import", { raw: await as64(f), name: f.name });
    await refresh();
    report(r);
  }
};
$("#export").onclick = async () => {
  const path = await api("export"),
    h = modal("Export terminé");
  h.append(
    el(
      "p",
      "Remplacez le dossier data du site par ce dossier, puis faites votre commit dans GitHub Desktop.",
    ),
    el("pre", path),
  );
};
refresh();
