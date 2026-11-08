# Chatbox Venice


La scansione QR in tempo reale e le opzioni di connessione sono descritte nella [guida di accoppiamento](docs/collaboration-troubleshooting.md).
Fork di Chatbox Community Edition con dati locali, parametri vendor per modello e supporto Venice.

- [Download e changelog delle release](https://github.com/n3me5is-git/chatbox-venice/releases)
- [GitHub Actions: build, test e log](https://github.com/n3me5is-git/chatbox-venice/actions)
- [Guida completa](README.md)

## Uso

Dalla 1.35.0 puoi condividere una chat con l’icona delle persone o accedere da **Chat collaborative** nella sidebar usando codice/QR. Il proprietario approva i partecipanti e concede separatamente scrittura, uso di AI/strumenti e clonazione. Gli HITL possono essere riservati al proprietario, inviati a tutti (prima risposta valida), oppure solo a chi ha inviato la richiesta. La comunicazione tra dispositivi è cifrata; le creazioni protette separatamente restano escluse dalla condivisione di una chat pubblica. [Guida e limiti](docs/collaboration.md).

I selettori Venice mostrano costi e unità quando disponibili; i tipi aggiornati del catalogo correggono eventuali vecchie classificazioni, anche per Krea 2 Turbo. Crea immagine e Studio mostrano subito il motivo degli errori. [Verifica dei 405 modelli](docs/venice-catalog-audit-2026-11-08.md).

Per i tool della **ricerca globale Chatbox**, vai in **Impostazioni → Ricerca web → Venice → Esponi i motori di ricerca separatamente**. Abilitandolo ottieni `web_search_brave`, `web_search_google` e `web_search_exa`, indipendenti dai tool della ricerca del modello Venice. Dalla 1.34.1 sono corretti anche il microfono delle nuove chat e i permessi audio Android; l’explorer gestisce gli aggiornamenti della chat e l’agente può rivedere immagini salvate. Il tool `ask_user` permette domande con scelte e testo libero; dopo una generazione fallita compare una decisione Riprova/Salta con il motivo dell’errore.

Dalla 1.34.0 il visualizzatore Markdown esporta anche in **PDF** e **HTML autonomo**, incorporando immagini, diagrammi e font delle formule. I file testuali hanno l'editor; gli allegati in sola lettura si modificano come copie. In **Impostazioni → Modelli predefiniti** scegli STT e TTS globali, poi usa il microfono della chat o **Leggi ad alta voce** sotto una risposta. La dettatura aggiunge testo modificabile alla bozza senza inviarlo. Le chat private bloccano i servizi vocali non privati/sconosciuti; nelle chat E2EE serve conferma per ogni richiesta a un servizio vocale privato, che usa HTTPS. Vedi la [guida italiana](docs/markdown-export-and-speech.it.md).

Dalla 1.33.0, **File e risorse** nell'intestazione della chat apre l'explorer: pannello destro su desktop, scheda scorrevole sul telefono. L'albero raccoglie allegati, artefatti, media generati e file gestiti. Le anteprime Markdown includono LaTeX, Mermaid, indice, immagini locali e link. Puoi modificare, esportare o cancellare una singola risorsa. Gli script intermedi restano nella chat; i documenti finali entrano in libreria solo se li contrassegni come risultati finali.

I nuovi file gestiti e il relativo indice sono cifrati e hanno backup/ripristino dedicati. L'agente può gestirli ed eseguire JavaScript isolato, oppure Python facoltativo con pacchetti selezionati. Python richiede un download esplicito del runtime verificato, poi esegue offline: vede solo i file scelti, senza shell, chiavi API o database dell'app. I vecchi strumenti Work mantengono il loro funzionamento. Vedi la [guida ai file di sessione](docs/session-workspaces.it.md).

Su desktop puoi anche avviare un **server MCP locale** per condividere la chat con un agente esterno fidato. Permessi separati controllano file, esecuzione, modelli, Venice Studio, ricerca e altri MCP. Le chiamate ai modelli richiedono conferma salvo autorizzazione automatica esplicita. Condivisione disattivata inizialmente, token nuovo a ogni avvio e arresto al blocco dell'app. Vedi la [configurazione MCP](docs/local-mcp-server.md).

In Impostazioni → Provider → Venice inserisci la API key, premi Fetch e aggiungi i modelli desiderati. Per la ricerca puoi scegliere Venice integrata, Brave, Google, Exa e, sui modelli compatibili, X. Le richieste passano direttamente dalle API Venice. Le modalità sono disattivata, automatica e sempre attiva; la ricerca automatica con un backend scelto richiede un modello con tool calling.

Dalla 1.29.0 la **Libreria multimediale locale** è nel menu laterale: miniature, anteprime, categorie e aree pubblica/protetta. Il pulsante di caricamento propone dispositivo o libreria locale. Invio nel prompt immagini va a capo; solo il pulsante esplicito avvia la generazione. Le impostazioni avanzate si aprono in un pannello dedicato. Le creazioni protette richiedono lo sblocco della vista.

La ricerca del modello Venice è separata dallo strumento di ricerca Chatbox: per quest’ultimo vai in Impostazioni → Ricerca web → Venice e scegli Brave, Google o Exa. Le approvazioni Venice sono nelle impostazioni della conversazione. **Nascondi Chatbox AI nei selettori** è disponibile in Impostazioni → Provider e in Aspetto. Tutte le stringhe del fork hanno una traduzione italiana esplicita, con inglese predefinito per gli altri casi.

Dalla 1.30.0 la ricerca Venice ha un interruttore indipendente per la chat, che conserva modalità e motore quando la sospendi, e un'icona per le impostazioni. Puoi esporre separatamente `venice_web_search_brave`, `venice_web_search_google` e `venice_web_search_exa`, insieme a `web_search` del provider globale. Le ricerche duplicate riusano il risultato; errori e limiti per risposta bloccano i cicli di chiamate ripetute.

In Impostazioni → Provider → Venice, con privacy E2EE, puoi attivare i tool dopo conferma. La scelta predefinita cifra definizioni, chiamate e risultati testuali usando il protocollo di `elkimek/venice-e2ee`; l'app esegue solo chiamate decifrate, firmate e validate. La modalità alternativa nativa richiede supporto del modello e avvisa che i metadati dei tool sono visibili. Ricerca e MCP ricevono comunque gli argomenti necessari all'esecuzione. La ricerca integrata del provider e gli allegati restano esclusi dal trasporto testuale E2EE; le ricerche tramite tool sono supportate. Vedi [guida completa](docs/search-and-encrypted-tools.md).

Nel generatore immagini compaiono le impostazioni Venice: moderazione, ricerca web, formato, dimensioni, risoluzione, qualità, seed, step, CFG, stile e altri controlli. I modelli di editing richiedono immagini di riferimento. Le opzioni disponibili dipendono dal modello.

Nei provider custom puoi specificare un JSON aggiuntivo per ogni modello, ad esempio `{"moderation":"low"}` per le immagini compatibili OpenAI. Gli oggetti vengono uniti ricorsivamente e gli array sostituiti. Per creare varianti dello stesso modello usa un ID locale diverso e specifica il vero ID nel campo `model` del JSON. L'opzione ricerca nativa esclude i tool di ricerca Chatbox.

Cronologia e immagini restano sul dispositivo. Puoi eliminare le generazioni dalla cronologia; i file esportati manualmente restano nella cartella scelta. L'inferenza invia prompt e riferimenti selezionati a Venice. Le richieste standard usano HTTPS; nelle impostazioni Venice puoi richiedere verifica TEE o E2EE per i modelli testuali compatibili. I media non usano E2EE.

Abilita i moduli desiderati in Impostazioni → Provider → Venice, poi apri **Venice Studio** dal menu laterale. Scegli modello e voce dai selettori: le voci e i formati arrivano dal catalogo del modello. Il caricamento del catalogo è esplicito; viene conservata una copia locale compatibile con la chiave configurata. Le prove voce sono brevi generazioni, avviate solo su richiesta, e possono avere un costo. ID e JSON sono raccolti nelle opzioni avanzate. Video e musica conservano il lavoro avviato e possono riprenderne il recupero senza rigenerarlo. La copia remota viene ripulita dopo il salvataggio locale; se non riesce, puoi riprovare. Cancellazione locale e cancellazione remota sono separate. I file esportati restano nella posizione scelta. Limiti: 25 MB per la trascrizione e 128 MB per i media generati.

Puoi salvare profili di ricerca/immagini e sceglierli per modello o chat esistente. La priorità è provider → profilo salvato → modello → chat → JSON extra del modello. I permessi dei moduli restano nelle impostazioni del provider. Il supporto Venice ha un interruttore generale; i nuovi moduli sono disattivati finché non li abiliti.

Dalla 1.26.0 l’MCP Venice interno è disponibile quando il provider è configurato e attivo; puoi disattivarlo in Impostazioni → MCP o nel provider Venice. I tool nelle chat in modalità Lavoro mostrano modelli, preventivi e stato, possono generare media e gestire le generazioni della chat corrente. Dalla 1.27.0 immagini e media seguono la politica di approvazione scelta nella chat; la modalità predefinita richiede conferma. Modelli ambigui o riferimenti richiesti aprono comunque il selettore; le cancellazioni la richiedono sempre. Nessuna API key viene inviata alle Actions per i test simulati.

La telemetria è disattivata di default. I servizi opzionali ereditati da Chatbox e gli altri provider possono essere configurati esplicitamente. Vedi [flussi dei dati](docs/fork-privacy.md).

Dalla 1.26.0 Studio include anche immagini, batch/remix/riuso prompt, registrazione dal microfono, ricerca globale Venice, saldo USD/DIEM, schede modello e embeddings per RAG. In Aspetto puoi nascondere Chatbox AI dai selettori. Vedi le [note complete](docs/releases/v1.26.0.md).

## Build e aggiornamenti

Setup Windows x64 e APK Android vengono creati nelle Actions. Non serve installare l'ambiente di compilazione sul PC. I pacchetti sono pubblicati nelle release del fork dopo test e build riusciti.

Il setup Windows non è firmato con certificato commerciale. Dalla 1.25.0 l'APK è compilato in modalità release e firmato per l'installazione personale; per gli aggiornamenti Android occorre conservare la stessa chiave. Da 1.25.0 sono disponibili anche moduli facoltativi per audio, trascrizione, video, musica ed effetti sonori, con cronologia locale ed esportazione.

Vedi anche [test simulati](docs/fork-testing.md) e [installazione personale e firma Android](docs/personal-distribution.md). Sono disponibili E2EE/TEE testuali, clonazione e conversione vocale compatibili con il catalogo. In Dati e backup trovi PIN/biometria, protezione dei progetti e libreria cifrata con backup e pulizia. Il blocco progetti protegge l’accesso nell’app: non cifra il database preesistente delle chat. Remix/edit supporta modelli compatibili, maschera locale e commenti percentuali. Vedi [protezione locale e limiti](docs/local-security.md).

[Licenza GPL-3.0](LICENSE) · [Progetto originale](https://github.com/chatboxai/chatbox)

## Approvazioni della chat e lingue

Da Venice approvals, accanto al saldo della chat, scegli conferma ogni volta, ricorda le generazioni simili o approvazione automatica. Le regole riguardano immagini, voce, video e musica Venice della sola chat corrente e restano in memoria fino alla chiusura dell’app. Simili significa stesso tool, modello e parametri; il prompt può cambiare. Il reset revoca le autorizzazioni. Modelli immagine ambigui o riferimenti da caricare richiedono comunque la scelta dell’utente; le cancellazioni chiedono conferma.

La lingua sorgente su GitHub e nell’app è inglese. Le nuove funzioni usano i18n con fallback inglese, traduzioni italiane e controlli principali delle approvazioni nelle 15 lingue desktop supportate. Le traduzioni nuove ancora mancanti usano l’inglese.
