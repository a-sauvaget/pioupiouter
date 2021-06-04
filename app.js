/* eslint-disable max-len */
/* eslint-disable no-restricted-syntax */
/* eslint-disable no-await-in-loop */
/* eslint-disable radix */
/* eslint-disable no-undef */
/* eslint-disable no-shadow */
/* eslint-disable no-useless-return */
/* eslint-disable no-console */
const express = require('express');
const session = require('express-session');
// Session data needs to be stored somewhere
const RedisStore = require('connect-redis')(session);
const path = require('path');
const { promisify } = require('util');
const redis = require('redis');
const bcrypt = require('bcrypt');
const { formatDistance } = require('date-fns');

// Acces to redis DB
const client = redis.createClient({
  password: 'vm5eqlAZh0K4WaI8NY30/Rwm+SeB1M2wH/lrMbsgVCG8YGPnBuBJlGVgnyHXkj3i1hF8EiSrkKwwBAYO',
});

// Promisify functions - start with a for async
const ahget = promisify(client.hget).bind(client);
const asmembers = promisify(client.smembers).bind(client);
const ahkeys = promisify(client.hkeys).bind(client);
const aincr = promisify(client.incr).bind(client);
const alrange = promisify(client.lrange).bind(client);

// Create our Express
const app = express();

// Tells how to process data sent by form
app.use(express.urlencoded({ extended: true }));
// Add the Redis store as a middleware to Express
app.use(
  session({
    store: new RedisStore({ client }),
    resave: true,
    saveUninitialized: true,
    cookie: {
      maxAge: 36000000, // 10hours in ms
      httpOnly: false,
      secure: false,
    },
    // Application will use it to verify the session
    secret: 'M45+YTAKNLtvwUB04ffzVpVWekvfXjDGimXjmGFp',
  }),
);

// Set up Pug engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// View to render for each path
app.get('/', async (req, res) => {
  if (req.session.userid) {
    const currentUserName = await ahget(`user:${req.session.userid}`, 'username');
    const following = await asmembers(`following:${currentUserName}`);
    const users = await ahkeys('users');

    const timeline = [];
    const posts = await alrange(`timeline:${currentUserName}`, 0, 100);

    for (post of posts) {
      const timestamp = await ahget(`post:${post}`, 'timestamp');
      const timeString = formatDistance(
        new Date(),
        new Date(parseInt(timestamp)),
      );
      /* For each post we construct an object containing
      the message,the author username and a timestamp */
      timeline.push({
        message: await ahget(`post:${post}`, 'message'),
        author: await ahget(`post:${post}`, 'username'),
        timeString,
      });
    }

    res.render('dashboard', {
      users: users.filter(
        // Remove my user name from the user list
        (user) => user !== currentUserName && following.indexOf(user) === -1,
      ),
      currentUserName,
      timeline,
    });
  } else {
    res.render('login');
  }
});

app.get('/post', (req, res) => {
  if (req.session.userid) {
    res.render('post');
  } else {
    res.render('login');
  }
});

// POST endpoints

// Receive the login and password
app.post('/', (req, res) => {
  // Contains key-value pairs of data submitted in the request body
  const { username, password } = req.body;

  if (!username || !password) {
    res.render('error', {
      message: 'Please set both username and password',
    });
    return;
  }

  // Utils
  const saveSessionAndRenderDashboard = (userid) => {
    req.session.userid = userid;
    req.session.save();
    res.redirect('/');
  };

  const handleSignup = (username, password) => {
    /* User does not exist, signup procedure
      Get the next available userid
      Associate the id to the username in the users hash
      */
    client.incr('userid', async (err, userid) => {
      client.hset('users', username, userid);
      // Create a password hash
      const saltRounds = 10;
      const hash = await bcrypt.hash(password, saltRounds);
      // Create a user:<userid> entry, that stores the hashed password
      client.hset(`user:${userid}`, 'hash', hash, 'username', username);
      saveSessionAndRenderDashboard(userid);
    });
  };

  const handleLogin = (userid, password) => {
    // User exist, login procedure
    client.hget(`user:${userid}`, 'hash', async (err, hash) => {
      // Verify a password against a hash
      const result = await bcrypt.compare(password, hash);
      if (result) {
        // Password ok
        saveSessionAndRenderDashboard(userid);
      } else {
        // Wrong password
        res.render('error', {
          message: 'Incorrect password',
        });
        return;
      }
    });
  };

  client.hget('users', username, (err, userid) => {
    if (!userid) {
      handleSignup(username, password);
    } else {
      handleLogin(userid, password);
    }
  });
});

// Post a message
app.post('/post', async (req, res) => {
  if (!req.session.userid) {
    res.render('login');
    return;
  }

  const { message } = req.body;
  const currentUserName = await ahget(`user:${req.session.userid}`, 'username');
  const postid = await aincr('postid');
  client.hmset(
    `post:${postid}`,
    'userid',
    req.session.userid,
    'username',
    currentUserName,
    'message',
    message,
    'timestamp',
    Date.now(),
  );
  client.lpush(`timeline:${currentUserName}`, postid);

  const followers = await asmembers(`followers:${currentUserName}`);
  for (follower of followers) {
    client.lpush(`timeline:${follower}`, postid);
  }

  res.redirect('/');
});

// Track who we are following
app.post('/follow', (req, res) => {
  if (!req.session.userid) {
    res.render('login');
    return;
  }

  const { username } = req.body;

  client.hget(`user:${req.session.userid}`, 'username', (err, currentUserName) => { // Adding 2 sets
    client.sadd(`following:${currentUserName}`, username);
    client.sadd(`followers:${username}`, currentUserName);
  });
  /* res.redirect is used to pass data to the template,
  and if we are connected,
  it show in every case the dashboard */
  res.redirect('/');
});

// Active the server
app.listen(3000, () => console.log('Server ready'));
