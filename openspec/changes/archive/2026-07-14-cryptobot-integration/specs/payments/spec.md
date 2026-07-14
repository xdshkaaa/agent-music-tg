## ADDED Requirements

### Requirement: Create invoice
The system SHALL create a Crypto Pay invoice for a selected offer when the user requests to purchase it.

#### Scenario: User requests to buy an offer
- **WHEN** the user selects an active offer via `/buy` command or Mini App
- **THEN** the system calls `createInvoice` on Crypto Pay API with the offer's amount and asset
- **AND** the system stores the invoice as `pending` in the `invoices` table with `chat_id`, `offer_id`, `amount`, `asset`
- **AND** the system returns the pay URL (bot invoice link) to the user

#### Scenario: Inactive offer selected
- **WHEN** the user selects a deactivated offer
- **THEN** the system SHALL reject with an error message

### Requirement: Confirm payment via webhook
The system SHALL accept incoming webhook POST requests from Crypto Pay on `/api/crypto/webhook` and verify the signature before processing.

#### Scenario: Valid webhook received
- **WHEN** Crypto Pay sends a POST with `update_type=invoice_paid` and a valid `crypto-pay-api-signature` header
- **THEN** the system SHALL verify the signature using HMAC-SHA256 with key `SHA256(app_token)` against the raw request body
- **AND** the system SHALL call `fulfillInvoice(invoiceId)` to grant the user the purchased offer

#### Scenario: Invalid signature received
- **WHEN** the signature header is missing or does not match
- **THEN** the system SHALL reject with HTTP 403
- **AND** the system SHALL NOT process the invoice

### Requirement: Confirm payment via polling fallback
The system SHALL periodically poll Crypto Pay `getInvoices` for locally-pending invoices that may have been missed by the webhook.

#### Scenario: Missed webhook recovered by poller
- **WHEN** a pending invoice's status in Crypto Pay is `paid` and the webhook was never received
- **THEN** the poller SHALL detect it on the next interval
- **AND** call `fulfillInvoice(invoiceId)` to fulfill the purchase

### Requirement: Idempotent fulfillment
The system SHALL fulfill each invoice exactly once, even if webhook and poller fire concurrently.

#### Scenario: Concurrent webhook and poller
- **WHEN** both webhook and poller attempt to fulfill the same invoice simultaneously
- **THEN** only one SHALL succeed because of the guarded `UPDATE ... WHERE status='pending'` transition
- **AND** the user SHALL receive the grant exactly once

#### Scenario: Webhook fulfills first, poller runs after
- **WHEN** the webhook already flipped the invoice to `paid`
- **THEN** the poller SHALL find no rows to update
- **AND** SHALL skip fulfillment without error

### Requirement: List active offers
The system SHALL expose a `GET /offers` endpoint returning all active offers with their title, price, asset, and grant details.

#### Scenario: User requests offers list
- **WHEN** an authenticated user calls `GET /offers`
- **THEN** the system SHALL return all offers where `active = 1`
