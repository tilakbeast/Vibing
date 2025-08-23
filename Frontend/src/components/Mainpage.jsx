import React, { useState, useEffect } from "react";
import {jwtDecode} from "jwt-decode";

// Global WebRTC variables
let pc = null;
let localStream = null;
let pendingCandidates = [];
let isInitiator = false;
let cleanupTimeout = null;

const MainPage = ({socket, token}) => {
  const [userId, setUserId] = useState("");
  const [name, setName] = useState("");
  const [bitmaskBinary, setBitmaskBinary] = useState("");
  const [match, setMatch] = useState(null);
  const [inCall, setInCall] = useState(false);
  const [mounted, setMounted] = useState(false);
  
  const decoded = jwtDecode(token);

  console.log("decoded: ", decoded.userId);

  // Enhanced cleanup function with better DOM handling
  const cleanupWebRTC = async () => {
    console.log("Cleaning up WebRTC resources");
    
    // Clear any pending cleanup timeout
    if (cleanupTimeout) {
      clearTimeout(cleanupTimeout);
      cleanupTimeout = null;
    }
    
    // Close peer connection first
    if (pc) {
      // Remove all event listeners to prevent memory leaks
      pc.onicecandidate = null;
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      
      // Get all senders and remove tracks
      if (pc.getSenders) {
        pc.getSenders().forEach(sender => {
          if (sender.track) {
            sender.track.stop();
          }
        });
      }
      
      pc.close();
      pc = null;
      console.log("Peer connection closed");
    }
    
    // Stop all tracks in local stream
    if (localStream) {
      localStream.getTracks().forEach(track => {
        track.stop();
        console.log("Stopped track:", track.kind, track.readyState);
      });
      localStream = null;
    }
    
    // Clear video elements with better error handling
    const clearVideoElement = (videoId) => {
      try {
        const video = document.getElementById(videoId);
        if (video) {
          // Pause video first
          video.pause();
          
          // Clear source
          video.srcObject = null;
          video.src = "";
          
          // Force reload to clear any cached streams
          video.load();
          
          console.log(`Cleared ${videoId}`);
        }
      } catch (err) {
        console.log(`Error clearing ${videoId}:`, err);
      }
    };
    
    clearVideoElement("localVideo");
    clearVideoElement("remoteVideo");
    
    // Reset global variables
    pendingCandidates = [];
    isInitiator = false;
    
    // Extended delay to ensure complete cleanup
    await new Promise(resolve => setTimeout(resolve, 300));
  };

  useEffect(() => {
    setUserId(decoded.userId);

    // Remove any existing listeners first to prevent duplicates
    socket.off("match_found");
    socket.off("call_ended");
    socket.off("waiting");
    socket.off("webrtc_signal");
    socket.off("start_call");

    socket.on("match_found", ({ partner }) => {
      console.log("Matched with:", partner);
      setMatch(partner);
      setInCall(true);
    });

    socket.onAny((event, ...args) => {
      console.log("Received event:", event, args);
    });

    // Listen for call end - Enhanced cleanup
    socket.on("call_ended", async ({ by }) => {
      console.log("Call ended by:", by);
      
      // Immediate cleanup with additional safety
      await cleanupWebRTC();
      
      // Additional cleanup after a delay
      cleanupTimeout = setTimeout(async () => {
        await cleanupWebRTC();
        console.log("Secondary cleanup completed");
      }, 500);
      
      // Reset state
      setInCall(false);
      setMatch(null);
      
      console.log("Call cleanup complete");
    });

    // Optional: waiting message
    socket.on("waiting", ({ message }) => {
      console.log(message);
    });

    // --- Enhanced start call event ---
    socket.on("start_call", async ({ partnerId, roomId }) => {
      console.log("Starting call with:", partnerId, "in room:", roomId);
      
      // Multiple cleanup attempts to ensure clean state
      await cleanupWebRTC();
      await new Promise(resolve => setTimeout(resolve, 100));
      await cleanupWebRTC();
      
      // Additional delay to ensure previous resources are fully released
      await new Promise(resolve => setTimeout(resolve, 300));

      try {
        // Create new peer connection with enhanced configuration
        pc = new RTCPeerConnection({
          iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            { urls: 'stun:stun1.l.google.com:19302' },
            { urls: 'stun:stun2.l.google.com:19302' }
          ],
          iceCandidatePoolSize: 10,
          iceTransportPolicy: 'all',
          bundlePolicy: 'max-bundle'
        });
        
        pendingCandidates = [];
        isInitiator = userId < partnerId;

        console.log("Is initiator:", isInitiator, "UserID:", userId, "PartnerID:", partnerId);

        // --- Get local stream with enhanced error handling ---
        try {
          console.log("Requesting camera access...");
          
          // More specific constraints with fallbacks
          const constraints = {
            video: { 
              width: { ideal: 640, min: 320, max: 1280 },
              height: { ideal: 480, min: 240, max: 720 },
              frameRate: { ideal: 30, min: 15 }
            }, 
            audio: {
              echoCancellation: true,
              noiseSuppression: true,
              autoGainControl: true
            }
          };
          
          localStream = await navigator.mediaDevices.getUserMedia(constraints);
          
          console.log("Camera access granted, tracks:", localStream.getTracks().map(t => ({
            kind: t.kind,
            enabled: t.enabled,
            readyState: t.readyState,
            id: t.id
          })));
          
          // Wait a moment before setting video to ensure DOM is ready
          await new Promise(resolve => setTimeout(resolve, 100));
          
          // Set local video with enhanced error handling and retries
          const setupLocalVideo = async (retries = 3) => {
            for (let i = 0; i < retries; i++) {
              try {
                const localVideo = document.getElementById("localVideo");
                if (localVideo && localStream) {
                  // Clear any existing content first
                  localVideo.srcObject = null;
                  await new Promise(resolve => setTimeout(resolve, 50));
                  
                  localVideo.srcObject = localStream;
                  
                  // Wait for loadedmetadata event
                  await new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => reject(new Error('Video load timeout')), 5000);
                    localVideo.onloadedmetadata = () => {
                      clearTimeout(timeout);
                      resolve();
                    };
                  });
                  
                  await localVideo.play();
                  console.log("Local video playing successfully");
                  break;
                } else {
                  throw new Error("Local video element not found or stream not available");
                }
              } catch (playErr) {
                console.log(`Local video setup attempt ${i + 1} failed:`, playErr);
                if (i === retries - 1) {
                  console.log("All local video setup attempts failed");
                } else {
                  await new Promise(resolve => setTimeout(resolve, 200));
                }
              }
            }
          };
          
          await setupLocalVideo();

          // Add tracks to peer connection with better error handling
          localStream.getTracks().forEach(track => {
            try {
              console.log("Adding track to peer connection:", track.kind, track.readyState);
              const sender = pc.addTrack(track, localStream);
              console.log("Track added successfully");
            } catch (err) {
              console.error("Error adding track:", err);
            }
          });

          console.log("Local stream setup complete");
        } catch (err) {
          console.error("Error accessing media devices:", err);
          alert(`Could not access camera/microphone: ${err.message}. Please check permissions and try again.`);
          await cleanupWebRTC();
          return;
        }

        // --- Enhanced remote stream handling ---
        pc.ontrack = (event) => {
          console.log("Received remote track:", {
            kind: event.track.kind,
            readyState: event.track.readyState,
            streamsCount: event.streams.length
          });
          
          if (event.streams[0]) {
            const remoteStream = event.streams[0];
            console.log("Remote stream tracks:", remoteStream.getTracks().map(t => ({
              kind: t.kind,
              enabled: t.enabled,
              readyState: t.readyState
            })));
            
            // Enhanced remote video setup with retries
            const setupRemoteVideo = async (retries = 3) => {
              for (let i = 0; i < retries; i++) {
                try {
                  const remoteVideo = document.getElementById("remoteVideo");
                  if (remoteVideo) {
                    // Clear any existing content first
                    remoteVideo.srcObject = null;
                    await new Promise(resolve => setTimeout(resolve, 50));
                    
                    remoteVideo.srcObject = remoteStream;
                    
                    // Wait for stream to be ready
                    await new Promise((resolve, reject) => {
                      const timeout = setTimeout(() => reject(new Error('Remote video load timeout')), 5000);
                      remoteVideo.onloadedmetadata = () => {
                        clearTimeout(timeout);
                        resolve();
                      };
                    });
                    
                    await remoteVideo.play();
                    console.log("Remote video playing successfully");
                    break;
                  } else {
                    throw new Error("Remote video element not found");
                  }
                } catch (err) {
                  console.log(`Remote video setup attempt ${i + 1} failed:`, err);
                  if (i < retries - 1) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                  }
                }
              }
            };
            
            // Small delay before setting up remote video
            setTimeout(() => setupRemoteVideo(), 100);
          }
        };

        // --- Enhanced ICE candidate handling ---
        pc.onicecandidate = (event) => {
          if (event.candidate) {
            console.log("Sending ICE candidate type:", event.candidate.type);
            socket.emit("webrtc_signal", { 
              candidate: event.candidate, 
              partnerId: partnerId, 
              senderId: userId
            });
          } else {
            console.log("ICE gathering complete");
          }
        };

        // Enhanced connection monitoring
        pc.onconnectionstatechange = () => {
          console.log("Connection state changed:", pc.connectionState);
          if (pc.connectionState === 'failed') {
            console.log("Connection failed, attempting cleanup");
            setTimeout(() => {
              if (pc && pc.connectionState === 'failed') {
                cleanupWebRTC();
              }
            }, 2000);
          }
        };

        pc.oniceconnectionstatechange = () => {
          console.log("ICE connection state changed:", pc.iceConnectionState);
          if (pc.iceConnectionState === 'failed') {
            console.log("ICE connection failed");
          }
        };

        // --- Only initiator creates offer immediately ---
        if (isInitiator) {
          console.log("Creating offer as initiator");
          
          // Small delay to ensure everything is set up
          await new Promise(resolve => setTimeout(resolve, 200));
          
          try {
            const offer = await pc.createOffer({
              offerToReceiveAudio: true,
              offerToReceiveVideo: true
            });
            
            await pc.setLocalDescription(offer);
            console.log("Initiator: Local description set successfully");
            
            socket.emit("webrtc_signal", { 
              sdp: pc.localDescription, 
              partnerId: partnerId, 
              senderId: userId  
            });
          } catch (err) {
            console.error("Error creating/setting offer:", err);
            await cleanupWebRTC();
          }
        }
      } catch (err) {
        console.error("Error in start_call handler:", err);
        await cleanupWebRTC();
      }
    });

    // --- Enhanced WebRTC signal handling ---
    socket.on("webrtc_signal", async (data) => {
      if (!pc) {
        console.log("No peer connection available, ignoring signal");
        return;
      }

      console.log("Received WebRTC signal:", data.sdp?.type || 'candidate', "from:", data.senderId);

      try {
        // Handle SDP offer/answer
        if (data.sdp) {
          const remoteDesc = new RTCSessionDescription(data.sdp);
          
          console.log("Current signaling state:", pc.signalingState, "Remote desc type:", data.sdp.type);
          
          // Enhanced signaling state management
          const canSetRemoteDescription = 
            (pc.signalingState === 'stable' && data.sdp.type === 'offer') ||
            (pc.signalingState === 'have-local-offer' && data.sdp.type === 'answer') ||
            (pc.signalingState === 'have-remote-offer' && data.sdp.type === 'answer');
          
          if (canSetRemoteDescription) {
            await pc.setRemoteDescription(remoteDesc);
            console.log("Remote description set successfully");

            // Process any queued ICE candidates
            console.log(`Processing ${pendingCandidates.length} queued ICE candidates`);
            const candidatesToProcess = [...pendingCandidates];
            pendingCandidates = [];
            
            for (const candidate of candidatesToProcess) {
              try {
                await pc.addIceCandidate(new RTCIceCandidate(candidate));
                console.log("Added queued ICE candidate");
              } catch (err) {
                console.error("Error adding queued candidate:", err);
              }
            }

            // If we received an offer and we're not the initiator, create answer
            if (data.sdp.type === "offer" && !isInitiator) {
              console.log("Creating answer to received offer");
              
              // Small delay to ensure remote description is fully processed
              await new Promise(resolve => setTimeout(resolve, 100));
              
              try {
                const answer = await pc.createAnswer({
                  offerToReceiveAudio: true,
                  offerToReceiveVideo: true
                });
                await pc.setLocalDescription(answer);
                console.log("Answer created and local description set");
                
                socket.emit("webrtc_signal", { 
                  sdp: pc.localDescription, 
                  partnerId: data.senderId, 
                  senderId: userId 
                });
              } catch (err) {
                console.error("Error creating answer:", err);
              }
            }
          } else {
            console.log("Cannot set remote description in current state:", pc.signalingState, "for type:", data.sdp.type);
          }
        } 
        // Handle ICE candidate
        else if (data.candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            try {
              await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
              console.log("Added ICE candidate successfully");
            } catch (err) {
              if (err.name !== 'OperationError') {
                console.error("Error adding ICE candidate:", err);
              }
            }
          } else {
            console.log("Queuing ICE candidate until remote description is set");
            pendingCandidates.push(data.candidate);
          }
        }
      } catch (err) {
        console.error("Error handling WebRTC signal:", err);
      }
    });

    return () => {
      // Enhanced cleanup on unmount
      console.log("Component unmounting, cleaning up...");
      cleanupWebRTC();
      
      if (cleanupTimeout) {
        clearTimeout(cleanupTimeout);
        cleanupTimeout = null;
      }
      
      socket.off("match_found");
      socket.off("call_ended");
      socket.off("waiting");
      socket.off("webrtc_signal");
      socket.off("start_call");
    };
  }, [socket, userId, decoded.userId]);

  // Function to check camera permissions
  const checkCameraPermissions = async () => {
    try {
      const result = await navigator.permissions.query({ name: 'camera' });
      console.log("Camera permission status:", result.state);
      
      const audioResult = await navigator.permissions.query({ name: 'microphone' });
      console.log("Microphone permission status:", audioResult.state);
      
      return result.state === 'granted' && audioResult.state === 'granted';
    } catch (err) {
      console.log("Cannot check permissions:", err);
      return null;
    }
  };

  const handleFindMatch = async () => {
    if (!decoded || !decoded.userId) return;
    
    // Clean up any existing resources before finding new match
    await cleanupWebRTC();
    
    // Additional delay to ensure cleanup is complete
    await new Promise(resolve => setTimeout(resolve, 200));
    
    // Check permissions before finding match
    const hasPermissions = await checkCameraPermissions();
    console.log("Has camera/mic permissions:", hasPermissions);
    
    socket.emit("find_match", decoded.userId);
  };

  const handleEndCall = async () => {
    if (!match) return;
    
    console.log("Ending call manually");
    
    // Clean up WebRTC first
    await cleanupWebRTC();
    
    // Emit call end
    socket.emit("call_end", { partnerId: match });
    
    // Reset state
    setInCall(false);
    setMatch(null);
  };

  const handleemptyredis = async () => {
    try {
      // Clean up current WebRTC resources first
      await cleanupWebRTC();
      
      const emp = await fetch("http://localhost:3000/emp");
      console.log("empty redis result: ", await emp.text());
      
      // Reset component state
      setInCall(false);
      setMatch(null);
    } catch (err) {
      console.error("Error emptying redis:", err);
    }
  }

  // Enhanced manual refresh function
  const handleRefreshCamera = async () => {
    console.log("Manually refreshing camera...");
    await cleanupWebRTC();
    
    // Wait for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 500));
    
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ 
        video: { 
          width: { ideal: 640 },
          height: { ideal: 480 }
        }, 
        audio: true 
      });
      
      const localVideo = document.getElementById("localVideo");
      if (localVideo) {
        localVideo.srcObject = stream;
        await localVideo.play();
        console.log("Camera refresh successful");
        
        // Show success for 3 seconds then cleanup
        setTimeout(() => {
          stream.getTracks().forEach(track => track.stop());
          localVideo.srcObject = null;
          console.log("Test stream cleaned up");
        }, 3000);
      }
    } catch (err) {
      console.error("Camera refresh failed:", err);
      alert(`Camera test failed: ${err.message}`);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Mock Matchmaking</h2>
      <p>User ID: {userId}</p>
      <p>Status: {inCall ? `In call with ${match}` : 'Waiting for match'}</p>

      <div style={{ marginTop: 20 }}>
        <button onClick={handleFindMatch} disabled={inCall}>
          {inCall ? "In Call" : "Find Match"}
        </button>
        <button onClick={handleemptyredis} style={{ marginLeft: 10 }}>
          Empty Redis
        </button>
        <button onClick={handleRefreshCamera} style={{ marginLeft: 10 }} disabled={inCall}>
          Test Camera
        </button>
      </div>

      {inCall && match && (
        <div style={{ marginTop: 20 }}>
          <h3>In Call with {match}</h3>
          
          <div style={{ display: 'flex', gap: '20px', marginBottom: '20px' }}>
            <div>
              <h4>Local Video (You)</h4>
              <video 
                id="localVideo"
                width="300" 
                height="200" 
                autoPlay 
                muted 
                playsInline
                style={{ 
                  border: '2px solid #007bff', 
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px'
                }}
              />
            </div>
            
            <div>
              <h4>Remote Video ({match})</h4>
              <video 
                id="remoteVideo"
                width="300" 
                height="200" 
                autoPlay 
                playsInline
                style={{ 
                  border: '2px solid #28a745', 
                  backgroundColor: '#f8f9fa',
                  borderRadius: '8px'
                }}
              />
            </div>
          </div>
          
          <button 
            onClick={handleEndCall}
            style={{
              backgroundColor: '#dc3545',
              color: 'white',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '5px',
              fontSize: '16px',
              cursor: 'pointer'
            }}
          >
            End Call
          </button>
        </div>
      )}
    </div>
  );
}

export default MainPage;