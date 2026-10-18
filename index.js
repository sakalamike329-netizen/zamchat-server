const express = require('express');
const cors = require('cors');
const app = express();

app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// IN-MEMORY STORAGE (for Render free tier - resets on restart, use DB later)
let users = []; // {id, name, email, bio, avatar, createdAt}
let requests = []; // {fromId, fromName, toId, createdAt}
let friends = []; // {userId, friendId, friendName}
let messages = []; // {fromId, toId, text, type, isGroup, timestamp}
let groups = []; // {id, name, members: [], createdBy}

console.log("ZamChat Server Starting...");

// HOME
app.get('/', (req, res) => {
  res.send(`
    <h1>ZamChat Server Running! 🔥</h1>
    <p>com.zamchat.app - Built for Zambia</p>
    <p>Users: ${users.length} | Requests: ${requests.length} | Messages: ${messages.length} | Groups: ${groups.length}</p>
    <p>Endpoints: /register, /users, /friendRequest, /requests, /accept, /send, /messages, /createGroup, /groups</p>
    <p>Dark Mode Glassmorphism UI - Exact like design</p>
  `);
});

// 1. REGISTER PROFILE
app.post('/register', (req, res) => {
  const { id, name, email, bio } = req.body;
  if (!id || !name) return res.status(400).json({ error: 'id and name required' });
  
  let user = users.find(u => u.id === id);
  if (!user) {
    user = {
      id,
      name,
      email: email || `${id}@zamchat.com`,
      bio: bio || 'ZamChat user • Zambia',
      avatar: name.charAt(0).toUpperCase(),
      createdAt: new Date().toISOString()
    };
    users.push(user);
    console.log(`New user registered: ${name} (${id})`);
  } else {
    user.name = name; // update name
  }
  res.json({ ok: true, user });
});

// 2. GET ALL USERS (DISCOVER)
app.get('/users', (req, res) => {
  res.json(users);
});

// 3. SEND FRIEND REQUEST
app.post('/friendRequest', (req, res) => {
  const { fromId, fromName, toId } = req.body;
  if (!fromId || !toId) return res.status(400).json({ error: 'fromId toId required' });

  // Don't allow duplicate requests
  const exists = requests.find(r => r.fromId === fromId && r.toId === toId);
  if (exists) return res.json({ ok: true, message: 'already sent' });

  // Don't allow if already friends
  const alreadyFriend = friends.find(f => 
    (f.userId === fromId && f.friendId === toId) || 
    (f.userId === toId && f.friendId === fromId)
  );
  if (alreadyFriend) return res.json({ ok: true, message: 'already friends' });

  requests.push({
    fromId,
    fromName: fromName || 'User',
    toId,
    createdAt: new Date().toISOString()
  });
  console.log(`Friend request: ${fromName} -> ${toId}`);
  res.json({ ok: true });
});

// 4. GET FRIEND REQUESTS FOR A USER
app.get('/requests', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId query required' });
  
  const userRequests = requests.filter(r => r.toId === userId);
  res.json(userRequests);
});

// 5. ACCEPT FRIEND REQUEST
app.post('/accept', (req, res) => {
  const { fromId, toId } = req.body;
  if (!fromId || !toId) return res.status(400).json({ error: 'fromId toId required' });

  // Remove request
  requests = requests.filter(r => !(r.fromId === fromId && r.toId === toId));

  // Add friendship both ways
  const fromUser = users.find(u => u.id === fromId);
  const toUser = users.find(u => u.id === toId);

  if (!friends.find(f => f.userId === fromId && f.friendId === toId)) {
    friends.push({
      userId: fromId,
      friendId: toId,
      friendName: toUser ? toUser.name : 'Friend',
      createdAt: new Date().toISOString()
    });
  }
  if (!friends.find(f => f.userId === toId && f.friendId === fromId)) {
    friends.push({
      userId: toId,
      friendId: fromId,
      friendName: fromUser ? fromUser.name : 'Friend',
      createdAt: new Date().toISOString()
    });
  }

  console.log(`Friendship accepted: ${fromId} <-> ${toId}`);
  res.json({ ok: true, message: 'friends now' });
});

// 6. GET FRIENDS FOR A USER
app.get('/friends', (req, res) => {
  const userId = req.query.userId;
  if (!userId) return res.status(400).json({ error: 'userId required' });
  
  const userFriends = friends.filter(f => f.userId === userId);
  res.json(userFriends);
});

// 7. SEND MESSAGE (text, photo, video)
app.post('/send', (req, res) => {
  const { fromId, from, to, toId, text, type, isGroup } = req.body;
  
  const msg = {
    id: Date.now().toString(),
    fromId: fromId || from || 'unknown',
    fromName: from || fromId || 'User',
    to: to || toId || 'all',
    toId: toId || to,
    text: text || '',
    type: type || 'text', // text, photo, video
    isGroup: isGroup || false,
    timestamp: new Date().toISOString()
  };
  
  messages.push(msg);
  // Keep only last 1000 messages to avoid memory issues
  if (messages.length > 1000) messages.shift();
  
  console.log(`Message: ${msg.fromName} -> ${msg.to}: ${text?.substring(0,50)}`);
  res.json({ ok: true, message: msg });
});

// 8. GET MESSAGES
app.get('/messages', (req, res) => {
  const { to, userId } = req.query;
  let filtered = messages;
  
  if (to) filtered = filtered.filter(m => m.to === to || m.toId === to);
  if (userId) filtered = filtered.filter(m => m.toId === userId || m.fromId === userId || m.to === userId);
  
  res.json(filtered.slice(-100)); // last 100
});

// 9. CREATE GROUP
app.post('/createGroup', (req, res) => {
  const { name, members, createdBy, createdByName } = req.body;
  if (!name) return res.status(400).json({ error: 'name required' });
  
  const group = {
    id: 'group_' + Date.now(),
    name,
    members: members || [],
    createdBy: createdBy || 'unknown',
    createdByName: createdByName || 'User',
    createdAt: new Date().toISOString()
  };
  
  groups.push(group);
  console.log(`Group created: ${name} with ${members?.length || 0} members`);
  res.json({ ok: true, group });
});

// 10. GET GROUPS
app.get('/groups', (req, res) => {
  const userId = req.query.userId;
  if (userId) {
    const userGroups = groups.filter(g => g.members.includes(userId) || g.createdBy === userId);
    return res.json(userGroups);
  }
  res.json(groups);
});

// 11. VOICE/VIDEO CALL SIGNALING (simple)
let calls = [];
app.post('/call', (req, res) => {
  const { fromId, toId, type } = req.body; // type: voice, video
  calls.push({ fromId, toId, type, status: 'calling', timestamp: new Date().toISOString() });
  console.log(`Call: ${fromId} -> ${toId} (${type})`);
  res.json({ ok: true, message: 'calling' });
});

app.get('/calls', (req, res) => {
  res.json(calls.slice(-50));
});

// Health check for Render
app.get('/health', (req, res) => res.json({ status: 'ok', users: users.length }));

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`ZamChat Server running on port ${PORT}`);
  console.log(`Glassmorphism Dark Mode - com.zamchat.app`);
});