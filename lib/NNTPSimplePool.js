var NNTPSimpleClient=require("./NNTPSimpleClient").NNTPSimpleClient;

function NNTPSimplePool(max,port,server,username,password) {
	this.max=max;
	this.port=port;
	this.server=server;
	this.username=username;
	this.password=password;
	
	this.pool=[];
	this.queue=[];
	this.active=0;
	this.destroyed=false;
}
NNTPSimplePool.prototype.destroy=function() {
	this.destroyed=true;
	while (this.pool.length) {
		this.pool.pop().destroy();
	}
	while (this.queue.length) {
		this.queue.shift()(new Error("Destroyed"));
	}
}
NNTPSimplePool.prototype._getClient=function(callback) {
	if (this.destroyed) {
		callback(new Error("Destroyed"));
		return;
	}
	if (this.pool.length>0) {
		callback(undefined,this.pool.shift());
		return;
	}
	this.queue.push(callback);
	this._requestNew();
}
NNTPSimplePool.prototype._discardClient=function(client) {
	if (this.destroyed) {
		client.destroy();
		return;
	}
	if (client.closed) {
		this.active--;
		if (this.queue.length > 0) {
			this._requestNew();
		}
		return;
	}
	if (this.queue.length>0) {
		this.queue.shift()(undefined,client);
		return;
	}
	this.pool.push(client);
}
NNTPSimplePool.prototype._requestNew=function() {
	var self=this,
		done=false;
	if (this.active < this.max) {
		this.active++;
		var n=new NNTPSimpleClient(this.port,this.server,this.username,this.password);
		function onConnect() {
			if (!done) {
				done=true;
				n.removeListener("connect",onConnect);
				n.removeListener("error",onEnd);
				n.removeListener("end",onEnd);
				n.addListener("error",function() {});
				self._discardClient(n);
			}
		}
		function onEnd() {
			if (!done) {
				done=true;
				n.removeListener("connect",onConnect);
				n.removeListener("error",onEnd);
				n.removeListener("end",onEnd);
				self.active--;
				if (self.queue.length>0) {
					self._requestNew();
				}
			}
		}
		n.on("connect",onConnect);
		n.on("error",onEnd);
		n.on("end",onEnd);
	}
}
NNTPSimplePool.prototype.getGroupInfo=function(group,callback) {
	var self=this;
	this._getClient(function(err,client) {
		if (err) {
			callback(err);
		} else {
			client.getGroupInfo(group,function(err) {
				self._discardClient(client);
				if (err) {
					callback(err);
				} else {
					callback.apply(undefined,arguments);
				}
			});
		}
	});
};
NNTPSimplePool.prototype.getOverviewFormat=function(callback) {
	var self=this;
	this._getClient(function(err,client) {
		if (err) {
			callback(err);
		} else {
			client.getOverviewFormat(function(err,handler) {
				var discarded=false;
				function discard() {
					if (!discarded) {
						discarded=true;
						self._discardClient(client);
					}
					handler.removeListener("error",discard);
					handler.removeListener("end",discard);
				}
				if (err) {
					discarded=true;
					self._discardClient(client);
					callback(err);
				} else {
					handler.on("error",discard);
					handler.on("end",discard);
					callback(undefined,handler);
				}
			});
		}
	});
};
NNTPSimplePool.prototype.getOverview=function(group,range,callback) {
	var self=this;
	this._getClient(function(err,client) {
		if (err) {
			callback(err);
		} else {
			client.getOverview(group,range,function(err,handler) {
				var discarded=false;
				function discard() {
					if (!discarded) {
						discarded=true;
						self._discardClient(client);
					}
					handler.removeListener("error",discard);
					handler.removeListener("end",discard);
				}
				if (err) {
					discarded=true;
					self._discardClient(client);
					callback(err);
				} else {
					handler.on("error",discard);
					handler.on("end",discard);
					callback(undefined,handler);
				}
			});
		}
	});
};

exports.NNTPSimplePool=NNTPSimplePool;