var request = require('request');
var config = require('./config');
var Bill = require('./../db/models/bill');
var logger = require('./logHelpers.js');

// Use this query string in an http request when pulling the data used to initially populate the database.
var initializationQueryString = {
  congress: config.congress,
  fields: 'bill_id,chamber,introduced_on,last_action_at,last_vote_at,last_version_on,short_title,official_title,popular_title,sponsor.first_name,sponsor.last_name,sponsor.middle_name,sponsor.title,sponsor_id,cosponsor_ids,keywords,summary,summary_short,related_bill_ids',
  order: 'introduced_on',
  per_page: '50'
};

// Use this query string in an http request when updating the bills in the database.
var updateQueryString = {
  fields: 'bill_id,chamber,introduced_on,last_action_at,last_vote_at,last_version_on,short_title,official_title,popular_title,sponsor.first_name,sponsor.last_name,sponsor.middle_name,sponsor.title,sponsor_id,cosponsor_ids,keywords,summary,summary_short,related_bill_ids'
};

// Generic helper function for querying the bills API.
// First argument is a query string object.
// Second argument is a callback function with the following signature: function(error, response, body). 
var billsAPIRequest = function(qs, callback) {
  request({
    url: config.CONGRESS_API_URL,
    qs: qs,
    method: 'GET'
  }, function(error, response, body) {
    if (error) {
      callback(error, null, null);
    } else {
      callback(null, response, body);
    }
  });  
};

// This helper function initializes the bills database if it has not been initialized yet.
// It checks if the database is empty, and if so it retrieves all bills from the current Congress.
var initializeBillsDatabase = function(callback) {

   // Check if the database is empty
  Bill.findOne({}, {}, function(err, bill) {
    if (err) {
      logger.log('Error initializing Bills database: ' + err);
    } else if (!bill) { 
      // The database is empty, so grab all recent congressional bills...

      // First, do an initial request to figure out how many bills we need to download into the database
      billsAPIRequest(initializationQueryString, function(error, response, body) {
        if (error) {
          logger.log('Error initializing Bills database: ' + err); 
        } else {
          body = JSON.parse(body);
       
          var totalBills = body.count;  // total number of bills to be fetched
          var billsFetched = 0;         // running count of bills we have requested from the API so far
          var billsWritten = 0;         // running count of bills written to the database so far
          var billsPerPage = Number(initializationQueryString.per_page); // number of bills received in each call to the Sunlight Foundation API
          var page = 1;                 // a counter we will increment in order to progressively retrieve all bills available through the API

          // Now use pagination to download all bills page by page
          while (billsFetched < totalBills) {
            var queryString = JSON.parse(JSON.stringify(initializationQueryString)); // making a deep clone of the initalizationQueryString
                                                                                     // through use of the JSON libraries 
            queryString.page = page.toString();
            billsFetched += billsPerPage;
            page++;      
            billsAPIRequest(queryString, function(error, response, body) {
              if (error) {
                logger.log('Error initializing Bills database: ' + err);
              } else {
                // Write each bill to the database
                body = JSON.parse(body);
                body.results.forEach(function(b) {
                  var bill = new Bill(b);
                  bill.save(function(err) {
                    if (err) {
                      logger.log('Error writing bill to the database: ' + err);                    
                    }
                    billsWritten++;
                    if (billsWritten === totalBills) {
                      callback();
                    }
                  });
                });
              }
            });
          }  
        }
      });
    } else { // database is not empty, no initialization needed
      callback();
    }
  });
};

module.exports.initializeBillsDatabase = initializeBillsDatabase;