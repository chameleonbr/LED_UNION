# Spec: data-sources

**Version:** 1.0
**Status:** Draft
**Author:** reversa-spec-sdd
**Date:** 2026-10-31
**Reviewers:** André Avila

> Selo 🟡 PLANEJADO em todos os itens.

---

## 1. Resumo (Summary)

🟡 A generic data-source feature: the user registers an HTTPS JSON URL, a field path and a refresh interval; values are bound into text items via `{name}` placeholders and can also feed trigger rules (value changed / crossed threshold). Third-party APIs are **not** integrated in the app: the repo ships ready-to-import n8n example workflows that proxy them (channel followers, X followers/posts, live comments) and expose a small JSON with CORS enabled. Phase 4.

---

## 2. Contexto (Context)

**Problem:** 🟡 The Content creator wants live social data on the panel. Browsers block most third-party APIs (CORS) and API secrets must not live in the PWA.

**Evidence:** 🟡 Creator journey steps 4–7; user decision: "use n8n only to test and as proxy; no third-party development inside the app; easy examples".

**Why now:** 🟡 After library and playlist exist to display values.

---

## 3. Goals

- [ ] 🟡 G-01: A text item "Followers: {followers}" shows a value from an n8n URL and updates on its own.
- [ ] 🟡 G-02: Example n8n workflows import and run with only credentials filled in.
- [ ] 🟡 G-03: No API secret stored in LED Union.

**Success metrics:**
| Metric | Current baseline | Target | Deadline |
|---|---|---|---|
| 🟡 Steps to add a source | n/a | ≤ 3 fields (URL, path, interval) | phase 4 |
| 🟡 n8n examples shipped | 0 | 3 (followers, X posts, live comments) | phase 4 |
| 🟡 Value-to-panel delay | n/a | ≤ interval + 15 s | phase 4 |

---

## 4. Non-Goals

- NG-01: 🟡 Native integrations or OAuth flows for YouTube, X, Twitch or any third party inside the app.
- NG-02: 🟡 Hosting or operating the n8n instance.
- NG-03: 🟡 WebSocket/streaming sources in v1 (polling only).
- NG-04: 🟡 Refresh with the app closed.

---

## 5. Usuários (Users)

**Primary user:** 🟡 Content creator (advanced, consumes APIs).

**Current journey:** 🟡 Not possible.

**Future journey:** 🟡 Import n8n example → set credentials → copy webhook URL → add source in LED Union → bind into text item → add to playlist.

---

## 6. Requisitos Funcionais (Functional Requirements)

### 6.1 Main requirements

| ID | Requirement | Priority | Acceptance criterion |
|---|---|---|---|
| RF-01 | 🟡 The user must add a source with name, URL (https only), field path (dot/bracket, e.g. `data.items[0].count`), interval (≥ 15 s) and optional request header. | Must | Form validation rejects `http:` and interval < 15. |
| RF-02 | 🟡 A "Test" button must fetch once and show raw JSON plus the extracted value. | Must | Value displayed. |
| RF-03 | 🟡 The system must poll each source while the page is visible and while a bound item is in use (playlist, scene, panel shown). | Must | No fetch when unused. |
| RF-04 | 🟡 Text items must replace `{name}` with the latest value, with optional format (number grouping, prefix/suffix, max length). | Must | `{followers}` → `1.234`. |
| RF-05 | 🟡 When a bound value changes, the system must re-render and re-upload the text item (only when changed). | Must | Unchanged value → 0 uploads. |
| RF-06 | 🟡 Sources must expose trigger events (`changed`, `above`, `below`) usable as `ActionRef` triggers. | Could | New follower → fire button. |
| RF-07 | 🟡 The repo must contain `examples/n8n/` with 3 workflow JSON files and a README: webhook → API call → `Respond to Webhook` with `{ value }` and `Access-Control-Allow-Origin` set to the app origin. | Must | Each imports into n8n without errors. |
| RF-08 | 🟡 Stealth must pause re-uploads; polling may continue. | Must | 0 writes during stealth. |

### 6.2 Happy Path

1. 🟡 The user imports `followers.json` into n8n, sets credentials, copies the webhook URL.
2. 🟡 In LED Union, adds source `followers` with path `value`, interval 60 s; Test shows 1234.
3. 🟡 Creates text item "Followers: {followers}" and adds it to a playlist.
4. 🟡 Result: panel shows the count and updates when it changes.

### 6.3 Alternative flows

**Flow A — Public API with CORS:** 🟡 user points directly at it; no n8n needed.

---

## 7. Requisitos Não-Funcionais (Non-Functional)

