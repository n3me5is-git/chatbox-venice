# Chatbox Venice

Fork di Chatbox Community Edition con dati locali, parametri vendor per modello e supporto Venice.

- [Download e changelog delle release](https://github.com/n3me5is-git/chatbox-venice/releases)
- [GitHub Actions: build, test e log](https://github.com/n3me5is-git/chatbox-venice/actions)
- [Guida completa](README.md)

## Uso

In Impostazioni → Provider → Venice inserisci la API key, premi Fetch e aggiungi i modelli desiderati. Per la ricerca puoi scegliere Venice integrata, Brave, Google, Exa e, sui modelli compatibili, X. Le richieste passano direttamente dalle API Venice. Le modalità sono disattivata, automatica e sempre attiva; la ricerca automatica con un backend scelto richiede un modello con tool calling.

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
