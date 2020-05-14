/**
 * Copyright 2017-present, Facebook, Inc. All rights reserved.
 *
 * This source code is licensed under the license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * Messenger Platform Quick Start Tutorial
 *
 * This is the completed code for the Messenger Platform quick start tutorial
 *
 * https://developers.facebook.com/docs/messenger-platform/getting-started/quick-start/
 *
 * To run this code, you must do the following:
 *
 * 1. Deploy this code to a server running Node.js
 * 2. Run `npm install`
 * 3. Update the VERIFY_TOKEN
 * 4. Add your PAGE_ACCESS_TOKEN to your environment vars
 *
 */

'use strict';
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
// Imports dependencies and set up http server
const request = require('request'),
  express = require('express'),
  axios = require('axios'),
  cheerio = require('cheerio'),
  body_parser = require('body-parser'),
  fs = require('fs'),
  path = require('path'),
  readline = require('readline'),
  stream = require('stream'),
  app = express().use(body_parser.json()),
  search_urls = require('./item-urls'),
  useless_items = require('./useless-items')
// creates express http server

var interval_id = null;
var search_dic = {};
var user_id_dic = {};
var start_time;
// Delay in seconds
var delay = 10;
// Limit of iteems
var item_limit = 4;

app.set('view engine', 'ejs');

app.use(express.static(__dirname + '/views/'));

// Sets server port and logs message on success
app.listen(process.env.PORT || 1337, () => {
  console.log('webhook is listening');
  try {
    setInterval(handleAllURLs, delay * 1000);
  }
  catch (error) {
    console.log(`Error: ${error}`);
  }

});

// Home screen page
app.get('/', (req, res) => {
  res.render('index')
});

app.get('/bot-guide', (req, res) => {
  res.render('bot-guide')
});

app.get('/terms', (req, res) => {
  res.render('terms');
});

app.get('/privacy-policy', (req, res) => {
  res.render('privacy-policy');
});

app.get('/current-items', (req, res) => {
  res.render('current-items', { data: search_urls });
});

app.get('/stock-updates', (req, res) => {
  var instream = fs.createReadStream('stock-log.txt');
  var outstream = new stream;
  var rl = readline.createInterface(instream, outstream);
  let data_from_log = { 'item_info': [] };
  rl.on('line', function (line) {
    // Process line here
    let words = line.split("|");
    let items = words[2].split(",")
    let item_dic = { 'time': words[0], 'name': words[1], 'items': items, 'link': words[3] };
    data_from_log['item_info'].unshift(item_dic);
  });

  rl.on('close', function () {
    res.render('stock-updates', { data: data_from_log });
  });

});


// Accepts POST requests at /webhook endpoint
app.post('/webhook', (req, res) => { // Parse the request body from the POST
  let body = req.body;

  // Check the webhook event is from a Page subscription
  if (body.object === 'page') {

    body.entry.forEach(function (entry) { // Gets the body of the webhook event
      let webhook_event = entry.messaging[0];
      console.log("---MESSAGE RECEIVED---");
      console.log(webhook_event);


      // Get the sender PSID
      let sender_psid = webhook_event.sender.id;
      console.log('Sender ID: ' + sender_psid + "\n");

      // Check if the event is a message or postback and
      // pass the event to the appropriate handler function
      if (webhook_event.message) {
        handleMessage(sender_psid, webhook_event.message);
      }
      else if (webhook_event.postback) {

        handlePostback(sender_psid, webhook_event.postback);
      }

    });
    // Return a '200 OK' response to all events
    res.status(200).send('EVENT_RECEIVED');

  }
  else { // Return a '404 Not Found' if event is not from a page subscription
    res.sendStatus(404);
  }

});

// Accepts GET requests at the /webhook endpoint
app.get('/webhook', (req, res) => { /** UPDATE YOUR VERIFY TOKEN **/
  const VERIFY_TOKEN = "VERIFY_TOKEN";

  // Parse params from the webhook verification request
  let mode = req.query['hub.mode'];
  let token = req.query['hub.verify_token'];
  let challenge = req.query['hub.challenge'];

  // Check if a token and mode were sent
  if (mode && token) { // Check the mode and token sent are correct
    if (mode === 'subscribe' && token === VERIFY_TOKEN) { // Respond with 200 OK and challenge token from the request
      console.log('WEBHOOK_VERIFIED');
      res.status(200).send(challenge);

    }
    else { // Responds with '403 Forbidden' if verify tokens do not match
      res.sendStatus(403);
    }
  }
});

