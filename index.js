const express = require('express');
const cors = require('cors');
const app = express();

// Allow big images / videos (base64)
app.use(cors());
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ limit: '100mb', extended: true }));

// STORAGE - In memory (Render free - resets on restart, for production use DB)
let users = {}; // id -> {id, name, email, photo, online, lastSeen}
let friendRequests = []; // {fromId, fromName, toId, time}
let friends = {}; // userId -> [friendIds]
let videos = []; // {id, userId, userName, title, uri, likes: [], comments: [], shares: 0, time}
let onlineUsers = {}; // id -> timestamp

app.get('/', (req,res)=>{
  res.send(`
  ZamChat Server Live!
  Server: https://zamchat-server-1.onrender.com
  Created by Mike Sakala
  Users: ${Object.keys(users).length}
  Videos: ${videos.length}
  Requests: ${friendRequests.length}
  Endpoints: /users /videos /register /posts?userId=ID
  `);
});

// ==================== USERS + PROFILE PICTURE ====================

// REGISTER - With profile picture
app.post('/register', (req,res)=>{
  const {id, name, email, photo} = req.body;
  if(!id) return res.status(400).json({error:'no id'});

  users[id] = {
    id,
    name: name || 'User',
    email: email || id+'@zamchat.com',
    photo: photo || '', // real profile picture - base64 or uri
    online: true,
    lastSeen: Date.now()
  };
  onlineUsers[id] = Date.now();
  if(!friends[id]) friends[id] = [];
  
  console.log(`[REGISTER] ${name} - ${id} - Photo: ${photo ? 'YES' : 'NO'}`);
  res.json({ok:true, user: users[id]});
});

// UPDATE PROFILE PICTURE
app.post('/updatePhoto', (req,res)=>{
  const {id, photo} = req.body;
  if(!id || !users[id]) return res.json({error:'user not found'});
  users[id].photo = photo;
  users[id].lastSeen = Date.now();
  console.log(`[PHOTO] Updated for ${users[id].name}`);
  res.json({ok:true, user: users[id]});
});

// GET ALL USERS
app.get('/users', (req,res)=>{
  const all = Object.values(users).map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    photo: u.photo,
    online: onlineUsers[u.id] && (Date.now() - onlineUsers[u.id] < 5*60*1000),
    lastSeen: u.lastSeen
  }));
  res.json(all);
});

// GET SINGLE USER PROFILE - When click avatar shows what you post
app.get('/user/:id', (req,res)=>{
  const user = users[req.params.id];
  if(!user) return res.json({error:'not found'});
  
  const userVideos = videos.filter(v => v.userId === req.params.id);
  
  res.json({
    ...user,
    posts: userVideos, // what you post
    postsCount: userVideos.length,
    friendsCount: friends[req.params.id] ? friends[req.params.id].length : 0,
    online: onlineUsers[req.params.id] && (Date.now() - onlineUsers[req.params.id] < 5*60*1000)
  });
});

// POSTS BY USER - When they click profile pic, showing what you post
app.get('/posts', (req,res)=>{
  const userId = req.query.userId;
  if(!userId) return res.json([]);
  
  const userVideos = videos.filter(v => v.userId === userId).map(v => ({
    ...v,
    likesCount: v.likes.length, // REAL COUNT, NO FAKE
    commentsCount: v.comments.length,
    likedBy: v.likes
  }));
  
  res.json(userVideos);
});

// ==================== ONLINE STATUS ====================

app.post('/online', (req,res)=>{
  const {id} = req.body;
  if(id){
    onlineUsers[id] = Date.now();
    if(users[id]){
      users[id].online = true;
      users[id].lastSeen = Date.now();
    }
  }
  res.json({ok:true});
});

app.get('/online', (req,res)=>{
  const now = Date.now();
  const online = Object.keys(onlineUsers).filter(id => now - onlineUsers[id] < 5*60*1000);
  res.json(online.map(id => users[id]).filter(Boolean));
});

// ==================== FRIENDS ====================

app.post('/friendRequest', (req,res)=>{
  const {fromId, fromName, toId} = req.body;
  if(!fromId || !toId) return res.json({error:'missing ids'});
  
  const exists = friendRequests.find(r => r.fromId===fromId && r.toId===toId);
  if(!exists){
    friendRequests.push({
      fromId, 
      fromName: fromName || users[fromId]?.name || 'User', 
      toId, 
      time: Date.now()
    });
  }
  console.log(`[REQUEST] ${fromName} -> ${toId}`);
  res.json({ok:true});
});

app.get('/requests', (req,res)=>{
  const userId = req.query.userId;
  if(!userId) return res.json([]);
  
  const myRequests = friendRequests.filter(r => r.toId === userId).map(r => ({
    fromId: r.fromId,
    fromName: r.fromName,
    fromUser: users[r.fromId] || null,
    time: r.time
  }));
  
  res.json(myRequests);
});

