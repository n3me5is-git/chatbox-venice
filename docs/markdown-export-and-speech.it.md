# Editor, esportazione Markdown e voce nella chat

## File e anteprime

Apri **File e risorse** nella chat. I file testuali gestiti e i file Work scrivibili si aprono con **Modifica file**. Per un allegato testuale o una risorsa in sola lettura trovi **Modifica una copia**: il salvataggio crea un file modificabile in `edits/`, mantenendo l'originale. Sono supportati Markdown, codice, JSON, CSV e gli altri formati testuali riconosciuti, entro il limite di anteprima/modifica di 2 MiB.

Il visualizzatore apre Markdown, testo, HTML, immagini, audio e video; sul desktop usa anche il visualizzatore PDF nativo. Non è stato aggiunto un visualizzatore Office: i documenti non supportati si esportano e si aprono con un'altra app.

## PDF e HTML autonomo

Nell'anteprima Markdown renderizzata trovi **Esporta PDF** ed **Esporta HTML in un unico file**. **Esporta** continua a salvare il sorgente `.md`.

L'HTML incorpora immagini, diagrammi Mermaid e font delle formule, insieme a stili, indice, tabelle e collegamenti ai titoli. Può essere riaperto senza rete e non richiede script Mermaid o CDN. Le immagini remote richiedono ancora l'abilitazione esplicita nell'anteprima. I collegamenti ad altri documenti della sessione restano relativi: quei documenti vanno esportati separatamente.

Su Windows il PDF viene generato localmente e salvato attraverso il selettore dell'app. Su Android si apre il pannello di stampa del sistema: scegli **Salva come PDF** e la destinazione. Nel browser si usa il dialogo di stampa disponibile. Le viste di stampa native non hanno accesso a rete, script o dati dell'app.

I file esportati sono copie leggibili nella destinazione scelta, esterne allo spazio di lavoro cifrato. Limiti HTML: 64 immagini, 2 MiB ciascuna, 20 MiB complessivi e documento fino a 32 MiB.

## Modelli vocali globali

Vai in **Impostazioni → Modelli predefiniti → Riconoscimento e sintesi vocale**. Scegli separatamente provider e modello per trascrizione e lettura. **Carica modelli vocali** recupera il catalogo; con Venice trovi anche privacy, voci disponibili, formati e scheda del modello con i costi. Abilita il modulo audio nelle impostazioni Venice.

Sono usati gli endpoint vocali diretti compatibili OpenAI, con configurazioni Venice, OpenAI, Groq e provider personalizzati compatibili. Il provider deve supportare l'endpoint e il modello scelti. I modelli Venice avanzati che usano una coda restano in Studio. Non viene scelto automaticamente un modello a pagamento e non c'è ripiego su un altro provider.

Le informazioni sulla privacy del catalogo sono associate a endpoint e chiave tramite impronta: dopo un cambio devi ricaricare il catalogo. Un modello senza classificazione non viene considerato privato.

## Dettatura e lettura

Il **microfono** accanto al prompt apre il registratore. Registra, ferma e premi **Trascrivi nella bozza**. Solo allora l'audio viene inviato al modello di riconoscimento. Il testo si aggiunge alla bozza mantenendo quello già scritto; non viene mai inviato automaticamente alla chat. Restano i limiti di tre minuti e 25 MiB.

**Leggi ad alta voce**, in fondo alla risposta dell'assistente, apre il lettore e usa il modello globale TTS. Invia il testo leggibile di quella risposta, senza tutta la cronologia, ragionamento o argomenti degli strumenti. I blocchi di codice e l'HTML grezzo vengono omessi. Limiti: 20.000 caratteri e 20 MiB di audio. La generazione può consumare crediti e non viene ripetuta automaticamente dopo un errore.

L'audio della lettura rimane temporaneo e non entra automaticamente in libreria. Chiusura del pannello, cambio delle impostazioni rilevanti, passaggio in background o blocco interrompono registrazione/riproduzione e annullano il lavoro in corso.

## Privacy

- **Chat privata/TEE + voce privata:** consentita tramite HTTPS.
- **Chat privata/TEE + voce non privata, anonima o sconosciuta:** funzione disattivata. Toccandola compare il motivo; non parte una richiesta vocale.
- **Chat E2EE o modello della chat con capacità E2EE + voce privata:** avviso e pulsante **Continua per questa richiesta**, ogni volta.
- **Chat E2EE + voce non privata o sconosciuta:** bloccata, senza possibilità di forzare l'invio.

Gli endpoint audio non implementano la cifratura E2EE testuale: una capacità dichiarata nel catalogo non cifra automaticamente l'audio. L'avviso lo chiarisce e ricorda che “privato” è una dichiarazione del provider. Configurazione, privacy della chat e accesso al progetto vengono ricontrollati prima dell'invio e prima di restituire dati.

Queste sono funzioni vocali su richiesta; non introducono una conversazione continua automatica. E2EE testuale, MCP, approvazioni Studio e strumenti Work mantengono il funzionamento precedente. Vedi la [guida inglese](markdown-export-and-speech.md) per contratti, limiti e test.
