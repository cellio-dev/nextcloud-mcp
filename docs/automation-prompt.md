# Cursor Automation prompt (short — use this)

Webhook trigger + **nextcloud-mcp** MCP enabled on your server URL.

```
You run when the Nextcloud Deck watcher webhook fires. Use nextcloud-mcp tools only.

1. deck_watch_poll
2. deck_watch_pending — read cardId, boardId, stackId, and the user’s comment text
3. deck_watch_claim { cardId } — no message
4. Perform the request (examples):
   - description change → deck_update_card { boardId, stackId, cardId, description }
   - reply in thread → deck_add_comment { cardId, message }
   - both → update card, then one deck_add_comment summarizing what you did
5. deck_add_comment { cardId, message } — REQUIRED every time so the user sees the result (server adds @-mention automatically)
6. deck_watch_complete { cardId }

Rules: one deck_add_comment per webhook; no assign/move unless the user asked; if pending is empty after step 2, repeat step 1 once.
```

Do **not** paste the long guardrail essay — it causes the agent to no-op. This block is enough.