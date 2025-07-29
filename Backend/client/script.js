const socket = io("http://localhost:5000");
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

let peerConnection;
let roomName;

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
  ]
};

navigator.mediaDevices.getUserMedia({ video: true, audio: true })
  .then(stream => {
    localVideo.srcObject = stream;

    socket.on('roomCreated', room => {
      roomName = room;
      peerConnection = createPeerConnection(stream);

      peerConnection.createOffer()
        .then(offer => {
          peerConnection.setLocalDescription(offer);
          socket.emit('offer', { offer, room });
        });
    });

    socket.on('offer', offer => {
      roomName = roomName || 'room-received';
      peerConnection = createPeerConnection(stream);

      peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
      peerConnection.createAnswer()
        .then(answer => {
          peerConnection.setLocalDescription(answer);
          socket.emit('answer', { answer, room: roomName });
        });
    });

    socket.on('answer', answer => {
      peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    });

    socket.on('ice-candidate', candidate => {
      peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    });
  });

function createPeerConnection(stream) {
  const pc = new RTCPeerConnection(config);

  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.ontrack = event => {
    remoteVideo.srcObject = event.streams[0];
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit('ice-candidate', { candidate: event.candidate, room: roomName });
    }
  };

  return pc;
}
