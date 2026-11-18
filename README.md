# AgentQuest Board

An **Agent ID-gated on-chain quest board** for the Binance Agent ID Hackathon
(Binance Wallet × BNB Chain, submission 2026-11-18 → 2026-12-09 08:00 UTC).

Holders of a Binance Agent ID check in once per UTC day, build streaks, and claim
ERC-1155 badges. Everything is free — users pay only network gas. There is no
token, no fee, no promised return, and the contract holds no funds.

## How Agent ID is used (access control)

- The contract reads the Binance Agent ID registry on BNB Chain
  (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`, SPACE ID Agent ID, ERC-721).
- **Every quest action requires holding an Agent ID**: `checkIn()` and
  `claimBadge()` both revert with `NotAgentIDHolder()` when
  `registry.balanceOf(msg.sender) == 0`.
- Agent ID is the *only* gate. No allowlist, no off-chain API, no login server.

## What it does

| Function | Behaviour |
|---|---|
| `checkIn()` | Once per UTC calendar day. Consecutive days grow the streak; a missed day resets it to 1. Emits `CheckIn(user, streak, totalCheckIns)`. |
| `claimBadge(1)` | "First Check-in" — eligible after ≥ 1 check-in. |
| `claimBadge(2)` | "3-Day Streak" — eligible at best streak ≥ 3. |
| `claimBadge(3)` | "7-Day Streak" — eligible at best streak ≥ 7. |
| `getUserStats(address)` | One-call read: current streak, best streak, total check-ins, last check-in day, can-check-in-today. |
| `uri(badgeId)` | Fully on-chain metadata: `data:application/json;base64` with an embedded SVG image (no external host). |
| `pause()` / `unpause()` | Owner-only emergency pause. The **only** privileged functions. |

Badge eligibility uses **best streak** (longest streak ever achieved), so a badge
earned by reaching a streak is not lost if the user later misses a day. Max 1 of
each badge per wallet.

## Project layout

```
contracts/AgentQuestBoard.sol        # the board (ERC-1155 + quest logic)
contracts/mocks/MockAgentIDRegistry.sol  # test-only registry stand-in
test/AgentQuestBoard.test.js         # 21 functional tests
test/gas-report.test.js              # deployment + per-function gas report
scripts/deploy.js                    # BSC mainnet deploy (env key only)
scripts/export-abi.js                # copies the exact ABI to frontend/abi.js
frontend/index.html + app.js + abi.js# static site, ethers v6, injected wallet only
```

## Tests

```bash
npm install
npx hardhat test
```

Result (2026-11-18, local Hardhat network): **22 passing, 0 failing**
(21 functional tests + 1 gas report). Coverage includes: non-holder reverts on
both actions, once-per-day rule, streak growth across days (time travel), streak
reset after a missed day, badge eligibility at streak 1/3/7, best-streak
persistence, double-claim revert, unknown-badge revert, metadata URI decoding
(valid JSON + SVG), pause/unpause access control, and zero-balance/no-payable
checks.

## Gas (measured in tests, optimizer 200 runs, solc 0.8.28, evm cancun)

| Action | Gas | BNB @ 0.1 gwei* | BNB @ 3 gwei | BNB @ 5 gwei |
|---|---|---|---|---|
| Deploy AgentQuestBoard | 2,131,780 | 0.000213 | 0.006395 | 0.010659 |
| `checkIn` (first) | 119,897 | 0.000012 | 0.000360 | 0.000599 |
| `checkIn` (streak day) | 51,628 | 0.000005 | 0.000155 | 0.000258 |
| `claimBadge` | ~81,350 | 0.000008 | 0.000244 | 0.000407 |
| Deploy + first check-ins + badge 1 | 2,384,644 | 0.000238 | 0.007154 | 0.011923 |

\* 0.1 gwei is the current BSC gas price observed on recent transactions
(2026-11-18). **Sizing:** the agency wallet held 0.002167 BNB before
deployment (2026-11-18), which covered deployment + dozens of transactions at
current gas prices. At a busy 5 gwei, deployment alone would need ~0.0107 BNB
— if gas spikes, top up to ~0.02 BNB first or wait for gas to fall.

## Live deployment (BSC mainnet, chain 56)

- **Contract:** `0xEC5b204C8905B7926588f9BD67E02E19606A139a`
- **Deployed:** 2026-11-18, block 134322792,
  tx `0xb2c50b677fd32aa9b35a95be9d5c2be8b79e84079f247d3d533318138199da04`
  (gas 2,136,027, cost 0.0002574 BNB)
- **Owner:** agency wallet `0x70A8C4bBD0Fa981737f9FAe5BD5a494694606e50`
  (verified via `owner()`); **registry:** `0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`
  (verified via `agentIdRegistry()`).
- **Route:** the Binance Agentic Wallet signs via `baw` only, and `baw
  contract-call` cannot deploy a contract directly (it requires a `to`
  address), so the deployment went through the Arachnid deterministic
  deployment proxy (`0x4e59b44847b379578588920cA78FbF26c0B4956C`, CREATE2,
  salt 0) — see `scripts/prepare-deploy.js`, which builds the init code
  (bytecode + constructor args) and prints the deterministic address.
  The constructor therefore takes the owner as an explicit argument
  (a factory-deployed contract's `msg.sender` would be the factory).
- **Live test (2026-11-18):** first check-in from the agency wallet
  (streak 1, tx `0x6788b90fc01d120c95805b34df855e89c1fc17743a930b3291536ab21c18e635`)
  and badge 1 claim (tx `0x9ec95e7792a3c1073ff4981aac639616dd544c2a5849e6ac97a27d06007d4120`)
  both executed and verified on-chain.

## Deploy + verify (for a fresh deploy)

```bash
# 1. Deploy with a local signer (key via environment only — never commit it)
export DEPLOYER_PRIVATE_KEY="0x..."
npx hardhat run scripts/deploy.js --network bsc

# Alternative (used for the live deployment above): build the CREATE2 init
# code and deploy through the Arachnid proxy, e.g. via baw contract-call.
node scripts/prepare-deploy.js

# 2. Verify source on BscScan (contract + constructor args = registry, owner)
npx hardhat verify --network bsc <DEPLOYED_ADDRESS> 0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F <OWNER_ADDRESS>

# 3. Frontend: set BOARD_ADDRESS in frontend/app.js, then host the
#    frontend/ folder as a static site (e.g. GitHub Pages).
```

## Hackathon red-line compliance

- **No QR login anywhere.** The frontend uses only the injected
  `window.ethereum` provider (MetaMask / Binance Wallet extension). No
  WalletConnect, no Agentic Wallet QR pairing, no session stored on any server.
- **No bypass of user confirmation.** Every transaction is sent from the user's
  own wallet and must be confirmed by the user in their wallet.
- **No unauthorized transfers, no approvals.** The contract never moves user
  funds and never asks for token approvals. It holds no BNB.
- **Open source.** Contract source is in this repo (to be published publicly)
  and verified on BscScan at deploy time.
- **No credential collection.** Nothing in the contract or frontend asks for or
  stores seed phrases, private keys, API secrets, or pairing codes.
- **No promised returns.** Badges are non-transferable-by-design collectibles
  (ERC-1155, no marketplace integration); the site promises no income or value.

## Notes / known limitations

- Streaks use UTC calendar days (`block.timestamp / 86400`).
- Badge art is a simple on-chain SVG (coloured disc + streak number + name).
  A richer design can replace `_badgeSvg()` without changing any logic.
- The contract is not upgradeable by design (no proxy) — v1 is final once deployed.
- Owner powers are limited to emergency pause/unpause; ownership can be
  renounced after the hackathon if desired (`renounceOwnership()`).
