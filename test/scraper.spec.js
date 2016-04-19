var scraper = require('../app/scraper.js');
var assert = require('chai').assert;


describe('scraper', function() {

  beforeEach(function() {
    sampleAddress = {
      number: "3609",
      street: "IBERVILLE ST"
    };
  });

  describe('generateQuery', function() {
    it('should generate a valid query', function(){
    	var expectedQuery = '?KEY=3609-IBERVILLEST';
    	var actualQuery = scraper.generateQuery(sampleAddress);
    	assert.equal(actualQuery, expectedQuery);
    });
  });

  describe('buildAddressObjectArray', function() {
    beforeEach(function() {
    });
    it('should transform an array of addresses into an array of address objects that contain street number and street name attributes', function(){
      var expectedArray = [sampleAddress];
      var actualArray = scraper.buildAddressObjectArray(["3609 IBERVILLE ST"]);
      assert.equal(actualArray[0]['number'], expectedArray[0]['number']);
      assert.equal(actualArray[0]['street'], expectedArray[0]['street']);
    });
  });

});
