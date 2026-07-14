# payments — delta

## ADDED Requirements

### Requirement: Offer supports optional Telegram Stars price
An offer SHALL have an optional Stars price (`stars_amount`, positive integer). An offer with a NULL Stars price SHALL be purchasable only via crypto. The crypto price remains required.

#### Scenario: Crypto-only offer shows no Stars option
- **WHEN** a buyer opens an offer whose `stars_amount` is NULL
- **THEN** no Stars payment option is presented and the crypto flow proceeds as before

#### Scenario: Dual-price offer offers method choice
- **WHEN** a buyer selects an offer that has both a crypto price and a Stars price
- **THEN** the buyer is asked to choose between crypto and Stars payment before an invoice is created

### Requirement: Stars purchase in bot chat
The bot SHALL sell dual-price offers for Telegram Stars using a native invoice with currency `XTR`. The bot MUST validate the offer in `pre_checkout_query` and MUST fulfill the grant upon `successful_payment`.

#### Scenario: Successful Stars purchase
- **WHEN** a user chooses Stars payment for an active offer and completes the payment
- **THEN** the system records a paid invoice with provider `stars` and the `telegram_payment_charge_id`, applies the offer grant (credits or subscription), and confirms to the user

#### Scenario: Offer deactivated before checkout completes
- **WHEN** a `pre_checkout_query` arrives for an offer that no longer exists or is inactive
- **THEN** the query is answered negatively with an error message and no payment is taken

### Requirement: Stars purchase in Mini App
`POST /invoices` SHALL accept `method: "crypto" | "stars"` (default `"crypto"`). For `stars`, the server SHALL create a Stars invoice link and return it; the Mini App SHALL open it via `WebApp.openInvoice` and refresh the user's balance after the invoice closes as paid.

#### Scenario: Stars purchase from Mini App
- **WHEN** the Mini App requests an invoice with `method: "stars"` for a dual-price offer
- **THEN** the server responds with a Stars invoice link, and after payment the same fulfillment path grants the offer exactly once

#### Scenario: Stars requested for crypto-only offer
- **WHEN** `POST /invoices` is called with `method: "stars"` for an offer whose Stars price is NULL
- **THEN** the server responds with a client error and creates no invoice

### Requirement: Exactly-once fulfillment across providers
Invoice records SHALL be keyed by `(provider, external_id)` with a uniqueness constraint. Duplicate payment notifications for the same external id MUST NOT grant twice. Existing crypto invoices SHALL be migrated to `provider = "crypto"` preserving status and history.

#### Scenario: Duplicate successful_payment delivery
- **WHEN** the same `telegram_payment_charge_id` is processed twice
- **THEN** the grant is applied exactly once

#### Scenario: Crypto webhook and poller race
- **WHEN** the webhook and the poller both report the same crypto invoice as paid
- **THEN** the grant is applied exactly once (behavior unchanged from before)

#### Scenario: Purchase history survives migration
- **WHEN** the invoices migration runs on a database with existing crypto invoices
- **THEN** all rows are preserved with provider `crypto` and prior status, and appear in `/profile` and `/me/purchases` as before
