# Venice E2EE gateway receipts

## What the live investigation found

Venice's public API and the attested inference gateway are different byte boundaries. The gateway uses upstream model identifiers, records request transformations, and returns a response that Venice can decorate with model/usage metadata. A signature over gateway-observed request/response bytes cannot be assumed to hash the outer JSON/SSE received by this app. JSON key sorting is not a documented repair: these are SHA-256 hashes of bytes, not a canonical JSON signature.

Live calls on November 6, 2026 established that decryption succeeded and the EIP-191 signature recovered the same secp256k1 address bound into the fresh TDX attestation. The signed request/response hashes did not match the app's exact request and response bytes. The API's signature response explicitly instructs clients to treat its hashes as provider-reported unless a documented canonical representation can be independently reconstructed. This is an interoperability boundary, not evidence of a wrong signer.

The current [Venice response-signature guide](https://docs.venice.ai/guides/features/tee-e2ee-models#response-signatures) describes checking the signer against the attestation. The [Phala ACI specification](https://github.com/Phala-Network/private-ai-gateway-with-vllm-router-as-middleware/blob/main/spec/aci.md) distinguishes received/forwarded request bytes and cleartext/wire response hashes. Its [receipt builder](https://github.com/Phala-Network/private-ai-gateway-with-vllm-router-as-middleware/blob/main/src/aci/receipt.rs) hashes exact bytes. The live legacy surface still supplied `response.returned.body_hash`, whereas the current ACI specification uses `wire_hash` and `cleartext_hash`.

We also reviewed the current [venice-e2ee receipt verifier](https://github.com/elkimek/venice-e2ee/blob/main/src/receipt.ts). Its full ACI verification requires an independently established workload-keyset trust anchor and exact request/response bodies. The compatibility quote binds the legacy E2EE key and nonce; copying an Ed25519 key from unauthenticated metadata would not establish that additional trust. This app does not claim full independent ACI verification or invent normalizations until a hash happens to match.

A second implementation issue was Phala's zero-padded quote transport. The client now accepts at most 256 trailing zero bytes only for Phala TDX v4/type 0x81, then parses the declared quote length strictly. Nonzero/excess padding and other providers remain rejected.

## Choose the verification policy

In **Settings → Providers → Venice**, choose **Secure text chat → Require end-to-end encryption**. **Compatible gateway receipts** is off by default. Enabling it opens a separate warning and requires confirmation. It is a provider permission: model profiles, chat overrides and model/tool output cannot enable it.

- **Default strict verification:** requires the attested signature to bind the exact request and received content. Native tool calls additionally require coverage of their actual arguments. The live gateway mismatch withholds output and offers no plaintext retry.
- **Explicit compatibility:** keeps fresh attestation, model/key/nonce checks, encrypted input/output, AES-GCM authentication and the signature from the attested key. It checks ACI version, request/receipt identifiers, endpoint and consistency between signed hashes and receipt events. It trusts the provider-reported hashes rather than proving their independent binding to the app's actual payload. Substitution or replay of a payload may therefore escape this check. The active setting shows this limitation persistently.

This limitation also applies to tool selection. Encrypted tool messages keep definitions/calls/results inside encrypted text; native tool envelopes remain visible to Venice after separate consent. Both use the selected receipt policy plus existing SDK schema checks and tool/media approvals. Search and external MCP services receive execution arguments regardless of the model transport.

No verification failure silently enables compatibility, sends a plaintext prompt, or repeats a paid completion. Switching compatibility off restores strict verification immediately for subsequent requests. The transport marks released responses internally as `payload-bound` or `gateway-signature-only`; it does not label the latter as independently authenticated payloads.

## Live verification

The production transport completed an E2EE text call with Qwen and a full encrypted-text tool cycle with Gemma: the model selected `local_sum(7,5)`, the local tool executed once, and the result returned to the model encrypted before the final answer `12`. These calls used explicit compatible receipts. Qwen's smaller model also executed the tool, but produced an additional invalid call handled by SDK validation; model instruction-following is distinct from transport verification. This is not certification of every catalog model or independent hardware certificate-chain verification.
