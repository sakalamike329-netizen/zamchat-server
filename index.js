const express = require('express');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
let messages = [];
let users = [];

app.get('/', (req, res) => {
  res.send('ZamChat Server Running - Online Email Chat Ready');
});

app.post('/register', (req, res) => {
  const { email, name } = req.body;
  let user = users.find(u => u.email === email);
  if(!user) {
    users.push({ email, name, joined: new Date() });
  }
  res.json({ success: true, totalUsers: users.length });
});

app.get('/users', (req, res) => {
  res.json(users);
});

app.get('/messages', (req, res) => {
  const email = req.query.email;
  if(!email) return res.json(messages);
  const myMsgs = messages.filter(m => m.from === email || m.to === email);
  res.json(myMsgs);
});

app.post('/messages', (req, res) => {
  const { from, to, text, name } = req.body;
  const msg = { 
    id: Date.now(), 
    from, 
    to, 
    name: name || from.split('@')[0], 
    text, 
    time: new Date().toLocaleString() 
  };
  messages.push(msg);
  if(messages.length > 500) messages.shift();
  console.log(`${from} -> ${to}: ${text}`);
  res.json({ success: true, message: msg });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log('Running on ' + PORT));