/* eslint-disable no-console */
const express = require('express');
const path = require('path');

const app = express();

// Set up Pug engine
app.set('view engine', 'pug');
app.set('views', path.join(__dirname, 'views'));

// View to render for each path
app.get('/', (req, res) => res.render('index'));

// Active the server
app.listen(3000, () => console.log('Server ready'));
