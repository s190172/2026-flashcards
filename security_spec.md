# Firebase Security Specification (Multi-Tenant Flashcards)

An exhaustive review of the security boundaries, invariant rules, and threat models for Firestore collections.

## 1. Data Invariants
- **Flashcards Collection (`/cards/{cardId}`)**: 
  - An individual user can only create, read, update, or delete cards where the `userId` matches their authenticated `request.auth.uid`.
  - All standard CRUD operations must be authenticated.
  - Required fields (`id`, `userId`, `term`, `definition`) must be correct types, matching safe lengths.
  - Immutability constraint: `userId` and `id` must not change after creation.
- **User Stats Collection (`/users/{userId}/stats/dashboard`)**:
  - The document path `{userId}` must strictly match the user's authenticated `request.auth.uid`. 
  - Users can only read and write their own stats.
  - `userId` must equal `request.auth.uid`.

---

## 2. The "Dirty Dozen" Threat Payloads
Here are 12 specific payloads designed to break our database, bypass authentication, hijack other users' data, or inject malicious payloads:

1. **Unauthenticated Read Attack on Cards**: Attempting to read a card document without credentials.
2. **Cross-Tenant Card Theft (Get)**: Authenticated User A tries to read a card belonging to User B.
3. **Cross-Tenant Card Scraping (List)**: Authenticated User A requests all cards without filter, hoping to see User B's cards.
4. **Identity Spoofing on Card Creation**: Authenticated User A tries to create a card setting `userId` to "admin" or "userB_id".
5. **Card Content Value Poisoning**: Creating a card where the `term` or `definition` is an extremely large string (e.g., > 10KB each) to trigger cost-attacks.
6. **Immutable Field Tampering**: User tries to update a card's `userId` to change its ownership.
7. **Phantom Status Injection (Shadow Fields)**: User tries to inject a field like `isAdmin: true` onto a card or user document.
8. **Invalid ID Poisoning**: User crafts a card document ID containing massive alphanumeric strings or binary characters.
9. **Spoofed User stats Overwrite**: User A tries to write a stats document at paths belonging to User B: `/users/UserB/stats/dashboard`.
10. **Unauthenticated Stats Update**: Attempting to set studied count or best match time without being signed in.
11. **Negative Score Exploit**: Writing negative integers to `studiedCount` or `bestMatchTime`.
12. **Timestamp/Temporal Spoofing**: Overwriting timestamps with arbitrary client dates instead of server timestamps.

---

## 3. Test Cases (TDD Verification)

The rules will mathematically prevent these 12 malicious scenarios:
All tests verify `PERMISSION_DENIED`.

- `testUnauthenticatedCardRead()` -> REJECT
- `testCrossTenantCardRead()` -> REJECT
- `testListCardsWithoutUserFilter()` -> REJECT
- `testIdentitySpoofingOnCreate()` -> REJECT
- `testSizeLimitExceeded()` -> REJECT
- `testImmutableOwnerUpdate()` -> REJECT
- `testGhostFieldInjection()` -> REJECT
- `testMalformedId()` -> REJECT
- `testCrossTenantStatsWrite()` -> REJECT
- `testUnauthenticatedStatsRead()` -> REJECT
- `testNegativeStatsWrite()` -> REJECT
- `testClientControlledTimestamps()` -> REJECT
