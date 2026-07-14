## MODIFIED Requirements

### Requirement: Inline generation via /generate

The bot SHALL accept `/generate <prompt>` to start playlist generation with the given prompt text immediately, without requiring a separate free-text message.

The bot SHALL accept `/generate` without arguments and respond with a prompt asking the user to type their request, then treat the next text message as the generation prompt.

The bot SHALL show typing indicator before responding for generation that takes noticeable time.

On successful generation, the bot SHALL send the text playlist reply immediately, then automatically deliver each track as an audio message (`sendAudio`) to the chat, reusing the existing audio extraction and caching pipeline.

#### Scenario: /generate with prompt text

- **WHEN** user sends `/generate lofi beats for coding`
- **THEN** the bot starts generation immediately with prompt "lofi beats for coding"
- **THEN** the bot returns a playlist or appropriate error/access/clarify response
- **THEN** on success, the bot sends audio messages for each track after the text reply

#### Scenario: /generate without arguments

- **WHEN** user sends `/generate`
- **THEN** the bot sends a message "Напиши запрос для генерации плейлиста:"
- **WHEN** user replies with text
- **THEN** the bot starts generation with that text as the prompt
- **THEN** on success, the bot sends audio messages for each track after the text reply

#### Scenario: /generate without access

- **WHEN** user sends `/generate` but has no credits or subscription
- **THEN** the bot shows the purchase prompt with offer list
- **THEN** no audio delivery is attempted
