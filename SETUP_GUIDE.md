# Setup: ThinQsmart → Customer.io

Volg dit van boven naar beneden. Elke stap eindigt met iets dat je kunt controleren, zodat je niet pas aan het eind merkt dat er iets mis is.

---

## Stap 1 — Startpunt bepalen (doe dit eerst)

Zoek het hoogste order-ID dat nu in de database staat:

```bash
mysql -h r2-db1-replica.cyv75atac9eg.eu-central-1.rds.amazonaws.com -u msn_tom -p \
  -e "SELECT MAX(id) FROM msg_orders WHERE company_id = 1;" r2_production
```

Op een Mac met mysql-client via Homebrew is het commando `/opt/homebrew/opt/mysql-client/bin/mysql`.

Schrijf dat getal op. Dit wordt `START_FROM_ORDER_ID`. **Sla dit niet over.** Zonder dit getal begint de sync bij order-ID 0 en stuurt hij mails naar klanten die jaren geleden besteld hebben.

---

## Stap 2 — Customer.io: sleutels ophalen

1. Log in en selecteer bovenin de **juiste workspace**. Er hangen meerdere workspaces aan het account en de sleutels zijn per workspace anders.
2. Settings → Account Settings → **API Credentials** → tab **Track API Keys**.
3. Noteer **Site ID** en **API Key**.

Dit zijn niet de sleutels van de App API. De App API gebruikt een Bearer-token en kan geen klanten aanmaken — daarmee krijg je een 401 die eruitziet als een verkeerd wachtwoord.

---

## Stap 3 — Customer.io: attribuut aanmaken

Settings → Attributes → nieuw attribuut `plaats`, type Text.

Strikt genomen maakt Customer.io attributen zelf aan zodra er data binnenkomt, maar door hem nu aan te maken kun je in stap 8 de automation al inrichten voordat er orders zijn.

---

## Stap 4 — Code naar GitHub

```bash
cd thinqsmart-complete
git init
git add .
git commit -m "ThinQsmart Customer.io sync"
git branch -M main
git remote add origin https://github.com/JOUW_ACCOUNT/thinqsmart-customer-io-sync.git
git push -u origin main
```

Maak de repository eerst aan op github.com/new — `git push` maakt hem niet voor je.

---

## Stap 5 — Vercel: project en KV-store

1. vercel.com → Add New → Project → je repository → Import.
2. Storage → Create Database → **Upstash for Redis**.
   - Region: **Frankfurt (fra1)**, dezelfde regio als de replica.
   - Plan: **Free**.
3. Koppel de database aan dit project. De `KV_*`-variabelen worden dan automatisch toegevoegd.

---

## Stap 6 — Vercel: environment variables

Ga naar het project (niet het team-overzicht):

```
vercel.com/JOUW_TEAM/thinqsmart-customer-io-sync/settings/environment-variables
```

Add Environment Variable, en plak dit blok:

```
DB_HOST=r2-db1-replica.cyv75atac9eg.eu-central-1.rds.amazonaws.com
DB_USER=msn_tom
DB_PASSWORD=jouw_wachtwoord
DB_NAME=r2_production
CUSTOMER_IO_SITE_ID=uit_stap_2
CUSTOMER_IO_TRACK_API_KEY=uit_stap_2
CUSTOMER_IO_REGION=eu
GEMEENTE_PLACES=Amsterdam,Weesp,Amsterdam-Noord,Amsterdam-West,Amsterdam-Oost,Amsterdam-Zuid,Amsterdam-Zuidoost
EXCLUDE_EMAILS=planning@thcontainers.nl,planning@paridoncontainers.nl,info@milieuservice.nl
START_FROM_ORDER_ID=getal_uit_stap_1
DRY_RUN=true
WEBHOOK_SECRET=zelf_verzinnen
```

Twee dingen die tijd kosten als je ze verkeerd doet:

- Zet **Production** aan.
- Vink **Sensitive** niet aan. Dan kun je de waarde niet meer teruglezen, ook niet om te controleren of er wel iets in staat.

Genereer een secret met `openssl rand -hex 32`, of gebruik iets simpels zolang je test.

---

## Stap 7 — Deployen en controleren

Elke wijziging in de environment variables vereist een nieuwe deployment. Bestaande deployments zien de nieuwe waarden niet. Deployments → bovenste rij → **Redeploy**.

Controleer eerst of de variabelen aankomen:

