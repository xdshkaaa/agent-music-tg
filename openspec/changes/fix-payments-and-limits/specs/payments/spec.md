# payments (delta)

## ADDED Requirements

### Requirement: Purchase cycle completes end-to-end for both payment methods
The system SHALL support the full purchase cycle for an active offer with either payment method: invoice creation (`POST /api/invoices` with `method: crypto|stars`, or the bot shop), payment confirmation (Crypto Pay webhook or poller; Telegram `successful_payment` for Stars), and grant application (credits added or subscription extended). After fulfillment the updated balance MUST be visible in `/api/me` and in the bot profile.

#### Scenario: Crypto purchase grants credits
- **WHEN** a user buys a credits offer via Crypto Pay and the signed webhook arrives
- **THEN** the invoice transitions pending→paid, the offer's credit amount is added to the user's balance, and `/api/me` reflects the new balance

#### Scenario: Stars purchase extends subscription
- **WHEN** a user buys a subscription offer via Telegram Stars and `successful_payment` is delivered
- **THEN** the subscription expiry is extended by the offer's day count (stacking on any remaining time) and the user can generate without credits

#### Scenario: Missed webhook is fulfilled by the poller
- **WHEN** a Crypto Pay invoice is paid but no webhook is received
- **THEN** the poller detects the paid invoice and applies the grant exactly once

#### Scenario: Duplicate confirmation grants once
- **WHEN** both the webhook and the poller (or duplicate `successful_payment` updates) report the same paid invoice
- **THEN** the grant is applied exactly once

#### Scenario: Inactive offer cannot be purchased
- **WHEN** a user attempts to create an invoice for an inactive or deleted offer
- **THEN** the request is rejected and no invoice is created
