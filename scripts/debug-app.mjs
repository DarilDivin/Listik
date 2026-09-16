#!/usr/bin/env node
// Pilote le webview Tauri (WebView2) déjà lancé, via CDP — voir
// .claude/skills/debug-listik/SKILL.md pour le mode d'emploi et les pièges.
//
// N'appelle JAMAIS browser.close() : sur une connexion connectOverCDP(),
// Playwright documente que ça ne devrait faire que se déconnecter, pas tuer
// le process attaché — mais l'ambiguïté a existé entre versions, et ici
// « tuer l'app » est précisément ce qu'on ne veut jamais risquer. On quitte
// donc par process.exit(), qui ne fait rien d'autre que couper le WebSocket.
import { chromium } from "playwright-core";

const CDP_URL = process.env.LISTIK_CDP_URL ?? "http://127.0.0.1:9222";

function pickPage(browser, match) {
  const pages = browser.contexts().flatMap((c) => c.pages());
  if (!pages.length) throw new Error(`Aucune page sur ${CDP_URL} — l'app tourne-t-elle avec WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS ?`);
  if (!match) return pages[0];
  // Correspondance exacte/en fin d'URL d'abord (sinon "3000/" trouve aussi
  // ".../quick/" avant la racine, puisque "/" y est aussi une sous-chaine).
  const found =
    pages.find((p) => p.url() === match || p.url().endsWith(match)) ??
    pages.find((p) => p.url().includes(match));
  if (!found) {
    throw new Error(
      `Aucune page ne correspond a "${match}". Pages ouvertes : ${pages.map((p) => p.url()).join(", ")}`,
    );
  }
  return found;
}

async function main() {
  const [, , cmd, ...rest] = process.argv;
  const browser = await chromium.connectOverCDP(CDP_URL);

  switch (cmd) {
    case "goto": {
      const [match, path] = rest;
      const page = pickPage(browser, match);
      const target = new URL(path, page.url()).toString();
      await page.goto(target);
      console.log(`Navigue : ${target}`);
      break;
    }
    case "list": {
      for (const p of browser.contexts().flatMap((c) => c.pages())) {
        console.log(p.url());
      }
      break;
    }
    case "screenshot": {
      const [match, out = "debug-screenshot.png"] = rest;
      const page = pickPage(browser, match);
      await page.screenshot({ path: out });
      console.log(`Ecrit : ${out} (${page.url()})`);
      break;
    }
    case "eval": {
      const [match, expr] = rest;
      const page = pickPage(browser, match);
      // eslint-disable-next-line no-eval -- outil de debug local, jamais expose
      const result = await page.evaluate(new Function(`return (${expr})`));
      console.log(JSON.stringify(result, null, 2));
      break;
    }
    case "html": {
      const [match, selector = "body"] = rest;
      const page = pickPage(browser, match);
      console.log(await page.locator(selector).first().innerHTML());
      break;
    }
    case "click": {
      const [match, selector] = rest;
      const page = pickPage(browser, match);
      await page.locator(selector).first().click();
      console.log(`Clique : ${selector}`);
      break;
    }
    case "type": {
      const [match, selector, text] = rest;
      const page = pickPage(browser, match);
      await page.locator(selector).first().click();
      await page.keyboard.type(text);
      console.log(`Tape dans ${selector} : ${text}`);
      break;
    }
    case "key": {
      const [match, key] = rest;
      const page = pickPage(browser, match);
      await page.keyboard.press(key);
      console.log(`Touche : ${key}`);
      break;
    }
    default:
      console.error(
        "Usage: node scripts/debug-app.mjs <list|goto|screenshot|eval|html|click|type|key> [urlMatch] [args...]",
      );
      process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((e) => {
    console.error(e?.message ?? e);
    process.exit(1);
  });
