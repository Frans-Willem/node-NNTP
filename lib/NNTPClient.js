var EventEmitter=require("events").EventEmitter;
var Buffer=require("buffer").Buffer;
var sys=require("sys");
var net=require("net");
var dbg=false;

var codes={
	100:{
		description: "Help text follows",
		handler: true
	},
	111:{
		description: "Server date and time",
		handler: true
	},
	200: {
		description: "Service available, posting allowed",
		multiline: false, //Is this a multiline code
		error: false, //Is this an error code (e.g.
		handler: true
	},
	201: {
		description: "Service available, posting prohibited",
		handler: true
	},
	211:{
		description: "Group successfully selected",
		handler: true,
		multiline: function(args,handler) {
			return handler.listeners("data").length>0;
		}
	},
	215: {
		description: "Information follows (multi-line)",
		handler: true,
		multiline: true
	},
	220:{
		description: "Article follow (multi-line)",
		handler: true,
		multiline: true
	},
	221:{
		description: "Headers follow (multi-line)",
		handler: true,
		multiline: true
	},
	222:{
		description: "Body follows (multi-line)",
		handler: true,
		multiline: true
	},
	223:{
		description: "Article found",
		handler: true
	},
	224: {
		description: "Overview information follows (multi-line)",
		handler: true,
		multiline: true
	},
	281: {
		description: "Authentication accepted",
		handler: true
	},
	381: {
		description: "Password required",
		handler: true
	},
	411:{
		description: "No such newsgroup",
		error: true,
		handler: true
	},
	412:{
		description: "No newsgroup selected",
		error: true,
		handler: true
	},
	420:{
		description: "Current article number is invalid",
		error: true,
		handler: true
	},
	421:{
		description: "No next article in this group",
		error: true,
		handler: true
	},
	422:{
		description: "No previous article in this group",
		error: true,
		handler: true
	},
	423:{
		description: "No article with that number",
		error: true,
		handler: true
	},
	430:{
		description: "No article with that message-id",
		error: true,
		handler: true
	},
	480: {
		description: "Authentication required for command",
		error: true,
		handler: true
	},
	481: {
		description: "Authentication failed/rejected",
		error: true,
		handler: true
	},
	482: {
		description: "Authentication commands issued out of sequence",
		error: true,
		handler: true
	},
	400: {
		description: "Service temporarily unavailable",
		error: true,
		handler: false
	},
	500: {
		description: "Command not recognized",
		error: true,
		handler: true
	},
	502: {
		description: "Service permanently unavailable",
		error: true,
		handler: false
	}
};

var CR="\r".charCodeAt(0);
var LF="\n".charCodeAt(0);

function createLineBuffer() {
	
	var buffer=[];
	var func=function(data,encoding) {
		data=(Buffer.isBuffer(data)?data:new Buffer(data,encoding));
		var chunk,index,lines,cur,line;
		lines=[];
		while (data.length>0 && (index=Array.prototype.indexOf.call(data,LF))!==-1) {
			var chunk=data.slice(0,index);
			var stripped=false;
			if (chunk.length>0 && chunk[chunk.length-1]==CR) {
				stripped=true;
				chunk=chunk.slice(0,chunk.length-1);
			}
			data=data.slice(index+1,data.length);
			if (buffer.length>0) {
				var last=buffer[buffer.length-1];
				if (last.length>0 && chunk.length==0 && last[last.length-1]==CR && !stripped) {
					buffer[buffer.length-1]=last.slice(0,last.length-1);
				}
				line=new Buffer(buffer.reduce(function(cur,b) { return cur+b.length; },chunk.length));
				cur=0;
				buffer.forEach(function(b) {
					b.copy(line,cur,0,b.length);
					cur+=b.length;
				});
				chunk.copy(line,cur,0,chunk.length);
				buffer=[];
				lines.push(line);
			} else {
				lines.push(chunk);
			}
		}
		if (data.length>0) {
			buffer.push(data);
		}
		return lines;
	};
	return func;
};

