# Biblio-Atlas 1.1.0-alpha.3 — Caméras 3D et terrain

Extraire le ZIP dans un nouveau dossier et lancer **Apercu-site.cmd**, puis **Volcans du monde**. Le site démarre sur CesiumJS 1.147.0 avec le terrain Re:Earth / Mapterhorn et le satellite Sentinel-2. Le Manager utilise toujours la base personnelle de la version 1.0.0. Pour consulter vos propres modifications, recopier votre export dans `site/data/` et reporter vos réglages dans `site/settings.js`.

## Se déplacer

- Les chevrons de la boussole modifient le cap par pas de 15°. **N** remet le nord en haut autour du point visé. La flèche indique la direction du nord à l’écran.
- Sous Cesium, **2D** ouvre la carte plane orientée au nord. **3D** retrouve une vue oblique si elle était active avant le passage en 2D. Le retour prend en compte le déplacement et le zoom effectués sur la carte plane.
- **Vue** incline la caméra des trois moteurs, même avec le terrain désactivé. Le curseur couvre 0–75° sous Cesium, 0–85° sous MapLibre et 0–78° sous OpenGlobus. À gauche, on regarde à la verticale. Le curseur suit également les mouvements manuels.
- Sous MapLibre et OpenGlobus, placer le pointeur sur une pente puis maintenir le **bouton droit**. Un déplacement vertical incline la vue, un déplacement horizontal change le cap. Sous Cesium, utiliser le bouton central ou Ctrl + glisser.
- Rechercher **Etna**, ouvrir la fiche et cliquer sur **Vue relief**. La vue de comparaison utilise un zoom commun de 10,8, une inclinaison de 70° par rapport à la verticale locale de la cible et un cap de 32°. Les adaptateurs visent les coordonnées de la fiche. Sur un globe, la hauteur du terrain affine le cadrage. Une interaction avec la carte interrompt cette correction de cadrage.
- Dans la fiche de **La Grande Soufrière**, développer **Sous-édifices** pour faire apparaître les neuf repères secondaires. Replier la rubrique ou fermer la fiche les retire.

## Réglages du panneau Rendu

| Profil Cesium | Résolution de rendu | Erreur maximale à l’écran | MSAA demandé |
|---|---|---:|---:|
| Automatique | DPR entre 1 et 3, plafonné à 2 si le navigateur signale au plus quatre processeurs logiques ou 4 Gio de mémoire | 2 px | 4× |
| Haute | DPR entre 1,5 et 3 | 1 px | 4× |
| Performance | DPR plafonné à 1 | 4 px | 1× |

Cesium choisit les niveaux de détail du terrain et de l’imagerie. Le globe conserve le cache natif de 100 tuiles avec préchargement des ancêtres, sans préchargement des tuiles sœurs. Le culling des faces arrière est actif. Les ombres portées restent désactivées.

**Mesures techniques** affiche le nombre d’images effectivement rendues par seconde, le mode, le cap, le pitch de la caméra, le DPR, la taille du canvas et les compteurs de repères et de clusters soumis au moteur. Le pitch est l’angle de la caméra par rapport à son horizon local. Le curseur décrit l’orbite autour du point regardé. Ces angles peuvent différer en vue mondiale.

Sous Cesium, le compteur de tuiles suit la file signalée par le globe. **tilesLoaded** concerne la vue courante. **Rendu suspendu** apparaît après 1,2 seconde sans nouvel événement de rendu. Un déplacement, l’arrivée d’une tuile ou une modification des repères peuvent réveiller le rendu. Le compteur ne mesure ni les watts ni l’utilisation totale du GPU.

**Fond physique · local** et **Sans relief** permettent une consultation hors connexion. Le satellite EOxCloudless, Mapterhorn et OpenStreetMap nécessitent le réseau. Cesium World Terrain utilise un jeton client placé dans `site/settings.js`. Les crédits des sources figurent sur la carte.

Les résultats détaillés des essais sur l’Etna figurent dans **ESSAIS-TERRAIN.md**. Le zoom 10,8 de la vue relief utilise la partie sphérique de la projection globe de MapLibre 5.16.0. Entre 11 et 12, le moteur interpole vers Mercator pour les vues locales. Le volet technique indique cette transition.

MapLibre et OpenGlobus sont accessibles dans le sélecteur du panneau Alpha. Les deux moteurs sont expérimentaux et peuvent être lents ou instables. Le site importe leurs scripts et leurs styles à la première sélection du moteur concerné.

## Marqueurs et évolution du catalogue

Les 677 éléments principaux entrent dans l’index Supercluster. Les 22 sous-édifices proviennent des familles développées. Cesium partage une collection de billboards et un atlas de textures. Les éléments principaux filtrés peuvent être masqués et réutilisés. Les clusters périmés et les sous-édifices refermés sont retirés. Les fiches détaillées se chargent à l’ouverture, les images utilisent le chargement différé du navigateur et aucun calque mondial de noms n’est créé.

L’ancrage utilise le sol, une origine en bas et un décalage vertical de deux pixels. Le test de profondeur du globe reste actif. Les billboards proches utilisent la vérification native en trois points jusqu’à 100 km. Une vérification complémentaire de la ligne de visée vers l’ancre empêche le sommet d’un disque de dépasser du globe lorsque sa base est derrière l’horizon.

Pour un catalogue beaucoup plus grand, mesurer le coût de l’index, de la liste et des billboards sur le matériel cible. Le contrôleur peut ensuite interroger l’index Supercluster dans la zone visible élargie, en tenant compte de l’antiméridien, et transmettre le résultat au même adaptateur. Les volumes de 10 000 ou 50 000 points restent à mesurer.