async function handleAllURLs() {
  for (let item in search_urls) {
    let data = await getDataFromURL(item);
    let item_str = "";
    let write_item_str = "";
    let in_stock_count = 0;

    // Loop through each item on page
    for (let i = 0; i < data.length; i++) {
      var avail = decodeURI('\u2705');

      // Check if data returned is empty
      if (Object.keys(data[i]).length == 0) {
        continue;
      }
      // Out of stock
      if (data[i]['in_stock'].indexOf("Notify Me") > 0) { // Cross emoji
        avail = decodeURI('\u274C');
      }
      // In stock
      else { // Check emoji
        avail = decodeURI('\u2705');
        in_stock_count += 1;
        write_item_str += data[i]['name'] + " " + avail + ", "
        item_str += data[i]['name'] + "\n" + data[i]['price'] + "\nIn stock: " + avail + "\n \n"
      }
      //item_str += data[i]['name'] + "\n" + data[i]['price'] + "\nIn stock: " + avail + "\n \n"
    }

    // No items found, everything sold out
    if (item_str === "") {
      item_str = "Everything currently out of stock.\n\n";
      write_item_str = item_str;
    }

    // Set date
    var today = new Date();
    var date = (today.getMonth() + 1) + '/' + today.getDate() + '/' + today.getFullYear();
    var time = today.toLocaleString('en-US',
      {
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: true
      });
    var dateTime = time + ' EST ' + date;

    // Send response to every user
    for (let sender_id in search_urls[item]['sender_ids']) {
      if (search_urls[item]['sender_ids'][sender_id] == 0) {
        search_urls[item]['sender_ids'][sender_id] = 1;
        // First response message
        let response = {
          "text": 
            `FIRST CHECK: "${item}"\n` +
            `Match found for: "${search_urls[item]['product_name']}".\n` +
            `Currently searching ${Object.keys(user_id_dic[sender_id]['products']).length}/${item_limit} items` +
            "\n\n" + item_str +
            `First initial check on ${dateTime}\n` +
            `You will be notified everytime there is a change in stock.\n` +
            `Will begin running in the background until "stop"\n` +
            "Link " + search_urls[item]['link']
        };
        callSendAPI(sender_id, response);
      }
    }

    // Checks if item has been checked
    if (!('prev_stock_count' in search_urls[item])) {
      search_urls[item]['prev_stock_count'] = in_stock_count;
    }
    // If item was in stock, but is now out of stock
    else if (in_stock_count == 0 && search_urls[item]['prev_stock_count'] > 0) {
      let write_line = `${dateTime} | ${search_urls[item]['product_name']} | ${write_item_str} | ${search_urls[item]['link']}\n`;
      try {
        if (write_item_str != "") {
          fs.appendFile('stock-log.txt', write_line, (error) => {
            if (error) throw error;
            console.log(`Wrote update on ${item} to file`);
          });
        }
      } catch (error) {
        console.error(`Could not write to file`);
      }
    }
    // Difference in stock count
    else if ((in_stock_count != search_urls[item]['prev_stock_count'])) {
      console.log("Response msg: Update in stock");
      console.log(item_str);
      console.log(dateTime);
      // Send response to every user
      for (let sender_id in search_urls[item]['sender_ids']) {
        // Response message
        let response = {
          "text": 
            `RESTOCK: "${item}"\n`+
            `Match found for: "${search_urls[item]['product_name']}".\n` +
            `Currently searching ${Object.keys(user_id_dic[sender_id]['products']).length}/${item_limit} items` +
            "\n\n" + item_str +
            "Checked On " + dateTime + "\n" +
            "Link " + search_urls[item]['link']
        };
        callSendAPI(sender_id, response);
      }
      let write_line = `${dateTime} | ${search_urls[item]['product_name']} | ${write_item_str} | ${search_urls[item]['link']}\n`;
      try {
        if (write_item_str != "") {
          fs.appendFile('stock-log.txt', write_line, (error) => {
            if (error) throw error;
            console.log(`Wrote update on ${item} to file`);
          });
        }
      } catch (error) {
        console.error(`Could not write to file`);
      }
    }
    // Update prev stock to current stock
    search_urls[item]['prev_stock_count'] = in_stock_count;
  }
}

