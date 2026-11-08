# File di sessione, artefatti e strumenti locali

Apri **File e risorse** nell’intestazione di una chat. Sul desktop trovi un pannello a destra; sul telefono una scheda scorrevole. L’albero raccoglie i file della chat, i risultati Work precedenti, gli allegati, gli artefatti HTML e i contenuti multimediali associati alla sessione. Carica prima i metadati, poi il contenuto del solo file aperto.

L’anteprima Markdown comprende tabelle, liste di attività, LaTeX, Mermaid, indice, immagini locali e link relativi ad altri file della chat. I link esterni si aprono tramite l’app; le immagini remote richiedono un’abilitazione esplicita. L’HTML nei Markdown viene ignorato. I diagrammi sono generati localmente e il loro contenuto non viene inviato agli analytics. Gli artefatti HTML dell’explorer usano una cornice isolata, senza rete né accesso all’app.

Puoi creare, importare, modificare, esportare ed eliminare singoli file. I nuovi file gestiti e il relativo indice sono cifrati nello storage dell’app e seguono la protezione del progetto. Le cartelle Work già esistenti mantengono il proprio formato: visualizzarle non le converte automaticamente in cartelle cifrate. Le cartelle desktop esterne scelte dall’utente sono in sola lettura nell’explorer.

## File di lavoro e risultati finali

I file intermedi, inclusi gli script, restano nella chat. **Salva tra i risultati finali** aggiunge un documento alla libreria; **Mantieni come file di lavoro** rimuove quella classificazione. Le generazioni multimediali mantengono la libreria esistente.

L’eliminazione chiede conferma e riguarda la risorsa scelta. Eliminando un’immagine di un batch, le altre rimangono. Anteprime e collegamenti alle copie eliminate possono smettere di funzionare. Il testo originale di una chat non viene cancellato quando elimini il suo artefatto HTML ricostruito. L’eliminazione locale non cancella copie remote o backup già esportati.

## Agente, JavaScript e Python

Nelle **Impostazioni dello spazio di lavoro**, il flag per l’agente abilita `session_file` e `session_js` in modalità Agent/Work. Il primo gestisce i file cifrati della chat; il secondo esegue JavaScript locale isolato con i soli file selezionati. I vecchi strumenti Work conservano percorsi e autorizzazioni precedenti. Per usare un allegato nel nuovo runtime, l’agente lo importa con `session_file`.

JavaScript non dispone di Node.js, terminale, rete, DOM, dati dell’app o chiavi API. Le modifiche vengono salvate insieme solo dopo un’esecuzione riuscita. Errori, annullamenti e modifiche concorrenti non pubblicano i risultati dell’esecuzione. Puoi eseguire uno script `.js` anche dalla sua anteprima.

Python è opzionale. Scegli i pacchetti, premi **Scarica Python**, poi abilitalo per questa chat. Il runtime di base occupa circa 13 MB e non installa Python di sistema o l’ambiente di compilazione dell’app. I pacchetti aggiungono spazio. I download espliciti contattano jsDelivr senza inviare file delle chat o chiavi API; runtime e pacchetti vengono verificati con SHA-256.

Durante l’esecuzione, Python usa esclusivamente i file scelti in `/workspace`; puoi usare `open` e `pathlib`. La rete è bloccata anche dalla Content Security Policy del browser. Non sono disponibili filesystem nativo, dati dell’app o credenziali. L’interprete viene eliminato dopo ogni chiamata. Il limite della memoria WASM è 256 MiB, a cui si aggiunge la memoria del browser e del caricatore. Sono disponibili pacchetti del catalogo Pyodide verificato, come NumPy e Pandas: non è un ambiente `pip` di sistema. `session_python` compare soltanto quando installato e abilitato per la chat.

## Backup e limiti

**Backup dei file di lavoro** esporta un archivio cifrato, inclusi file intermedi e risultati finali. Conserva separatamente la passphrase. Il ripristino aggiunge file alla chat corrente e mantiene quelli esistenti; i nomi in conflitto finiscono in una cartella `restored-…/`. L’archivio deve essere autenticato integralmente prima della pubblicazione dei file. Messaggi della chat, libreria e cartelle Work precedenti usano i rispettivi strumenti di backup.

Limiti attuali: anteprima testuale 2 MiB; singolo file gestito 10 MiB; 2.048 file e 512 MiB per chat; 128 file e 20 MiB per esecuzione. JavaScript ha un limite di 20 secondi; Python 60 secondi, avvio compreso. Le anteprime multimediali dell’explorer sono limitate a 20 MiB; l’esportazione dei file cifrati grandi procede a blocchi. Le sessioni molto grandi mostrano un avviso di elenco parziale.

## Server MCP desktop

In **Condividi questa chat tramite MCP**, oppure nelle impostazioni MCP, puoi autorizzare un agente fidato sullo stesso computer. Il server è spento per impostazione predefinita, ascolta solo su `127.0.0.1` e usa un token locale revocabile. Non restituisce le chiavi dei provider. Ogni riavvio crea un token nuovo; il blocco dell’app o una modifica delle protezioni interrompono la condivisione.

I permessi distinguono lettura, scrittura/eliminazione, codice isolato, modelli testuali, Venice Studio, ricerca e altri servizi MCP. Le chiamate ai modelli richiedono conferma, salvo abilitazione esplicita delle chiamate automatiche; Studio mantiene le approvazioni della chat. Gli altri MCP possono avere accesso a risorse esterne alla chat: abilitali solo per client fidati. Un agente esterno autorizzato riceve contenuti decifrati e può elaborarli o inoltrarli con i propri strumenti; E2EE verso Venice non controlla quel client.

Il server esterno è distinto dall’MCP interno Venice, che resta in memoria. L’app desktop supporta già client MCP locali stdio e remoti; il nuovo server non aggiunge un terminale. Android non avvia un server HTTP persistente. Per protocollo, configurazione e limiti consulta [la guida MCP in inglese](local-mcp-server.md).

Venice non documenta attualmente una API pubblica WebSocket speech-to-speech compatibile con OpenAI Realtime. L’integrazione ufficiale per agenti descrive [STT → LLM → TTS con rilevamento locale della voce](https://docs.venice.ai/guides/integrations/livekit-agents). Questa versione non introduce una nuova modalità vocale continua.
