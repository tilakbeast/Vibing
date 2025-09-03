// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const cors = require('cors');
const client = require('./redis/client');
const { Mutex } = require("async-mutex");
const matchMutex = new Mutex();
const Redis = require("ioredis");
const redis = new Redis({host: process.env.REDIS_HOST || 'redis'}) // defaults to localhost:6379

async function clearRedis() {
  try {
    await redis.flushdb(); // clears only current DB
    // await redis.flushall(); // clears ALL databases
    console.log("Redis data cleared!");
  } catch (err) {
    console.error("Error clearing Redis:", err);
  } 
}

const {
  addMatch,
  isAlreadyMatched,
  getMatchedUsers,
  addActive,
  getActiveUsers,
  removeActive,
  removeQueue
} = require('./redis/matchservice');


const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*" }
});

app.use(express.json());

app.use(cors());

// ----- Mongo User Schema -----
const userSchema = new mongoose.Schema({
  username: { type: String, unique: true },
  password: String,
  preferences: String
}); 
const User = mongoose.model("User", userSchema);

User.find().then(users => {
  console.log("mongo: ", users);
  
//   mongoose.disconnect();
});

// async function clearUsersCollection() {

// const users = await User.find();
//     console.log("Users before clearing:", users);

//     // Drop the users collection safely
//     const db = mongoose.connection.db;
//     const collections = await db.listCollections({ name: "users" }).toArray();
//     if (collections.length > 0) {
//       await db.collection("users").drop();
//       console.log("Users collection cleared!");
//     } else {
//       console.log("Users collection does not exist.");
//     }


// }

// clearUsersCollection();

// console.log("hello")

function popcount(n) {
  let count = 0;
  while (n > 0) {
    count += n & 1;
    n >>= 1;
  }
  return 10 - count;
}

let activeUsers = new Map();

async function fillin() {

  activeUsers = await getActiveUsers();

  console.log("active users : ", activeUsers);


}

let runit = 0;

let userSocketMap = new Map();
// ----- Registration Route -----

app.post("/register", async (req, res) => {
  try {
    const { username, password, preferences } = req.body;

    console.log("register is running");

    // check if username already exists
    const existing = await User.findOne({ username });
    if (existing) return res.status(400).json({ msg: "Username taken" });

    // hash password
    const hashed = await bcrypt.hash(password, 10);

    // save user
    const user = await User.create({ username, password: hashed, preferences });

    // create JWT
    const token = jwt.sign({ userId: username}, "SECRET", { expiresIn: "1h" });

    console.log("token: ", token);

    res.json({ token }); // frontend will use this token for socket connect
  } catch (err) {
    res.status(500).json({ msg: "Server error", err });
  }
});

app.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log("login is running");

    // check if user exists
    const user = await User.findOne({ username });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // check password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      
      return res.status(400).json({ message: "Invalid username or password" });
    }

    // create JWT
    const token = jwt.sign({ userId: username}, "SECRET", { expiresIn: "1h" });

    console.log("token:", token);

    res.json({ token });
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Server error", err });
  }
});

app.get('/emp', async (req, res) => {

  // const activeUsers = await getActiveUsers();

  let cnt = 0;

  for(let [a, b] of activeUsers) {

    // if(i.userId.userId === "kendall") {

      await removeQueue(a);

    // }

    // cnt2++;

    cnt++;
  }

  activeUsers = new Map();

  clearRedis();

  let s = `Removed users count: ${cnt}`;


  res.send(s)


});




// ----- Socket Auth Middleware -----
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("No token"));

  try {
    const payload = jwt.verify(token, "SECRET");
    socket.data.userId = payload.userId; // attach user id to socket

    console.log(payload.userId);

    next();
  } catch (err) {
    next(new Error("Invalid token"));
  }
});

// ----- When a socket connects -----
io.on("connection", (socket) => {
  console.log("User connected:", socket.data.userId);

  let bitmaskfordiconnect = "";


  socket.on("find_match", async (userId) => {

    if (runit === 0) {
      runit++;
      await fillin();
    }

    // fetch user details from MongoDB
    const user = await User.findOne({ username: userId });
    if (!user) {
      return socket.emit("error", { message: "User not found" });
    }

    userSocketMap.set(userId, socket);
    console.log(`${user.username} is looking for a match`);

    const bitmaskBinary = user.preferences;

    bitmaskfordiconnect = bitmaskBinary;

    try {
      await addActive(userId, bitmaskBinary);
      activeUsers.set(userId, bitmaskBinary);
      console.log("added to activeUsers");
    } catch (err) {
      console.log("error while adding: ", err);
    }

    console.log("active users after find : ", activeUsers);

  await matchMutex.runExclusive(async () => {
    

    // Initialize best match
    let maxScore = -1;
    let bestMatchId = null;
    let bitmax = "";

    for (let [a, b] of activeUsers) {
      if (a === userId) continue;

      const already = await isAlreadyMatched(userId, a);
      if (already) continue;

      const score = popcount(
        parseInt(bitmaskBinary, 2) ^ parseInt(b, 2)
      );

      if (score > maxScore) {
        maxScore = score;
        bestMatchId = a;
        bitmax = b;
      }
    }

    if (bestMatchId) {
      // update matches in Redis
      await addMatch(userId, bestMatchId);
      await addMatch(bestMatchId, userId);

      activeUsers.delete(userId);
      activeUsers.delete(bestMatchId);

      await removeActive(userId, bitmaskBinary);
      await removeActive(bestMatchId, bitmax);

      const socketA = userSocketMap.get(userId);
      const socketB = userSocketMap.get(bestMatchId);

      if (socketA) socketA.emit("match_found", { partner: bestMatchId });
      if (socketB) socketB.emit("match_found", { partner: userId });

      console.log(`Matched ${userId} with ${bestMatchId}`);

      const roomId = `${userId}_${bestMatchId}`;
      if (socketA) socketA.emit("start_call", { roomId, partnerId: bestMatchId });
      if (socketB) socketB.emit("start_call", { roomId, partnerId: userId });

      socketA?.on("webrtc_signal", (data) => {
        socketB?.emit("webrtc_signal", data);
      });

      socketB?.on("webrtc_signal", (data) => {
        socketA?.emit("webrtc_signal", data);
      });
    } else {
      socket.emit("waiting", { message: "No match yet, added to queue" });
    }
  });
});


  socket.on('call_end', async({ partnerId }) => {
    const partnerSocket = userSocketMap.get(partnerId);

    // Notify the partner that the call has ended
    if (partnerSocket) {

      console.log("sending the call ended")
      partnerSocket.emit('call_ended', { by: socket.data.userId });
      socket.emit('call_ended', { by: "you" });

      // await addActive(socket.data.userId);
      // await addActive(partnerId);

    }

    console.log(`${socket.data.userId} ended the call with ${partnerId}`);
    });

  socket.on("disconnect", async() => {

    try {
      await removeActive(socket.data.userId, bitmaskfordiconnect);
      activeUsers.delete(socket.data.userId);
    }

    catch (err) {

      console.log("error removing from active users while disconnecting: ", err);

    }

    console.log("User disconnected:", socket.data.userId);
  });
});

// ----- Start -----
const MONGO_URI = "mongodb://admin:adminpassword@mongo:27017/myapp?authSource=admin";

mongoose.connect(MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
    .then(() => console.log("MongoDB connected"))
  .then(() => server.listen(3000, () => console.log("Server running on 3000")));
