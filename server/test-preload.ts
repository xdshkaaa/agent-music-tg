/**
 * Test-only env defaults, loaded via bunfig.toml's [test] preload.
 *
 * server/env.ts snapshots process.env into a frozen singleton the first time it
 * is imported, and `bun test` shares one module registry across every test
 * file. So a per-file `process.env.X ??= ...` only takes effect if that file
 * happens to import env.ts first — whichever file wins the race decides the
 * config for the whole run. Setting the defaults here, before any module
 * loads, makes the ordering irrelevant.
 *
 * Real values still win: these only fill in what the environment omits.
 */
process.env.TELEGRAM_BOT_TOKEN ??= "test-token";
process.env.CRYPTOBOT_TOKEN ??= "test-crypto-token";
