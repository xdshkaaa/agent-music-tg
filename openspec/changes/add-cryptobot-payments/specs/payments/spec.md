## ADDED Requirements

### Requirement: Offer catalog

The system SHALL maintain a catalog of purchasable offers. Each offer SHALL have a stable id, a title, a price with currency/asset, an active flag, and a grant that is either a number of generation credits or a subscription duration in days. Only active offers SHALL be purchasable by users.

#### Scenario: List active offers

- **WHEN** a user requests the offer list
- **THEN** the system returns only offers whose active flag is true, each with title, price, and what it grants

#### Scenario: Inactive offer is not purchasable

- **WHEN** a user attempts to create an invoice for an offer whose active flag is false
- **THEN** the system rejects the request and does not create an invoice

### Requirement: Invoice creation via Crypto Pay

The system SHALL create a CryptoBot Crypto Pay invoice for a chosen offer by calling the Crypto Pay `createInvoice` API with the offer's amount and asset, and SHALL return a pay URL to the buyer. The system SHALL persist a local record linking the invoice id to the buyer chat id, the offer id, and a status of `pending` at creation time.

#### Scenario: User buys an offer

- **WHEN** a user selects an active offer to purchase
- **THEN** the system creates a Crypto Pay invoice, stores a `pending` invoice record for that buyer and offer, and returns the pay URL

#### Scenario: Crypto Pay API failure

- **WHEN** the Crypto Pay `createInvoice` call fails or returns an error
- **THEN** the system does not store a paid invoice, surfaces an error to the buyer, and leaves the buyer's entitlements unchanged

### Requirement: Payment confirmation via webhook

The system SHALL expose a webhook endpoint that receives Crypto Pay invoice-paid updates. The system SHALL verify each webhook using the Crypto Pay signature derived from the app token before acting on it, and SHALL reject requests that fail verification.

#### Scenario: Valid paid webhook

- **WHEN** a webhook with a valid signature reports an invoice as paid
- **THEN** the system marks the corresponding invoice record as `paid` and fulfills the offer for the buyer

#### Scenario: Invalid signature

- **WHEN** a webhook arrives with a missing or invalid signature
- **THEN** the system rejects it with an error response and does not change any invoice or entitlement

### Requirement: Payment confirmation polling fallback

The system SHALL periodically poll Crypto Pay `getInvoices` for invoices still in `pending` status and fulfill any that Crypto Pay reports as paid. Polling SHALL be a safety net for missed webhooks and SHALL not double-fulfill invoices already marked `paid`.

#### Scenario: Missed webhook recovered by polling

- **WHEN** an invoice is paid but no valid webhook was processed
- **THEN** the next polling cycle detects the paid status via `getInvoices` and fulfills the offer

#### Scenario: Polling skips already-fulfilled invoices

- **WHEN** polling reports an invoice that is already marked `paid` locally
- **THEN** the system takes no further fulfillment action for that invoice

### Requirement: Idempotent fulfillment

The system SHALL fulfill each paid invoice at most once. Fulfillment SHALL credit generation credits or extend the subscription according to the offer's grant, and SHALL record the invoice as fulfilled so that repeated webhook or polling events for the same invoice have no additional effect.

#### Scenario: Duplicate confirmation events

- **WHEN** both a webhook and a polling cycle report the same invoice as paid
- **THEN** the buyer's balance or subscription is granted exactly once

#### Scenario: Fulfillment grants the offer

- **WHEN** a `pending` invoice for a credit package transitions to paid for the first time
- **THEN** the system increases the buyer's credit balance by the offer's credit amount and marks the invoice fulfilled
