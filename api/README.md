# FAR.E Group — Contact API

Azure Function (Static Web Apps managed) che riceve i dati del form contatti e
spedisce un'email di notifica via **Microsoft Graph** (`/users/{sender}/sendMail`).

## Struttura

```
api/
├── host.json
├── package.json
└── contact/
    ├── function.json     # binding HTTP POST /api/contact
    └── index.js          # handler principale
```

## Configurazione Entra ID (one-time)

L'API si autentica con Microsoft 365 tramite OAuth2 **client credentials**
contro un'app registrata in Entra ID (Azure AD).

1. **Entra ID → App registrations → New registration**
   - Nome: `fare-site-contact-api`
   - Supported account types: *Single tenant*
   - Redirect URI: lasciare vuoto

2. **Certificates & secrets → New client secret**
   - Annotare il **Value** del secret (sarà visibile solo una volta)

3. **API permissions → Add a permission → Microsoft Graph → Application permissions**
   - Aggiungere `Mail.Send`
   - Cliccare **Grant admin consent for FAR.E**

4. **(Consigliato) Application Access Policy** — limita l'app a inviare solo
   come la mailbox `info@fare-group.com` (non tutte le mailbox del tenant):
   ```powershell
   Connect-ExchangeOnline
   New-ApplicationAccessPolicy `
     -AppId <CLIENT_ID> `
     -PolicyScopeGroupId info@fare-group.com `
     -AccessRight RestrictAccess `
     -Description "Restrict fare-site-contact-api to info mailbox"
   ```

## App Settings su Azure Static Web Apps

Dal portale Azure → Static Web App → **Configuration → Application settings**:

| Nome                | Valore                                  |
|---------------------|-----------------------------------------|
| `MS_TENANT_ID`      | GUID del tenant Microsoft 365           |
| `MS_CLIENT_ID`      | Application (client) ID dell'app        |
| `MS_CLIENT_SECRET`  | Client secret generato al passo 2       |
| `MS_SENDER`         | `info@fare-group.com`                   |
| `CONTACT_RECIPIENT` | `info@fare-group.com` (o altro)         |

Le variabili sono lette in `api/contact/index.js`.

## Test in locale

Richiede [Azure Functions Core Tools v4](https://learn.microsoft.com/azure/azure-functions/functions-run-local) e Node 18+.

```bash
cd api
# crea local.settings.json (NON committare) con i valori sopra
func start
# in un altro terminale:
curl -X POST http://localhost:7071/api/contact \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Mario","lastName":"Rossi","email":"m.rossi@example.com","message":"test","privacy":true,"lang":"it"}'
```

`local.settings.json` di esempio (escluso da `.gitignore`):

```json
{
  "IsEncrypted": false,
  "Values": {
    "AzureWebJobsStorage": "",
    "FUNCTIONS_WORKER_RUNTIME": "node",
    "MS_TENANT_ID": "...",
    "MS_CLIENT_ID": "...",
    "MS_CLIENT_SECRET": "...",
    "MS_SENDER": "info@fare-group.com",
    "CONTACT_RECIPIENT": "info@fare-group.com"
  }
}
```

## Sicurezza implementata

- **Honeypot** (`website` nel form) — bot vengono accettati silenziosamente senza inviare email
- **Anti header-injection** — strip CR/LF dai campi single-line
- **Validazione lato server** — required, lunghezza max, regex email
- **HTML escape** del messaggio prima di inserirlo nel body MIME
- **`saveToSentItems: false`** — evita di intasare la mailbox `info@`
- **`replyTo`** popolato col mittente reale → rispondendo dall'email Outlook si scrive direttamente al richiedente
- **Nessun secret nel repo** — tutti via App Settings

## Limitazioni note (futuro)

- **Rate limiting**: non implementato. Su volumi maggiori valutare Azure Front Door
  con WAF, oppure tabella Storage per contare richieste/IP/min.
- **Captcha**: non aggiunto. Su B2B con honeypot è generalmente sufficiente.
  In caso di abusi, integrare Cloudflare Turnstile (GDPR-friendly).
