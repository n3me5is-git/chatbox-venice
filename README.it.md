# Chatbox Venice

Fork di Chatbox Community Edition con dati locali, parametri vendor per modello e supporto Venice.

- [Download e changelog delle release](https://github.com/n3me5is-git/chatbox-venice/releases)
- [GitHub Actions: build, test e log](https://github.com/n3me5is-git/chatbox-venice/actions)
- [Guida completa](README.md)

## Uso

In Impostazioni → Provider → Venice inserisci la API key, premi Fetch e aggiungi i modelli desiderati. Per la ricerca puoi scegliere Venice integrata, Brave, Google, Exa e, sui modelli compatibili, X. Le richieste passano direttamente dalle API Venice. Le modalità sono disattivata, automatica e sempre attiva; la ricerca automatica con un backend scelto richiede un modello con tool calling.

Nel generatore immagini compaiono le impostazioni Venice: moderazione, ricerca web, formato, dimensioni, risoluzione, qualità, seed, step, CFG, stile e altri controlli. I modelli di editing richiedono immagini di riferimento. Le opzioni disponibili dipendono dal modello.

Nei provider custom puoi specificare un JSON aggiuntivo per ogni modello, ad esempio `{"moderation":"low"}` per le immagini compatibili OpenAI. Gli oggetti vengono uniti ricorsivamente e gli array sostituiti. Per creare varianti dello stesso modello usa un ID locale diverso e specifica il vero ID nel campo `model` del JSON. L'opzione ricerca nativa esclude i tool di ricerca Chatbox.

Cronologia e immagini restano sul dispositivo. Puoi eliminare le generazioni dalla cronologia; i file esportati manualmente restano nella cartella scelta. L'inferenza invia prompt e riferimenti selezionati a Venice. Questa integrazione usa HTTPS e non implementa il protocollo E2EE Venice.

La telemetria è disattivata di default. I servizi opzionali ereditati da Chatbox e gli altri provider possono essere configurati esplicitamente. Vedi [flussi dei dati](docs/fork-privacy.md).

## Build e aggiornamenti

Setup Windows x64 e APK Android vengono creati nelle Actions. Non serve installare l'ambiente di compilazione sul PC. I pacchetti sono pubblicati nelle release del fork dopo test e build riusciti.

Il setup Windows non è firmato con certificato commerciale. L'APK è firmato come build di sviluppo e si installa tramite sideload; per gli aggiornamenti Android occorre conservare la stessa chiave. Audio, video e musica sono estensioni successive.

[Licenza GPL-3.0](LICENSE) · [Progetto originale](https://github.com/chatboxai/chatbox)