// Parses HTML from URL and returns data structure containing relevent data
async function getDataFromURL(item) {
  var item_url_dict = search_urls[item];
  var item_link = item_url_dict['link'];
  try {
    let response = await axios.get(item_link);
    var item_type = item_url_dict['type'];

    // console.log("Looking for: " + item);
    // console.log("Web scraping data from: " + item_link);
    let $ = cheerio.load(response.data);
    var items = [];

    // Check if search string already exists
    if (!(item in search_dic)) {
      search_dic[item] = {};
      search_dic[item]['user_ids'] = [];
    }

    // Multiple items in a page
    if (item_type === "multi") {
      $('.grouped-item').each(function (index, element) {
        let item_name = $(element).find('.item-name').text();
        items[index] = {};
        // Check for useless items
        if (useless_items.indexOf(item_name) >= 0) {
          // console.log(`Useless item found in ${item}: ${item_name}`);
          return;
        }
        items[index]['name'] = $(element).find('.item-name').text();
        items[index]['price'] = $(element).find('.price').text();
        items[index]['in_stock'] = $(element).find('.bin-stock-availability').text();
      });
    }
    // else if (item_type === "bone") {
    //   items[0] = {};
    //   items[0]['name'] = $('.product-title').text();
    //   items[0]['price'] = $('.price').text();
    //   items[0]['in_stock'] = $('.bin-stock-availability').text();
    // }
    // Just one item in a page
    else {
      items[0] = {};
      items[0]['name'] = $('.product-title').text();
      items[0]['price'] = $('.price').text();
      items[0]['in_stock'] = $('.bin-stock-availability').text();
    }
    return items;
  }
  catch (error) {
    console.log(`Error: ${error}`);
  }

}

function getTimeDiff(start_time) {
  var curr_time = new Date();
  var time_elapsed = (curr_time - start_time) / 1000;

  var seconds = Math.round(time_elapsed % 60);
  // remove seconds from the date
  time_elapsed = Math.floor(time_elapsed / 60);

  // get minutes
  var minutes = Math.round(time_elapsed % 60);

  // remove minutes from the date
  time_elapsed = Math.floor(time_elapsed / 60);

  // get hours
  var hours = Math.round(time_elapsed % 24);

  // remove hours from the date
  time_elapsed = Math.floor(time_elapsed / 24);
  var time_elapsed_str = hours + ":" + minutes + ":" + seconds;
  return time_elapsed_str;
}

