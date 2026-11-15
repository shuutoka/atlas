const host = document.querySelector("#projects");
try {
  const projects = await (await fetch("data/projects.json")).json();
  host.replaceChildren();
  for (const p of projects) {
    const card = document.createElement("article");
    card.className = "project";
    card.innerHTML =
      '<div class="coverText"><span class="kicker"></span><h2></h2><p></p><a class="cta">Explorer l’atlas <b>↗</b></a></div><div class="coverImage"><img alt="Globe terrestre et répartition des repères de la collection"></div>';
    card.querySelector(".kicker").textContent =
      p.total + " fiches géographiques";
    card.querySelector("h2").textContent = p.name;
    card.querySelector("p").textContent = p.description;
    card.querySelector("a").href =
      "atlas.html?atlas=" + encodeURIComponent(p.slug);
    card.querySelector("img").src = p.cover || "assets/collection.webp";
    host.append(card);
  }
} catch (e) {
  host.textContent =
    "Impossible de lire le catalogue. Ouvrez le site avec le lanceur d’aperçu ou via GitHub Pages.";
}
