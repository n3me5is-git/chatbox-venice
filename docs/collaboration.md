# Collaborative chats

Open **Share and collaborate** (the people icon) in a saved chat header. Select **Share this chat**, then open **Pairing code and QR**. Another person opens **Collaborative chats** in the sidebar, enters a display name and pastes the code, scans with the live camera, or uploads a QR image. Use 1.40.0 or later on both devices for the full remote interface and controls.

Joining opens a full remote chat page, also listed under **Remote chats** beside the local conversation list. The cloud icon identifies a temporary remote session. Its context/overflow menu manages the connection or leaves the session. Local chats keep their existing storage and generation behavior; joining does not create a persistent local chat. Clone explicitly when permitted to keep a copy.

The remote view shows authors, the host model, live response text, visible thinking, tool activity/errors, HITL questions and the current active conversation thread. Files and media open from message links or the shared file explorer. No file bytes are prefetched by the transcript. One preview is retained at a time (64 MB media/file limit, 2 MB text limit, bounded raster dimensions); closing it releases the object URL. Markdown includes tables, LaTeX, Mermaid and the existing exports. Larger or unsupported files can be imported by cloning when allowed.

The settings button exposes supported thinking levels and the separate Chatbox search, Venice search engine/mode/citation controls, or ChatGPT native search switch. Changes require both write and AI interaction permission, are checked against the current host controls, and apply to the shared conversation for everyone. The model, MCP server selection, credentials, system prompt, approval policy and device/security settings remain host-controlled. Conflicting settings changes and changes during generation are rejected with a visible explanation. The guest never executes its own providers or tools for a remote request. Enter creates a new line; the send button or Ctrl/Cmd+Enter submits.

Names and participant IDs are displayed on remote messages and persisted on the host's user messages. Their IDs come from the authenticated peer, rather than a user-supplied author field. Remote @ suggestions contain shared files and exposed host agents/tools; they never enumerate other host conversations.

Each installation has a local participant key and ID. The owner sees the name and ID of a joining participant and must admit them before any transcript or files are sent. A name is a display label, not proof of a person's identity: check the participant ID when admitting someone.

The owner can independently grant:

- **Write messages**: add a human message to the conversation.
- **Use AI and tools**: ask the owner's configured AI to reply and use its tools. This uses the owner's providers and can incur charges.
- **Clone chat and files**: import an independent local copy.

Read-only participants can browse the shared transcript and open supported files. No provider configuration, API keys, PINs or device unlock keys are sent as application settings. Content deliberately included in the conversation is shared content.

## Questions and approvals

Every shared session has **Who can answer agent questions and approvals?**:

| Setting | Recipient and decision |
| --- | --- |
| Session owner only | Only the owner can answer. |
| Everyone: the first valid answer wins | All admitted participants, including the owner, can answer. The host accepts one valid response and closes the request everywhere. |
| Only the person who sent the request | Only the initiating participant can answer that turn's questions and approvals. Owner-originated turns go to the owner. |

This covers the agent's `ask_user` tool, Venice image/media generation and deletion approvals, and Retry/Skip decisions after a failed generation. Questions support single choices, multiple choices and custom text. The original requester is retained through image background follow-ups. Replies are checked on the host; expired, duplicate, revoked or unauthorized responses are refused. Requests expire after ten minutes or cancel when the turn/share stops. Changing the policy cancels existing decisions.

Guest-originated tool turns also recheck membership and interaction permission when tools execute. Revoked/disconnected requests cannot resume as an automatically approved owner task, including after restart. Send a new owner message to continue a former guest task locally.

While a chat is shared, paid Venice operations require an explicit decision even if that chat previously had automatic/similar approval enabled. Guests cannot change the owner's automatic-approval policy. Local operating-system commands, security prompts, project PINs and device access remain owner-side controls.

Image approvals let participants choose the model, prompt, count and supported aspect ratio, with catalog pricing when available. Reference-dependent image editing needs files on the owner's device and its full local image dialog. Remote choices do not upload guest-device reference images. Models requiring those references are disabled in the remote basic approval form; the owner can use owner approval mode for that workflow.

## Files and cloning

The shared file list covers accessible session files, attachments, artifacts and generated media. Individually protected creations are not exposed through an otherwise public chat, even if that protected area is currently unlocked. Assets protected by a different project are excluded. Project-scoped shares require the owner's existing project access and stop when it locks.

Guests keep a temporary bounded view. Media is requested on demand. File transfers use acknowledged 32 KiB chunks, with one incoming file per guest, rather than loading the entire workspace into RAM. Supported previews are bounded to 12 MiB. Larger media can be imported by cloning.

Cloning creates a new local chat and copies all files in the complete shared snapshot into the existing encrypted device storage. Failed/cancelled imports remove the partial chat and transferred files. Managed workspace tools start disabled; imported scripts are files and are not executed automatically. Deliverables can appear in the library; intermediate scripts stay in the explorer. The copy uses the recipient's device storage and access settings, not the owner's PIN.

Archived threads and alternative replies are preserved as a linear transcript; the original branch-navigation tree is not recreated. Current bounds are 10,000 messages, 4,000 listed resources, approximately 8 million characters per protocol snapshot, and 128 MiB per streamed media file. Import uses the existing 2,048-file/512 MiB workspace quota, with 10 MiB per ordinary file and 128 MiB per media file. An incomplete/oversized snapshot disables cloning rather than silently claiming a complete copy.

Clone permission controls the app's import function. Someone who can read content can still copy it manually. Revocation stops future access and transfers; it does not erase material already received, saved or photographed.

## Encryption and lifetime

WebRTC data channels use DTLS. In addition, each owner/participant connection uses an application AES-256-GCM channel, derived with WebCrypto P-256 ECDH and HKDF. The invitation contains a fresh room secret and pins the owner's public key. Fresh connection nonces, directional keys and checked sequence numbers prevent reusing an old connection's frames or accepting a duplicate frame. An invited participant cannot use the common signaling password to impersonate the pinned owner to another guest.

Public Nostr relays handle pairing/signaling; they do not receive plaintext chat messages or files. The Trystero/QR implementation is locally bundled from the pinned chicCanva reference, with its licenses included. No runtime CDN script is loaded. The optional custom signaling relay must use `wss://`; unencrypted `ws://` is accepted only for explicit localhost testing.

This encrypts collaboration traffic between participants. AI/provider and MCP calls still run on the owner under the chat's existing privacy, tool and approval settings. This is separate from Venice text E2EE/TEE. Authorized participants and the owner can read the shared content on their devices. Direct WebRTC and STUN expose network addresses to peers and network services; this feature does not provide network anonymity.

Up to eight owned and eight joined chats can be active independently in memory. **Stop sharing** revokes the room; **Revoke access** removes one participant. The green people icon indicates an active share; pending owner decisions add a count. Sharing stops on app privacy lock, chat deletion, page/app exit. Mobile background suspension can interrupt it. The default setup has STUN and no TURN relay, so some NAT/firewall/mobile networks will not connect; use another network if direct pairing is blocked.

## Verification

Actions exercise three isolated real Chromium contexts using the bundled Nostr/WebRTC transport and a loopback signaling relay. Checks cover admission, distinct device IDs, denied forged permissions, message authorship, all three HITL policies, multiple/custom answers, image model selection, stale replies, acknowledged binary cloning, concurrent rooms, QR round-trip, revocation and privacy lock. Crypto tests cover both directions, tampering, replay and wrong-owner/old-connection keys. These tests do not contact inference providers or spend generation credits.

Physical Android devices, public relay availability and arbitrary external NAT combinations still need device/network testing. This is not an independent security audit.
