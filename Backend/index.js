const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const redisHelpers = require("./matchservice.js"); 

const app = express();
const server = http.createServer(app);
const io = new Server(server);

function popcount(x) {
  return x.toString(2).split("1").length - 1;
}

// Map to track socket.id -> userId for emitting to matched users
const socketUserMap = new Map();
const userSocketMap = new Map();

io.on("connection", (socket) => {
  console.log("User connected:", socket.id);

  // Register userId with socket
  socket.on("register", ({ userId }) => {
    socketUserMap.set(socket.id, userId);
    userSocketMap.set(userId, socket);
  });

  // User clicks "Find"
  socket.on("find_match", async ({ userId, bitmaskBinary }) => {
    try {
      const p = parseInt(bitmaskBinary, 2);

      // 1️⃣ Add current user to Active set
      await redisHelpers.addActive(userId);

      // 2️⃣ Fetch all active users
      const activeUsers = await redisHelpers.getActiveUsers();

      let maxScore = 0;
      let bestMatch = null;

      // 3️⃣ Loop through active users and find best match
      for (const otherUserId of activeUsers) {
        if (otherUserId === userId) continue;

        // Check if already matched before
        const alreadyMatched = await redisHelpers.isAlreadyMatched(
          userId,
          otherUserId
        );
        if (alreadyMatched) continue;

        // Get other user's bitmask from a source (DB or in-memory for mock)
        // Here we assume frontend sends a map or fetch from DB
        const otherBitmaskBinary = await getBitmaskForUser(otherUserId); // Implement this
        const j = parseInt(otherBitmaskBinary, 2);

        const score = popcount(j & p);
        if (score > maxScore) {
          maxScore = score;
          bestMatch = otherUserId;
        }
      }

      // 4️⃣ If match found, update Redis atomically
      if (bestMatch) {
        // Remove both from Active set
        await redisHelpers.addMatch(userId, bestMatch);
        await redisHelpers.addMatch(bestMatch, userId);

        await redisHelpers.addActive(userId); // optional: if you want to keep active
        await redisHelpers.addActive(bestMatch);

        // Remove both from active set so no one else matches them
        await redisHelpers.getActiveUsers(); // can do in LUA for real atomicity if needed

        // Notify both users
        const bestMatchSocket = userSocketMap.get(bestMatch);
        if (bestMatchSocket) {
          bestMatchSocket.emit("match_found", { partnerId: userId });
        }

        socket.emit("match_found", { partnerId: bestMatch });
      } else {
        // No match yet, just wait
        socket.emit("waiting", { message: "No match found yet" });
      }
    } catch (err) {
      console.error(err);
      socket.emit("error", { message: "Server error during matching" });
    }
  });

  socket.on("disconnect", async () => {
    const userId = socketUserMap.get(socket.id);
    if (userId) {
      socketUserMap.delete(socket.id);
      userSocketMap.delete(userId);
      // Optionally remove from Active
      const activeUsers = await redisHelpers.getActiveUsers();
      if (activeUsers.includes(userId)) {
        await redisHelpers.addActive(userId); // or removeActive if you implement it
      }
    }
    console.log(`User disconnected: ${socket.id}`);
  });
});

// Express route example
app.get("/", (req, res) => {
  res.send("Socket.IO Matching Server is running");
});

server.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
});

// Mock: Fetch user's bitmask
async function getBitmaskForUser(userId) {
  // Replace this with DB fetch or in-memory map
  // For testing, return random 8-bit number as string
  const randomMask = Math.floor(Math.random() * 256).toString(2);
  return randomMask.padStart(8, "0");
}
