// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC1155/ERC1155.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Pausable.sol";
import "@openzeppelin/contracts/utils/Base64.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @notice Minimal interface of the Binance Agent ID registry (SPACE ID Agent ID, ERC-721).
/// @dev An address holds an Agent ID when balanceOf(address) > 0.
interface IAgentIDRegistry {
    function balanceOf(address owner) external view returns (uint256);
}

/// @title AgentQuest Board
/// @notice An Agent ID-gated on-chain quest board for the Binance Agent ID Hackathon.
/// @dev Daily check-ins build streaks; streaks unlock ERC-1155 badges with fully
///      on-chain SVG metadata. No payments anywhere: every function is value 0,
///      the contract holds no funds, there is no token and no promised return.
///      The ONLY privileged function is the owner-only emergency pause/unpause.
contract AgentQuestBoard is ERC1155, Ownable, Pausable {
    using Strings for uint256;

    /// @notice Binance Agent ID registry on BNB Chain (immutable, set at deploy).
    IAgentIDRegistry public immutable agentIdRegistry;

    uint256 public constant BADGE_FIRST_CHECKIN = 1;
    uint256 public constant BADGE_STREAK_3 = 2;
    uint256 public constant BADGE_STREAK_7 = 3;

    uint256 private constant SECONDS_PER_DAY = 86400;

    /// @notice UTC calendar day (block.timestamp / 86400) of the user's last check-in.
    mapping(address => uint256) public lastCheckInDay;
    /// @notice Current consecutive-day streak.
    mapping(address => uint256) public streak;
    /// @notice Best (longest) streak ever achieved. Badge eligibility uses this,
    ///         so a badge earned by reaching a streak is not lost by missing a day.
    mapping(address => uint256) public bestStreak;
    /// @notice Total number of check-ins.
    mapping(address => uint256) public totalCheckIns;
    /// @notice Whether a wallet already claimed a given badge (max 1 per badge).
    mapping(address => mapping(uint256 => bool)) public badgeClaimed;

    event CheckIn(address indexed user, uint256 streak, uint256 totalCheckIns);
    event BadgeClaimed(address indexed user, uint256 indexed badgeId);

    error NotAgentIDHolder();
    error AlreadyCheckedInToday();
    error NotEligibleForBadge();
    error BadgeAlreadyClaimed();
    error InvalidBadge();

    /// @param registry_ Binance Agent ID registry address.
    /// @param initialOwner_ Owner of the board (emergency pause only).
    /// @dev Owner is a constructor argument (not msg.sender) because the board
    ///      is deployed via a CREATE2 factory: msg.sender at creation would be
    ///      the factory, not the deployer.
    constructor(address registry_, address initialOwner_) ERC1155("") Ownable(initialOwner_) {
        agentIdRegistry = IAgentIDRegistry(registry_);
    }

    modifier onlyAgentIDHolder() {
        if (agentIdRegistry.balanceOf(msg.sender) == 0) revert NotAgentIDHolder();
        _;
    }

    /// @notice Check in once per UTC calendar day. Consecutive days grow the streak;
    ///         a missed day resets it to 1. Requires holding an Agent ID.
    function checkIn() external onlyAgentIDHolder whenNotPaused {
        uint256 today = block.timestamp / SECONDS_PER_DAY;
        uint256 lastDay = lastCheckInDay[msg.sender];
        if (lastDay == today) revert AlreadyCheckedInToday();

        uint256 newStreak = (lastDay + 1 == today) ? streak[msg.sender] + 1 : 1;
        streak[msg.sender] = newStreak;
        if (newStreak > bestStreak[msg.sender]) {
            bestStreak[msg.sender] = newStreak;
        }
        lastCheckInDay[msg.sender] = today;
        totalCheckIns[msg.sender] += 1;

        emit CheckIn(msg.sender, newStreak, totalCheckIns[msg.sender]);
    }

    /// @notice Claim a badge the caller is eligible for. Max 1 per wallet per badge.
    /// @dev Eligibility: badge 1 needs >= 1 check-in; badge 2 needs best streak >= 3;
    ///      badge 3 needs best streak >= 7. Requires holding an Agent ID.
    function claimBadge(uint256 badgeId) external onlyAgentIDHolder whenNotPaused {
        if (badgeId != BADGE_FIRST_CHECKIN && badgeId != BADGE_STREAK_3 && badgeId != BADGE_STREAK_7) {
            revert InvalidBadge();
        }
        if (badgeClaimed[msg.sender][badgeId]) revert BadgeAlreadyClaimed();
        if (!_isEligible(msg.sender, badgeId)) revert NotEligibleForBadge();

        badgeClaimed[msg.sender][badgeId] = true;
        _mint(msg.sender, badgeId, 1, "");
        emit BadgeClaimed(msg.sender, badgeId);
    }

    /// @notice Read-only eligibility check (used by the frontend).
    function isEligible(address user, uint256 badgeId) public view returns (bool) {
        if (badgeId != BADGE_FIRST_CHECKIN && badgeId != BADGE_STREAK_3 && badgeId != BADGE_STREAK_7) {
            return false;
        }
        return _isEligible(user, badgeId);
    }

    /// @notice One-call stats for the frontend.
    function getUserStats(address user)
        external
        view
        returns (
            uint256 currentStreak,
            uint256 bestStreak_,
            uint256 totalCheckIns_,
            uint256 lastCheckInDay_,
            bool canCheckInToday
        )
    {
        uint256 today = block.timestamp / SECONDS_PER_DAY;
        return (
            streak[user],
            bestStreak[user],
            totalCheckIns[user],
            lastCheckInDay[user],
            lastCheckInDay[user] != today
        );
    }

    /// @notice Fully on-chain metadata: data:application/json;base64 with an embedded SVG.
    function uri(uint256 badgeId) public pure override returns (string memory) {
        if (badgeId != BADGE_FIRST_CHECKIN && badgeId != BADGE_STREAK_3 && badgeId != BADGE_STREAK_7) {
            revert InvalidBadge();
        }
        string memory name = _badgeName(badgeId);
        string memory json = string(
            abi.encodePacked(
                '{"name":"',
                name,
                '",',
                '"description":"AgentQuest Board badge. Earned by checking in with a Binance Agent ID on BNB Chain.",',
                '"image":"data:image/svg+xml;base64,',
                Base64.encode(bytes(_badgeSvg(badgeId))),
                '",',
                '"attributes":[{"trait_type":"Badge","value":"',
                name,
                '"},{"trait_type":"Streak Required","value":',
                _streakRequired(badgeId).toString(),
                "}]}"
            )
        );
        return string(abi.encodePacked("data:application/json;base64,", Base64.encode(bytes(json))));
    }

    /// @notice Emergency pause (owner only). Pauses check-ins and badge claims.
    function pause() external onlyOwner {
        _pause();
    }

    /// @notice Lift the emergency pause (owner only).
    function unpause() external onlyOwner {
        _unpause();
    }

    function _isEligible(address user, uint256 badgeId) internal view returns (bool) {
        if (badgeId == BADGE_FIRST_CHECKIN) return totalCheckIns[user] >= 1;
        if (badgeId == BADGE_STREAK_3) return bestStreak[user] >= 3;
        return bestStreak[user] >= 7; // BADGE_STREAK_7
    }

    function _badgeName(uint256 badgeId) internal pure returns (string memory) {
        if (badgeId == BADGE_FIRST_CHECKIN) return "AgentQuest - First Check-in";
        if (badgeId == BADGE_STREAK_3) return "AgentQuest - 3-Day Streak";
        return "AgentQuest - 7-Day Streak";
    }

    function _streakRequired(uint256 badgeId) internal pure returns (uint256) {
        if (badgeId == BADGE_FIRST_CHECKIN) return 1;
        if (badgeId == BADGE_STREAK_3) return 3;
        return 7;
    }

    function _badgeSvg(uint256 badgeId) internal pure returns (string memory) {
        string memory color = badgeId == BADGE_FIRST_CHECKIN
            ? "#F0B90B"
            : badgeId == BADGE_STREAK_3
            ? "#2EBD85"
            : "#7C5CFC";
        string memory big = badgeId == BADGE_FIRST_CHECKIN ? "1" : badgeId == BADGE_STREAK_3 ? "3" : "7";
        string memory label = badgeId == BADGE_FIRST_CHECKIN
            ? "FIRST CHECK-IN"
            : badgeId == BADGE_STREAK_3
            ? "3-DAY STREAK"
            : "7-DAY STREAK";
        return
            string(
                abi.encodePacked(
                    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400">',
                    '<rect width="400" height="400" rx="32" fill="#0B0E11"/>',
                    '<circle cx="200" cy="180" r="110" fill="',
                    color,
                    '"/>',
                    '<text x="200" y="205" font-family="Arial,sans-serif" font-size="96" font-weight="bold" text-anchor="middle" fill="#0B0E11">',
                    big,
                    "</text>",
                    '<text x="200" y="320" font-family="Arial,sans-serif" font-size="28" font-weight="bold" text-anchor="middle" fill="#FFFFFF">',
                    label,
                    "</text>",
                    '<text x="200" y="355" font-family="Arial,sans-serif" font-size="18" text-anchor="middle" fill="#8A8F98">AgentQuest Board</text>',
                    "</svg>"
                )
            );
    }
}
