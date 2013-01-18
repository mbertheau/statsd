/*
 * Flush stats to graphite (http://graphite.wikidot.com/).
 *
 * To enable this backend, include 'graphite' in the backends
 * configuration array:
 *
 *   backends: ['graphite']
 *
 * This backend supports the following config options:
 *
 *   graphiteHost: Hostname of graphite server.
 *   graphitePort: Port to contact graphite server at.
 */

var net = require('net'),
   util = require('util');

var debug;
var flushInterval;
var graphiteHost;
var graphitePort;

// prefix configuration
var globalPrefix;
var prefixCounter;
var prefixTimer;
var prefixTimerLf;
var prefixGauge;
var prefixSet;

// set up namespaces
var globalNamespace  = [];
var counterNamespace = [];
var timerNamespace   = [];
var timerLfNamespace = [];
var gaugesNamespace  = [];
var setsNamespace     = [];

var graphiteStats = {};

var post_stats = function graphite_post_stats(statString) {
  if (graphiteHost) {
    try {
      var graphite = net.createConnection(graphitePort, graphiteHost);
      graphite.addListener('error', function(connectionException){
        if (debug) {
          util.log(connectionException);
        }
      });
      graphite.on('connect', function() {
        this.write(statString);
        this.end();
        graphiteStats.last_flush = Math.round(new Date().getTime() / 1000);
      });
    } catch(e){
      if (debug) {
        util.log(e);
      }
      graphiteStats.last_exception = Math.round(new Date().getTime() / 1000);
    }
  }
}

var flush_stats = function graphite_flush(ts, metrics) {
  var ts_suffix = ' ' + ts + "\n";
  var starttime = Date.now();
  var statString = '';
  var numStats = 0;
  var key;
  var timer_data_key;
  var counters = metrics.counters;
  var gauges = metrics.gauges;
  var timers = metrics.timers;
  var timers_lf = metrics.timers_lf;
  var sets = metrics.sets;
  var timer_data = metrics.timer_data;

  gauges[prefixStats + '.graphiteBackend.last_flush'] = graphiteStats.last_flush || 0
  gauges[prefixStats + '.graphiteBackend.last_exception'] = graphiteStats.last_exception || 0

  for (key in counters) {
    var namespace = counterNamespace.concat(key);
    var value = counters[key];

    statString += namespace.join(".") + ' ' + value          + ts_suffix;

    numStats += 1;
  }

  for (key in timer_data) {
    if (Object.keys(timer_data).length > 0) {
      for (timer_data_key in timer_data[key]) {
        var namespace = timerNamespace.concat(key);
        var the_key = namespace.join(".");
        statString += the_key + '.' + timer_data_key + ' ' + timer_data[key][timer_data_key] + ts_suffix;
      }

      numStats += 1;
    }
  }

  for (key in timers_lf) {
    var namespace = timersLfNamespace.concat(key);
    statString += namespace.join(".") + ' ' + timers_lf[key] + ts_suffix;
    numStats += 1;
  }

  for (key in gauges) {
    var namespace = gaugesNamespace.concat(key);
    statString += namespace.join(".") + ' ' + gauges[key] + ts_suffix;
    numStats += 1;
  }

  for (key in sets) {
    var namespace = setsNamespace.concat(key);
    statString += namespace.join(".") + '.count ' + sets[key].values().length + ts_suffix;
    numStats += 1;
  }

  var namespace = gaugesNamespace.concat(prefixStats);
  statString += namespace.join(".") + '.graphiteBackend.num_stats ' + numStats + ts_suffix;
  var namespace = timerLfNamespace.concat(prefixStats);
  statString += namespace.join(".") + '.graphiteBackend.calculation_time ' + (Date.now() - starttime) + ts_suffix;

  post_stats(statString);
};

var backend_status = function graphite_status(writeCb) {
  for (var stat in graphiteStats) {
    writeCb(null, 'graphite', stat, graphiteStats[stat]);
  }
};

exports.init = function graphite_init(startup_time, config, events) {
  debug = config.debug;
  graphiteHost = config.graphiteHost;
  graphitePort = config.graphitePort;
  config.graphite = config.graphite || {};
  globalPrefix    = config.graphite.globalPrefix;
  prefixCounter   = config.graphite.prefixCounter;
  prefixTimer     = config.graphite.prefixTimer;
  prefixTimerLf   = config.graphite.prefixTimerLf;
  prefixGauge     = config.graphite.prefixGauge;
  prefixSet       = config.graphite.prefixSet;

  // set defaults for prefixes
  globalPrefix  = globalPrefix !== undefined ? globalPrefix : "stats";
  prefixCounter = prefixCounter !== undefined ? prefixCounter : "counters";
  prefixTimer   = prefixTimer !== undefined ? prefixTimer : "timers";
  prefixTimerLf = prefixTimerLf !== undefined ? prefixTimerLf : "timers_lf";
  prefixGauge   = prefixGauge !== undefined ? prefixGauge : "gauges";
  prefixSet     = prefixSet !== undefined ? prefixSet : "sets";


  if (globalPrefix !== "") {
    globalNamespace.push(globalPrefix);
    counterNamespace.push(globalPrefix);
    timerNamespace.push(globalPrefix);
    timerLfNamespace.push(globalPrefix);
    gaugesNamespace.push(globalPrefix);
    setsNamespace.push(globalPrefix);
  }

  if (prefixCounter !== "") {
    counterNamespace.push(prefixCounter);
  }
  if (prefixTimer !== "") {
    timerNamespace.push(prefixTimer);
  }
  if (prefixTimerLf !== "") {
    timerLfNamespace.push(prefixTimerLf);
  }
  if (prefixGauge !== "") {
    gaugesNamespace.push(prefixGauge);
  }
  if (prefixSet !== "") {
    setsNamespace.push(prefixSet);
  }

  graphiteStats.last_flush = startup_time;
  graphiteStats.last_exception = startup_time;

  flushInterval = config.flushInterval;

  events.on('flush', flush_stats);
  events.on('status', backend_status);

  return true;
};
