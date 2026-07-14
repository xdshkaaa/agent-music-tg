# Deploy

Ship code changes (server, miniapp, config) to the VPS.

## Trigger

Manual — developer decides it's ready.

## Steps

1. Edit code in `server/`, `miniapp/`, or `deploy/`.
2. Run `bun run typecheck`.
3. Run `bun test`.
4. Run `./deploy/deploy.sh`.
5. Script builds miniapp, rsyncs to VPS, restarts systemd unit, curls `/healthz`.

## Checkpoints

- Step 2–3: are typecheck & tests passing? If not, go back to step 1.
- Step 5: did `/healthz` return 200? If not, roll back (see README).

## Push-right notes

Already fairly pushed — deploy.sh does max work before considering itself "done". Could push further: run typecheck + test inside the script and abort early.
