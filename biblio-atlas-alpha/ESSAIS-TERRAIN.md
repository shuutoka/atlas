# Essais de terrain sur l’Etna · Alpha 1.1.0-alpha.3

## Reproduire le cadrage sur Windows

1. Ouvrir **Apercu-site.cmd**. Rechercher **Etna**, ouvrir la fiche **VOL-000403**, puis **Vue relief**.
2. Dans **Rendu**, choisir **Re:Earth / Mapterhorn**, une seule imagerie et **Automatique**. Activer **Mesures techniques**. Le panneau donne le cap, l’inclinaison ou le pitch selon le moteur, le canvas et les images effectivement rendues.
3. Choisir le moteur suivant. Cliquer à nouveau sur **Vue relief** pour retrouver un cap de 32°, une inclinaison de 70° et un zoom de 10,8. Si la fiche est réduite, cliquer sur **Développer la fiche**. Fermer les réglages pour libérer la carte. Attendre l’affinement des tuiles.
4. Faire un glisser droit sur le massif avec MapLibre ou OpenGlobus. Alterner **Sans relief** et **Re:Earth / Mapterhorn** à imagerie, caméra et qualité identiques. Pour tester tout le catalogue, effacer le filtre de recherche et comparer les groupes ON/OFF.

La caméra libre, le curseur, les chevrons et le nord fonctionnent sur les trois moteurs. La valeur du curseur est une fraction entre 0 et 1. MapLibre la convertit en pitch natif positif. OpenGlobus calcule l’œil et le vecteur haut autour de la cible dans le repère local est/nord/verticale. Cesium convertit l’orbite en angle négatif pour HeadingPitchRange.

## Protocole mesuré

Chromium sous Linux, SwiftShader (WebGL logiciel), canvas 640 × 400, DPR 1. Une seule instance active pour chaque mesure. Coordonnées 14,996917° E et 37,753710° N. La caméra oscille autour du cap de 32° sur une amplitude de 8°, à 70° d’inclinaison. Les résultats sont les médianes de trois séquences d’environ trois secondes par étape. La résolution, la méthode de déplacement de caméra et les tuiles d’élévation sont maintenues entre étapes d’un même moteur.

Le profil progressif utilise le fond physique local lors de l’étape imagerie. Les tuiles d’altitude réelles sont servies par un relais local avec cache disque. Une deuxième vérification visuelle emploie le satellite Sentinel-2 du site. Les deux moteurs montrent le flanc de l’Etna et l’arrière-plan jusqu’à la côte. MapLibre signale un globe effectivement sphérique à ce zoom et une altitude DEM d’environ 3 260 m au point sélectionné. OpenGlobus renvoie environ 3 355 m. Les encodages, référentiels verticaux et niveaux d’échantillonnage diffèrent.

## Charge du terrain et des repères

Cadence et irrégularité mesurées en profil **Automatique**. « P95 » est le 95ᵉ centile des intervalles entre deux mises à jour de caméra demandées via requestAnimationFrame. Une valeur élevée correspond à une interaction saccadée.

| Étape cumulative | MapLibre images/s | P95 (ms) | OpenGlobus images/s | P95 (ms) |
|---|---:|---:|---:|---:|
| Globe sans relief, sans imagerie ni repères | 33,0 | 50 | 18,4 | 67 |
| Terrain seul | 3,1 | 367 | 13,3 | 100 |
| Terrain + une imagerie | 3,0 | 650 | 12,5 | 117 |
| Avec les 699 repères individuels | 2,5 | 558 | 13,2 | 83 |
| Avec regroupement des édifices principaux | 3,0 | 763 | 12,9 | 100 |
| Page Biblio-Atlas complète, groupes actifs | 3,2 | 417 | 12,7 | 100 |

Les 699 repères constituent un essai de charge. Dans le site, 677 édifices principaux entrent dans l’index, avec 22 sous-édifices disponibles sur ouverture des familles. La ligne « groupes » remplace les 699 points par les résultats Supercluster sur les édifices principaux. La ligne « interface » utilise la vraie page avec son répertoire, sa fiche, ses contrôles et le suivi de caméra, dans une session distincte.

MapLibre présente sa première baisse marquée à l’activation du DEM, avant tout ajout de marqueurs. OpenGlobus demande davantage de tuiles pendant l’affinement du relief. Au cours d’un premier passage sur le relais sans cache préparé, de nouvelles requêtes DEM continuaient pendant les étapes imagerie et repères. Après chargement, les variations de cadence associées aux marqueurs OpenGlobus sont faibles dans cet essai. Les mesures ne permettent pas d’attribuer les blocages d’un PC Windows au réseau, à son pilote ou à une seule fonction du moteur.

## Essai isolé sur le maillage MapLibre

Avec la même caméra, les mêmes tuiles DEM de 512 pixels et la même imagerie, remplacer 128 divisions par côté par 64 a fait passer la médiane de **2,6 à 4,5 images/s** sans marqueurs, puis de **2,3 à 5,3 images/s** avec le catalogue regroupé. Les fenêtres individuelles ont donné des résultats variables. Le profil **Performance** permet de tester la grille de 64 sur Windows. **Automatique** et **Haute** conservent les 128 divisions natives. La grille plus grossière réduit la finesse géométrique disponible dans chaque tuile. L’encodage, la résolution du DEM et l’exagération restent identiques.

## Paramètres et requêtes

| Élément | MapLibre GL JS 5.16.0 | OpenGlobus 0.28.7 |
|---|---|---|
| Terrain | Une source raster-dem Terrarium, échelle verticale 1 | Un fournisseur Terrain-RGB ellipsoïdal |
| Données natives | 512 × 512, zoom source maximal 14 | 512 × 512, maxZoom et maxNativeZoom 14 |
| Géométrie | 128 divisions par côté en Automatique et Haute, 64 en Performance | Altitudes interpolées sur une grille de 33 × 33 sommets. Le maillage affiché utilise jusqu’à 32 divisions par côté selon le niveau |
| Concurrence configurée | 10 requêtes image en parallèle dans le gestionnaire MapLibre | 8 dans le chargeur DEM, 8 dans celui des tuiles d’imagerie |
| Cache et hors champ | Plafond configuré de 96 tuiles pour le cache de chaque source. Couverture et niveaux pilotés par le moteur | Quadtree natif, niveaux de détail progressifs, cache natif du fournisseur. Les ancêtres nécessaires à l’affinement sont aussi demandés |
| Imagerie | Une couche raster de fond à la fois | Une couche de fond XYZ à la fois |

Sur le passage progressif avec cache du relais, la phase terrain a demandé 12 URL DEM distinctes sous MapLibre et 80 sous OpenGlobus. Le pic de requêtes DEM simultanées observé côté relais était respectivement de 3 et 6. Il dépend aussi du transport HTTP local. Le cadrage oblique étend la zone visible vers l’horizon. Le comptage inclut les tuiles grossières et les ancêtres et ne suffit pas à classer chaque requête comme visible ou superflue.

Sur la page complète, un glisser droit a changé cap et inclinaison sans appel à la reconstruction des marqueurs, au changement de terrain, au changement d’imagerie ni à l’initialisation du moteur. Un franchissement de niveau de zoom peut faire interroger de nouveau l’index de groupes. Les changements de terrain utilisent la scène existante. MapLibre affiche les repères dans une couche de symboles native. OpenGlobus réutilise les entités portant la même clé.

