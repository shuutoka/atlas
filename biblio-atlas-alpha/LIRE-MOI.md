# Biblio-Atlas 1.1.0-alpha.3 — Volcans du monde

**Pour tester la nouvelle carte**, ouvrir **Apercu-site.cmd**, rechercher **Etna**, puis cliquer sur **Vue relief**. Le guide **ALPHA-RENDUS.md** décrit les commandes des trois moteurs et les sources. **ESSAIS-TERRAIN.md** présente les mesures sur l’Etna. Le Manager conserve sa version 1.0.0.

## Première ouverture sous Windows 10/11 x64

1. Extraire **tout le ZIP** dans un dossier local. Garder l’exécutable, sa DLL et le dossier `manager` ensemble.
2. Ouvrir **Biblio-Atlas-Manager.exe**. La fenêtre Tauri utilise Microsoft Edge WebView2. Le moteur Python et SQLite sont inclus. La première ouverture initialise la collection personnelle avec les 699 fiches.
3. Ouvrir **Apercu-site.cmd** pour consulter l’export livré dans le navigateur. Garder la console ouverte pendant la consultation. Le site utilise HTTP local pour charger ses fichiers JSON.
4. Pour essayer une correction, chercher **Trou aux Cerfs**, ouvrir la fiche, développer la provenance, modifier un champ puis cliquer sur **Enregistrer**. Le bouton **Exporter le site** indique le dossier à copier pour voir la modification sur le site.

**Ouvrir-Manager.cmd** ouvre aussi le Manager dans le navigateur par défaut, avec la même base et toutes les fonctions. Cette solution convient lorsque WebView2 est absent. Sous Linux ou macOS avec Python 3.12+, lancer `python3 manager/server.py`. Pour le site, exécuter `python3 -m http.server --directory site` depuis le dossier extrait.

## Collection importée

| Contrôle | Résultat |
|---|---:|
| Repères KML et fiches SQLite | 699 |
| Éléments principaux du globe | 677 |
| Sous-édifices liés | 22 |
| Coordonnées présentes | 699 |
| Dossiers Google Earth | 93 |
| Fiches nommées / sans nom | 620 / 79 |
| Fiches avec description | 321 |
| Fiches avec au moins une source | 81 |
| Fiches avec au moins un lien d’image | 127 |
| Fiches contenant des suggestions extraites | 243 |
| StyleMaps utilisés | 74 |

Les 22 rattachements proviennent des dossiers explicites de La Grande Soufrière (9), des Champs Phlégréens (10) et de Vulsini (3). Les autres regroupements sont à décider dans le Manager. Un repère sans nom affiche son identifiant. La recherche accepte les accents ou leur omission.

Toutes les fiches d’origine ont l’option **À vérifier**. Elles sont marquées **Publiée** dans la base initiale pour que l’aperçu restitue toute la collection. Le site fourni reste local jusqu’à votre déploiement. Les nouveaux imports et duplications démarrent en brouillon.

Le rapport détaillé se trouve dans `archives/rapport-import.json`. Le KML original figure dans `archives/original.kml` ainsi que dans SQLite. Sur les 154 références de carrousel du document, 121 appartiennent à des repères. Les autres restent attachées à leur contexte dans l’original. L’import récupère aussi les images des descriptions HTML. Les liens distants peuvent expirer. Les crédits restent à renseigner lorsqu’ils manquent.

## Gérer la collection

- Développer un groupe du répertoire ou utiliser la recherche. Les filtres administratifs isolent notamment les brouillons, les fiches sans nom et les fiches à vérifier.
- Renseigner les classifications avec plusieurs valeurs séparées par des virgules. Exemple : morphologies « cône, bouclier », style « effusif », contexte « point chaud ».
- Une suggestion reprise depuis le KML remplit le formulaire. Relire, corriger puis enregistrer. L’altitude du point KML et son mode restent en provenance. L’altitude publiée est un champ distinct. La hauteur d’un édifice et l’altitude de la caméra ne deviennent pas son altitude sommitale.
- Choisir une **fiche parente** pour rattacher un repère existant, ou cliquer sur **Ajouter un sous-édifice**. Enlever le parent pour détacher l’élément. Le Manager demande de détacher les enfants avant de supprimer leur parent.
- Cocher les fiches à traiter, puis **Édition en lot**. La case générale sélectionne les résultats filtrés. Le compteur indique toute la sélection, y compris les fiches sélectionnées avant un changement de filtre. Le lot remplace le champ choisi, y compris les listes de classification.
- Ajouter plusieurs sources et images avec leurs légendes, crédits, auteurs ou notes. Les images locales PNG/JPEG/GIF/WebP sont copiées à l’import. Les URLs distantes sont conservées.
- Les créations et copies reçoivent un nouvel ID. Un changement de nom, une correction de coordonnées ou un changement de parent conserve l’ID.

