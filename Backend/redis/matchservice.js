const redis = require('./client');


// Add matched user
async function addMatch(userId, matchedId) {
  await redis.sAdd(userId, matchedId);
}

// Add active user
async function addActive(userId, bitmaskBinary) {

  const userObj = JSON.stringify({ userId, bitmaskBinary });
  await redis.sAdd("Active", userObj);
}

//Remove active
async function removeActive(userId, bitmaskBinary) {
  const userObj = JSON.stringify({ userId, bitmaskBinary });
  await redis.sRem("Active", userObj);
}

// Check if already matched
async function isAlreadyMatched(userId, matchedId) {
  return await redis.sIsMember(userId, matchedId);
}

// Get matched users
async function getMatchedUsers(userId) {
  return await redis.sMembers(userId);
}

// Delete queue

async function removeQueue(userId) {

  // return await redis.sRem("Active", '{"userId":{"userId":"kendall","bitmaskBinary":"0000000110"}}');

  return await redis.DEL(userId);

}



// Get Active users
async function getActiveUsers() {
  const members = await redis.sMembers("Active"); // get all members
  const map = new Map();

  for (const m of members) {
    const obj = JSON.parse(m);
    map.set(obj.userId, obj.bitmaskBinary); // key = userId, value = bitmaskBinary
  }

  return map;
}


module.exports = {
  addMatch,
  isAlreadyMatched,
  getMatchedUsers,
  addActive,
  getActiveUsers,
  removeActive,
  removeQueue
};


