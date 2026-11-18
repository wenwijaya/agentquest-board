const { ethers, network } = require("hardhat");

const DAY = 86400;

function bnb(gas, gwei) {
  // gas is a BigInt; gwei is a number. Returns a decimal string in BNB.
  return (Number(gas) * gwei * 1e9) / 1e18;
}

describe("gas report (for deployment sizing)", function () {
  it("prints deployment + per-function gas and BNB cost", async function () {
    const [owner, alice] = await ethers.getSigners();

    const Registry = await ethers.getContractFactory("MockAgentIDRegistry");
    const registry = await Registry.deploy();
    const registryReceipt = await (await registry.deploymentTransaction()).wait();

    const Board = await ethers.getContractFactory("AgentQuestBoard");
    const board = await Board.deploy(await registry.getAddress(), owner.address);
    const deployReceipt = await (await board.deploymentTransaction()).wait();

    await registry.setBalance(alice.address, 1);

    const tx1 = await board.connect(alice).checkIn();
    const r1 = await tx1.wait();

    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");
    const tx2 = await board.connect(alice).checkIn();
    const r2 = await tx2.wait();

    const tx3 = await board.connect(alice).claimBadge(1);
    const r3 = await tx3.wait();

    await network.provider.send("evm_increaseTime", [DAY]);
    await network.provider.send("evm_mine");
    await board.connect(alice).checkIn(); // streak 3
    const tx4 = await board.connect(alice).claimBadge(2);
    const r4 = await tx4.wait();

    const rows = [
      ["MockAgentIDRegistry deploy (test-only)", registryReceipt.gasUsed],
      ["AgentQuestBoard deploy", deployReceipt.gasUsed],
      ["checkIn (first, cold storage)", r1.gasUsed],
      ["checkIn (streak day 2)", r2.gasUsed],
      ["claimBadge(1)", r3.gasUsed],
      ["claimBadge(2) at streak 3", r4.gasUsed],
    ];

    console.log("\n==== AgentQuestBoard gas report ====");
    console.log("gas prices: 0.1 gwei (current BSC, per recent claims), 3 gwei (typical), 5 gwei (busy)");
    for (const [label, gas] of rows) {
      console.log(
        `${label.padEnd(38)} ${gas.toString().padStart(9)} gas | ` +
          `${bnb(gas, 0.1).toFixed(6)} BNB @0.1gwei | ${bnb(gas, 3).toFixed(6)} BNB @3gwei | ${bnb(gas, 5).toFixed(6)} BNB @5gwei`
      );
    }
    const totalFirstWeek = deployReceipt.gasUsed + r1.gasUsed + r2.gasUsed + r3.gasUsed;
    console.log(
      `deploy + first check-ins + badge 1`.padEnd(38) +
        ` ${totalFirstWeek.toString().padStart(9)} gas | ` +
        `${bnb(totalFirstWeek, 0.1).toFixed(6)} BNB @0.1gwei | ${bnb(totalFirstWeek, 3).toFixed(6)} BNB @3gwei | ${bnb(totalFirstWeek, 5).toFixed(6)} BNB @5gwei`
    );
    console.log("======================================\n");
  });
});
