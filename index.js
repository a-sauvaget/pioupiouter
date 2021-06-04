/* eslint-disable no-undef */
/* eslint-disable no-shadow */
/* eslint-disable no-useless-return */
/* eslint-disable no-console */
const express = require('express');
const session = require('express-session');
// Session data needs to be stored somewhere
const RedisStore = require('connect-redis')(session);
const path = require('path');
const redis = require('redis');
const bcrypt = require('bcrypt');

// Acces to redis DB
const client = redis.createClient({
  password: 'vm5eqlAZh0K4WaI8NY30/Rwm+SeB1M2wH/lrMbsgVCG8YGPnBuBJlGVgnyHXkj3i1hF8EiSrkKwwBAYO',
});

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
app.get('/', (req, res) => {
  if (req.session.userid) {
    res.render('dashboard');
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
    res.render('dashboard');
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

// Active the server
app.listen(3000, () => console.log('Server ready'));
