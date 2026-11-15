# WorkBuddy usage status bar

Displays conversation usage, WorkBuddy credits, model rates and account balance below the DeepSeek Harness input. Requires the dsh-connect-workbuddy bridge for response credit records.

## Setup

1. Use Node.js 22.15 or later and DSH >=0.2.1-rc.2, <0.3.0.
2. Run npm run build and install this directory through DSH plugin management.
3. Enable the bridge, sign in and restart DSH.

Credits are associated with conversations by response ID across account rotation. Actual records replace estimates. The current conversation's daily total uses midnight in Beijing time. Account balance has a separate scope.

Run npm run check to build and test. See the Chinese [accounting](docs/ACCOUNTING.md), [migration](docs/MIGRATION.md) and [development](docs/DEVELOPMENT.md) guides for implementation details and limitations.

## Trae pricing limits

Trae token usage and actual credits remain available independently. Without verifiable cache billing details and a CNY conversion, model rows show “CNY price unavailable” instead of public API list prices. Mixed-provider totals are labeled “Estimated cost (priced channels only)”; Trae-only sessions omit the CNY estimate.

## Resource limits

Accounting runs in a single worker with eight pending queries at most. Identical queries share a result, cached in memory for 60 seconds. Reproducible payloads are no longer persisted. Usage-only transcript caches exclude conversation bodies and are limited to 32 sessions / 16 MiB. Reads allow 64 MiB compressed input, 16 MiB per decompressed frame and 256 MiB total decoded data; the worker V8 old generation is limited to 256 MiB. Oversized sessions report unavailable without modifying source data. Historical credit imports are batched, corrections remain durable, hidden pages pause polling, only visible conversation bars subscribe, and unmounted bars release session caches. Account balances are sampled once a minute; unchanged balances and journal totals do not rewrite logs or snapshots.
