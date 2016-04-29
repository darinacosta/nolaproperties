var assert = require('assert'),
    asyncHelper = require('./helpers/asyncHelper.js'),
    cheerio = require("cheerio"),
    csv = require("csv"),
    csvParser = csv.parse();
    fs = require('fs'),
    json2csv = require('json2csv'),
    http = require("http"),
    MongoClient = require('mongodb').MongoClient,
    mongoUrl = 'mongodb://localhost:27017/',
    Q = require("q");

module.exports = (function() {

    var scraper = this;

    scraper.config = {
    	baseUrl: 'http://qpublic9.qpublic.net/la_orleans_display.php',
      addresses: './public_data/jpnsi_addresses_complete_v1.csv',
      db: mongoUrl + 'assessordata',
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
    scraper.problemAddresses = [];

    scraper.init = function() {
      var addresses = scraper.getAddresses()
      .then(function(addresses){
        console.log(addresses.length + ' records will be processed.');
        scraper.entries = scraper.buildLocationObjectArray(addresses);
        var numberOfLoops = scraper.entries.length;
        console.log('\nInitializing collection of (' + numberOfLoops + ') records...')
        asyncHelper.syncLoop(numberOfLoops,
          scraper.loop,
          scraper.complete);
      });
    };

    scraper.getAddresses = function(){
      var defer = Q.defer();
      fs.readFile(scraper.config.addresses, function(err, data){
        if (err){ console.log(err); }
        csv.parse(data, function(err, csvData){
          if (err){ console.log(err); }
          defer.resolve(csvData);
        });
      });
      return defer.promise;
    };

    scraper.loop = function(loop){
      var i = loop.iteration();
      console.log(' ' + i + '. ' + scraper.entries[i].url)
      scraper.recordExists(scraper.entries[i].url)
      .then(function(state){
        if (state === 'error') {
          loop.next();
        } else if (state === false){
          console.log('    - ' + scraper.entries[i].number + ' ' + scraper.entries[i].street + ' already exists in database.')
          loop.next();
        } else {
          scraper.download(scraper.entries[i].url)
          .then(function(html){
            scraper.handleScrapeProcedure(html, scraper.entries[i])
            .then(loop.next);
          });
        }
      })
    };

    scraper.handleScrapeProcedure = function(html, feature){
      var defer = Q.defer();
      if (html !== undefined && html !== null) {
        feature = scraper.buildFeature(html, feature);
        if (feature.property.taxBillNumber) {
          scraper.insertFeatureIntoDb(feature)
          .then(function(){
            defer.resolve()
          })
        } else {
          console.log('    x url was not scraped. Ensure that the address exists in the assessor database.');
          defer.resolve()
        }
      } else {
        console.log('    x url was not scraped. Ensure that the address exists in the assessor database.');
        defer.resolve()
      }
      return defer.promise;
    };

    scraper.recordExists = function(url){
      var defer = Q.defer();
      MongoClient.connect(scraper.config.db, function(e, db) {

        if (db === null){
          console.log('Bad database connection.')
          defer.resolve('error');
        } else {
          db.collection('features').find({"url" : url}).toArray(function(e, docs){
            assert.equal(e, null);
            if (docs.length === 0){
              defer.resolve(false);
              defer.resolve();
            } else {
              defer.resolve(true);
            }
          });
        }
      });
      return defer.promise;
    };

    scraper.insertFeatureIntoDb = function(feature){
      var defer = Q.defer();
      MongoClient.connect(scraper.config.db, function(e, db) {

        if (db === null){
          console.log('Bad database connection.')
          defer.resolve();
        }

        db.collection('features').insert(feature, function(e, records) {
          assert.equal(e, null);
          console.log('    + ' + feature.property.locationAddress + ' entered into database.')
          db.close();
          defer.resolve();
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

    scraper.buildLocationObjectArray = function(addresses) {
      var locationObjectArray = [];
      for (var i = 1; i < addresses.length; i ++) { //skip the header row
        var addressStringArray = addresses[i][0].split(/([0-9]+)/);
        var addressNumber = addressStringArray[1];
        var addressStreet = addressStringArray[2];
        var url = scraper.generateUrlQuery(addressNumber, addressStreet);
        var locationObject = {
          number: addressNumber.trim(),
          street: addressStreet.trim(),
          address: addressNumber.trim() + ' ' + addressStreet.trim(),
          x: addresses[i][1],
          y: addresses[i][2],
          url: url
        }
        locationObjectArray.push(locationObject);
      }
      return locationObjectArray;
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

    scraper.generateUrlQuery = function(streetNum, streetName){
    	var url = scraper.config.baseUrl + "?KEY=";
      if (streetNum) {
          url += streetNum + '-';
      }
      if (streetName) {
      	url += streetName.replace(/ /g,'');
      }
      return url;
    };

    scraper.buildFeature = function(html, feature){
      var $ = cheerio.load(html),
      newFeature = {},
      value = {},
      transfer = {},
      propertyInformation = {},
      firstListedYear, secondListedYear, thirdListedYear;

      /*
        value - First Listed Year - .tax_value 0 - 8
      */

      firstListedYear = $('.tax_value').eq(0).text().replace(/ /g,'').trim();
      if (/^20*/.test(firstListedYear) == true){
        value[firstListedYear] = {};
        value[firstListedYear]['landValue'] = $('.tax_value').eq(1).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['buildingValue'] = $('.tax_value').eq(2).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['totalValue'] = $('.tax_value').eq(3).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['assessedLandValue'] = $('.tax_value').eq(4).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['assessedBuildingValue'] = $('.tax_value').eq(5).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['totalAssessedValue'] = $('.tax_value').eq(6).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['homesteadExemptionValue'] = $('.tax_value').eq(7).text().replace(/ |\.|,|\$/g,'').trim();
        value[firstListedYear]['taxablevalue'] = $('.tax_value').eq(8).text().replace(/ |\.|,|\$/g,'').trim();
      }

      /*
        value - Second Listed Year - .tax_value 13 - 25
      */
      secondListedYear = $('.tax_value').eq(13).text().replace(/ /g,'').trim();
      if (/^20*/.test(secondListedYear) == true){
        value[secondListedYear] = {};
        value[secondListedYear]['landValue'] = $('.tax_value').eq(14).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['buildingValue'] = $('.tax_value').eq(15).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['totalValue'] = $('.tax_value').eq(16).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['assessedLandValue'] = $('.tax_value').eq(17).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['assessedBuildingValue'] = $('.tax_value').eq(18).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['totalAssessedValue'] = $('.tax_value').eq(19).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['homesteadExemptionValue'] = $('.tax_value').eq(20).text().replace(/ |\.|,|\$/g,'').trim();
        value[secondListedYear]['taxablevalue'] = $('.tax_value').eq(21).text().replace(/ |\.|,|\$/g,'').trim();
      }

      /*
        value - Third Listed Year - .tax_value 26 - 39
      */

      thirdListedYear = $('.tax_value').eq(26).text().replace(/ /g,'').trim();
      if (/^20*/.test(secondListedYear) == true){
        value[thirdListedYear] = {};
        value[thirdListedYear]['landValue'] = $('.tax_value').eq(27).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['buildingValue'] = $('.tax_value').eq(28).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['totalValue'] = $('.tax_value').eq(29).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['assessedLandValue'] = $('.tax_value').eq(30).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['assessedBuildingValue'] = $('.tax_value').eq(31).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['totalAssessedValue'] = $('.tax_value').eq(32).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['homesteadExemptionValue'] = $('.tax_value').eq(33).text().replace(/ |\.|,|\$/g,'').trim();
        value[thirdListedYear]['taxablevalue'] = $('.tax_value').eq(34).text().replace(/ |\.|,|\$/g,'').trim();
      }

      /*
        Transfer Information
      */
      var $prcClass = $('.prc_class');
      var $transferTable;
      for (var i = 0; i < prcClass.length; i ++){
        var prcText = $prcClass[0].text();
        if (prcText.indexOf('Sale/Transfer Information') > -1){
          $transferTable = $prcClass[0];
        }
      }
      for ($('.even')


      /*
        Property Information
      */

      propertyInformation['owner'] = $('.owner_value').eq(0).text().trim();
      propertyInformation['mailingAddress'] = $('.owner_value').eq(2).text().trim();
      propertyInformation['locationAddress'] = $('.owner_value').eq(4).text().trim();
      propertyInformation['taxBillNumber'] = $('.owner_value').eq(5).text().trim();
      propertyInformation['propertyClass'] = $('.owner_value').eq(6).text().trim();
      propertyInformation['sqFt'] = $('.owner_value').eq(9).text().trim();


      newFeature = {
        value: value,
        property: propertyInformation,
        location: {
          x: feature.x,
          y: feature.y,
          address: feature.number + ' ' + feature.street
        },
        url: feature.url
      };

      return newFeature;

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
