const badge = document.querySelector("#alphaBadge"),
  panel = document.createElement("dialog");
panel.innerHTML =
  '<button class="close" type="button">Fermer</button><h2>Biblio-Atlas α</h2><p>Cette édition est en développement. Certaines fiches peuvent être incomplètes ou comporter des erreurs.</p><p>CesiumJS est le moteur recommandé. MapLibre et OpenGlobus sont disponibles à titre expérimental dans le panneau Rendu. La navigation, la netteté et les performances dépendent du moteur et de votre appareil.</p><p>Les fonctions expérimentales évolueront avant la version finale.</p>';
document.body.append(panel);
panel.querySelector("button").onclick = () => panel.close();
badge.onclick = () => panel.showModal();
let seen = false;
try {
  seen = !!localStorage.getItem("biblio-alpha-notice-1");
} catch {}
if (!seen) {
  const bar = document.createElement("aside");
  bar.className = "alphaBar";
  bar.innerHTML =
    "<p>Biblio-Atlas est en version Alpha. Certaines fonctions et données sont encore expérimentales.</p><button>En savoir plus</button><button>Compris</button>";
  document.body.append(bar);
  const dismiss = () => {
    bar.remove();
    try {
      localStorage.setItem("biblio-alpha-notice-1", "1");
    } catch {}
  };
  bar.children[1].onclick = () => {
    dismiss();
    panel.showModal();
  };
  bar.children[2].onclick = dismiss;
}
