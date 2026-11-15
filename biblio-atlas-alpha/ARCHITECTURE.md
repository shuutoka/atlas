# Architecture et format des données V1

La couche cartographique de l’Alpha 1.1 est décrite dans **ALPHA-RENDUS.md**. Les sections de ce document qui concernent uniquement le globe Cesium et ses anciens tests documentent la V1.0.

## Chemin des données

Le Manager et le site communiquent par des fichiers exportés. Le site peut être servi par tout hébergeur statique. Le processus d’édition reste sur la machine du propriétaire.

| Emplacement | Rôle |
|---|---|
| `manager/schema.sql` | Schéma de travail SQLite, version 1 |
| `manager/atlas.py` | Validations, identifiants, import, export, sauvegardes |
| `manager/server.py` | Commandes d’édition transactionnelles et interface HTTP locale |
| `manager/ui/` | Interface de gestion, partagée par le navigateur et Tauri |
| `manager/src-tauri/` | Fenêtre native, lancement et arrêt du processus enfant |
| `manager/seed/atlas.sqlite` | Base initiale copiée au premier démarrage |
| `site/data/projects.json` | Catalogue, identifiant de schéma, titre, icône et compteurs |
| `site/assets/volcan-v1.js` | Formes, palette, filtres et champs affichés pour cet atlas |
| `site/assets/atlas.js` | Recherche, consultation, navigation, carte et formulaires |
| `site/data/volcans/index.json` | Résumé des éléments principaux pour carte et recherche |
| `site/data/volcans/fiches/VOL-xxxxxx.json` | Détail chargé à l’ouverture de la fiche |
| `site/data/volcans/media/` | Images locales référencées, créé à la demande |

## SQLite

**element** utilise une clé entière AUTOINCREMENT. L’API la rend sous la forme VOL-000001. Le nom peut être vide. La clé étrangère `parent` référence le même tableau et sa suppression est restreinte. Deux niveaux sont autorisés. `origin` conserve la clé d’import, unique lorsqu’elle est présente. `created` et `updated` sont en UTC. La sauvegarde d’une fiche compare la version ouverte à la date de modification courante.

Le champ `payload` contient un objet JSON validé. Sa structure permet de conserver plusieurs catégories, sources et images sans installer d’ORM ou d’extension spatiale. Les relations, l’unicité des origines et les identifiants appartiennent à SQLite. Le Manager recherche dans une projection des fiches chargée en mémoire.

| Champs | Représentation |
|---|---|
| `name, continent, country, region, subregion` | Chaînes UTF-8. Chaîne vide si inconnue |
| `lat, lon` | Degrés décimaux WGS84, nombres finis. Null permis en brouillon |
| `altitude` | Mètres ou null. Valeur descriptive saisie ou validée |
| `aliases, morphology, style, context, tags` | Tableaux extensibles de chaînes |
| `kind` | Volcan, Maar, Montagne, Croix ou Source chaude |
| `status` | Actif, Dormant, Éteint, Incertain ou Inconnu |
| `incomplete, review, published` | Booléens indépendants |
| `age, period, eruption` | Texte libre acceptant approximations et intervalles |
| `description, notes` | Texte multiligne. Les notes sont privées |
| `sources` | Liste d’objets avec title, url, author, note |
| `images` | Liste d’objets avec url, caption, credit. URL HTTP(S) ou média local par empreinte |

**imports** conserve le flux original dans un BLOB, son empreinte SHA-256, sa date et le rapport de traitement. **legacy** relie une fiche et son import à la provenance JSON. Pour le KML, cette provenance comprend le chemin de dossiers original, l’ID de repère, le style, l’URL d’icône, la couleur, la coordonnée verticale, le mode d’altitude, le HTML et les suggestions. Les extensions inconnues, les métadonnées des dossiers, les styles de survol et les vues de caméra se retrouvent dans le BLOB. Un outil SQLite peut récupérer celui-ci octet pour octet.

## Interpréter la migration

Les pays et régions sont proposés à partir des dossiers, qui mêlent géographie, administration et collections. Le chemin original reste intact. Certains continents sont laissés vides, notamment lorsque le classement administratif recouvre plusieurs continents. Les coordonnées sont reprises du Point. Les fiches restent à vérifier dans le Manager.

