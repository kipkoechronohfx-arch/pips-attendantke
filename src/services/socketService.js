const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET } = require('../middleware/auth');

function initializeSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: [
        'https://pips-attendantke.onrender.com',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ],
      credentials: true
    }
  });

  // Authenticate connections
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) return next(new Error('Authentication error'));
    
    // Support legacy VIP password tokens or user tokens
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      next(new Error('Authentication error'));
    }
  });

  io.on('connection', (socket) => {
    // When a user sends a message
    socket.on('sendMessage', async (data) => {
      try {
        if (!data || !data.text) return;
        const author = data.author || 'VIP Member';
        
        // Save to database
        const msg = await db.addChatMessage({ author, text: data.text });
        
        // Broadcast to everyone (including sender, for immediate feedback if desired, or let sender handle it locally)
        io.emit('newMessage', msg);
      } catch (err) {
        socket.emit('error', 'Failed to send message');
      }
    });
  });

  return io;
}

module.exports = { initializeSocket };
