# ThinQsmart → Customer.io order-sync

Synchroniseert nieuwe orders uit de ThinQsmart MySQL-replica naar Customer.io, zodat klanten uit de gemeente Amsterdam automatisch een mail krijgen.

De database wordt **alleen gelezen**. Geen tabellen, geen triggers, geen schemawijzigingen.

## Hoe het werkt

1. Het endpoint `/api/webhook-processor` wordt aangeroepen (handmatig, door cron, of door een externe scheduler).
2. Het leest uit Upstash/Vercel KV welk order-ID het laatst is verwerkt.
3. Het haalt de orders op met een hoger ID (max 50 per run).
4. Per order: staat `plaats` in `GEMEENTE_PLACES`? Zo niet → skip. Staat het e-mailadres in `EXCLUDE_EMAILS`? Zo ja → skip.
5. Wat overblijft gaat via de Customer.io **Track API** naar de workspace, in twee aanroepen:
   - `PUT /customers/{email}` met `plaats` en een `true`-vlag voor de webshop van deze order.
   - `POST /customers/{email}/events` met event `bestelling_geplaatst`.
6. Het hoogste verwerkte order-ID gaat terug in KV.
7. In Customer.io triggert een campagne op het event `bestelling_geplaatst` de mail.

## Webshop-vlaggen

Per webshop krijgt de klant een eigen attribuut op `true`, in plaats van één `webshop`-veld dat wordt overschreven. Iemand die bij twee shops bestelt, houdt beide vlaggen: een PUT werkt alleen de meegestuurde velden bij.

De mapping staat bovenaan `api/webhook-processor.js` in `WEBSHOP_ATTRIBUTEN`. Links de naam zoals ThinQsmart hem heeft, rechts wat er in Customer.io komt te staan:

| ThinQsmart | Customer.io |
|---|---|
| Puincontainershop.be | `Puincontainershop.be` |
| MDK Containers | `Mdkcontainers.nl` |
| TH Containers | `Thcontainers.nl` |
| Paridon Containers | `Paridoncontainers.nl` |
| Puincontainershop.nl | `Puincontainershop.nl` |
| Containerhuren.nl | `Containerhuren.nl` |
| Regiocontainer.nl | `Regiocontainer.nl` |
| Praxis-Kluscontainer.nl | `Praxis-kluscontainer.nl` |
| Afvalcontainershop.nl | `Afvalcontainershop.nl` |

Staat een webshopnaam niet in de mapping, dan gaan de klant en het event alsnog door, maar zonder vlag. Je ziet dat in de response terug als `"webshop_attribuut": null`, zodat een nieuwe of hernoemde webshop niet stil verdwijnt.

Let op bij het gebruiken van deze attributen in een e-mailtemplate: de punten in de naam breken Liquid. Gebruik blokhaken:

```liquid
{{customer["Puincontainershop.nl"]}}
```

## Waarom een event en niet alleen attributen

Een campagne die triggert op "attribuut gewijzigd" gaat bij een tweede bestelling bij dezelfde shop niet opnieuw af: die `true` stond er al, dus er verandert niets aan het profiel. Daarom stuurt de sync per order ook een event `bestelling_geplaatst`, met `order_id`, `plaats` en `webshop` als data. Een campagne die op dat event triggert vuurt bij elke bestelling.

Bouw de flow in Customer.io dus op het event, niet op een attribuut.

## Bestanden

| Bestand | Doel |
|---|---|
| `api/webhook-processor.js` | De sync zelf |
| `api/debug.js` | Laat zien welke environment variables de functie ziet. Weghalen zodra alles werkt. |
| `package.json` | Dependencies, Node 24 |
| `.env.example` | Alle variabelen met uitleg |
| `SETUP_GUIDE.md` | Stap voor stap installeren |

Er zit **geen `vercel.json`** in. Vercel detecteert de `api/`-map automatisch. Een `vercel.json` met een cron erin wordt op het Hobby-plan geweigerd, en dat blokkeert je hele deployment.