| Convention | Traitement |
|---|---|
| Rouge, jaune, bleu du KML | Reprise des couleurs identifiées comme Actif, Dormant et Éteint |
| Violet « pas assez de donné » dans la légende du projet | Activité inconnue et qualité à compléter |
| Vert historique ou teinte sans correspondance fiable | Activité inconnue, à compléter, couleur exacte conservée |
| Nouvelle fiche marquée à compléter | Marqueur vert, activité conservée séparément |
| Pictogrammes Google 2381, 2000, 2227, 2396 | Volcan, cercle de maar, montagne et croix |
| Pictogrammes 2175 et 2211 | Sources chaudes pour 2175. L’ancien signe plus 2211 reste à identifier et s’affiche comme croix |

La couleur de complétude a priorité sur la couleur d’activité à l’affichage. Le filtre **Activité** porte toujours sur l’état volcanique. Le filtre **Complétude** retrouve les marqueurs verts. La provenance des champs structurés ne constitue pas une validation scientifique.

## Carte et extensibilité

Supercluster construit un index hiérarchique sur les éléments principaux correspondant à la recherche. La hauteur de caméra et la largeur du viewport déterminent le niveau de zoom. Quand on dézoome, les groupes régionaux se réunissent dans les groupes de niveau inférieur. Un clic sur un groupe rapproche la caméra jusqu’au niveau de séparation. Les points coïncidents proposent une liste. Les sous-édifices ont une couche Cesium distincte, alimentée par la fiche ouverte. Fermer cette fiche retire la couche familiale visible.

Pour ajouter un deuxième atlas, créer son répertoire de données, une entrée de catalogue avec son slug et son schéma, puis enregistrer un module de schéma dans la table `schemas` de la carte. Le module volcan fournit le contrat initial pour les marqueurs, les catégories et les libellés. Ajouter l’éditeur et le sérialiseur métier nécessaires dans le Manager, et étendre l’écriture du catalogue dans `export()` pour exporter tous les projets ensemble. La V1 livre uniquement le modèle volcanique. Les ressources cartographiques et de contribution peuvent être remplacées via `settings.js`.

## Reconstruction

- **Base et export.** Depuis la racine du projet, lancer `manager\python\python.exe manager\prepare_seed.py archives\original.kml nouvelle-sortie`. Le dossier de sortie doit être nouveau. Il contient la base, le rapport, et l’export. L’opération n’écrit pas dans le dossier de travail personnel. Les IDs suivent l’ordre d’origine à la première migration. Pour faire évoluer une collection déjà éditée, utiliser sa base existante.
- **Manager Windows.** Les sources Rust et Cargo.lock sont livrés. Avec Rust, les outils de compilation Windows et WebView2, se placer dans `manager/src-tauri` puis lancer `cargo build --release --locked`. Placer le nouvel exécutable à côté du dossier `manager`. La version portable fournie cible Windows x64. Elle inclut le chargeur WebView2 sur cette cible.
- **Contrôles.** `manager/check_release.py` compare les 699 coordonnées et les noms au KML, l’export livré à l’export recalculé et l’archive originale aux octets en base. Il contrôle les contraintes SQLite, l’import tabulaire, les brouillons, les liens parent-enfant, les médias, la sauvegarde et l’annulation d’une modification en lot.
- **Validation réalisée.** Chromium a chargé le site sur HTTP local avec WebGL, affiché le globe, ouvert La Grande Soufrière et un sous-édifice, basculé les groupes, puis ouvert une fiche en largeur mobile. Le test de regroupement a affiché 19 marqueurs ou groupes en vue mondiale, puis 604 en zoom rapproché et de nouveau 19 au retour. Le mode sans regroupement a exposé les 677 éléments principaux. Les essais de formulaires ont simulé une erreur HTTP puis un succès, sans envoyer de données à un tiers. Le parcours Manager a modifié une fiche dans une base temporaire et exporté la nouvelle version. L’exécutable a été compilé et son format et ses dépendances inspectés sous Linux. Le lancement graphique natif Windows et l’acheminement de l’e-mail sur un compte Formspree réel restent à vérifier sur la machine et le compte destinataires.

## Composants

CesiumJS 1.124.0 avec Natural Earth II (licences dans `site/vendor/CESIUM-LICENSE.md`), Supercluster 8.0.1 (licence dans `site/assets/`), Python embarqué Windows 3.13.9 (licence dans `manager/python/`), Tauri 2 et dépendances Rust verrouillées par Cargo.lock. Le fond de couverture est une projection orthographique des textures Natural Earth II avec les positions de la collection.
