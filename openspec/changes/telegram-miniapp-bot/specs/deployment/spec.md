## ADDED Requirements

### Requirement: TLS-terminated Mini App domain
The deployment SHALL serve the Mini App and its API over valid HTTPS at `miniapp.xdshka.party`, with certificates obtained and renewed automatically, and SHALL NOT rely on the bare VPS IP for the Mini App URL.

#### Scenario: DNS is correctly pointed
- **WHEN** `miniapp.xdshka.party` resolves to `YOUR_VPS_IP` and the reverse proxy starts
- **THEN** it obtains a valid TLS certificate and serves the Mini App over HTTPS

#### Scenario: DNS is not yet pointed
- **WHEN** `miniapp.xdshka.party` does not resolve to the VPS at deploy time
- **THEN** certificate issuance fails visibly in the deploy process instead of silently falling back to an insecure/self-signed certificate

### Requirement: Process supervision
The bot/API process SHALL run under systemd with automatic restart on failure, and SHALL start automatically on VPS boot.

#### Scenario: Process crashes
- **WHEN** the bot/API process exits unexpectedly
- **THEN** systemd restarts it automatically

#### Scenario: VPS reboots
- **WHEN** the VPS restarts
- **THEN** the bot/API process and the reverse proxy both come back up without manual intervention

### Requirement: Secrets stay off the client and out of version control
The deployment SHALL keep the Telegram bot token, Spotify client credentials, and all LLM provider API keys in a server-side environment file on the VPS only, never in the Mini App's client bundle and never committed to the repository.

#### Scenario: Mini App bundle is inspected
- **WHEN** the built Mini App's static assets are inspected
- **THEN** no bot token, Spotify credential, or LLM API key appears in them

#### Scenario: Repository is inspected
- **WHEN** the git history or working tree of the repository is searched for secret-shaped strings
- **THEN** none of the deployed secrets are found

### Requirement: Release and rollback
The deployment process SHALL support deploying a new release by syncing built artifacts to the VPS and restarting the supervised process, and SHALL support rolling back to the previous release directory if the new one fails to start or fails a post-deploy health check.

#### Scenario: Successful deploy
- **WHEN** a new release is synced and the process restarted
- **THEN** a post-deploy health check against the API succeeds

#### Scenario: Failed deploy
- **WHEN** a post-deploy health check fails after restarting into a new release
- **THEN** the previous release directory can be re-activated and the process restarted against it
