# fix-offer-save-non-usdt

Fix bug: offers/packages with non-USDT assets cannot be saved via the admin panel (Mini App) because the PATCH handler unconditionally validates starsAmount as required, blocking saves for legacy offers with NULL stars_amount.
