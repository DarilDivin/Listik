#!/bin/sh
# Rend toutes les vidéos de diffusion dans out/ (voir README.md).
set -e
H264="--codec=h264 --crf=16 --pixel-format=yuv420p --color-space=bt709 --log=error"
ALPHA="--codec=vp9 --image-format=png --pixel-format=yuva420p --log=error"
npx remotion render LogoSting out/listik-sting-paper.mp4 $H264
npx remotion render LogoStingInk out/listik-sting-ink.mp4 $H264
npx remotion render SocialWide out/listik-social-16x9-paper.mp4 $H264
npx remotion render SocialWideInk out/listik-social-16x9-ink.mp4 $H264
npx remotion render SocialSquare out/listik-social-1x1-paper.mp4 $H264
npx remotion render SocialSquareInk out/listik-social-1x1-ink.mp4 $H264
npx remotion render SocialVertical out/listik-social-9x16-paper.mp4 $H264
npx remotion render SocialVerticalInk out/listik-social-9x16-ink.mp4 $H264
npx remotion render LogoStingClear out/listik-sting-transparent-ink.webm $ALPHA
npx remotion render LogoStingClearInk out/listik-sting-transparent-ivory.webm $ALPHA
npx remotion render SplashLight out/splash-light.webm $ALPHA
npx remotion render SplashDark out/splash-dark.webm $ALPHA
echo ALL-DONE
