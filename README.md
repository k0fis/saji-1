# Saji – nákupní kontrolka (demo)

Mobilní webová aplikace bez backendu, která pomáhá hlídat celkovou cenu nákupu.
Uživatel naskenuje čárový kód, aplikace zkusí dohledat název zboží, uživatel doplní
cenu a množství a průběžně vidí celkovou částku. Hostování: **GitHub Pages**.

## Spuštění

Aplikace je čistě statická (HTML + JS moduly), nepotřebuje build.

```bash
python3 -m http.server 8000
```
Otevřít `http://localhost:8000`. Kamera funguje jen na `localhost` nebo přes HTTPS (GitHub Pages).

Testy logiky (Node.js 20+):
```bash
npm test
```

Nasazení: automaticky po pushi do `main`, viz [kap. 8](#8-nasazení-na-github-pages).

### Ovládání
- **🏪 obchod** (nahoře) – jedním ťuknutím zvolíš obchod, ceny se pamatují podle obchodu.
- **+ Seznam** – doma si připravíš, co koupit (stačí název a počet).
- **▦ Skenovat** – naskenuješ kód → název se dohledá → doplníš cenu → položka je v košíku.
  Naskenování zboží ze seznamu „Koupit“ ho automaticky přesune do košíku.
- **+ Ručně** – položka bez kódu (pečivo, ovoce…).
- **⋯ menu** – rozpočet, částka z účtenky (kontrola rozdílu), sdílení (WhatsApp / e-mail / kopírovat), nový nákup.

---

## 1. Cíle a rozsah

### Co aplikace dělá (MVP)
1. Naskenuje čárový kód (EAN-13, EAN-8, UPC-A/E) kamerou telefonu.
2. Podle kódu dohledá název zboží (veřejná databáze + lokální paměť).
3. Uživatel doplní **cenu za kus** a **množství** (předvyplní se z minula, pokud je známo).
4. Seznam položek s mezisoučty a **celkovou cenou**.
5. Data zůstávají v telefonu (přežijí zavření prohlížeče).

### Co aplikace nedělá
- Nezná aktuální ceny v obchodech (žádné veřejné API pro ceny v ČR neexistuje).
- Nemá uživatelské účty ani synchronizaci mezi zařízeními.
- Nenahrazuje pokladní systém – slouží jen ke kontrole účtenky.

---

## 2. Proveditelnost bez backendu – závěr

**Ano, jde to.** Všechny klíčové části lze řešit čistě v prohlížeči:

| Potřeba | Řešení v prohlížeči | Poznámka |
|---|---|---|
| Hosting | GitHub Pages (statické soubory) | Poskytuje **HTTPS**, které je nutné pro přístup ke kameře |
| Kamera | `navigator.mediaDevices.getUserMedia` | Funguje v Chrome/Android i Safari/iOS |
| Dekódování kódu | `BarcodeDetector` API + JS knihovna jako fallback | Viz kap. 3 |
| Dohledání zboží | Open Food Facts API (veřejné, bez klíče, podporuje CORS) | Viz kap. 4 |
| Úložiště | `localStorage` / IndexedDB | Data jen v daném zařízení |
| Offline | PWA (manifest + service worker) | Lze „nainstalovat“ na plochu |

---

## 3. Skenování čárových kódů

### Varianty
| Varianta | Podpora | Velikost | Hodnocení |
|---|---|---|---|
| Nativní `BarcodeDetector` | Chrome na Androidu ano; Safari na iOS **ne** | 0 kB | Rychlé, ale samo nestačí |
| [`zxing-wasm`](https://github.com/Sec-ant/zxing-wasm) / [`barcode-detector` polyfill](https://github.com/Sec-ant/barcode-detector) | Všude, kde běží WebAssembly | cca stovky kB | **Použito** – stejné API jako nativní |
| [`html5-qrcode`](https://github.com/mebjas/html5-qrcode) | Všude | cca 300 kB | Hotové UI, jednoduché, ale méně udržované |
| [`@zxing/browser`](https://github.com/zxing-js/browser) | Všude | cca 400 kB | Osvědčené, čistý JS |
| QuaggaJS / Quagga2 | Všude | střední | Jen 1D kódy, dobré pro EAN |

### Řešení (implementováno)
- Použije se **`BarcodeDetector`**, pokud existuje; jinak se načte **polyfill `barcode-detector@2`** (zxing-wasm) z jsDelivr.
  Kód aplikace používá jedno API.
- Formáty omezeny na `ean_13`, `ean_8`, `upc_a`, `upc_e` (rychlejší a méně chybných čtení).
- Vždy je k dispozici **ruční zadání kódu** (poškozený kód, špatné světlo, odmítnutý přístup ke kameře).
- Zadní kamera (`facingMode: "environment"`), svítilna (`torch`), pokud ji zařízení podporuje.
- Po úspěšném načtení vibrace + pípnutí, skener se zavře.
- Kontrolní číslice EAN se ověřuje – odfiltruje chybná čtení.

### Úskalí
- iOS: kamera funguje jen přes HTTPS a v Safari / PWA; při spuštění z plochy se může oprávnění ptát opakovaně.
- Malé kódy a lesklé obaly → nutné dobré světlo / svítilna.
- Desktop bez kamery → jen ruční zadání (vhodné pro vývoj).

---

## 4. Dohledání zboží podle kódu

### Zdroje dat (bez backendu)
1. **Lokální katalog (vlastní paměť)** – první místo, kam se díváme.
   Kdykoli uživatel zboží pojmenuje nebo zadá cenu, uloží se pod EAN.
   Časem tak aplikace „zná“ běžný nákup včetně poslední ceny.
2. **[Open Food Facts](https://world.openfoodfacts.org)** – otevřená databáze potravin, slušné pokrytí i v ČR.
   - `GET https://world.openfoodfacts.org/api/v2/product/{ean}.json?fields=product_name,product_name_cs,brands,quantity,image_small_url`
   - Bez API klíče, CORS povolen (ověřeno: `access-control-allow-origin: *`).
   - Paralelně se dotazují i sesterské databáze se stejným API: **Open Products Facts**, **Open Beauty Facts**.
3. **Ruční zadání** – pokud nic nenajdeme, uživatel napíše název (uloží se do lokálního katalogu).

> Komerční API (UPCitemdb, Barcode Lookup, EAN-Search…) mají limity, vyžadují klíč a klíč by ve statické
> stránce byl veřejný. Pro demo je **nedoporučuji**.

### Ceny
Žádné veřejné API s cenami z českých obchodů není. Cena se proto:
- zadává ručně,
- předvyplní **poslední cenou** z lokálního katalogu (podle obchodu, viz 5.1).

### Speciální případ: vážené zboží a kódy obchodů
Kódy začínající **20–29** (GS1 „restricted circulation“) si generuje obchod – typicky u váženého zboží
(maso, sýry, pečivo). Často obsahují **cenu nebo hmotnost**. Formát se liší podle obchodu,
proto v MVP: rozpoznat prefix 2x, upozornit uživatele a nechat ho zadat cenu ručně. Později lze přidat
konfigurovatelné parsování podle řetězce.

---

## 5. Uživatelské rozhraní (mobile-first)

### Obrazovky
1. **Seznam (hlavní)**
   - Nahoře: obchod, výrazně **V košíku: 1 234,50 Kč**, odhad celkem, rozpočet, kontrola účtenky.
   - Sekce „Koupit“ (plán) a „V košíku“: název, `množství × cena`, mezisoučet, tlačítka +/−.
   - Dole lišta: **+ Seznam**, velké **Skenovat**, **+ Ručně** (dosah palcem).
2. **Skener** – celoobrazovkové video, zaměřovací rámeček, svítilna, ruční zadání kódu, zavřít.
3. **Detail položky (bottom sheet)** – EAN, obrázek, název (s našeptáváním), cena (`inputmode="decimal"`),
   množství (+/−, desetinná čísla pro kg), mezisoučet, Smazat / Naskenovat / Uložit.
4. **Menu** – rozpočet, částka z účtenky, sdílení, nový nákup.

### 5.1 Ceny podle obchodu – UX návrh (jednoduchá varianta)

**Princip: obchod se volí jednou za nákup, ne u každé položky.**

- Nahoře tlačítko **„🏪 Vybrat obchod“** → čipy naposledy použitých obchodů (`Lidl` `Albert` `Billa` … `+ jiný`). Jedno ťuknutí.
- Výběr je **nepovinný** – bez obchodu vše funguje, ceny se ukládají jako „bez obchodu“.
- Předvyplnění ceny po naskenování:
  1. poslední cena **v tomto obchodě** → předvyplní se,
  2. jinak poslední cena **odkudkoli** → předvyplní se a pod polem šedě: *„naposledy 24,90 Kč – Albert, 12. 10.“*,
  3. jinak prázdné pole.
- (Fáze 2) značka **↑ / ↓** u položky při změně ceny ve stejném obchodě.

Závěr: přidává **jedno ťuknutí za celý nákup**, zbytek je automatický → **součást MVP**.

### 5.2 Seznam předem (plánování nákupu)

| Stav | Význam | Zobrazení |
|---|---|---|
| **Koupit** (plán) | připraveno doma, ještě není v košíku | nahoře, čárkovaný rámeček, odhad ceny |
| **V košíku** | naskenováno / potvrzeno | pod plánem, s cenou a mezisoučtem |

- Plánovanou položku lze přidat **jen názvem** – našeptávání z lokálního katalogu (pak se zná EAN i poslední cena).
- V obchodě:
  - naskenovaný EAN odpovídá plánované položce → přesune se do košíku,
  - ťuknutí na ○ / položku → zadat cenu nebo „Naskenovat“ → přesun do košíku,
  - neplánované zboží se prostě naskenuje.
- Hlavička: **„V košíku: 845,00 Kč“** a menším písmem **„odhad celkem ~1 120,00 Kč“**.
- Při „Nový nákup“ lze nekoupené položky přenést do dalšího seznamu.

### 5.3 Sdílení seznamu (export do e-mailu / WhatsAppu)

- **„📤 Sdílet…“** → `navigator.share` (telefon nabídne WhatsApp, e-mail, SMS…).
- Záložní varianty: **WhatsApp** (`https://wa.me/?text=…`), **E-mail** (`mailto:`), **Kopírovat**.
- Obsah je čitelný text:
  ```
  Nákup – Lidl, 28. 10. 2026

  Koupit:
  ☐ Rohlíky 10×

  V košíku:
  ☑ Mléko polotučné 1 l  2 × 24,90 Kč = 49,80 Kč

  Celkem v košíku: 49,80 Kč
  ```
- (Fáze 2) odkaz s celým seznamem v URL (`#l=` + komprimovaný JSON) → příjemce ho naimportuje jedním ťuknutím.
  Data za `#` se na server neposílají.

### 5.4 Slevy – odloženo
Možností je příliš mnoho (2+1, cena s kartou, % na druhý kus, kupony). Zatím se zadává
**skutečně zaplacená jednotková cena**.

### 5.5 UX detaily
- Desetinná čárka i tečka (`12,90` i `12.90`).
- Formátování přes `Intl.NumberFormat('cs-CZ', { style: 'currency', currency: 'CZK' })`.
- Volitelný **rozpočet**: barva se mění (zelená → oranžová nad 90 % → červená nad limit).
- **Kontrola účtenky**: uživatel zadá částku z účtenky, aplikace ukáže rozdíl.
- Tmavý režim dle systému, velké dotykové plochy (min. 44 px).

---

## 6. Data a úložiště

Vše v `localStorage` (pro demo stačí, limit ~5 MB). Při růstu přejít na IndexedDB.

```jsonc
// saji.catalog – lokální katalog zboží (klíč = EAN, nebo "n:<název>" pro zboží bez kódu)
{
  "8594001021499": {
    "name": "Mléko polotučné 1 l",
    "image": "https://…",
    "source": "world.openfoodfacts.org", // nebo "manual"
    "prices": {                            // haléře, podle obchodu; "" = bez obchodu
      "lidl":   { "price": 2490, "at": "2026-10-28" },
      "albert": { "price": 2690, "at": "2026-10-12" }
    }
  }
}

// saji.stores – obchody (předvyplněné běžné řetězce + vlastní)
[ { "id": "lidl", "name": "Lidl", "lastUsed": "2026-10-28T10:00:00Z" } ]

// saji.currentList – aktuální nákup
{
  "id": "uuid",
  "createdAt": "2026-10-28T10:15:00Z",
  "store": "lidl",          // nepovinné
  "budget": 150000,         // haléře, nepovinné
  "receiptTotal": null,     // částka z účtenky pro kontrolu
  "items": [
    { "id": "uuid", "ean": "8594001021499", "name": "Mléko polotučné 1 l",
      "price": 2490, "qty": 2, "status": "cart", "addedAt": 1793182500000 },
    { "id": "uuid", "ean": null, "name": "Rohlíky", "price": null, "qty": 10, "status": "planned" }
  ]
}

// saji.history – uzavřené nákupy (currentList + total + closedAt), max. 100
```

- **Peníze se počítají v haléřích (celá čísla)**, aby nevznikaly chyby typu `0.1 + 0.2`.
- Výsledek dohledání se uloží do katalogu → opakovaný sken funguje i offline.
- `navigator.storage.persist()` – žádost, aby prohlížeč data nemazal.

---

## 7. Technické řešení

### Stack
- **Vanilla JavaScript (ES moduly), HTML, CSS – bez build kroku.**
- Knihovna pro skenování se načítá z CDN (jsDelivr) jen tam, kde chybí nativní `BarcodeDetector`.
- PWA: `manifest.webmanifest` (instalace na plochu); service worker pro offline ve fázi 2.

> Alternativa: Vite + Preact/Lit a build v GitHub Action. Pro takto malé demo zbytečná složitost;
> lze přejít později.

### Struktura projektu
```
/
├── .github/workflows/pages.yml  # CI: test → deploy na Pages → úklid starých běhů
├── index.html               # layout + dialogy (detail, skener, obchod, menu)
├── manifest.webmanifest
├── .nojekyll                # GitHub Pages: servírovat soubory tak, jak jsou
├── icons/icon.svg
├── css/app.css              # mobile-first, tmavý režim
├── js/
│   ├── app.js               # UI, stav, události
│   ├── scanner.js           # kamera + BarcodeDetector / polyfill (barcode-detector@2)
│   ├── lookup.js            # Open Food/Products/Beauty Facts
│   ├── store.js             # localStorage
│   ├── list.js              # logika seznamu, součty
│   ├── money.js             # haléře, parsování a formátování CZK
│   ├── ean.js               # normalizace, kontrolní číslice, UPC-E, prefix 2x
│   └── share.js             # text pro sdílení
├── tests/core.test.js       # node --test
├── package.json             # jen skripty (test/start), žádné závislosti
└── README.md
```

### Tok skenování
```
[Skenovat] → kamera → detekce kódu → validace EAN
   → lookup: lokální katalog? ──ano──► předvyplnit (název + poslední cena)
                 │ne
                 ▼
          Open *Facts? ──ano──► předvyplnit název
                 │ne / offline
                 ▼
          ruční název
   → bottom sheet (cena, množství) → uložit do seznamu + katalogu → přepočet celkové ceny
```

---

## 8. Nasazení na GitHub Pages

Nasazení je automatické přes GitHub Actions – [`.github/workflows/pages.yml`](.github/workflows/pages.yml).

**Jednorázové nastavení:** *Settings → Pages → Build and deployment → Source:* **GitHub Actions**.

Co workflow dělá při každém pushi do `main` (nebo ručně přes *Actions → Run workflow*):
1. **build** – `npm test`, zkopíruje do `_site/` jen soubory potřebné pro běh
   (`index.html`, `manifest.webmanifest`, `.nojekyll`, `css/`, `js/`, `icons/`), nahraje artefakt.
2. **deploy** – publikuje na `https://<uzivatel>.github.io/<repo>/` (HTTPS automaticky).
3. **cleanup** – (i při chybě) smaže staré workflow běhy a artifacts, ponechá **poslední 4**.
   Prevence hromadění artifacts, které zabírají storage quota (viz problém s kfsAiMail).

Poznámky:
- Neprojdou-li testy, nic se nepublikuje.
- Všechny cesty v aplikaci jsou **relativní** (`./js/app.js`), protože aplikace neběží v kořeni domény;
  `start_url` a `scope` v manifestu jsou `./`.

### Lokální vývoj
Kamera vyžaduje HTTPS nebo `localhost`:
```bash
python3 -m http.server 8000
```
Testování na mobilu v lokální síti (potřeba HTTPS) – např. tunel:
```bash
npx localtunnel --port 8000
```
nebo jednoduše pushnout na GitHub Pages a testovat tam.

---

## 9. Rizika a omezení

| Riziko | Dopad | Mitigace |
|---|---|---|
| Safari/iOS nemá `BarcodeDetector` | Bez polyfillu nefunguje sken | WASM polyfill (zxing-wasm) |
| Open Food Facts nezná zboží (hlavně nepotraviny, privátní značky) | Nutno psát název | Lokální katalog se učí; sesterské databáze |
| Výpadek / pomalé API v obchodě (slabý signál) | Zdržení | Timeout 5 s, pak ruční název; cache v katalogu |
| Smazání dat prohlížečem (iOS maže data webů po ~7 dnech nepoužívání, pokud není PWA na ploše) | Ztráta katalogu | Doporučit „Přidat na plochu“, `navigator.storage.persist()`, později export zálohy |
| Vážené zboží (prefix 2x) | Kód nenese obecný EAN | Ruční zadání, později parser podle obchodu |
| Data jen v jednom telefonu | Žádná synchronizace | Sdílení textem; později export/import JSON |

---

## 10. Plán realizace

### Fáze 1 – MVP
- [x] Kostra stránky, mobilní layout, seznam s ručním přidáním položky
- [x] Výpočet mezisoučtů a celkové ceny (haléře), formátování CZK
- [x] Uložení do `localStorage`
- [x] Skener: `BarcodeDetector` + polyfill, ruční zadání kódu, validace EAN (vč. UPC-E)
- [x] Lookup: lokální katalog → Open Food/Products/Beauty Facts → ruční název
- [x] Výběr obchodu za nákup + předvyplnění poslední ceny podle obchodu
- [x] Seznam předem: „Koupit“ / „V košíku“, párování podle EAN, odhad celkem
- [x] Sdílení textu (`navigator.share`, WhatsApp, e-mail, schránka)
- [x] Rozpočet s barevným varováním, kontrola proti účtence
- [x] Opakovaný sken stejného kódu = +1 ks, svítilna, vibrace, pípnutí
- [x] Workflow pro nasazení na GitHub Pages + úklid starých běhů
- [ ] První nasazení + test na reálném Androidu a iPhonu

### Fáze 2 – pohodlí
- [ ] PWA offline (service worker, lokální kopie polyfillu + WASM ve `vendor/`)
- [ ] Odkaz pro import seznamu (`#l=` komprimovaný JSON), export/import JSON zálohy
- [ ] Indikace zdražení/zlevnění ↑/↓
- [ ] PNG ikony pro iOS (`apple-touch-icon`)

### Fáze 3 – rozšíření (volitelně)
- [ ] Historie nákupů (data už se ukládají), statistiky, porovnání cen mezi obchody
- [ ] Export CSV
- [ ] Parsování vážených kódů podle obchodu
- [ ] Slevy (viz 5.4)

---

## 11. Rozhodnutí

| Otázka | Rozhodnutí |
|---|---|
| Ceny podle obchodu | **Ano**, pokud zůstane jednoduché → jeden výběr obchodu za nákup, nepovinný (kap. 5.1) |
| Sdílení seznamu | **Export textu** přes systémové sdílení (WhatsApp, e-mail), žádná synchronizace (kap. 5.3) |
| Seznam předem | **Ano**, položky ve stavech „Koupit“ / „V košíku“ (kap. 5.2) |
| Slevy | **Odloženo**, zatím se zadává skutečně zaplacená cena (kap. 5.4) |
| Nasazení | GitHub Actions → Pages při pushi do `main`, ponechat poslední 4 běhy (kap. 8) |


