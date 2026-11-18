# AgentQuest Board — Hackathon Submission Draft

> Fill in the placeholders after deployment + hosting. Do NOT submit with
> placeholders still in place.

## Project

- **Project name:** AgentQuest Board
- **Website:** _TODO — static hosting URL for `frontend/` (e.g. GitHub Pages)_
- **Contract address (BNB Chain, chain 56):** `0xEC5b204C8905B7926588f9BD67E02E19606A139a` (deployed 2026-11-18, block 134322792, tx `0xb2c50b677fd32aa9b35a95be9d5c2be8b79e84079f247d3d533318138199da04`)
- **Source code:** _TODO — public GitHub repo URL (required: open-source)_
- **BscScan verification:** _TODO — link after `hardhat verify`_

## Agent ID usage description (draft for the submission form)

> AgentQuest Board is a daily quest board that only Binance Agent ID holders
> can use. The smart contract calls `balanceOf(address)` on the Agent ID
> registry (`0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F`) on every quest action:
> `checkIn()` and `claimBadge()` both revert unless the caller holds an Agent
> ID. There is no allowlist and no off-chain check — the Agent ID itself is
> the access control.
>
> Users check in once per UTC day to build streaks (tracked fully on-chain)
> and claim ERC-1155 badges at streak milestones: First Check-in, 3-Day
> Streak, 7-Day Streak. Badge metadata (name, description, SVG image) is
> generated entirely on-chain — no external image host.
>
> All quests are free: every function costs 0 value, the contract holds no
> funds, there is no token and no promised return. The frontend connects only
> through the user's injected wallet (MetaMask / Binance Wallet extension) and
> every transaction requires the user's own confirmation. The contract's only
> privileged functions are the owner-only emergency pause/unpause.

## Submission checklist

- [x] Contract deployed to BNB Chain mainnet (chain 56) — `0xEC5b204C8905B7926588f9BD67E02E19606A139a`
- [ ] Source verified on BscScan
- [ ] Code published in a public repo
- [x] Frontend pointing at the deployed contract address (`frontend/app.js` BOARD_ADDRESS set)
- [ ] Frontend hosted
- [x] Tested end-to-end with a real Agent ID holder wallet (check-in + 1 badge claim) — check-in DONE 2026-11-18 ~20:56 WIB (agency wallet, streak 1, tx `0x6788b90fc01d120c95805b34df855e89c1fc17743a930b3291536ab21c18e635`, block 134323067); badge 1 claim DONE ~20:59 WIB (tx `0x9ec95e7792a3c1073ff4981aac639616dd544c2a5849e6ac97a27d06007d4120`, block 134323537, balanceOf(agency,1)=1 verified)
- [ ] Submission form filled (project name, website, contract address, Agent ID usage description above)
- [ ] At least 30 Agent ID addresses interacted during the submission period
      (Innovation Award eligibility — promote via X + community channels)
