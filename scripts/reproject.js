//var reproject = require('reproject');
//var assessorData = require('../public_data/assessordata.json');
var proj4 = require('proj4');

//LA State Plane South
proj4.defs["ESRI:102682"] = "+proj=lcc +lat_1=29.3 +lat_2=30.7 +lat_0=28.5 +lon_0=-91.33333333333333 +x_0=1000000 +y_0=0 +ellps=GRS80 +datum=NAD83 +to_meter=0.3048006096012192 +no_defs";
var re = proj4(proj4.defs["ESRI:102682"],proj4.defs["WGS84"],["3670387.606","536998.7308"]);


//console.log(reproject.toWgs84(JSON.stringify(assessorData), 'EPSG:3785', proj4.defs));