```bash
curl "https://jouw-project.vercel.app/api/debug"
```

Alles moet op `SET` staan. Staat er iets op `MISSING`, ga dan niet verder — dan komt die variabele niet door en krijg je later een foutmelding die naar de verkeerde oorzaak wijst.

Dan de sync in testmodus (`DRY_RUN=true`, dus er wordt niets verstuurd):

```bash
curl "https://jouw-project.vercel.app/api/webhook-processor?secret=JOUW_SECRET"
```

Je verwacht iets als:

```json
{
  "success": true,
  "dry_run": true,
  "would_send": 1,
  "skipped": 4,
  "failed": 0,
  "last_processed_id": 128010,
  "details": [
    { "order_id": 128007, "plaats": "Rotterdam", "status": "skipped", "reason": "plaats_not_in_gemeente" },
    { "order_id": 128010, "plaats": "Amsterdam", "status": "dry_run" }
  ]
}
```

Kijk in `details` of de filters doen wat je wil: Amsterdam en Weesp erdoor, de rest geskipt, en de uitgesloten adressen met reden `email_excluded`.

---

## Stap 8 — Automation in Customer.io

1. Campaigns → Newsletters/Campaigns → nieuwe **Campaign**.
2. Trigger: *Attribute changes* op `plaats`, of *Segment entry* met conditie `plaats` is een van je Amsterdam-plaatsen.
3. Voeg je e-mail toe.
4. Zet hem nog **niet** live.

Overweeg een frequency cap of een conditie op `sync_date`, anders krijgt een terugkerende klant bij elke bestelling opnieuw dezelfde mail.

---

## Stap 9 — Live

1. Zet `DRY_RUN` op `false`.
2. Redeploy.
3. Plaats een testorder in ThinQsmart met een Amsterdams adres en je eigen e-mailadres.
4. Roep het endpoint aan en controleer of de klant in Customer.io verschijnt met `plaats`.
5. Activeer de campaign.
6. Haal `api/debug.js` weg en push.

---

## Stap 10 — Automatisch laten draaien

Op Hobby mag cron één keer per dag. Dat is te weinig voor "direct een mail". Kies:

**Vercel Pro ($20/maand)** — maak `vercel.json`:

```json
{
  "crons": [
    { "path": "/api/webhook-processor?secret=JOUW_SECRET", "schedule": "*/1 * * * *" }
  ]
}
```

**Externe scheduler (gratis)** — laat cron-job.org of een Make-scenario elke minuut de URL aanroepen.

---

## Als iets niet werkt

| Symptoom | Oorzaak |
|---|---|
| `Invalid vercel.json file provided` | Trailing comma, of een cron op het Hobby-plan. Zonder `vercel.json` werkt het ook. |
| `Found invalid or discontinued Node.js Version` | `engines.node` in `package.json` op een versie die Vercel niet meer ondersteunt. |
| `ECONNREFUSED 127.0.0.1:3306` | `DB_HOST` is leeg; mysql2 valt terug op localhost. Check `/api/debug`. |
| `NOT_FOUND` op een endpoint | Deployment nog niet klaar, of de push is niet doorgekomen. Check `git log -1` en de Deployments-lijst. |
| 401 van Customer.io | App API key in plaats van Track API key, of verkeerde regio (`us` terwijl je account EU is). |
| Elk secret werkt | `WEBHOOK_SECRET` komt niet aan. De code slaat de check over als de variabele niet bestaat. |
| Env var staat in de UI maar is MISSING | Leeg opgeslagen, of er is niet opnieuw gedeployed. |
| Klant komt in de verkeerde workspace terecht | Site ID uit een andere workspace. Geen foutmelding, dus makkelijk te missen. |

---

## Checklist

- [ ] Hoogste order-ID opgezocht en in `START_FROM_ORDER_ID`
- [ ] Site ID + Track API Key uit de juiste workspace
- [ ] `CUSTOMER_IO_REGION=eu`
- [ ] Upstash-database aangemaakt en gekoppeld
- [ ] Alle variabelen op `SET` in `/api/debug`
- [ ] Dry-run laat de juiste filtering zien
- [ ] Testorder komt aan in Customer.io
- [ ] `DRY_RUN=false` en opnieuw gedeployed
- [ ] Campaign geactiveerd
- [ ] Scheduler ingericht
- [ ] `api/debug.js` verwijderd