## Environment variables

Zie `.env.example` voor de volledige lijst met uitleg. De drie waar het meestal op misgaat:

**`CUSTOMER_IO_SITE_ID` en `CUSTOMER_IO_TRACK_API_KEY`** komen uit Settings → Account Settings → API Credentials → **Track API Keys**. Dit zijn niet dezelfde sleutels als de App API key. Ze zijn ook per workspace verschillend, dus selecteer eerst de juiste workspace.

**`CUSTOMER_IO_REGION`** moet `eu` zijn voor dit account. Een EU-workspace praat met `track-eu.customer.io`; stuur je naar de US-URL, dan krijg je een authenticatiefout die eruitziet als een verkeerde sleutel.

**`START_FROM_ORDER_ID`** is je beveiliging tegen een ongeluk. Is de KV-store leeg en staat deze variabele niet ingevuld, dan begint de sync bij order-ID 0 en werkt hij zich door je oudste orders heen — inclusief mails naar klanten van jaren terug. Zet hem op het hoogste order-ID dat nu in de database staat:

```sql
SELECT MAX(id) FROM msg_orders WHERE company_id = 1;
```

## Testen zonder te mailen

Zet `DRY_RUN=true`. De functie doorloopt dan alles, past alle filters toe en rapporteert per order wat hij zou doen, maar stuurt niets naar Customer.io. De response bevat dan `"dry_run": true` en een `would_send`-teller in plaats van `processed`.

Let op: ook in dry-run wordt het laatst verwerkte ID in KV bijgewerkt. Wil je dezelfde orders opnieuw testen, verlaag dan de KV-waarde `thinqsmart:last_processed_order_id` (Storage → je database → Data Browser).

Handmatig aanroepen:

```bash
curl "https://jouw-project.vercel.app/api/webhook-processor?secret=JOUW_SECRET"
```

Controleren welke variabelen aankomen:

```bash
curl "https://jouw-project.vercel.app/api/debug"
```

## Automatisch laten draaien

Op het **Hobby-plan** mag een cron maximaal één keer per dag draaien. Voor "direct een mail na een bestelling" is dat te weinig. Twee opties:

**Vercel Pro, $20/maand.** Voeg een `vercel.json` toe:

```json
{
  "crons": [
    { "path": "/api/webhook-processor?secret=JOUW_SECRET", "schedule": "*/1 * * * *" }
  ]
}
```

**Externe scheduler, gratis.** Laat bijvoorbeeld cron-job.org of een Make-scenario elke minuut de URL aanroepen. Je blijft dan op Hobby. Je hebt Make al in gebruik, en één HTTP-call per minuut kost daar minder credits dan de database uitlezen.

## Wat er misging tijdens het opzetten

Bewaard, omdat het waarschijnlijk weer voorkomt:

- **"Invalid vercel.json"** — een komma achter de laatste regel. JSON staat geen trailing comma toe.
- **"Found invalid or discontinued Node.js Version 18.x"** — Vercel ondersteunt Node 18 niet meer. Staat nu op 24 in `package.json`.
- **`ECONNREFUSED 127.0.0.1:3306`** — `DB_HOST` kwam niet aan, waardoor mysql2 terugvalt op localhost. Niet de database is het probleem, maar een env var die niet doorkomt.
- **Env vars die wel in de UI staan maar MISSING zijn in de functie** — vaak leeg opgeslagen. Zet ze niet op "Sensitive" zolang je aan het opzetten bent, dan kun je de waarde teruglezen en controleren.
- **Env var toegevoegd maar functie ziet hem niet** — een deployment krijgt alleen de variabelen die bestonden op het moment van bouwen. Na elke wijziging opnieuw deployen.

## Kosten

| Onderdeel | Kosten |
|---|---|
| Vercel Hobby | gratis |
| Upstash for Redis (free tier) | gratis |
| Externe cron | gratis |
| Vercel Pro (alleen voor ingebouwde cron) | $20/maand |