function NNTPClient(port,server,user,password) {
	var self=this;
	EventEmitter.call(this);
	this.connected=false;
	this.closed=false;
	this.linebuffer=createLineBuffer();
	this.socket=net.createConnection(port,server);
	this.socket.on("data",function(data) {
		self.linebuffer(data).forEach(function(line) {
			if (dbg) sys.puts("<< "+line.toString());
			self._onSocketLine(line);
		});
	});
	this.socket.write=function(data) {
		if (dbg) data.toString().split("\n").forEach(function(l) { if (l) sys.puts(">> "+l); });
		return this.__proto__.write.apply(this,arguments);
	}
	this.socket.on("error",function(error) {
		self._onSocketError(error);
	});
	this.socket.on("end",function() {
		self._onSocketEnd();
	});
	this.currentHandler=undefined;
	this.handlerQueue=[];
	this.requestQueue=[];
	
	function waitForConnect() {
		var connectHandler=new EventEmitter();
		connectHandler.on("response",function(code,args,codeInfo) {
			if (code===200 || code===201) {
				switchToReader(function(err) {
					if (err) {
						self.emit("error",err);
					} else {
						self.connected=true;
						self.emit("connect");
						while (self.requestQueue.length>0) {
							var r=self.requestQueue.shift();
							self.socket.write(r.line);
							self.handlerQueue.push(r.handler);
						}
					}
				});
			} else {
				self._triggerError("Unexpected code: "+code);
			}
		});
		self.handlerQueue.push(connectHandler);
	}
	
	function switchToReader(callback) {
		var handler=new EventEmitter();
		var responded=false;
		self.socket.write("MODE READER\r\n");
		self.handlerQueue.push(handler);
		handler.on("error",function(error) {
			self._triggerError(error);
		});
		handler.on("response",function(code,args,codeInfo) {
			if (code===480) {
				Authenticate(function(err,data) {
					if (!responded) {
						responded=true;
						callback(err);
					}
				});
			} else if (code===200) {
				if (!responded) {
					callback(undefined);
				}
			} else {
				if (!responded) {
					responded=true;
					callback(new Error("Unexpected code "+code));
				}
			}
		})
	}
	
	function Authenticate(callback) {
		var handler=new EventEmitter();
		var responded=false;
		self.socket.write("AUTHINFO USER "+user+"\r\n");
		self.handlerQueue.push(handler);
		
		handler.on("response",function(code,args,codeInfo) {
			if (code===281 || code===502 || code ===500) {
				if (!responded) {
					responded=true;
					callback(undefined,true);
				}
			} else if (code===381) {
				AuthenticatePassword(function(err,data) {
					if (!responded) {
						responded=true;
						callback(err,data);
					}
				});
			} else if (code===481) {
				if (!responded) {
					responded=true;
					callback(new Error("Authentication failed/rejected"));
				}
			} else {
				if (!responded) {
					responded=true;
					callback(new Error("Unexpected code "+code+" to AUTHINFO"));
				}
			}
		});
		handler.on("error",function(error) {
			if (!responded) {
				responded=true;
				callback(error || new Error("Unknown"));
			}
		});
	}
	
	function AuthenticatePassword(callback) {
		var handler=new EventEmitter();
		var responded=false;
		self.socket.write("AUTHINFO PASS "+password+"\r\n");
		self.handlerQueue.push(handler);
		
		handler.on("response",function(code,args,codeInfo) {
			if (code===281 || code===502 || code ===500) {
				if (!responded) {
					responded=true;
					callback(undefined,true);
				}
			} else if (code===481) {
				if (!responded) {
					responded=true;
					callback(new Error("Authentication failed/rejected"));
				}
			} else {
				if (!responded) {
					responded=true;
					callback(new Error("Unexpected code "+code+" to AUTHINFO"));
				}
			}
		});
		handler.on("error",function(error) {
			if (!responded) {
				responded=true;
				callback(error || new Error("Unknown"));
			}
		});
	}
	
	waitForConnect();
}
sys.inherits(NNTPClient,EventEmitter);
NNTPClient.prototype._triggerError=function(error) {
	if (this.closed) {
		return;
	}
	this.closed=true;
	this.socket.destroy();
	this.emit("error",error);
	this.connected=false;
	
	if (this.currentHandler!==undefined) {
		this.currentHandler.emit("error",error);
		this.currentHandler=undefined;
	}
	while (this.handlerQueue.length>0) {
		this.handlerQueue.shift().emit("error",error);
	}
	while (this.requestQueue.length>0) {
		this.requestQueue.shift().handler.emit("error",error);
	}
}
NNTPClient.prototype._onSocketLine=function(line) {
	if (this.currentHandler!==undefined) {
		var DOT=".".charCodeAt(0);
		if (line.length==1 && line[0]===DOT) {
			this.currentHandler.emit("end");
			this.currentHandler=undefined;
		} else {
			if (line.length>1 && line[0]===DOT && line[1]===DOT) {
				line=line.slice(1,line.length);
			}
			this.currentHandler.emit("data",line);
		}
		return;
	}
	var split=Array.prototype.indexOf.call(line," ".charCodeAt(0));
	var code=(split===-1)?line.toString("utf8"):line.slice(0,split).toString("utf8");
	var args=(split===-1)?"":line.slice(split+1,line.length).toString("utf8");
	var codeInfo=codes[code];
	if (codeInfo===undefined) {
		this._triggerError(new Error("Unknown code "+code));
		return;
	}
	if (codeInfo.handler) {
		if (this.handlerQueue.length<1) {
			this._triggerError(new Error("Unexpected response code "+code));
			return;
		}
		var handler=this.handlerQueue.shift();
		handler.emit("response",parseInt(code,10),args,codeInfo);
		if ((typeof(codeInfo.multiline) == "function")?codeInfo.multiline(args,handler):codeInfo.multiline) {
			this.currentHandler=handler;
		} else {
			handler.emit("end");
		}
	} else if (codeInfo.error) {
		this._triggerError(new Error(codeInfo.description));
	} else {
		this._triggerError(new Error("No behaviour defined for code "+code));
	}
}
NNTPClient.prototype._onSocketError=function(error) {
	this._triggerError(error);
}
NNTPClient.prototype._onSocketEnd=function(end) {
	if (!this.closed) {
		this.closed=true;
		this.emit("end");
	}
	if (this.currentHandler!==undefined) {
		this.currentHandler.emit("error",new Error("Connection ended"));
		this.currentHandler=undefined;
	}
	while (this.handlerQueue.length>0) {
		this.handlerQueue.shift().emit("error",new Error("Connection ended"));
	}
	while (this.requestQueue.length>0) {
		this.requestQueue.shift().handler.emit("error",new Error("Connection ended"));
	}
}
NNTPClient.prototype._doRequest=function(line) {
	var handler=new EventEmitter();
	if (this.connected) {
		this.handlerQueue.push(handler);
		this.socket.write(line);
	} else {
		this.requestQueue.push({
			line: line,
			handler: handler
		});
	}
	return handler;
}

