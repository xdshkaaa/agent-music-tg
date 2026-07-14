## MODIFIED Requirements

### Requirement: Free trial package offered in shop surfaces without invoices
Both purchase surfaces — the bot `/buy` flow and the Mini App shop screen — SHALL present a free trial package ("10 генераций на 3 дня") to users who have not yet claimed it, above the paid offers. Claiming it SHALL grant the trial instantly through the generation-access trial grant, bypassing the invoice flow entirely. Once claimed, the free package MUST no longer be offered to that user. The trial claim endpoint SHALL be unavailable (like invoice creation) while payments are disabled.

#### Scenario: Bot /buy shows the free package
- **WHEN** a user who has not claimed the trial opens /buy
- **THEN** a free-package button appears above the paid offers, and tapping it activates the trial and confirms with the granted amount and duration

#### Scenario: Mini App shows the free package card
- **WHEN** a user who has not claimed the trial opens the shop screen
- **THEN** a free-package card with a claim button appears above the paid offers, and claiming shows a success state

#### Scenario: Claimed users see only paid offers
- **WHEN** a user who already claimed the trial opens /buy or the shop screen
- **THEN** the free package is not shown

#### Scenario: Repeat claim via API is rejected
- **WHEN** a client calls the trial claim endpoint for a user who already claimed
- **THEN** the request fails with a conflict error and no grant is applied

#### Scenario: Payments disabled
- **WHEN** payments are disabled and a client calls the trial claim endpoint
- **THEN** the request fails with service-unavailable, consistent with invoice creation

### Requirement: Mini App BuyScreen refreshes after claiming
After a successful claim, the Mini App BuyScreen SHALL re-fetch its full state so the free card disappears and the purchase history is up to date.

#### Scenario: BuyScreen refreshes after claim
- **WHEN** a user successfully claims the trial via the Mini App
- **THEN** the BuyScreen re-fetches offers, purchases, and user state, hiding the free card and showing any new data

#### Scenario: Error during claim still refreshes
- **WHEN** a user attempts to claim but the API returns an error
- **THEN** the BuyScreen re-fetches to reconcile state (existing behaviour, unchanged)
