const socketIo = require('socket.io');
const jwt = require('jsonwebtoken');
const db = require('./db');
const { JWT_SECRET } = require('../middleware/auth');

const VALID_ROOMS = ['general', 'vip', 'signals', 'platinum'];

function initializeSocket(server) {
  const io = socketIo(server, {
    cors: {
      origin: [
        'https://pips-attendantke.onrender.com',
        'https://pipsattendant.top',
        'https://www.pipsattendant.top',
        'http://localhost:3000',
        'http://127.0.0.1:3000'
      ],
      credentials: true
    }
  });

  // Authenticate connections (optional token — unauthenticated can use general room only)
  io.use(async (socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      socket.user = null; // unauthenticated — general room only
      return next();
    }
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      // Fetch latest user data for avatar/tier
      const user = await db.getUserById(decoded.id || decoded._id);
      if (user) {
        socket.user.avatar = user.avatar;
        socket.user.subscriptionTier = user.subscriptionTier;
      }
      next();
    } catch (err) {
      socket.user = null;
      next(); // Allow connection, but restrict room join below
    }
  });

  io.on('connection', (socket) => {
    // ── Join a room ────────────────────────────────────────────
    socket.on('joinRoom', (room) => {
      if (!VALID_ROOMS.includes(room)) return;

      // VIP room requires active subscription
      if (room === 'vip') {
        if (!socket.user || !socket.user.subscriptionExpiry || socket.user.subscriptionExpiry < Date.now()) {
          socket.emit('roomError', { room, error: 'Active VIP subscription required.' });
          return;
        }
      }

      if (room === 'platinum') {
        const tier = (socket.user && socket.user.subscriptionTier) ? socket.user.subscriptionTier.toLowerCase() : '';
        if (!tier.includes('platinum')) {
          socket.emit('roomError', { room, error: 'Platinum subscription required.' });
          return;
        }
      }

      // Leave any other rooms first (except the socket's own room)
      VALID_ROOMS.forEach(r => {
        if (r !== room) socket.leave(`room:${r}`);
      });

      socket.join(`room:${room}`);
      socket.emit('roomJoined', { room });
    });

    // ── Send a message to a room ────────────────────────────────
    socket.on('sendMessage', async (data) => {
      try {
        if (!data || (!data.text && !data.image)) return;
        const room = VALID_ROOMS.includes(data.room) ? data.room : 'general';
        const author = data.author || (socket.user?.name) || 'Member';
        const avatar = socket.user?.avatar || null;

        // Signals room is admin-only
        if (room === 'signals') {
          if (!socket.user || socket.user.role !== 'admin') {
            socket.emit('error', 'Signals room is read-only.');
            return;
          }
        }

        // VIP room requires subscription
        if (room === 'vip') {
          if (!socket.user || !socket.user.subscriptionExpiry || socket.user.subscriptionExpiry < Date.now()) {
            socket.emit('error', 'Active VIP subscription required.');
            return;
          }
        }

        // Platinum room requires Platinum tier
        if (room === 'platinum') {
           const tier = (socket.user && socket.user.subscriptionTier) ? socket.user.subscriptionTier.toLowerCase() : '';
           if (!tier.includes('platinum')) {
              socket.emit('error', 'Platinum subscription required.');
              return;
           }
        }

        const msg = await db.addChatMessage({ author, text: data.text || '', image: data.image || null, room, avatar });
        io.to(`room:${room}`).emit('newMessage', msg);
      } catch (err) {
        socket.emit('error', 'Failed to send message');
      }
    });
  });


  return io;
}

module.exports = { initializeSocket };
