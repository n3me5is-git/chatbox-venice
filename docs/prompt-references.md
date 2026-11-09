# Prompt references

Type `@` at the cursor to open inline suggestions. Continue typing to filter by name, path or description, use arrow keys and Enter/Tab to choose, or tap a result. Escape dismisses the list. Email addresses do not trigger it. Selecting a reference inserts it without sending the prompt.

- Dedicated agents use `@technical-name` and the existing Work delegation rules. Local owners can explicitly tag an agent; collaborators can use only agents already exposed by the host policy.
- Files insert a named sandbox link to a file in the current session. The model can open it using the session file tools in Work mode. Suggestions list metadata; file bytes are not loaded into the composer.
- Conversations insert a named `chatbox:chat/ID` link. In a Work request, the owner exposes a reader for those exact IDs only. The reader returns up to 40 recent messages and 20,000 text characters, excluding system prompts, tool payloads and file bytes. Access is checked again before and after reading. Conversations in another protected scope are not offered/read. Open the link to navigate to that conversation.
- MCP entries insert `@tool:technical-name`. These are hints to tools already enabled in the current environment; they never enable a disconnected server or bypass approvals.

For remote chats, suggestions use the host's shared file/agent/tool metadata. They cannot read the guest's local conversations or enumerate other conversations on the host. Existing model/tool/guardian permissions remain authoritative.
