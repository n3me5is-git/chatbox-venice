# Collaborative pairing and QR scanning

In **Share and collaborate**, choose **Scan with camera** for live QR recognition or **Upload QR image** for an existing photo/screenshot. Both use the bundled jsQR decoder on the device. Scanning fills the pairing code; you still choose **Join chat** and the owner must admit you. Camera frames are not uploaded or saved. Closing the scanner, locking the app or putting the scanner in the background stops capture. Android requests camera permission when scanning; microphone access is not requested.

Keep both apps open during pairing. The invitation must belong to an active share. A QR code from a share that was stopped cannot restart it. A participant whose connection fails can choose **Retry connection**. This creates a new connection and requires owner admission again.

The connection uses three separate layers:

1. A Nostr signaling relay exchanges encrypted pairing information. Both devices must use the same relay configuration.
2. WebRTC attempts a direct connection using STUN. Being on the same Wi-Fi helps, but guest networks/client isolation, VPNs and blocked UDP can still prevent peers reaching each other.
3. If direct connections are unavailable, a configured TURN relay can forward encrypted traffic. Signaling and TURN are different services: changing only the signaling relay cannot fix blocked WebRTC.

**Connection options** accepts an optional TURN address (`turn:host:3478?transport=udp` or `turns:host:443?transport=tcp`) plus username/password. Configure reachable TURN service credentials on both devices. The app does not supply a public TURN account. Credentials remain in the current panel/active transport and are neither persisted nor embedded in invitations. The owner must stop and recreate the share after changing connection settings. **Use TURN only** disables direct candidates for that connection; it requires TURN credentials. TURN sees traffic/network metadata, while WebRTC DTLS and the existing authenticated AES-GCM application channel protect message/file contents.

Errors now distinguish failed WebRTC establishment, an unverifiable invitation, a secure-handshake timeout and an owner/signaling timeout. Unknown structured transport errors are reduced to their actual message rather than `[object Object]`, without dumping pairing records or secrets.

## Validation boundaries

Automated checks exercise the actual QR decoder against a live video element with a synthetic camera feed and against a file input, plus real Chromium WebRTC connections with direct and forced TURN paths. Android emulator instrumentation checks camera capture and a WebRTC data-channel exchange in the Capacitor WebView on API 34/35. These checks do not reproduce every physical phone, access point or system WebView release. A failure observed on two physical Android devices remains unconfirmed until that device pair is retested or its actual transport error is available.

## Italiano

In **Condividi e collabora**, **Scansiona con fotocamera** legge il QR in tempo reale; **Carica immagine QR** permette di scegliere una foto o uno screenshot. La lettura resta sul dispositivo, senza salvare o inviare i fotogrammi. Il codice viene compilato, poi devi premere **Partecipa alla chat** e il proprietario deve ammetterti. Chiudere la scansione, bloccare l’app o metterla in background spegne la fotocamera.

Durante l’accoppiamento tieni aperte entrambe le app. **Riprova connessione** ricrea il collegamento dopo un errore e richiede una nuova ammissione. Sulla stessa Wi-Fi possono comunque intervenire isolamento dei client, VPN o filtri UDP. Il relay di segnalazione serve ad accoppiare i dispositivi; per superare i blocchi alla connessione diretta può servire un relay TURN, configurabile in **Opzioni di connessione**. Le credenziali TURN non vengono salvate né inserite nel QR. TURN inoltra traffico cifrato: può osservare metadati di rete, non il contenuto della chat. Le modifiche del proprietario richiedono di interrompere e riavviare la condivisione.
