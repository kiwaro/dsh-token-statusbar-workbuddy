# WorkBuddy usage status bar

Displays conversation usage, WorkBuddy credits, model rates and account balance below the DeepSeek Harness input. Requires the dsh-connect-workbuddy bridge for response credit records.

## Setup

1. Use Node.js 22.15 or later and DSH >=0.2.1-rc.2, <0.3.0.
2. Run npm run build and install this directory through DSH plugin management.
3. Enable the bridge, sign in and restart DSH.

Credits are associated with conversations by response ID across account rotation. Actual records replace estimates. The current conversation's daily total uses midnight in Beijing time. Account balance has a separate scope.

Run npm run check to build and test. See the Chinese [accounting](docs/ACCOUNTING.md), [migration](docs/MIGRATION.md) and [development](docs/DEVELOPMENT.md) guides for implementation details and limitations.
