# ChatGPT subscription allowance

The device-local unofficial subscription provider reads `GET https://chatgpt.com/backend-api/wham/usage` with the same vault-stored OAuth connection used for generation. It never switches to API billing. Tokens are attached only to the fixed ChatGPT host; redirects are rejected.

Remaining percentages are displayed in provider settings, the chat composer when this provider is selected, and image creation when its image provider is selected. Refresh is manual and automatic while the app is visible. Results are memory-only and cleared on disconnect/unmount/privacy lock. They are account-wide, not counters for the current chat. Empty or failed responses are unavailable, never an invented 0% or 100%.

The API's `primary_window` and `secondary_window` are classified by `limit_window_seconds`, not position. Five-hour and weekly windows, and additional model-specific limits, retain their actual period. A missing window is omitted. No monthly placeholder is displayed. `used_percent` is converted to `100 - used_percent`, clamped to 0–100. An account spending cap is shown separately because its public schema does not declare a billing period.

Tap the allowance indicator to open the details, including the plan and the date/time at which each window resets. Dates use the device's time zone. If a window has no reset timestamp, the dialog states that the date was not reported. The dialog participates in the mobile Back stack and closes on privacy lock.

This does not claim that every subscription exposes the same windows. Subscription billing periods and usage-limit periods are separate concepts; a client cannot calculate an authoritative monthly balance from token counts or the renewal date.

Primary implementation references, checked 2026-11-09:

- [OpenAI usage request](https://github.com/openai/codex/blob/main/codex-rs/backend-client/src/client/rate_limit_resets.rs)
- [Usage window schema](https://github.com/openai/codex/blob/main/codex-rs/codex-backend-openapi-models/src/models/rate_limit_window_snapshot.rs)
- [Account spending cap schema](https://github.com/openai/codex/blob/main/codex-rs/codex-backend-openapi-models/src/models/spend_control_limit_details.rs)
- [OpenAI plan and usage documentation](https://learn.chatgpt.com/docs/pricing)