NNTPClient.prototype.destroy=function() {
	return this.socket.destroy();
}

function fixInt(input) {
	var re=/^[0-9]+$/;
	if (re.exec(input))
		return parseInt(input,10);
	return input;
}
NNTPClient.prototype.Capabilities=function(keyword,callback) {
	var request,
		handler,
		responded=false;
	callback=arguments[Math.min(1,arguments.length-1)];
	keyword=(arguments.length>1)?arguments[0]:undefined;
	request="CAPABILITIES";
	if (keyword!==undefined) {
		request+=" "+keyword;
	}
	request+="\r\n";
	handler=this._doRequest(request);
	handler.on("response",function(code,args,codeInfo) {
		if (code===101) {
			if (!responded) {
				responded=true;
				callback(undefined,handler);
			}
		} else {
			if (!responded) {
				responded=true;
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Quit=function(callback) {
	var handler=this._doRequest("QUIT\r\n");
	var responded=false;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===205) {
				args=args.split(" ");
				args.unshift(undefined);
				callback.apply(this,args);
			} else if (code===501) {
				callback(new Error("Unknown QUIT option"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}

NNTPClient.prototype.Group=function(group,callback) {
	var handler=this._doRequest("GROUP "+group+"\r\n");
	var responded=false;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===211) {
				args=args.split(" ");
				args[0]=fixInt(args[0]);
				args[1]=fixInt(args[1]);
				args[2]=fixInt(args[2]);
				args.unshift(undefined);
				callback.apply(this,args);
			} else if (code===411) {
				callback(new Error("No such newsgroup"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.ListGroup=function(group,range,callback) {
	var request,
		handler,
		number,low,high,group,
		responded=false;
	callback=arguments[Math.min(2,arguments.length-1)];
	group=(arguments.length>1)?arguments[0]:undefined;
	range=(arguments.length>2)?arguments[1]:undefined;
	request="LISTGROUP";
	if (group!==undefined) {
		request+=" "+group;
		if (range!==undefined) {
			request+=" "+range;
		}
	}
	request+="\r\n";
	handler=this._doRequest(request);
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===211) {
				args=args.split(" ");
				number=fixInt(args[0]);
				low=fixInt(args[1]);
				high=fixInt(args[2]);
				group=args[3];
				callback(undefined,number,low,high,group,handler);
			} else if (code===411) {
				callback(new Error("No such newsgroup"));
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Last=function(callback) {
	var handler=this._doRequest("LAST\r\n");
	var responded=false;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===223) {
				args=args.split(" ");
				args[0]=fixInt(args[0]);
				args.unshift(undefined);
				callback.apply(this,args);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===422) {
				callback(new Error("No previous article in this group"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Next=function(callback) {
	var handler=this._doRequest("NEXT\r\n");
	var responded=false;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===223) {
				args=args.split(" ");
				args[0]=fixInt(args[0]);
				args.unshift(undefined);
				callback.apply(this,args);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===421) {
				callback(new Error("No next article in this group"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Article=function(id,callback) {
	var handler=this._doRequest((arguments.length>1 && id!==undefined)?("ARTICLE "+id+"\r\n"):"ARTICLE\r\n"),
		n,
		messageId,
		responded=false;
	callback=(arguments.length>1)?callback:id;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===220) {
				args=args.split(" ");
				n=fixInt(args[0]);
				messageId=fixInt(args[1]);
				callback(undefined,n,messageId,handler);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===423) {
				callback(new Error("No article with that number"));
			} else if (code===430) {
				callback(new Error("No article with that message-id"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Head=function(id,callback) {
	var handler=this._doRequest((arguments.length>1 && id!==undefined)?("HEAD "+id+"\r\n"):"HEAD\r\n"),
		n,
		messageId,
		responded=false;
	callback=(arguments.length>1)?callback:id;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===221) {
				args=args.split(" ");
				n=fixInt(args[0]);
				messageId=fixInt(args[1]);
				callback(undefined,n,messageId,handler);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===423) {
				callback(new Error("No article with that number"));
			} else if (code===430) {
				callback(new Error("No article with that message-id"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Body=function(id,callback) {
	var handler=this._doRequest((arguments.length>1)?("BODY "+id+"\r\n"):"BODY\r\n"),
		n,
		messageId,
		responded=false;
	callback=(arguments.length>1)?callback:id;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===222) {
				args=args.split(" ");
				n=fixInt(args[0]);
				messageId=fixInt(args[1]);
				callback(undefined,n,messageId,handler);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===423) {
				callback(new Error("No article with that number"));
			} else if (code===430) {
				callback(new Error("No article with that message-id"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Stat=function(id,callback) {
	var handler=this._doRequest((arguments.length>1 && id!==undefined)?("STAT "+id+"\r\n"):"STAT\r\n"),
		responded=false;
	callback=(arguments.length>1)?callback:id;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===223) {
				args=args.split(" ");
				args[0]=fixInt(args[0]);
				args.unshift(undefined);
				callback.apply(this,args);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===423) {
				callback(new Error("No article with that number"));
			} else if (code===430) {
				callback(new Error("No article with that message-id"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Date=function(callback) {
	var handler=this._doRequest("DATE\r\n"),
		responded=false;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===111) {
				args=args.split(" ");
				args.unshift(undefined);
				callback.apply(this,args);
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Help=function(callback) {
	var handler=this._doRequest("HELP\r\n"),
		responded=false;
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===100) {
				callback(undefined,handler);
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.List=function(keyword,argument,callback) {
	var request,
		handler,
		responded=false;
	callback=arguments[Math.min(2,arguments.length-1)];
	keyword=(arguments.length>1)?arguments[0]:undefined;
	argument=(arguments.length>2)?arguments[1]:undefined;
	request="LIST";
	if (keyword!==undefined) {
		request+=" "+keyword;
		if (argument!==undefined) {
			request+=" "+argument;
		}
	}
	request+="\r\n";
	handler=this._doRequest(request);
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===215) {
				callback(undefined,handler);
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Xover=function(argument,callback) {
	var request,
		handler,
		lines=[],
		responded=false;
	callback=arguments[Math.min(1,arguments.length-1)];
	argument=(arguments.length>1)?arguments[0]:undefined;
	request="XOVER";
	if (argument!==undefined) {
		request+=" "+argument;
	}
	request+="\r\n";
	handler=this._doRequest(request);
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===224) {
				callback(undefined,handler);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===423) {
				callback(new Error("No articles in that rang"));
			} else if (code===430) {
				callback(new Error("No article with that message-id"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}
NNTPClient.prototype.Over=function(argument,callback) {
	var request,
		handler,
		lines=[],
		responded=false;
	callback=arguments[Math.min(1,arguments.length-1)];
	argument=(arguments.length>1)?arguments[0]:undefined;
	request="OVER";
	if (argument!==undefined) {
		request+=" "+argument;
	}
	request+="\r\n";
	handler=this._doRequest(request);
	handler.on("response",function(code,args,codeInfo) {
		if (!responded) {
			responded=true;
			if (code===224) {
				callback(undefined,handler);
			} else if (code===412) {
				callback(new Error("No newsgroup selected"));
			} else if (code===420) {
				callback(new Error("Current article number is invalid"));
			} else if (code===423) {
				callback(new Error("No articles in that rang"));
			} else if (code===430) {
				callback(new Error("No article with that message-id"));
			} else {
				callback(new Error("Unexpected code "+code));
			}
		}
	});
	handler.on("error",function(error) {
		if (!responded) {
			responded=true;
			callback(error || new Error("Unknown"));
		}
	});
}

NNTPClient.simpleMultiline=function(callback) {
	return function(err) {
		if (err) {
			return callback(err);
		}
		var args=Array.prototype.slice.call(arguments),
			lines=[],
			responded=false;
		if (args.length>1 && (args[args.length-1] instanceof EventEmitter)) {
			handler=args.pop();
			args.push(lines);
			handler.on("data",function(d) {
				lines.push(d);
			});
			handler.on("error",function(err) {
				if (!responded) {
					responded=true;
					callback(err || new Error("Unknown error"));
				}
			});
			handler.on("end",function() {
				if (!responded) {
					responded=true;
					callback.apply(undefined,args);
				}
			});
		} else {
			return callback.apply(this,args);
		}
	}
}

exports.NNTPClient=NNTPClient;