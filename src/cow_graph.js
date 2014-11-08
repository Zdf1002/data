"use strict";

var _ = require('underscore');
var Graph = require('./graph');
var Property = require('./property');
var GraphError = Graph.GraphError;

var CopyOnWriteGraph = function(graph) {
  this.original = graph;
  this.COW_ID = CopyOnWriteGraph.IDX++;

  this.nodes = CopyOnWriteGraph.cowObject(graph.nodes, this.COW_ID);
  this.schema = graph.schema;
  this.indexes = {};
};

CopyOnWriteGraph.IDX = 1;

CopyOnWriteGraph.Prototype = function() {

  this.get = function(path) {
    if (path === undefined || path === null) {
      throw new GraphError("Invalid argument: provided undefined or null.");
    }
    if (!_.isArray(path) && !_.isString(path)) {
      throw new GraphError("Invalid argument path. Must be String or Array");
    }
    if (_.isString(path)) path = [path];
    var prop = this.resolve(path);
    return prop.get();
  };

  this.resolve = function(path) {
    return new CopyOnWriteGraph.CowProperty(this, path, this.COW_ID);
  };

  this._delete = function(id) {
    this.nodes[id] = undefined;
  };

};
CopyOnWriteGraph.Prototype.prototype = Graph.prototype;
CopyOnWriteGraph.prototype = new CopyOnWriteGraph.Prototype();

CopyOnWriteGraph.cowObject = function(obj, COW_ID) {
  var result;
  if (obj === undefined || obj === null) return obj;

  if ( _.isArray(obj) ) {
    result = obj.slice(0);
  } else if (_.isDate(obj)) {
    return new Date(obj);
  } else if (_.isObject(obj)) {
    if (obj.copyOnWriteClone) {
      result = obj.copyOnWriteClone();
    } else {
      result = Object.create(obj);
    }
    result.toJSON = function() {
      // TODO: maybe we want to do something like this:
      // var protoChain = util.getProtoChain().reverse();
      // protoChain.unshift({});
      // _.extend.apply(null, protoChain);
      var proto = Object.getPrototypeOf(this);
      var protoJSON = proto.toJSON ? proto.toJSON() : proto;
      return _.extend({}, protoJSON, this);
    };
  } else {
    return obj;
  }
  result.__COW__ = COW_ID;
  return result;
};

CopyOnWriteGraph.CowProperty = function(graph, path, COW_ID) {
  // Important: set this before calling super
  this.COW_ID = COW_ID;

  Property.call(this, graph, path);
  this.graph = graph;
  this.path = path;
};
CopyOnWriteGraph.CowProperty.Protoype = function() {

  this.init = function() {
    this.context = this.graph.nodes;
    this.key = this.path[this.path.length-1];
    var child;
    for (var i = 0; i < this.path.length - 1; i++) {
      child = this.context[this.path[i]];
      if (child === undefined || child === null) {
        this.context = [];
        this.type = [];
        this.baseType = undefined;
        return;
      }
      else if (child.__COW__ !== this.COW_ID) {
        child = CopyOnWriteGraph.cowObject(child, this.COW_ID);
        this.context[this.path[i]] = child;
      }
      this.context = child;
    }
    if (this.context === this.graph.nodes) {
      this.type = ['graph'];
      this.baseType = 'graph';
    } else {
      this.type = this.graph.schema.getPropertyType(this.context.type, this.key);
      this.baseType = _.isArray(this.type) ? this.type[0] : this.type;
    }
  };

  this.get = function() {
    var value = this.context[this.key];
    if (value && (value.__COW__ !== this.COW_ID) ) {
      value = this.graph.schema.ensureType(this.baseType, value);
      value = CopyOnWriteGraph.cowObject(value, this.COW_ID);
      this.context[this.key] = value;
    }
    return value;
  };

};
CopyOnWriteGraph.CowProperty.Protoype.prototype = Property.prototype;
CopyOnWriteGraph.CowProperty.prototype = new CopyOnWriteGraph.CowProperty.Protoype();

module.exports = CopyOnWriteGraph;