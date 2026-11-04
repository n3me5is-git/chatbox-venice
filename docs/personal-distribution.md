# Installazione personale e firma dei pacchetti

Per questo fork non pubblichiamo su Google Play o Microsoft Store. Setup e APK si scaricano dalle [release del fork](https://github.com/n3me5is-git/chatbox-venice/releases). Non serve acquistare un certificato Windows commerciale per produrre il setup; Windows può mostrare avvisi per un installer non firmato.

## Android senza account sviluppatore Google

Dalla 1.25.0 il workflow compila un APK in modalità release, poi lo firma e verifica la firma nelle Actions. La firma Android usa una chiave del progetto: non richiede una registrazione Google Play.

L'installazione personale tramite ADB resta disponibile senza registrazione/verifica dello sviluppatore secondo le [FAQ ufficiali Android](https://developer.android.com/developer-verification/guides/faq). Il flusso di installazione di un APK dal browser dipende da dispositivo, versione, area e regole Android in vigore; per app di sviluppatori non verificati può essere richiesto il [percorso avanzato di Android](https://support.google.com/android/answer/17588095). Questo fork non aggira i controlli del dispositivo.

Per ADB servono solo i Platform Tools, non Android Studio o l'intero SDK di compilazione. Dopo avere autorizzato il computer sul telefono, l'aggiornamento si effettua con `adb install -r percorso-al-file.apk`. Usa sempre pacchetti scaricati dalla release del tuo fork.

## Conservare la stessa identità della firma

Gli aggiornamenti sul posto richiedono la stessa chiave. Il workflow supporta quattro repository secrets GitHub:

| Secret | Contenuto |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | File keystore codificato base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Password del keystore |
| `ANDROID_KEY_ALIAS` | Alias della chiave |
| `ANDROID_KEY_PASSWORD` | Password della chiave |

Si configurano in **Settings → Secrets and variables → Actions → Repository secrets** del repository GitHub. Non sono account Google e non contengono la API key Venice. La configurazione incompleta fa fallire la firma; non si ripiega silenziosamente su una chiave diversa. Il keystore dei secrets viene scritto solo temporaneamente nel runner, poi rimosso. Non viene inserito nella cache o negli artifact in chiaro.

Senza questi secrets viene riutilizzato il debug keystore della cache CI già usato dalle prime release, per mantenere compatibilità con quelle installazioni personali. La cache può essere eliminata da GitHub: non è un backup permanente. Cambiare chiave può richiedere esportazione dei dati, disinstallazione e nuova installazione. Una chiave nuova creata altrove non conserva automaticamente l'identità di quella precedente.

Il job **Sign and verify Android package** riporta nel log e nel riepilogo la fingerprint SHA-256 pubblica del certificato. Puoi inserirla come singola riga in `scripts/android-signing-cert.sha256`: dopo il pinning, una firma diversa o la perdita della chiave di fallback blocca la distribuzione invece di pubblicare un aggiornamento incompatibile. Non inserire password o materiale privato in quel file.

## Backup cifrato della chiave corrente

Aggiungi il repository secret `ANDROID_SIGNING_BACKUP_PASSPHRASE` con una passphrase robusta di almeno 20 caratteri. Alla successiva build Android, dopo la firma, il workflow carica l'artifact **Android-signing-backup-encrypted**. Scaricalo e conservalo fuori da GitHub: gli artifact CI scadono dopo 14 giorni. Conserva la passphrase separatamente; senza di essa non si recupera la chiave.

Il backup usa AES-256-GCM con salt e nonce casuali e PBKDF2-SHA256 (600.000 iterazioni). Contiene solo il keystore cifrato, non le sue password né la API key Venice. Se si usa il keystore di debug precedente, alias e password sono quelli Android standard (`androiddebugkey`, `android`). Se si usa una propria chiave, conserva anche alias e password originali.

Per ripristinare, su un ambiente fidato con Node imposta la passphrase nell'ambiente `ANDROID_SIGNING_BACKUP_PASSPHRASE`, quindi esegui:

```text
node scripts/android-signing.mjs restore android-keystore.aes.json restored-android.keystore
```

Il comando rifiuta di sovrascrivere un file esistente. Codifica il keystore ripristinato in base64 e inseriscilo nel secret GitHub; non commetterlo nel repository e non incollarlo in chat o nei log. Dopo il recupero rimuovi la passphrase dall'ambiente e conserva il keystore in modo protetto.

Il backup va abilitato e scaricato prima che la cache venga persa. Le Actions non possono ricostruire una chiave privata smarrita.
