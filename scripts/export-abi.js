// Copies the exact ABI from the compiled artifact into frontend/abi.js
// so the frontend can never drift from the contract.
const fs = require("fs");
const path = require("path");

const artifact = require("../artifacts/contracts/AgentQuestBoard.sol/AgentQuestBoard.json");
const out =
  "// Auto-generated from artifacts/contracts/AgentQuestBoard.sol/AgentQuestBoard.json\n" +
  "// Do not edit by hand — re-run: node scripts/export-abi.js\n" +
  `const BOARD_ABI = ${JSON.stringify(artifact.abi, null, 2)};\n`;
fs.writeFileSync(path.join(__dirname, "..", "frontend", "abi.js"), out);
console.log("wrote frontend/abi.js (" + artifact.abi.length + " ABI entries)");