## Importer d’autres données

**Importer des données** accepte KML, CSV UTF-8 et GeoJSON Point. Un import est transactionnel. Le rapport détaille les erreurs et les fiches à examiner. Le fichier d’origine reste conservé dans SQLite. Le même fichier binaire est reconnu par son empreinte SHA-256. Un ID Google Earth déjà présent conserve la fiche locale. Une réimportation ne fusionne pas automatiquement les modifications concurrentes du KML et du Manager.

Exemple CSV (séparateurs virgule, point-virgule ou tabulation). Les listes importées utilisent la barre verticale.

```csv
nom;latitude;longitude;pays;morphology;style;context
Exemple à vérifier;45.1;2.4;France;cône|bouclier;effusif;point chaud
```

GeoJSON accepte une Feature ou une FeatureCollection. Les coordonnées d’un Point suivent l’ordre longitude, latitude, altitude facultative. Les propriétés acceptent les champs du modèle. Les colonnes supplémentaires restent dans la provenance. Un CSV modifié constitue un nouvel import et peut créer de nouveaux repères. Le KML utilise les identifiants de repères lorsqu’ils existent.

## Exporter et publier sur GitHub Pages

1. Cliquer sur **Exporter le site**. Chaque export crée un nouveau dossier daté. L’ancien export reste disponible.
2. Remplacer entièrement `site/data/` par le dossier `data` indiqué. Un simple collage par-dessus l’ancien dossier peut laisser des fiches retirées accessibles par leur ancienne URL.
3. Vérifier le résultat avec **Apercu-site.cmd**. L’export contient uniquement les fiches publiées. Un enfant publié dont le parent est en brouillon reste hors export.
4. Dans GitHub Desktop, copier **le contenu de site/** à la racine de la branche publiée, ou dans son dossier `docs/` si Pages publie ce dossier. Conserver les répertoires `vendor/`, `assets/` et `data/` et le fichier `.nojekyll`. Faire le commit et le push. Les chemins relatifs fonctionnent aussi pour un site situé sous `/biblio-atlas/`.
5. Le Manager, sa base, les notes internes et les archives restent sur le PC. Le déploiement manuel ne demande aucun jeton GitHub au Manager.

## Contributions, fonds et relief

Dans `site/settings.js`, renseigner **formEndpoint** avec l’URL de réception du formulaire de votre compte, par exemple `https://formspree.io/f/VOTRE_ID`. Configurer et vérifier l’e-mail destinataire chez le prestataire. Faire un envoi d’essai après déploiement. Les deux formulaires partagent le destinataire. Un signalement transmet l’ID de la fiche. Un champ leurre anti-robot accompagne l’envoi. Activer les contrôles anti-spam disponibles chez le prestataire.

Le visiteur voit la confirmation après une réponse HTTP réussie. En cas d’échec, sa saisie reste à l’écran. Un endpoint vide désactive l’envoi avec un message explicite. Les contributions reçues sont examinées puis saisies manuellement dans le Manager.

Le panneau **Rendu** sépare moteur, terrain, imagerie et qualité. Le site démarre avec CesiumJS, le relief Mapterhorn et l’imagerie Sentinel-2. Pour une consultation hors connexion, choisir le fond physique local et le terrain sans relief. Les sources et les commandes de navigation sont décrites dans **ALPHA-RENDUS.md**.

## Sauvegarde et restauration

Le dossier de travail est **%USERPROFILE%\Biblio-Atlas**. Il contient `atlas.sqlite`, `media/`, `exports/` et `sauvegardes/`. L’ouverture ou la première opération d’écriture de la journée produit un instantané SQLite daté. Plusieurs écritures dans la journée laissent cet instantané intact. Aucune purge automatique.

Pour une sauvegarde externe complète, fermer le Manager et copier le dossier de travail, en particulier **atlas.sqlite et media/**. Les instantanés de la base référencent les images locales par leur empreinte. Pour restaurer, fermer les instances, renommer la base actuelle pour la conserver, copier la sauvegarde choisie sous le nom `atlas.sqlite`, conserver ou rétablir le dossier `media/`, puis relancer. Les archives de livraison restent indépendantes de ce dossier. La variable `BIBLIO_ATLAS_HOME` permet d’utiliser un autre dossier de travail.

## Code et vérification

Voir **ARCHITECTURE.md** pour le schéma, les conventions et la reconstruction. Le contrôle reproductible se lance avec `manager\python\python.exe manager\check_release.py` depuis la racine extraite. Il travaille dans un dossier temporaire et compare l’export à la collection d’origine livrée.
