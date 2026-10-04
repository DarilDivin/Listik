# Animation du logo L!stik

Sous-projet [Remotion](https://www.remotion.dev) (npm, indépendant de l'app) :
l'animation du logotype, rendue image par image en vidéo. Une seule
chorégraphie, `src/LogoSting.tsx`, en trois coupes :

- **master** : le sting seul, 5 s, 16:9 (fond papier, fond encre, ou transparent) ;
- **social** : le sting suivi d'un carton (« Une touche, l'idée est posée. »,
  « Pour Windows · gratuit »), 6,5 s, en 16:9, carré et vertical ;
- **splash** : l'écran d'ouverture de l'app, 2 s, transparent, aux couleurs de
  texte de l'app (thèmes clair et sombre).

Remotion est gratuit pour un particulier ou une équipe de trois personnes au plus
(voir sa licence avant d'en faire un usage d'entreprise).

## Travailler

```console
npm i --loglevel=error
npm run dev          # Remotion Studio, pour scruter image par image
```

Le Studio rejoue les flous de mouvement en direct : la lecture peut saccader
pendant les gestes rapides. Le rendu fait foi.

## Rendre

Vidéos (dans `out/`, ignoré par git) :

```console
npx remotion render LogoSting out/listik-sting-paper.mp4 --codec=h264 --crf=16 --pixel-format=yuv420p --color-space=bt709
npx remotion render SocialVertical out/listik-social-vertical-paper.mp4 --codec=h264 --crf=16 --pixel-format=yuv420p --color-space=bt709
```

Transparent (WebM VP9 avec couche alpha) : il faut des images PNG.

```console
npx remotion render LogoStingClear out/listik-sting-clear.webm --codec=vp9 --image-format=png --pixel-format=yuva420p
```

Écran d'ouverture de l'app : rendre puis remplacer les deux fichiers de
`public/brand/` à la racine du dépôt.

```console
npx remotion render SplashLight out/splash-light.webm --codec=vp9 --image-format=png --pixel-format=yuva420p
npx remotion render SplashDark out/splash-dark.webm --codec=vp9 --image-format=png --pixel-format=yuva420p
cp out/splash-light.webm ../public/brand/listik-splash-light.webm
cp out/splash-dark.webm ../public/brand/listik-splash-dark.webm
```

Le cadrage de la coupe splash (`SPLASH_GEOMETRY`) est repris par
`components/brand/ListikLogoMotion.tsx` pour caler la vidéo sur la boîte du
logo : les changer ensemble.

## D'où viennent les formes

`src/logo-data.ts` est généré depuis le moteur du logo (les tracés Fraunces et la
plume de `brand/`) : ne pas l'éditer à la main. Les polices du carton
(`public/fonts/`) sont celles du site, sous licence OFL.
