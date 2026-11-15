export const colors = {
  Actif: "#d53a34",
  Dormant: "#edba28",
  Éteint: "#2976c4",
  Incertain: "#9946af",
  Inconnu: "#202324",
  "À compléter": "#399658",
};
export const shapes = {
  Volcan:
    "M3 24L11 12L13 7L20 7L23 13L30 24Z M10 16L15 10L18 12L20 10L23 16L18 14L15 16L14 13Z",
  Maar: "M16 5a11 11 0 1 0 .01 0Z",
  Montagne: "M2 25L13 8L17 14L21 10L31 25Z",
  Croix: "M8 3L16 11L24 3L29 8L21 16L29 24L24 29L16 21L8 29L3 24L11 16L3 8Z",
  "Source chaude":
    "M4 24Q16 31 28 24L29 20Q16 26 3 20Z M10 20Q4 15 11 7Q9 13 14 16Z M19 20Q13 14 21 3Q18 12 23 15Z",
};
export const filters = {
  status: "Activité",
  incomplete: "Complétude",
  morphology: "Morphologie",
  style: "Style",
  context: "Contexte",
  country: "Pays",
  region: "Région",
  period: "Période",
};
export const labels = {
  country: "Pays",
  region: "Région",
  subregion: "Sous-région",
  altitude: "Altitude",
  status: "Activité",
  kind: "Nature du repère",
  morphology: "Morphologie",
  style: "Style volcanique",
  context: "Contexte",
  age: "Âge",
  period: "Période",
  eruption: "Dernière éruption",
};
export function marker(r) {
  return (
    "data:image/svg+xml," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 32 32"><path fill-rule="evenodd" stroke="#fff9e7" stroke-width="1.8" stroke-linejoin="round" fill="' +
        colors[r.incomplete ? "À compléter" : r.status] +
        '" d="' +
        (shapes[r.kind] || shapes.Croix) +
        '"/></svg>',
    )
  );
}
