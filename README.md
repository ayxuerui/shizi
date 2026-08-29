# shizi
Help Eliana to Learn Chinese

## Development & verification

- **Dev environment:** `https://shizi-dev.realxco.com/assessment/` — an isolated
  deployment for verifying candidate builds without touching the app the child
  actually uses (`https://shizi.realxco.com/assessment/`). Day-to-day operating
  notes live in [infra/README.md](infra/README.md).
- **Ship loop for dev** (from the checkout holding your change):
  `npm run build --workspace=apps/assessment -- --mode dev`, then
  `docker restart shizi-gateway-dev`.
- **Real-browser verification by agents:** see [AGENTS.md](AGENTS.md).
