// AgentQuest Board frontend — ethers v6, injected provider only.
// NO WalletConnect, NO QR login of any kind (hackathon red line).

// Deployed 2026-11-18 (tx 0xb2c50b677fd32aa9b35a95be9d5c2be8b79e84079f247d3d533318138199da04,
// block 134322792) via the Arachnid deterministic deployment proxy (CREATE2, salt 0).
const BOARD_ADDRESS = "0xEC5b204C8905B7926588f9BD67E02E19606A139a";

// Binance Agent ID registry (SPACE ID Agent ID, ERC-721) on BNB Chain.
const REGISTRY_ADDRESS = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";
const REGISTRY_ABI = ["function balanceOf(address owner) view returns (uint256)"];
const BSC_CHAIN_ID = 56n;

const BADGES = [
  { id: 1, requirement: "Check in once", reqId: "Check-in 1x" },
  { id: 2, requirement: "Reach a 3-day streak", reqId: "Streak 3 hari" },
  { id: 3, requirement: "Reach a 7-day streak", reqId: "Streak 7 hari" },
];

let provider = null;
let signer = null;
let board = null;
let registry = null;
let userAddress = null;

const $ = (id) => document.getElementById(id);

function setStatus(msg, kind) {
  const el = $("status");
  el.textContent = msg;
  el.className = kind || "";
}

function shortAddr(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

async function connect() {
  setStatus("", "");
  if (!window.ethereum) {
    setStatus("No injected wallet found. Install MetaMask or the Binance Wallet extension.", "err");
    return;
  }
  try {
    provider = new ethers.BrowserProvider(window.ethereum);
    const accounts = await provider.send("eth_requestAccounts", []);
    userAddress = accounts[0];
    signer = await provider.getSigner();

    const net = await provider.getNetwork();
    if (net.chainId !== BSC_CHAIN_ID) {
      setStatus("Switching to BNB Chain (56)…");
      try {
        await window.ethereum.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: "0x38" }],
        });
      } catch (e) {
        setStatus("Please switch your wallet to BNB Chain (chain id 56) and reconnect.", "err");
        return;
      }
      provider = new ethers.BrowserProvider(window.ethereum);
      signer = await provider.getSigner();
    }

    registry = new ethers.Contract(REGISTRY_ADDRESS, REGISTRY_ABI, provider);
    if (BOARD_ADDRESS !== "0x0000000000000000000000000000000000000000") {
      board = new ethers.Contract(BOARD_ADDRESS, BOARD_ABI, signer);
    }

    $("address").textContent = shortAddr(userAddress) + "  •  BNB Chain";
    $("connectBtn").textContent = "Connected";
    $("connectBtn").disabled = true;
    $("statsCard").style.display = "block";
    $("badgesCard").style.display = "block";
    setStatus("Connected. Reading your Agent ID and quest status…", "ok");
    await refresh();
  } catch (e) {
    console.error(e);
    setStatus("Connection failed: " + (e?.info?.error?.message || e.message || e), "err");
  }
}

async function refresh() {
  if (!userAddress) return;
  try {
    const hasId = (await registry.balanceOf(userAddress)) > 0n;
    $("statAgentId").textContent = hasId ? "Yes — holder" : "No Agent ID";

    if (!board) {
      $("statStreak").textContent = "—";
      $("statBest").textContent = "—";
      $("statTotal").textContent = "—";
      $("statToday").textContent = "Contract not deployed";
      $("checkInBtn").disabled = true;
      renderBadges(null, hasId);
      return;
    }

    const paused = await board.paused();
    const [streak, best, total, , canCheckIn] = await board.getUserStats(userAddress);
    $("statStreak").textContent = streak.toString() + " day" + (streak === 1n ? "" : "s");
    $("statBest").textContent = best.toString();
    $("statTotal").textContent = total.toString();
    $("statToday").textContent = canCheckIn ? "Not yet — you can check in" : "Done ✓";
    $("checkInBtn").disabled = !hasId || !canCheckIn || paused;
    if (paused) setStatus("The board is paused by the owner (emergency pause).", "err");
    else if (!hasId) setStatus("You need a Binance Agent ID to use this board. Claim one in the Binance App first.", "err");
    else setStatus("Ready.", "ok");

    renderBadges({ hasId, paused }, hasId);
  } catch (e) {
    console.error(e);
    setStatus("Failed to read on-chain state: " + (e.message || e), "err");
  }
}

async function renderBadges(ctx, hasId) {
  const wrap = $("badges");
  wrap.innerHTML = "";
  for (const b of BADGES) {
    const card = document.createElement("div");
    card.className = "badge";
    let img = "";
    let owned = false;
    let eligible = false;
    let name = "Badge " + b.id;
    if (board && userAddress) {
      try {
        owned = (await board.balanceOf(userAddress, b.id)) > 0n;
        eligible = await board.isEligible(userAddress, b.id);
        const dataUri = await board.uri(b.id);
        const meta = JSON.parse(
          atob(dataUri.replace("data:application/json;base64,", ""))
        );
        name = meta.name;
        img = `<img src="${meta.image}" alt="${meta.name}">`;
      } catch (e) {
        console.error("badge render failed", b.id, e);
      }
    }
    const btnLabel = owned
      ? "Owned ✓"
      : !hasId
      ? "Need Agent ID"
      : ctx && ctx.paused
      ? "Paused"
      : eligible
      ? "Claim badge"
      : "Not eligible yet";
    card.innerHTML =
      img +
      `<h3>${name}</h3><p>${b.requirement} · ${b.reqId}</p>` +
      `<button data-badge="${b.id}" ${owned || !eligible || !hasId || (ctx && ctx.paused) ? "disabled" : ""}>${btnLabel}</button>`;
    wrap.appendChild(card);
  }
  wrap.querySelectorAll("button[data-badge]").forEach((btn) => {
    btn.addEventListener("click", () => claimBadge(Number(btn.dataset.badge)));
  });
}

async function checkIn() {
  if (!board) return;
  setStatus("Confirm the check-in in your wallet…");
  try {
    $("checkInBtn").disabled = true;
    const tx = await board.checkIn();
    setStatus("Check-in sent: " + tx.hash + " — waiting for confirmation…");
    await tx.wait();
    setStatus("Checked in! Streak updated.", "ok");
    await refresh();
  } catch (e) {
    console.error(e);
    setStatus("Check-in failed: " + (e?.info?.error?.message || e.reason || e.message || e), "err");
    await refresh();
  }
}

async function claimBadge(badgeId) {
  if (!board) return;
  setStatus("Confirm the badge claim in your wallet…");
  try {
    const tx = await board.claimBadge(badgeId);
    setStatus("Claim sent: " + tx.hash + " — waiting for confirmation…");
    await tx.wait();
    setStatus("Badge " + badgeId + " claimed!", "ok");
    await refresh();
  } catch (e) {
    console.error(e);
    setStatus("Claim failed: " + (e?.info?.error?.message || e.reason || e.message || e), "err");
    await refresh();
  }
}

$("connectBtn").addEventListener("click", connect);
$("checkInBtn").addEventListener("click", checkIn);
if (window.ethereum) {
  window.ethereum.on("accountsChanged", () => window.location.reload());
  window.ethereum.on("chainChanged", () => window.location.reload());
}

if (BOARD_ADDRESS === "0x0000000000000000000000000000000000000000") {
  $("notDeployedBanner").style.display = "block";
} else {
  $("contractAddr").textContent = BOARD_ADDRESS;
}
