---
name: Listik — site de téléchargement
description: Une vitrine éditoriale pour la capture rapide et l’application Windows Listik.
colors:
  page: "#f2f1ed"
  paper: "#fbfaf7"
  ink: "#202624"
  muted: "#646d68"
  line: "#d7d9d4"
  accent: "#177d85"
  accent-strong: "#17575a"
  accent-soft: "#e0eeed"
  dark-panel: "#1c302f"
  trust: "#dfe9e5"
  focus: "#1a8c93"
typography:
  display:
    fontFamily: "Cormorant Garamond, Georgia, serif"
    fontSize: "clamp(67px, 6.8vw, 98px)"
    fontWeight: 400
    lineHeight: 0.88
  body:
    fontFamily: "DM Sans, sans-serif"
    fontSize: "16px"
    lineHeight: 1.65
  label:
    fontFamily: "DM Mono, monospace"
    fontSize: "11px"
rounded:
  panel: "9px"
  capture: "15px"
  pill: "100px"
components:
  button-primary:
    backgroundColor: "{colors.accent-strong}"
    textColor: "#ffffff"
    rounded: "{rounded.pill}"
    height: "51px"
    padding: "0 24px"
---

# Design System: Listik, site de téléchargement

## Overview

**Creative North Star: « L’atelier calme »**

La page donne la priorité à la capture rapide, puis montre comment les idées deviennent tâches, notes de journal ou questions. Elle emprunte à [daril.fr](https://daril.fr) son rythme éditorial, ses grands caractères sérif, ses petites légendes mono et son espace généreux. Les surfaces chaudes et l’accent sarcelle rappellent l’application Listik. La démonstration du héros est une **illustration HTML/CSS**, pas une capture d’écran ni une interface interactive de l’application.

## Colors

Le thème clair utilise `--page`, `--paper` et `--ink` comme base, `--accent` pour les marques d’attention et `--accent-strong` pour les appels à l’action. `--line` sépare les blocs avec retenue. Le thème sombre remplace ces variables dans `:root[data-theme="dark"]` ; consulter `styles.css` pour ses valeurs exactes. Garder le sarcelle comme seul accent chromatique.

## Typography

Cormorant Garamond porte les titres et le mot-symbole ; DM Sans porte la lecture courante ; DM Mono porte les métadonnées et les légendes. Les fichiers WOFF2 sont hébergés localement dans `assets/fonts/`. Chaque famille est distribuée sous SIL Open Font License, avec sa licence dans ce dossier : `Cormorant-Garamond-OFL.txt`, `DM-Sans-OFL.txt` et `DM-Mono-OFL.txt`.

## Layout

La grille principale est plafonnée à 1 340 px, avec des marges fluides. Le héros associe texte et illustration sur grand écran, puis les empile à 780 px. Le sélecteur de modes passe de deux colonnes à une seule, et les détails du quotidien s’empilent sur téléphone. Les points de rupture principaux sont 1 100, 780 et 560 px.

## Elevation & Depth

La page reste essentiellement plate. Une ombre plus présente distingue la barre de capture illustrée du document et du panneau sombre derrière elle. Éviter les ombres sur les autres sections.

## Shapes

Les panneaux ont des coins discrets de 9 px, la barre de capture 15 px, et les boutons sont des capsules. Leurs formes suivent la douceur de l’application sans transformer chaque section en carte.

## Components

Le bouton principal mène à la dernière version Windows ; `app.js` remplace son lien par celui de l’installateur si GitHub le fournit. Le sélecteur « tâche / pensée / question » change un exemple illustratif, avec `aria-pressed` et une zone `aria-live`. Le bouton de thème est accessible au clavier et mémorise le choix localement. Préserver le lien « Aller au contenu », les états `:focus-visible`, le contraste des deux thèmes et `prefers-reduced-motion`.

## Do's and Don'ts

- Mettre la capture rapide et le téléchargement en évidence dès le premier écran.
- Employer des exemples concrets et signaler leur caractère illustratif.
- Garder des lignes de texte courtes et un rythme vertical aéré sur desktop comme sur mobile.
- Ne pas présenter la démonstration comme une capture réelle de l’application.
- Ne pas ajouter d’autres couleurs d’accent ni de grilles de cartes génériques.
