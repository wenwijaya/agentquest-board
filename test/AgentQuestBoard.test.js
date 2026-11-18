const { expect } = require("chai");
const { ethers, network } = require("hardhat");

const DAY = 86400;

async function advanceDays(n) {
  await network.provider.send("evm_increaseTime", [n * DAY]);
  await network.provider.send("evm_mine");
}

async function deploy() {
  const [owner, alice, bob, carol] = await ethers.getSigners();

  const Registry = await ethers.getContractFactory("MockAgentIDRegistry");
  const registry = await Registry.deploy();
  await registry.waitForDeployment();

  // alice and bob hold an Agent ID; carol does not.
  await registry.setBalance(alice.address, 1);
  await registry.setBalance(bob.address, 1);

  const Board = await ethers.getContractFactory("AgentQuestBoard");
  const board = await Board.deploy(await registry.getAddress(), owner.address);
  await board.waitForDeployment();

  return { owner, alice, bob, carol, registry, board };
}

describe("AgentQuestBoard", function () {
  describe("deployment", function () {
    it("sets the Agent ID registry and the deployer as owner", async function () {
      const { owner, registry, board } = await deploy();
      expect(await board.agentIdRegistry()).to.equal(await registry.getAddress());
      expect(await board.owner()).to.equal(owner.address);
    });
  });

  describe("Agent ID gate", function () {
    it("non-Agent-ID address reverts on checkIn", async function () {
      const { carol, board } = await deploy();
      await expect(board.connect(carol).checkIn()).to.be.revertedWithCustomError(
        board,
        "NotAgentIDHolder"
      );
    });

    it("non-Agent-ID address reverts on claimBadge", async function () {
      const { carol, board } = await deploy();
      await expect(board.connect(carol).claimBadge(1)).to.be.revertedWithCustomError(
        board,
        "NotAgentIDHolder"
      );
    });

    it("an address that gains an Agent ID later can then check in", async function () {
      const { carol, registry, board } = await deploy();
      await expect(board.connect(carol).checkIn()).to.be.revertedWithCustomError(
        board,
        "NotAgentIDHolder"
      );
      await registry.setBalance(carol.address, 1);
      await expect(board.connect(carol).checkIn()).to.emit(board, "CheckIn");
    });
  });

  describe("checkIn", function () {
    it("works once, emits CheckIn with streak 1 and total 1", async function () {
      const { alice, board } = await deploy();
      await expect(board.connect(alice).checkIn())
        .to.emit(board, "CheckIn")
        .withArgs(alice.address, 1n, 1n);
      expect(await board.streak(alice.address)).to.equal(1n);
      expect(await board.totalCheckIns(alice.address)).to.equal(1n);
    });

    it("second check-in within 24h reverts", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await expect(board.connect(alice).checkIn()).to.be.revertedWithCustomError(
        board,
        "AlreadyCheckedInToday"
      );
    });

    it("streak increments across consecutive days", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await advanceDays(1);
      await expect(board.connect(alice).checkIn())
        .to.emit(board, "CheckIn")
        .withArgs(alice.address, 2n, 2n);
      await advanceDays(1);
      await expect(board.connect(alice).checkIn())
        .to.emit(board, "CheckIn")
        .withArgs(alice.address, 3n, 3n);
      expect(await board.streak(alice.address)).to.equal(3n);
      expect(await board.bestStreak(alice.address)).to.equal(3n);
    });

    it("streak resets to 1 after a missed day, total keeps counting", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn(); // day 0, streak 1
      await advanceDays(1);
      await board.connect(alice).checkIn(); // day 1, streak 2
      await advanceDays(2); // skip day 2, now day 3
      await expect(board.connect(alice).checkIn())
        .to.emit(board, "CheckIn")
        .withArgs(alice.address, 1n, 3n);
      expect(await board.streak(alice.address)).to.equal(1n);
      expect(await board.bestStreak(alice.address)).to.equal(2n);
      expect(await board.totalCheckIns(alice.address)).to.equal(3n);
    });

    it("getUserStats reports streak, totals and canCheckInToday", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      const [s, best, total, , can] = await board.getUserStats(alice.address);
      expect(s).to.equal(1n);
      expect(best).to.equal(1n);
      expect(total).to.equal(1n);
      expect(can).to.equal(false);
      await advanceDays(1);
      const [, , , , canNext] = await board.getUserStats(alice.address);
      expect(canNext).to.equal(true);
    });
  });

  describe("badges", function () {
    it("badge 1 is claimable after the first check-in", async function () {
      const { alice, board } = await deploy();
      await expect(board.connect(alice).claimBadge(1)).to.be.revertedWithCustomError(
        board,
        "NotEligibleForBadge"
      );
      await board.connect(alice).checkIn();
      await expect(board.connect(alice).claimBadge(1))
        .to.emit(board, "BadgeClaimed")
        .withArgs(alice.address, 1n);
      expect(await board.balanceOf(alice.address, 1)).to.equal(1n);
    });

    it("badge 2 unlocks at streak 3, badge 3 at streak 7", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await expect(board.connect(alice).claimBadge(2)).to.be.revertedWithCustomError(
        board,
        "NotEligibleForBadge"
      );
      await advanceDays(1);
      await board.connect(alice).checkIn();
      await advanceDays(1);
      await board.connect(alice).checkIn(); // streak 3
      expect(await board.isEligible(alice.address, 2)).to.equal(true);
      expect(await board.isEligible(alice.address, 3)).to.equal(false);
      await board.connect(alice).claimBadge(2);
      expect(await board.balanceOf(alice.address, 2)).to.equal(1n);
      await expect(board.connect(alice).claimBadge(3)).to.be.revertedWithCustomError(
        board,
        "NotEligibleForBadge"
      );
      for (let i = 0; i < 4; i++) {
        await advanceDays(1);
        await board.connect(alice).checkIn();
      } // streak 7
      expect(await board.isEligible(alice.address, 3)).to.equal(true);
      await board.connect(alice).claimBadge(3);
      expect(await board.balanceOf(alice.address, 3)).to.equal(1n);
    });

    it("badge 2 stays claimable after a missed day (best streak)", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await advanceDays(1);
      await board.connect(alice).checkIn();
      await advanceDays(1);
      await board.connect(alice).checkIn(); // streak 3
      await advanceDays(2); // miss a day, streak resets
      await board.connect(alice).checkIn(); // streak 1 again
      expect(await board.streak(alice.address)).to.equal(1n);
      expect(await board.isEligible(alice.address, 2)).to.equal(true);
      await board.connect(alice).claimBadge(2);
      expect(await board.balanceOf(alice.address, 2)).to.equal(1n);
    });

    it("double-claim of the same badge reverts", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await board.connect(alice).claimBadge(1);
      await expect(board.connect(alice).claimBadge(1)).to.be.revertedWithCustomError(
        board,
        "BadgeAlreadyClaimed"
      );
    });

    it("claiming an unknown badge id reverts", async function () {
      const { alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await expect(board.connect(alice).claimBadge(99)).to.be.revertedWithCustomError(
        board,
        "InvalidBadge"
      );
      await expect(board.connect(alice).claimBadge(0)).to.be.revertedWithCustomError(
        board,
        "InvalidBadge"
      );
    });

    it("badges are per-wallet: one user claiming does not block another", async function () {
      const { alice, bob, board } = await deploy();
      await board.connect(alice).checkIn();
      await board.connect(alice).claimBadge(1);
      await board.connect(bob).checkIn();
      await board.connect(bob).claimBadge(1);
      expect(await board.balanceOf(bob.address, 1)).to.equal(1n);
    });
  });

  describe("metadata", function () {
    function decodeMetadataUri(dataUri) {
      expect(dataUri.startsWith("data:application/json;base64,")).to.equal(true);
      const json = JSON.parse(
        Buffer.from(dataUri.replace("data:application/json;base64,", ""), "base64").toString("utf8")
      );
      return json;
    }

    it("uri(1) decodes to valid JSON with an SVG image", async function () {
      const { board } = await deploy();
      const meta = decodeMetadataUri(await board.uri(1));
      expect(meta.name).to.equal("AgentQuest - First Check-in");
      expect(meta.description).to.include("Agent ID");
      expect(meta.image.startsWith("data:image/svg+xml;base64,")).to.equal(true);
      const svg = Buffer.from(
        meta.image.replace("data:image/svg+xml;base64,", ""),
        "base64"
      ).toString("utf8");
      expect(svg).to.include("<svg");
      expect(svg).to.include("FIRST CHECK-IN");
      expect(meta.attributes).to.deep.include({ trait_type: "Badge", value: "AgentQuest - First Check-in" });
    });

    it("uri(2) and uri(3) carry the right names and streak values", async function () {
      const { board } = await deploy();
      const m2 = decodeMetadataUri(await board.uri(2));
      expect(m2.name).to.equal("AgentQuest - 3-Day Streak");
      const svg2 = Buffer.from(m2.image.replace("data:image/svg+xml;base64,", ""), "base64").toString("utf8");
      expect(svg2).to.include("3-DAY STREAK");
      const m3 = decodeMetadataUri(await board.uri(3));
      expect(m3.name).to.equal("AgentQuest - 7-Day Streak");
      expect(m3.attributes).to.deep.include({ trait_type: "Streak Required", value: 7 });
    });

    it("uri of an unknown badge reverts", async function () {
      const { board } = await deploy();
      await expect(board.uri(99)).to.be.revertedWithCustomError(board, "InvalidBadge");
    });
  });

  describe("pause", function () {
    it("only the owner can pause/unpause", async function () {
      const { alice, board } = await deploy();
      await expect(board.connect(alice).pause()).to.be.revertedWithCustomError(
        board,
        "OwnableUnauthorizedAccount"
      );
    });

    it("checkIn and claimBadge revert while paused, work again after unpause", async function () {
      const { owner, alice, board } = await deploy();
      await board.connect(alice).checkIn();
      await board.connect(owner).pause();
      expect(await board.paused()).to.equal(true);
      await expect(board.connect(alice).checkIn()).to.be.revertedWithCustomError(
        board,
        "EnforcedPause"
      );
      await expect(board.connect(alice).claimBadge(1)).to.be.revertedWithCustomError(
        board,
        "EnforcedPause"
      );
      await board.connect(owner).unpause();
      expect(await board.paused()).to.equal(false);
      await advanceDays(1);
      await expect(board.connect(alice).checkIn()).to.emit(board, "CheckIn");
      await board.connect(alice).claimBadge(1);
      expect(await board.balanceOf(alice.address, 1)).to.equal(1n);
    });
  });

  describe("no payments", function () {
    it("contract holds no BNB and has no payable entry point", async function () {
      const { board } = await deploy();
      expect(await ethers.provider.getBalance(await board.getAddress())).to.equal(0n);
    });
  });
});
