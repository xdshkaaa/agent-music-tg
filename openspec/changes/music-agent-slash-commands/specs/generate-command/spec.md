## ADDED Requirements

### Requirement: Inline generation via /generate

The bot SHALL accept `/generate <prompt>` to start playlist generation with the given prompt text immediately, without requiring a separate free-text message.

The bot SHALL accept `/generate` without arguments and respond with a prompt asking the user to type their request, then treat the next text message as the generation prompt.

The bot SHALL show typing indicator before responding for generation that takes noticeable time.

#### Scenario: /generate with prompt text

- **WHEN** user sends `/generate lofi beats for coding`
- **THEN** the bot starts generation immediately with prompt "lofi beats for coding"
- **THEN** the bot returns a playlist or appropriate error/access/clarify response

#### Scenario: /generate without arguments

- **WHEN** user sends `/generate`
- **THEN** the bot sends a message "Напиши запрос для генерации плейлиста:"
- **WHEN** user replies with text
- **THEN** the bot starts generation with that text as the prompt

#### Scenario: /generate without access

- **WHEN** user sends `/generate` but has no credits or subscription
- **THEN** the bot shows the purchase prompt with offer list
