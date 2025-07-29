const redis = require('./client');


// Add matched user
async function addMatch(userId, matchedId) {
  await redis.sAdd(userId, matchedId);
}

// Add active user
async function addActive(userId) {
  await redis.sAdd("Active", userId);
}

// Check if already matched
async function isAlreadyMatched(userId, matchedId) {
  return await redis.sIsMember(userId, matchedId);
}

// Get matched users
async function getMatchedUsers(userId) {
  return await redis.sMembers(userId);
}

// Get Active users
async function getActiveUsers() {
  return await redis.sMembers("Active");
}

module.exports = {
  addMatch,
  isAlreadyMatched,
  getMatchedUsers,
  addActive,
  getActiveUsers
};


