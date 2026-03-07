# TaskForest Protocol

Real-time bounty board on Solana — workers bid on bounties via MagicBlock Ephemeral Rollups (sub-50ms, gasless), settlement records archived on-chain.

**Program ID:** [`Fgiye795epSDkytp6a334Y2AwjqdGDecWV24yc2neZ4s`](https://explorer.solana.com/address/Fgiye795epSDkytp6a334Y2AwjqdGDecWV24yc2neZ4s?cluster=devnet)

## Architecture

```
L1 (Solana Devnet / Helius)              ER (MagicBlock)
┌──────────────────────┐                ┌──────────────────┐
│ initialize_job       │                │                  │
│ delegate_job ────────│──→ delegate ──→│ place_bid (×N)   │
│ submit_proof         │←── commit ←────│ close_bidding    │
│ settle_job           │                │ (gasless, <50ms) │
│ archive_settlement   │                └──────────────────┘
│ expire_claim         │
└──────────────────────┘
```

### Job Lifecycle

```
Open → Delegate → Bidding (ER) → Claimed → Submitted → Done/Failed → Archived
```

## Instructions (8 total)

| Instruction | Layer | Purpose |
|---|---|---|
| `initialize_job` | L1 | Create job PDA with reward, deadline, proof spec |
| `delegate_job` | L1 | Delegate job PDA to Ephemeral Rollup |
| `place_bid` | ER | Worker bids with stake (real-time, gasless) |
| `close_bidding` | ER→L1 | Select winner, commit+undelegate to L1 |
| `submit_proof` | L1 | Claimed worker submits proof hash |
| `settle_job` | L1 | Verifier passes/fails the job |
| `archive_settlement` | L1 | Archive settlement to PDA (future: ZK compressed) |
| `expire_claim` | L1 | Slash worker stake if deadline passed |

## Quick Start

### Prerequisites

- [Anchor CLI](https://www.anchor-lang.com/docs/installation) 0.32.1
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) 2.x
- Node.js 20+

### Build & Test (localnet)

```bash
anchor build
anchor test          # 7 tests — guards + archive
```

### Deploy to Devnet

```bash
# Set up environment
cp .env.example .env  # add your Helius API key
anchor deploy --provider.cluster <HELIUS_RPC> --provider.wallet keys/<wallet>.json
```

### Run Devnet ER Integration Test

```bash
ANCHOR_PROVIDER_URL="<HELIUS_RPC>" \
ANCHOR_WALLET=keys/<wallet>.json \
npx ts-mocha -p ./tsconfig.json -t 120000 tests/er-devnet.ts
```

### Run Client

```bash
cd client
npm install
npm run dev
```

## Project Structure

```
programs/taskforest/src/lib.rs    # Anchor program (8 instructions)
tests/taskforest.ts               # Localnet unit tests (7 passing)
tests/er-devnet.ts                # Devnet ER integration test (7 steps)
client/src/App.tsx                # Web client
scripts/deploy-devnet.sh          # Deploy helper
keys/                             # Wallet keypairs (gitignored)
.env                              # Helius API key (gitignored)
```

## Key Technical Notes

- **No status mutation in `delegate_job`** — delegation CPI transfers PDA ownership; any Anchor auto-serialization after would fail with `ExternalAccountDataModified`
- **Dynamic ER routing** — Magic Router (`devnet-router.magicblock.app`) assigns the ER region; don't hardcode endpoints
- **`@solana/web3.js` workaround** — `sendAndConfirmTransaction` used directly instead of Anchor's broken `sendAndConfirm` in web3.js 1.95+
- **Settlement archive** — uses regular PDA (Light Protocol `light-sdk` needs `rustc 1.85+`, Anchor bundles `1.79.0`)

## Stack

- **On-chain:** Anchor 0.32.1, `ephemeral-rollups-sdk 0.6.5`
- **Client:** React + Vite, `@coral-xyz/anchor`
- **RPC:** Helius (devnet)
- **ER:** MagicBlock Ephemeral Rollups