app.post('/accept', (req,res)=>{
  const {fromId, toId} = req.body;
  if(!fromId || !toId) return res.json({error:'missing'});
  
  friendRequests = friendRequests.filter(r => !(r.fromId===fromId && r.toId===toId));
  
  if(!friends[fromId]) friends[fromId] = [];
  if(!friends[toId]) friends[toId] = [];
  
  if(!friends[fromId].includes(toId)) friends[fromId].push(toId);
  if(!friends[toId].includes(fromId)) friends[toId].push(fromId);
  
  console.log(`[FRIENDS] ${fromId} <-> ${toId}`);
  res.json({ok:true});
});

app.get('/friends', (req,res)=>{
  const userId = req.query.userId;
  if(!userId || !friends[userId]) return res.json([]);
  const list = friends[userId].map(id => users[id]).filter(Boolean);
  res.json(list);
});

// ==================== VIDEOS / REELS - NO FAKE LIKES ====================

// POST VIDEO - Real, no fake likes
app.post('/postVideo', (req,res)=>{
  const {userId, userName, title, uri} = req.body;
  if(!userId) return res.status(400).json({error:'no userId'});
  
  const video = {
    id: Date.now().toString(),
    userId,
    userName: userName || users[userId]?.name || 'Mike Sakala',
    userPhoto: users[userId]?.photo || '',
    title: title || 'Zam Video',
    uri: uri || '', // video uri or base64
    likes: [], // REAL - starts empty, no fake 2K
    comments: [], // REAL - starts empty
    shares: 0, // REAL
    downloads: 0,
    time: Date.now()
  };
  
  videos.unshift(video);
  console.log(`[VIDEO POSTED] ${title} by ${userName} - ID: ${video.id}`);
  res.json({ok:true, video});
});

// GET VIDEOS - Reels feed - Swipe DOWN for next - NO FAKE LIKES
app.get('/videos', (req,res)=>{
  // Return real videos with real counts
  const realVideos = videos.map(v => ({
    id: v.id,
    userId: v.userId,
    userName: v.userName,
    userPhoto: users[v.userId]?.photo || v.userPhoto || '',
    title: v.title,
    uri: v.uri,
    likes: v.likes.length, // REAL COUNT
    likesArray: v.likes,
    comments: v.comments.length, // REAL
    shares: v.shares, // REAL
    downloads: v.downloads,
    time: v.time,
    online: onlineUsers[v.userId] && (Date.now() - onlineUsers[v.userId] < 5*60*1000)
  }));
  
  res.json(realVideos);
});

// LIKE VIDEO - REAL, NO FAKE - Toggle like
app.post('/likeVideo', (req,res)=>{
  const {videoId, userId} = req.body;
  if(!videoId || !userId) return res.json({error:'missing'});
  
  const video = videos.find(v => v.id === videoId);
  if(!video) return res.json({error:'video not found'});
  
  const alreadyLiked = video.likes.includes(userId);
  
  if(alreadyLiked){
    // Unlike
    video.likes = video.likes.filter(id => id !== userId);
  } else {
    // Like
    video.likes.push(userId);
  }
  
  console.log(`[LIKE] Video ${videoId} - User ${userId} - ${alreadyLiked ? 'UNLIKED' : 'LIKED'} - Total: ${video.likes.length}`);
  
  res.json({
    ok:true, 
    liked: !alreadyLiked,
    likes: video.likes.length, // REAL COUNT
    likesArray: video.likes
  });
});

// COMMENT VIDEO - Real
app.post('/commentVideo', (req,res)=>{
  const {videoId, userId, comment} = req.body;
  const video = videos.find(v => v.id === videoId);
  if(!video) return res.json({error:'not found'});
  
  video.comments.push({
    userId,
    userName: users[userId]?.name || 'User',
    userPhoto: users[userId]?.photo || '',
    comment,
    time: Date.now()
  });
  
  res.json({ok:true, comments: video.comments.length});
});

// DOWNLOAD VIDEO - Real + notification
app.post('/downloadVideo', (req,res)=>{
  const {videoId, userId} = req.body;
  const video = videos.find(v => v.id === videoId);
  if(video){
    video.downloads++;
    console.log(`[DOWNLOAD] Video ${videoId} by ${userId} - Total downloads: ${video.downloads}`);
  }
  res.json({ok:true, message:'Video saved - Created by Mike Sakala', downloads: video?.downloads || 0});
});

// DELETE VIDEO
app.delete('/video/:id', (req,res)=>{
  const id = req.params.id;
  videos = videos.filter(v => v.id !== id);
  res.json({ok:true});
});

// CLEAR ALL - For testing
app.get('/clear', (req,res)=>{
  users={}; friendRequests=[]; friends={}; videos=[]; onlineUsers={};
  console.log('[CLEAR] All data cleared');
  res.json({ok:true, message:'All cleared - Fresh start'});
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, ()=>{
  console.log(`ZamChat Server Running - Port ${PORT}`);
  console.log(`Created by Mike Sakala`);
  console.log(`https://zamchat-server-1.onrender.com`);
  console.log(`NO FAKE LIKES - REAL PROFILE PICS - REAL POSTS`);
});
