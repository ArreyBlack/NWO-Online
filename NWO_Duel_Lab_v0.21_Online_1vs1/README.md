# NWO Duel Lab — Online 1vs1 v0.21 (prototipo)

**Base di gioco:** motore estratto dal file fornito `NWO_Duel_Lab_v0.20 MARTYRS.html` (v0.20 Martyrs). Le regole e le 200 definizioni delle carte vengono dal motore originale. L'interfaccia multiplayer è nuova e semplificata, non una copia integrale della UI offline.

## Funzionalità

- Accesso ospite, nessuna registrazione per i giocatori.
- Codice stanza casuale di 6 caratteri; due giocatori in due browser/dispositivi differenti.
- Selezione di 6 mazzi starter e 14 mazzi precostruiti della v0.20.
- Server autorevole: il motore esegue azioni, dadi, pesca, danni e controlli. Non è l'IA a giocare il secondo mazzo.
- Mano, mazzo e Presagi coperti dell'avversario non vengono inviati al suo browser.
- Evocazione, magia, presagi, sviluppo, abilità, martire, cambio posizione, attacchi, dadi e passaggio del turno.
- Vittoria/sconfitta e resa; disconnessione = sconfitta del giocatore disconnesso.

## Avvio locale

Richiede **Node.js 20 o superiore**. Non richiede `npm install` né librerie esterne.

```bash
node server.js
```

Apri `http://localhost:3000` in due finestre o dispositivi sulla stessa rete (usando l'IP LAN del computer che esegue il server). Premi **Crea stanza** nella prima finestra, inserisci il codice nella seconda, scegliete i mazzi e premete **Sono pronto**.

Esegui il test automatico:

```bash
node test.js
```

## Pubblicazione online per amici a distanza

**Non basta caricare `index.html` su itch.io o Netlify:** questo gioco richiede un processo Node.js attivo e WebSocket. Il pacchetto è adatto a Render, Railway, Fly.io, VPS o altro hosting Node.js che supporti WebSocket.

Esempio con Render:

1. Crea un repository GitHub con il contenuto di questa cartella (`server.js`, `engine.js`, `socket.js`, `public/`, `package.json`, ecc.).
2. Su Render crea un nuovo **Web Service** collegato al repository (non Static Site).
3. Runtime **Node**, Build Command `echo Ready`, Start Command `node server.js`.
4. Una volta pubblicato, Render fornisce un URL HTTPS. Entrambi aprite **lo stesso URL**.
5. Uno crea la stanza e comunica il codice di 6 caratteri all'altro.

Su piani gratuiti con sospensione per inattività, il primo caricamento potrebbe essere lento; un riavvio del server interrompe le stanze attive.

## Limiti noti — prototipo v0.21

- Interfaccia multiplayer nuova, non identica all'arena grafica offline; animazioni e alcune scelte manuali sono semplificate.
- I pagamenti dei dadi vengono scelti automaticamente dal motore. Per alcuni effetti opzionali il motore originale applica risoluzioni automatiche.
- Disponibili 20 mazzi predefiniti, non ancora importazione di mazzi personali.
- Niente riconnessione alla partita dopo refresh/chiusura della scheda, niente salvataggio stanze e niente rivincita automatica.
- Una sola istanza server: le stanze risiedono in memoria, quindi non usare scaling orizzontale senza un archivio/sistema di routing condiviso.
- Nessun sistema di ranking/anti-abuso avanzato. Codice stanza privato ma non autenticazione.
- L'uso delle carte e dei dadi segue il motore originale, compresi eventuali bug di bilanciamento v0.20; **non** incorpora automaticamente le modifiche sperimentali Fuoco.
- Per un rilascio pubblico occorrono ulteriori test di tutte le carte, le interazioni rare e la sicurezza operativa.

## Struttura

- `engine.js`: motore v0.20 Martyrs estratto, senza modifiche.
- `server.js`: server HTTP + stanze e stato autorevole del duello.
- `socket.js`: implementazione WebSocket minimale senza dipendenze.
- `public/index.html`, `public/client.js`: interfaccia online.
- `public/art.js`: artwork incorporato nella versione originale.
- `test.js`: test di integrazione con due client WebSocket.