| ID | Requirement | Target value | Note |
|---|---|---|---|
| RNF-01 | Rate | 🟡 Minimum interval 15 s per source | Protects APIs and BLE. |
| RNF-02 | Security | 🟡 HTTPS only; no third-party secrets in app storage | Header field meant for an n8n shared token only. |
| RNF-03 | Timeout | 🟡 Fetch timeout 10 s | AbortController. |

---

## 8. Design e Interface

**Affected components:** 🟡 new `Sources.svelte`, `src/lib/sources.ts`, `panel-content-library` text renderer, `persist.ts`, `examples/n8n/*`, `dict.ts`.

**Expected behaviour:** 🟡 List of sources with last value, last update time and status dot.

**UI states:**
- Empty: 🟡 "Add a JSON source or import an n8n example".
- Loading: 🟡 spinner on Test.
- Error: 🟡 "CORS blocked — use the n8n proxy" / "HTTP 4xx/5xx" / "Field not found".
- Success: 🟡 value + "updated 12 s ago".

---

## 9. Modelo de Dados (Data Model)

```
DataSource {
  id: string; name: string           // placeholder name: lowercase letters, digits, underscore
  url: string; path: string; intervalS: number
  header?: { name: string; value: string }   // n8n shared token, not a third-party secret
  last?: { value: string | number; at: string; error?: string }
}
```

**Migrations:** 🟡 No.

---

## 10. Integrações e Dependências (Dependencies)

| Dependency | Type | Impact if unavailable |
|---|---|---|
| 🟡 User's n8n instance | Optional | Only CORS-open URLs work. |
| 🟡 Third-party APIs (via n8n) | Optional | Value shows last known + error dot. |
| 🟡 `fetch` + AbortController | Required | — |

---

## 11. Edge Cases

| Scenario | Trigger | Expected behaviour |
|---|---|---|
| EC-01: CORS blocked | `TypeError` on fetch | 🟡 Error "CORS blocked — use the n8n proxy"; keep last value. |
| EC-02: Timeout | No response 10 s | 🟡 Retry next interval; error dot. |
| EC-03: Field missing | Path not found | 🟡 Show "—" in placeholder; error "Field not found". |
| EC-04: HTTP 429 / 5xx | Rate limit or server failure | 🟡 Exponential backoff up to 10 min. |
| EC-05: Long value | Text longer than max length | 🟡 Truncate with "…". |
| EC-06: Mixed content | `http:` URL | 🟡 Rejected at form. |

---

## 12. Segurança e Privacidade (Security)

- **Authentication:** 🟡 Optional shared header token to the user's n8n webhook.
- **Authorization:** 🟡 Handled in n8n.
- **Sensitive data:** 🟡 Third-party API keys live only in n8n credentials; examples never include keys.
- **Audit:** 🟡 N/A.

---

## 13. Plano de Rollout (Rollout)

- **Strategy:** 🟡 Phase 4 PR including `examples/n8n/`.
- **Rollback:** 🟡 Revert; placeholders render literally.
- **Monitoring:** 🟡 Test with each example for 1 h.

---

## 14. Open Questions

| # | Question | Impact | Owner | Deadline |
|---|---|---|---|---|
| OQ-01 | 🟡 Which channel platform (YouTube, Twitch, Instagram) for the followers example? | Medium | André | phase 4 |
| OQ-02 | 🟡 Which live platform for the comments example? | Medium | André | phase 4 |

---

## 15. Decisões Tomadas (Decision Log)

| Decision | Alternatives | Rationale |
|---|---|---|
| 🟡 Generic JSON + n8n examples | Built-in integrations | User decision; no secrets in PWA; CORS. |
| 🟡 Polling only | WebSocket/SSE | Simplest; enough for counts. |

---

## Appendix

### References
- `_reversa_sdd/prd.md` §4 phase 4, §6

### Revision history
| Version | Date | Author | Changes |
|---|---|---|---|
| 1.0 | 2026-10-31 | reversa-spec-sdd | Initial |

---

## Relatório de avaliação

Iterations: 2

```
  SCORE TOTAL: 100.0/100  —  ⭐ Excelente — Pronta para implementação

  BREAKDOWN POR DIMENSÃO:
  Dimensão             Score      Peso     Contribuição
  --------------------------------------------------
  Completude           100%       30%     30.0/pt
  Testabilidade        100%       25%     25.0/pt
  Clareza              100%       20%     20.0/pt
  Escopo               100%       15%     15.0/pt
  Edge Cases           100%       10%     10.0/pt

  ✅ PONTOS FORTES:
     ✅ Seção 1 (Resumo) presente e preenchida
     ✅ Seção 2 (Contexto) presente e preenchida
     ✅ Seção 3 (Goals) presente e preenchida
     ✅ Seção 4 (Non-Goals) presente e preenchida
     ✅ Seção 5 (Usuários) presente e preenchida
```
