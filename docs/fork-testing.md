# Test simulati e verifica dell'app

I test delle Actions non richiedono la tua API key e non generano contenuti a pagamento.

## Eseguire solo i controlli

Apri [Checks](https://github.com/n3me5is-git/chatbox-venice/actions/workflows/checks.yml), scegli **Run workflow** e seleziona:

- `focused`: controlli mirati del fork, TypeScript, UI e prova in Chromium.
- `ui`: controlli UI e browser, oltre a TypeScript e alla configurazione dei pacchetti.
- `unit`: suite unitaria più ampia del progetto, oltre ai controlli statici.

Questa action non produce setup o APK. I controlli mirati e UI sono anche requisiti delle build. Un errore nei controlli impedisce di distribuire i pacchetti. Puoi riavviare un job fallito dalla sua pagina; una correzione al codice richiede invece una nuova run sul nuovo commit.

## Cosa viene simulato

Il servizio media viene verificato con risposte HTTP simulate: moduli disattivati, generazione voce, trascrizione multipart, errori e rate limit senza ripetere POST a pagamento, salvataggio, ripresa delle code, credenziali cambiate, pulizia remota, cancellazione durante il salvataggio e limiti di dimensione/tipo. I tool vengono verificati per isolamento della chat, conferme, annullamento e disattivazione durante l'approvazione.

I test React interagiscono con il componente reale: campi obbligatori, selezione delle voci del modello, cambio modello senza conservare voci incompatibili, prove voce solo su richiesta, preventivi leggibili, immagine iniziale del video, JSON errato, scelta dei profili e moderazione disattivata, generazione, ripresa, errori, cronologia e cancellazione. Si eseguono anche regressioni dei pannelli chat desktop/mobile, delle immagini, delle impostazioni e dei link alle fonti.

La prova Chromium monta il componente reale Venice Studio in una pagina di test con un servizio locale simulato. Usa click e tastiera, genera un WAV di prova, esporta il file, simula HTTP 429, disattiva il modulo ed elimina il risultato. Controlla richieste esterne inattese, eccezioni JavaScript e debordamento orizzontale. Non monta l'intera applicazione Electron/Android e non certifica tutte le schermate dell'app.

Alla fine della run apri **Artifacts → Venice-UI-simulation**: contiene `desktop.png` (1440×1100), `mobile.png` (412×915), `report.json` e il log del server di test. Gli artifact restano disponibili per 14 giorni. Le schermate sono risultati di una simulazione, non screenshot da un telefono fisico.

Sono inclusi anche salvataggio e riapertura del modal modello, scelte HITL, riconoscimento nomi/ID modello, parametri della sola chiamata, roundtrip MCP in memoria, ricerca globale Venice, payload thinking/embeddings e verifica dei default su un campione pubblico dei 19 modelli musicali. La prova Chromium esercita anche il modal HITL sul formato telefono e salva `image-hitl-mobile.png`; il modello presente in questa fixture è simulato.

## La prova reale che resta utile

Dopo avere scaricato una release, controlla con la tua chiave almeno una chat con ricerca e fonti cliccabili, una generazione/modifica immagine e i moduli media che intendi usare. I modelli e le loro opzioni dipendono dal catalogo Venice del momento; solo una chiamata reale conferma accesso, disponibilità e risultato. I test non consumano credito per farlo al posto tuo.

Su Windows/Android verifica installazione, aggiornamento, riproduzione, scelta del file di esportazione e riapertura dell'app. Le prove simulate non sostituiscono la verifica dei codec, delle autorizzazioni e del sistema di installazione sul tuo dispositivo. Esporta i dati importanti prima di una migrazione o reinstallazione.
