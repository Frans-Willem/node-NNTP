var NNTPClient=require("./NNTPClient").NNTPClient;
var EventEmitter=require("events").EventEmitter;
var sys=require("sys");

function NNTPSimpleClient(port,server,user,password) {
	var self=this;
	EventEmitter.call(self);
	this.client=new NNTPClient(port,server,user,password);
	this.client.on("error",function(err) {
		self.connected=self.client.connected;
		self.closed=self.client.closed;
		self.emit("error",err);
	});
	this.client.on("end",function() {
		self.connected=self.client.connected;
		self.closed=self.client.closed;
		self.emit("end");
	});
	this.client.on("connect",function() {
		self.connected=self.client.connected;
		self.closed=self.client.closed;
		self.emit("connect");
	});
	this.lastGroup=undefined;
	this.groupRequests={};
}
sys.inherits(NNTPSimpleClient,EventEmitter);
NNTPSimpleClient.prototype.getGroupInfo=function(group,callback) {
	if (!this.client) {
		throw new Error("Client destroyed");
	}
	var self=this;
	group=group.toLowerCase();
	if (self.groupRequests[group]!==undefined && self.groupRequests[group].length>0) {
		self.groupRequests[group][0].push(callback);
		return;
	}
	var requests=self.groupRequests[group]=[callback];
	self.lastGroup=group;
	self.client.Group(group,function() {
		var args=Array.prototype.slice.call(arguments);
		delete self.groupRequests[group];
		requests.forEach(function(r) {
			r.apply(self,args);
		});
	});
};
NNTPSimpleClient.prototype.getOverviewFormat=function(callback) {
	if (!this.client) {
		throw new Error("Client destroyed");
	}
	return this.client.List("OVERVIEW.FMT",callback);
};
NNTPSimpleClient.prototype.getOverview=function(group,range,callback) {
	if (!this.client) {
		throw new Error("Client destroyed");
	}
	var responded=false;
	if (this.lastGroup!==group) {
		this.lastGroup=group;
		this.client.Group(group,function(err) {
			if (err && !responded) {
				responded=true;
				callback(err);
			}
		});
	}
	this.client.Over(range,function(err) {
		if (!responded) {
			responded=true;
			callback.apply(this,arguments);
		}
	});
};
NNTPSimpleClient.prototype.destroy=function() {
	if (this.client) {
		this.client.destroy();
		this.client=undefined;
	}
}

exports.NNTPSimpleClient=NNTPSimpleClient;