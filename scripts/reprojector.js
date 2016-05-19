"use strict";

var MongoClient = require('mongodb').MongoClient,
    mongoUrl = 'mongodb://localhost:27017/',
    proj4 = require('proj4'),
    Q = require("q");

module.exports = (function() {

  var reprojector = {};

  reprojector.config = {
    mongoUrl: 'mongodb://localhost:27017/',
    db: mongoUrl + 'assessordb',
    defaultCrs: 'WGS84'
  };

  // Louisiana State Plane
  proj4.defs["EPSG:3452"] = "+proj=lcc +lat_1=30.7 +lat_2=29.3 +lat_0=28.5 +lon_0=-91.33333333333333 +x_0=999999.9999898402 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs";

  reprojector.pointToWgs84 = function(fromCrs, coords) {
    var reproj = proj4(fromCrs, proj4.defs["WGS84"], coords);
    return reproj;
  };

  reprojector.pointFeatureToWgs84 = function(fromCrs, feature) {
    try{
      if (feature.geometry.type === "Point") {
        feature.geometry.coordinates = proj4(fromCrs,
                                             proj4.defs["WGS84"],
                                             feature.geometry.coordinates);
        return feature;
      }
    } catch(e) {
      console.log(e);
      return "error";
    }
  };

  reprojector.dbFeatureToWgs84 = function() {
  };

  return reprojector;
})();
