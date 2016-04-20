var assert = require('assert'),
    asyncHelper = require('./helpers/asyncHelper.js'),
    cheerio = require("cheerio"),
    csv = require("csv"),
    fs = require('fs'),
    json2csv = require('json2csv'),
    http = require("http"),
    MongoClient = require('mongodb').MongoClient,
    assessorDb = 'mongodb://localhost:27017/assessordata',
    Q = require("q");

module.exports = (function() {

    var scraper = this;

    scraper.config = {
    	baseUrl: "http://qpublic9.qpublic.net/la_orleans_display.php",
    	sampleQuery: "?KEY=3609-IBERVILLEST",
    	sampleAddress: {
    		number: "825",
    		street: "N PRIEUR ST"
    	},
      sampleAddresses: [
        '825 N PRIEUR ST',
        '829 N PRIEUR ST',
        '910 N PRIEUR ST',
        '128 N JOHNSON ST',
        '327 N ROMAN ST',
        '1936 CONTI ST',
        '2111 CONTI ST',
        '313 N JOHNSON ST',
        '2137 URSULINES AVE'
      ],
      writeFile: './properties.json'
    };

    scraper.entries = [];
    scraper.urls = [];
    scraper.problemAddresses = [];

    scraper.init = function() {
      var addressObjects = scraper.buildAddressObjectArray(scraper.config.sampleAddresses);
      scraper.urls = scraper.generateUrlQueryArray(addressObjects);
      var numberOfLoops = scraper.urls.length;
      console.log('\nInitializing collection of (' + numberOfLoops + ') records...')
      asyncHelper.syncLoop(numberOfLoops,
        scraper.loop,
        scraper.complete);
    };

    scraper.loop = function(loop){
      var i = loop.iteration();
      console.log(' ' + i + '. ' + scraper.urls[i])
      scraper.download(scraper.urls[i])
      .then(function(html){
        if (html !== undefined && html !== null) {
          feature = scraper.buildFeature(html);
          feature['url'] = scraper.urls[i];
          if (feature.property.taxBillNumber) {
            scraper.insertFeatureIntoDb(feature)
            .then(loop.next);
          } else {
            var problemAddress = scraper.urls[i].split("?KEY=")[1];
            scraper.problemAddresses.push(problemAddress)
            console.log('    x ' + problemAddress + ' was not scraped.Check that the address exists in the assessor database.');
            loop.next();
          }
        }
      });
    };

    scraper.insertFeatureIntoDb = function(feature){
      var defer = Q.defer();
      MongoClient.connect(assessorDb, function(e, db) {

        function _addNewFeature(feature){
          db.collection('features').insert(feature, function(e, records) {
            console.log('    + ' + feature.property.locationAddress + ' entered into database.')
            assert.equal(e, null);
            db.close();
            defer.resolve();
          });
        };

        if (db === null){
          console.log('Bad database connection.')
          defer.resolve();
        }
        db.collection('features').find({"url" : feature.url}).toArray(function(e, docs){
          assert.equal(e, null);
          if (docs.length === 0){
            _addNewFeature(feature);
          } else {
            defer.resolve();
            console.log('    - ' + feature.property.locationAddress + ' already exists in database.')
          }
        });
      });
      return defer.promise;
    };

    scraper.complete = function(){
      fs.writeFile(config.writeFile, JSON.stringify(entries));
      console.log("=======================================================");
      if (scraper.problemAddresses.length === 0) {
        console.log('All addresses were verified');
      } else {
        var addressPlural = scraper.problemAddresses.length === 1 ? 'address' : 'addresses';
        console.log('The following (' + scraper.problemAddresses.length + ') '
          + addressPlural + ' could not be verified: \n'
          + JSON.stringify(scraper.problemAddresses))
      }
    };

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

    scraper.buildFeature = function(html){
      var $ = cheerio.load(html),
      feature = {},
      value = {},
      propertyInformation = {},
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

      feature = {
        value: value,
        property: propertyInformation
      };

      return feature;
    };

    scraper.testDb = function(){
      MongoClient.connect(mongoUrl, {
         db: {
           raw: true
         },
         server: {
           poolSize: 10
         }
       }, function(err, db) {
       assert.equal(null, err);
       console.log("Connected correctly to server");

       db.close();
     });
   };

   return scraper;
})();
