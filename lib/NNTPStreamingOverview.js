var sys=require("sys");
var EventEmitter=require("events").EventEmitter;
var LinkedList=require("./LinkedList").LinkedList;

function bind(f,obj) {
	return function() {
		return f.apply(obj,arguments);
	}
}

/**
 * Splits a buffer on a character, possible to limit to several pieces
 */
function BufferSplit(buffer,split,pieces) {
	if (typeof(split)==="string") {
		split=split.charCodeAt(0);
	}
	var ret=[],
		last=0,
		cur;
	if (typeof(pieces)==="number") {
		pieces=pieces-1;
	} else {
		pieces=(1/0);
	}
	for (cur=0; cur<buffer.length && ret.length<pieces; cur++) {
		if (buffer[cur]===split) {
			ret.push(buffer.slice(last,cur));
			last=cur+1;
		}
	}
	ret.push(buffer.slice(last,buffer.length));
	return ret;
}

function NNTPStreamingOverview(pool,group,start,end,batchSize,cacheBatches) {
	EventEmitter.call(this);
	this._pool=pool;
	this._group=group;
	this._current=start; //Current article number that should be retrieved
	this._end=end; //Last article that should be retrieved
	this._batchSize=batchSize; //Number of articles to retrieve per call
	this._numBatches=cacheBatches; //Number of batches to 
	
	this._requesting=0; //How many outstanding requests do we currently have?
	this._queue=new LinkedList();
	this._numBlockers=0; //Number of blockers on the queue
	this._emitting=false;
	this._paused=false;
	this._closed=false;
	this._emitCallback=bind(this._emit,this);
	this._request();
}
sys.inherits(NNTPStreamingOverview,EventEmitter);
NNTPStreamingOverview.prototype._request=function() {
	while ((this._queue.size() - this._numBlockers) + (this._requesting*this._batchSize) < (this._numBatches*this._batchSize) && this._current<=this._end) {
		this._requesting++;
		this._startRequest();
	}
}
NNTPStreamingOverview.prototype._startRequest=function() {
	var self=this,
		start,
		end,
		blocker;
	start=this._current;
	end=Math.min(this._end,this._current+(this._batchSize-1));
	blocker=this._queue.push_back(false);
	this._numBlockers++;
	this._current=end+1;
	sys.puts("Doing a request for "+start+"-"+end);
	self._pool.getOverview(self._group,start+"-"+end,function(err,handler) {
		if (err) {
			if (!self._closed) {
				self._closed=true;
				self.readable=false;
				self.emit("error",err);
			}
		} else {
			var ended=false;
			handler.on("error",onError);
			handler.on("end",onEnd);
			handler.on("data",onLine);
			
			function onError(err) {
				handler.removeListener("error",onError);
				handler.removeListener("end",onEnd);
				handler.removeListener("data",onLine);
				if (!ended) {
					ended=true;
					if (!self._closed) {
						self._closed=true;
						self.readable=false;
						self.emit("error",err || new Error("Unknown error"));
					}
				}
			}
			function onEnd() {
				handler.removeListener("error",onError);
				handler.removeListener("end",onEnd);
				handler.removeListener("data",onLine);
				if (!ended) {
					ended=true;
					if (!self._closed) {
						self._queue.remove(blocker);
						self._numBlockers--;
						self._requesting--;
						if (!self._paused) {
							self._ensureEmitting();
						}
						self._request();
					}
				}
			}
			function onLine(line) {
				if (!ended && !self._closed) {
					self._queue.insertBefore(blocker,BufferSplit(line,"\t"));
					if (!self._paused) {
						self._ensureEmitting();
					}
				}
			}
		}
	});
}
NNTPStreamingOverview.prototype.readable=true;
NNTPStreamingOverview.prototype.setEncoding=function() {
	throw new Error("setEncoding is not supported");
}
NNTPStreamingOverview.prototype.pause=function() {
	this._paused=true;
}
NNTPStreamingOverview.prototype.resume=function() {
	this._paused=false;
	this._ensureEmitting();
}
NNTPStreamingOverview.prototype.destroy=function() {
	this._closed=true;
	this.readable=false;
	this.queue.clear();
}
NNTPStreamingOverview.prototype._emit=function() {
	if (this._paused || this._closed) {
		this._emitting=false;
		return;
	}
	if (this._queue.size() < 1) {
		this._emitting=false;
		if (this._requesting < 1 && this._current>this._end && this.readable && !this._closed) {
			this.readable=false;
			this._closed=true;
			this.emit("end");
		}
		return;
	}
	if (this._queue.front() === false) {
		//Encountered a blocker
		this._emitting=false;
		return;
	}
	this.emit("data",this._queue.pop_front());
	this._request();
	process.nextTick(this._emitCallback);
}
NNTPStreamingOverview.prototype._ensureEmitting=function() {
	var self=this;
	if (!this._emitting) {
		this._emitting=true;
		process.nextTick(this._emitCallback);
	}
}
exports.NNTPStreamingOverview=NNTPStreamingOverview;