// Handles messages from sender
function handleMessage(sender_psid, received_message) {
  let response;

  // Checks if the message contains text
  if (received_message.text) {
    // Create the payload for a basic text message, which
    // will be added to the body of our request to the Send API
    var rec_msg = received_message.text.toLowerCase();

    // Checks if user is in dict, if not creates entry
    if (!(sender_psid in user_id_dic)) {
      user_id_dic[sender_psid] = { 'products': {}, 'start-date': {}, 'intervals': [] };
    }

    // Set start time
    if (Object.keys(user_id_dic).length == 1) {
      start_time = new Date();
      var date = (start_time.getMonth() + 1) + '/' + start_time.getDate() + '/' + start_time.getFullYear();
      var time = start_time.toLocaleString('en-US',
        {
          hour: 'numeric',
          minute: 'numeric',
          second: 'numeric',
          hour12: true
        });
      start_time = time + ' EST ' + date;
    }

    // Help message
    if (rec_msg === "help") { 
      var keys = Object.keys(search_urls);
      var key_string = "";
      for (var i = 0; i < keys.length; ++i) {
        key_string += keys[i] + "\n";
      }
      response = {
        "text": `HELP MSG:\n` +
          `Search for the following items\n: ${key_string} \n` +
          "Type `stop` to stop checking all items \n"
      };
      callSendAPI(sender_psid, response);
      return;
    }
    // Status message
    else if (rec_msg === "status") {
      let search_str = `STATUS ${Object.keys(user_id_dic[sender_psid]['products']).length}/${item_limit} items\:\n` +
        `There are ${Object.keys(user_id_dic).length} total users searching\n\n`;
      for (let key in user_id_dic[sender_psid]['products']) {
        search_str += search_urls[key]['product_name'] + " / " + key +
          "\nTime elapsed: " + getTimeDiff(user_id_dic[sender_psid]['products'][key]) + "\n\n";
      }
      search_str += `Last reset: ${start_time}\n`;
      let response = {
        "text": search_str
      };
      callSendAPI(sender_psid, response);
      return;
    }
    // Stop message
    else if (rec_msg === "stop") {
      user_id_dic[sender_psid]['intervals'].forEach(clearInterval);
      var search_item_str = "";
      for (var key in user_id_dic[sender_psid]['products']) {
        search_item_str += search_url[key]['product_name'] +
          "\nTime elapsed: " + getTimeDiff(user_id_dic[sender_psid]['products'][key]) + "\n\n";
      }
      response = {
        "text": `STOP MSG:\n` +
          `Stopped checking ${user_id_dic[sender_psid]['intervals'].length} item(s):\n\n` +
          search_item_str
      };
      user_id_dic[sender_psid]['intervals'] = [];
      user_id_dic[sender_psid]['products'] = {};
      //delete search_urls[rec_msg]['sender_ids'][sender_psid];
      delete user_id_dic[sender_psid];

      callSendAPI(sender_psid, response);
      return;
    }

    // User message is invalid
    if (!(rec_msg in search_urls)) {
      response = {
        "text": `INVALID\nYou entered: "${
          received_message.text
          }".` + "\n\n" +
          "Item doesn't exist\nTry typing `help` for a list of all valid commands"
      };
      callSendAPI(sender_psid, response);
      return;
    }


    // Check current amount of items
    if (Object.keys(user_id_dic[sender_psid]['products']).length >= item_limit) {
      response = {
        "text": `INVALID\nYou have reached max limit of "${item_limit}" items\n`
      };
      callSendAPI(sender_psid, response);
      return;
    }

    // Check if item is already being searched for user
    if (rec_msg in user_id_dic[sender_psid]['products']) {
      response = {
        "text": `INVALID\nAlready searching: "${
          search_urls[rec_msg]['product_name']
          }".\n`
      };
      callSendAPI(sender_psid, response);
      return;
    }
    else {
      user_id_dic[sender_psid]['products'][rec_msg] = new Date();
      //user_id_dic[sender_psid]['start-time'] = new Date();
    }

    // Check if sender_psid is in dic for url
    if (!(sender_psid in search_urls[rec_msg]['sender_ids'])) {
      search_urls[rec_msg]['sender_ids'][sender_psid] = 0;
    }
  }

  // Send the response message
  callSendAPI(sender_psid, response);
}

function handlePostback(sender_psid, received_postback) {
  console.log('ok')
  let response;
  // Get the payload for the postback
  let payload = received_postback.payload;

  // Set the response based on the postback payload
  if (payload === 'yes') {
    response = {
      "text": "Thanks!"
    }
  }
  else if (payload === 'no') {
    response = {
      "text": "Oops, try sending another image."
    }
  }
  // Send the message to acknowledge the postback
  callSendAPI(sender_psid, response);
}

function callSendAPI(sender_psid, response) { // Construct the message body
  let request_body = {
    "recipient": {
      "id": sender_psid
    },
    "message": response
  }

  // Send the HTTP request to the Messenger Platform
  request(
    {
      "uri": "https://graph.facebook.com/v2.6/me/messages",
      "qs": {
        "access_token": PAGE_ACCESS_TOKEN
      },
      "method": "POST",
      "json": request_body
    },
    (err, res, body) => {
      if (!err) {
        console.log('---MESSAGE SENT!---\n');
      }
      else {
        console.error("Unable to send message:" + err);
      }
    }
  );
}
