const { ethers } = require("hardhat");

// Binance Agent ID registry (SPACE ID Agent ID, ERC-721) on BNB Chain.
const AGENT_ID_REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F";

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deployer:", deployer.address);
  console.log("Balance:", ethers.formatEther(await ethers.provider.getBalance(deployer.address)), "BNB");

  const Board = await ethers.getContractFactory("AgentQuestBoard");
  const board = await Board.deploy(AGENT_ID_REGISTRY, deployer.address);
  await board.waitForDeployment();

  const address = await board.getAddress();
  console.log("AgentQuestBoard deployed to:", address);
  console.log("Owner:", await board.owner());
  console.log("Registry:", await board.agentIdRegistry());
  console.log("Verify on BscScan with:");
  console.log(`  npx hardhat verify --network bsc ${address} ${AGENT_ID_REGISTRY} ${deployer.address}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
