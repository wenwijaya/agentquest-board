// Prepare the AgentQuestBoard deployment via the Arachnid deterministic
// deployment proxy (CREATE2, salt 0). Outputs:
//   deploy-initcode.txt  — creation bytecode + ABI-encoded constructor args
//   deploy-calldata.txt  — proxy calldata: 32-byte salt + init code
// Prints the deterministic contract address (verify it against the eth_call
// dry-run and, after deployment, against the on-chain result).
const { ethers } = require("ethers");
const fs = require("fs");

const artifact = require("../artifacts/contracts/AgentQuestBoard.sol/AgentQuestBoard.json");
const REGISTRY = "0x60B9262456dE011F7d15a54CdD8c48bAaa8B022F"; // Binance Agent ID registry, BSC
const OWNER = "0x70A8C4bBD0Fa981737f9FAe5BD5a494694606e50"; // agency wallet (morningshine.ai)
const PROXY = "0x4e59b44847b379578588920cA78FbF26c0B4956C"; // Arachnid deterministic deployment proxy
const SALT = "0x" + "00".repeat(32);

const coder = new ethers.AbiCoder();
const args = coder.encode(["address", "address"], [REGISTRY, OWNER]);
const initCode = artifact.bytecode + args.slice(2);
const initCodeHash = ethers.keccak256(initCode);
const address = ethers.getCreate2Address(PROXY, SALT, initCodeHash);

console.log("registry:      ", REGISTRY);
console.log("owner:         ", OWNER);
console.log("proxy:         ", PROXY);
console.log("salt:          ", SALT);
console.log("init code bytes:", (initCode.length - 2) / 2);
console.log("init code hash:", initCodeHash);
console.log("CREATE2 address:", address);

fs.writeFileSync("deploy-initcode.txt", initCode);
const calldata = "0x" + SALT.slice(2) + initCode.slice(2);
fs.writeFileSync("deploy-calldata.txt", calldata);
console.log("proxy calldata bytes:", (calldata.length - 2) / 2);
console.log("wrote deploy-initcode.txt + deploy-calldata.txt");
