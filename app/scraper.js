var cheerio = require("cheerio");
var csv = require("csv");
var fs = require('fs');
var json2csv = require('json2csv');
var asyncHelper = require('./helpers/asyncHelper.js');
var http = require("http");
var Q = require("q");

var addressSample = require('../data/jpnsi_address_sample.js');

module.exports = (function() {

    var scraper = this;

    scraper.config = {
    	baseUrl: "http://qpublic9.qpublic.net/la_orleans_display.php",
    	sampleQuery: "?KEY=3609-IBERVILLEST",
    	sampleAddress: {
    		number: "3609",
    		street: "IBERVILLE ST"
    	},
      sampleAddresses: addressSample.sample_addresses,
      writeFile: './properties.json'
    };

    scraper.entries = [];

    scraper.buildAddressObjectArray = function(addresses) {
      var addressObjectArray = [];
      for (var i =0; i < addresses.length; i ++) {
        var addressStringArray = addresses[i].split(/([0-9]+)/);
        var addressNumber = addressStringArray[1];
        var addressStreet = addressStringArray[2];
        addressObjectArray.push({
          number: addressNumber.trim(),
          street: addressStreet.trim()
        });
      }
      return addressObjectArray;
    };

    scraper.download = function(url) {
        var defer = Q.defer();
        http.get(url, function(res) {
            var data = "";
            res.on('data', function (chunk) {
                data += chunk;
            });
            res.on("end", function() {
                defer.resolve(data);
            });
        }).on("error", function() {
            console.log('Unable to retrieve requested HTML for: ' + url);
            defer.resolve();
        });
        return defer.promise;
    };

    scraper.generateUrlQueryArray = function(addressObjArray){
      console.log('Generating query array...');
      var queryStringArray = []
      for (var i = 0; i < addressObjArray.length; i ++){
      	var queryString = scraper.config.baseUrl + "?KEY=";

        if (addressObjArray[i].number) {
            queryString += addressObjArray[i].number + '-';
        }

        if (addressObjArray[i].street) {
        	queryString += addressObjArray[i].street.replace(/ /g,'');
        }
        queryStringArray.push(queryString);
      }

      return queryStringArray;
    };

    scraper.scrape = function(html){
      var $ = cheerio.load(html),
      value = {},
      propertyInformation = {},
      entry = {},
      firstListedYear, secondListedYear, thirdListedYear;
      /*
        value - First Listed Year - .tax_value 0 - 8
      */
      firstListedYear = $('.tax_value').eq(0).text().replace(/ /g,'').trim();
      value[firstListedYear] = {};
      value[firstListedYear]['landValue'] = $('.tax_value').eq(1).text().replace(/ /g,'').trim();
      value[firstListedYear]['buildingValue'] = $('.tax_value').eq(2).text().replace(/ /g,'').trim();
      value[firstListedYear]['totalValue'] = $('.tax_value').eq(3).text().replace(/ /g,'').trim();
      value[firstListedYear]['assessedLandValue'] = $('.tax_value').eq(4).text().replace(/ /g,'').trim();
      value[firstListedYear]['assessedBuildingValue'] = $('.tax_value').eq(5).text().replace(/ /g,'').trim();
      value[firstListedYear]['totalAssessedValue'] = $('.tax_value').eq(6).text().replace(/ /g,'').trim();
      value[firstListedYear]['homesteadExemptionValue'] = $('.tax_value').eq(7).text().replace(/ /g,'').trim();
      value[firstListedYear]['taxablevalue'] = $('.tax_value').eq(8).text().replace(/ /g,'').trim();

      /*
        value - Second Listed Year - .tax_value 13 - 25
      */
      secondListedYear = $('.tax_value').eq(13).text().replace(/ /g,'').trim();
      value[secondListedYear] = {};
      value[secondListedYear]['landValue'] = $('.tax_value').eq(14).text().replace(/ /g,'').trim();
      value[secondListedYear]['buildingValue'] = $('.tax_value').eq(15).text().replace(/ /g,'').trim();
      value[secondListedYear]['totalValue'] = $('.tax_value').eq(16).text().replace(/ /g,'').trim();
      value[secondListedYear]['assessedLandValue'] = $('.tax_value').eq(17).text().replace(/ /g,'').trim();
      value[secondListedYear]['assessedBuildingValue'] = $('.tax_value').eq(18).text().replace(/ /g,'').trim();
      value[secondListedYear]['totalAssessedValue'] = $('.tax_value').eq(19).text().replace(/ /g,'').trim();
      value[secondListedYear]['homesteadExemptionValue'] = $('.tax_value').eq(20).text().replace(/ /g,'').trim();
      value[secondListedYear]['taxablevalue'] = $('.tax_value').eq(21).text().replace(/ /g,'').trim();

      /*
        value - Third Listed Year - .tax_value 26 - 39
      */

      thirdListedYear = $('.tax_value').eq(26).text().replace(/ /g,'').trim();
      value[thirdListedYear] = {};
      value[thirdListedYear]['landValue'] = $('.tax_value').eq(27).text().replace(/ /g,'').trim();
      value[thirdListedYear]['buildingValue'] = $('.tax_value').eq(28).text().replace(/ /g,'').trim();
      value[thirdListedYear]['totalValue'] = $('.tax_value').eq(29).text().replace(/ /g,'').trim();
      value[thirdListedYear]['assessedLandValue'] = $('.tax_value').eq(30).text().replace(/ /g,'').trim();
      value[thirdListedYear]['assessedBuildingValue'] = $('.tax_value').eq(31).text().replace(/ /g,'').trim();
      value[thirdListedYear]['totalAssessedValue'] = $('.tax_value').eq(32).text().replace(/ /g,'').trim();
      value[thirdListedYear]['homesteadExemptionValue'] = $('.tax_value').eq(33).text().replace(/ /g,'').trim();
      value[thirdListedYear]['taxablevalue'] = $('.tax_value').eq(34).text().replace(/ /g,'').trim();

      /*
        Property Information
      */

      propertyInformation['owner'] = $('.owner_value').eq(0).text().trim();
      propertyInformation['mailingAddress'] = $('.owner_value').eq(2).text().trim();
      propertyInformation['locationAddress'] = $('.owner_value').eq(4).text().trim();
      propertyInformation['taxBillNumber'] = $('.owner_value').eq(5).text().trim();
      propertyInformation['propertyClass'] = $('.owner_value').eq(6).text().trim();
      propertyInformation['sqFt'] = $('.owner_value').eq(9).text().trim();

      entry = {
        value: value,
        propertyInformation: propertyInformation
      };

      scraper.entries.push(entry);
      return;
    };

    scraper.test = function() {
      var addressObjects = scraper.buildAddressObjectArray(scraper.config.sampleAddresses);
      var urls = scraper.generateUrlQueryArray(addressObjects);

      console.log('URLS LENGTH: ' + urls.length);

      asyncHelper.syncLoop(urls.length, function(loop){
          var i = loop.iteration();
          scraper.download(urls[i])
          .then(function(html){
            if (html !== undefined && html !== null) {
              console.log(i + '. Successfully downloaded HTML for: ' + urls[i]);
              scraper.scrape(html);
            }
            loop.next();
          });
      }, function(){
        fs.writeFile(config.writeFile, JSON.stringify(entries));
        console.log("done");
      });
    }

    return scraper;
})();
