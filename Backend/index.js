const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  }
});

let waitingUser = null;

io.on('connection', socket => {
  console.log('New client connected: ' + socket.id);

  if (waitingUser) {
    const room = 'room-' + socket.id + '-' + waitingUser.id;
    socket.join(room);
    waitingUser.join(room);
    io.to(room).emit('roomCreated', room);
    waitingUser = null;
  } else {
    waitingUser = socket;
  }

  socket.on('offer', ({ offer, room }) => {
    socket.to(room).emit('offer', offer);
  });

  socket.on('answer', ({ answer, room }) => {
    socket.to(room).emit('answer', answer);
  });

  socket.on('ice-candidate', ({ candidate, room }) => {
    socket.to(room).emit('ice-candidate', candidate);
  });

  socket.on('disconnect', () => {
    if (waitingUser && waitingUser.id === socket.id) {
      waitingUser = null;
    }
    console.log('Client disconnected: ' + socket.id);
  });
});

server.listen(5000, () => {
  console.log('Signaling server running on http://localhost:5000');
});
