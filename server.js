const WebSocket = require('ws');

// Initialize WebSocket server on port 4000
const wss = new WebSocket.Server({ port: 4000 }, () => {
  console.log('WebSocket server running on ws://localhost:4000');
});

// In-memory storage for rooms
// Structure: { roomName: { clients: Set<ws>, history: Array<Object> } }
const rooms = {};

wss.on('connection', (ws) => {
  // Keep track of the current client's state
  let currentRoom = null;
  let currentUsername = null;

  ws.on('message', (messageData) => {
    try {
      const parsedMessage = JSON.parse(messageData);

      // 1. Handle "join" events
      if (parsedMessage.type === 'join') {
        currentRoom = parsedMessage.room;
        currentUsername = parsedMessage.username;

        // Initialize room if it doesn't exist
        if (!rooms[currentRoom]) {
          rooms[currentRoom] = {
            clients: new Set(),
            history: []
          };
        }

        // Add client to the room
        rooms[currentRoom].clients.add(ws);

        // Send the last 50 messages to the new joiner
        const historyMessage = {
          type: 'history',
          room: currentRoom,
          messages: rooms[currentRoom].history
        };
        ws.send(JSON.stringify(historyMessage));

        // Broadcast presence (join) to all other room members
        const joinNotification = {
          type: 'presence',
          event: 'join',
          room: currentRoom,
          username: currentUsername,
          timestamp: Date.now()
        };
        broadcastToRoom(currentRoom, joinNotification, ws); // Skip sending to self
      }

      // 2. Handle "message" events
      else if (parsedMessage.type === 'message' && currentRoom) {
        const chatMessage = {
          type: 'message',
          room: currentRoom,
          username: currentUsername,
          text: parsedMessage.text,
          timestamp: parsedMessage.timestamp || Date.now()
        };

        // Persist message to history
        rooms[currentRoom].history.push(chatMessage);
        
        // Enforce the 50-message limit
        if (rooms[currentRoom].history.length > 50) {
          rooms[currentRoom].history.shift(); 
        }

        // Broadcast to everyone in the room (including sender)
        broadcastToRoom(currentRoom, chatMessage);
      }
    } catch (error) {
      console.error('Invalid message format received:', error.message);
    }
  });

  // 3. Handle Disconnects (Graceful cleanup)
  ws.on('close', () => {
    if (currentRoom && rooms[currentRoom]) {
      // Remove client from room
      rooms[currentRoom].clients.delete(ws);

      // Notify the room that the user left
      const leaveNotification = {
        type: 'presence',
        event: 'leave',
        room: currentRoom,
        username: currentUsername,
        timestamp: Date.now()
      };
      broadcastToRoom(currentRoom, leaveNotification);

      // Optional: Cleanup empty rooms to save memory
      if (rooms[currentRoom].clients.size === 0) {
        delete rooms[currentRoom];
      }
    }
  });
});

// Helper function to broadcast a message to a specific room
function broadcastToRoom(roomName, messageObject, excludeWs = null) {
  if (rooms[roomName]) {
    const messageString = JSON.stringify(messageObject);
    rooms[roomName].clients.forEach((client) => {
      // Send if connection is open, and it's not the excluded client
      if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
        client.send(messageString);
      }
    });
  }
}