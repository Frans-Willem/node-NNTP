# Node NNTP Tools
## Contents
* NNTPClient.js: Main client, no synchronisation of selected groups, be careful to take care of when you select a group and when you expect a group to be selected.
* NNTPSimpleClient.js: Simple wrapper for NNTPClient.js, contains getGroupInfo (GROUP), getOverviewFormat (LIST OVERVIEW.FMT), and getOverview (OVER), will make sure the proper group is selected for each request.
* NNTPSimplePool.js: Pool of NNTPSimpleClient, just call getGroupInfo, getOverviewFormat, or getOverview on this, and it'll make sure a connected client will handle it.
* NNTPStreamingOverview.js: Create this with a pool, a group, and a range, and it'll stream an overview of articles like a ReadableStream, with pause and resume format.
* LinkedList.js: Used in NNTPStreamingOverview.js
# NNTPClient
## Use

	var NNTPClient=require("NNTPClient").NNTPClient;
	var c=new NNTPClient(port,server,user,password);

## Events
### 'connect' ()
Issued when succesfully connected to the NNTP server
### 'error' (err)
Issued a fatal error occured. The client is no longer usable after this.
### 'end'
Issued when the NNTP server disconnects. The client is no longer usable after this.
## Callbacks
Some callbacks get a "handler" argument. This will be an EventEmitter, which will fire a "data" for each line received (note: \r and \n are stripped off), "end" when done, or "error" when something went wrong.
If you'd rather get an array of lines directly, use NNTPClient.simpleMultiline around your callback, e.g.:

	function capabilitiesCallback(err,capabilities) {
		sys.puts("Capabilities: "+capabilities.map(String).join("\r\n"));
	}
	c.Capabilities(NNTPClient.simpleMultiline(capabilitiesCallback));
## Methods
### c.destroy()
Destroys the underlying socket.
### c.Capabilities(callback)
Issues a CAPABILITIES command, results passed to callback.
Callback should be of the form: function(err,handler) {}
### c.Quit(callback)
Issues a QUIT command.
Callback should be of the form: function(err) {}
### c.Group(group,callback)
Issues a GROUP command. Group should be a string like "alt.binaries.multimedia".
Callback should be of the form: function(err,number,low,high,group) {}
See http://tools.ietf.org/html/rfc3977#section-6.1.1
### c.ListGroup([group,[range,]]callback)
Issues a LISTGROUP command, group and range are optional (can be omitted or set to undefined).
Callback should be of the form: function(err,number,low,high,group,handler) {}
See http://tools.ietf.org/html/rfc3977#section-6.1.2
### c.Last(callback)
Issues a LAST command.
Callback should be of the form: function(err,n,messageId) {}
See http://tools.ietf.org/html/rfc3977#section-6.1.3
### c.Next(callback)
Issues a NEXT command.
Callback should be of the form: function(err,n,messageId) {}
See http://tools.ietf.org/html/rfc3977#section-6.1.4
### c.Article([id,]callback)
Issues an ARTICLE command.
Callback should be of the form: function(err,n,messageId,handler) {}
See http://tools.ietf.org/html/rfc3977#section-6.2.1
### c.Head([id,]callback)
Issues an HEAD command.
Callback should be of the form: function(err,n,messageId,handler) {}
See http://tools.ietf.org/html/rfc3977#section-6.2.2
### c.Body([id,]callback)
Issues an BODY command.
Callback should be of the form: function(err,n,messageId,handler) {}
See http://tools.ietf.org/html/rfc3977#section-6.2.3
### c.Stat([id,]callback)
Issues a STAT command.
Callback should be of the form: function(err,n,messageId) {}
See http://tools.ietf.org/html/rfc3977#section-6.2.4
### c.Date(callback)
Issues a DATE command.
Callback should be of the form: function(err,date) {}
Note that the returned date value is a string, like defined in the RFC. Parsing it to a javascript Date is left as an exercise to the reader ;)
See http://tools.ietf.org/html/rfc3977#section-7.1
### c.Help(callback)
Issues a HELP command.
Callback should be of the form: function(err,handler) {}
See http://tools.ietf.org/html/rfc3977#section-7.2
### c.List([keyword,[argument,]]callback)
Issues a LIST command. keyword and argument are optional.
Callback should be of the form: function(err,handler) {}
See http://tools.ietf.org/html/rfc3977#section-7.6
### c.Xover
Same as c.Over, although issues an XOVER instead of an OVER command
### c.Over(range|messageId,callback)
Issues an OVER command.
Callback should be of the form: function(err,handler) {}
Note that handler gets raw lines, splitting it on the \t character still has to be done.
See NNTPStreamingOverview for an implementation of this.
See http://tools.ietf.org/html/rfc3977#section-8.3
# NNTPSimpleClient
## Use

	var NNTPSimpleClient=require("NNTPSimpleClient").NNTPSimpleClient;
	var c=new NNTPSimpleClient(port,server,user,password);

## Events
Same as on NNTPClient
### 'connect'
### 'end'
### 'error'
## Callbacks
See the Callbacks section for NNTPClient
## Methods
### c.getGroupInfo(group,callback)
Same as the Group command of an NNTPClient, although this will keep track of which group is selected, and not send more GROUP requests unless needed.
### c.getOverviewFormat(callback)
Alias for .List("OVERVIEW.FMT",callback) on the NNTPClient.
### c.getOverview(group,range,callback)
Will make sure group is selected with GROUP, and issue an Over command on the NNTPClient.
# NNTPSimplePool
## Use

	var NNTPSimplePool=require("NNTPSimplePool").NNTPSimplePool;
	var c=new NNTPSimplePool(maxClients,port,server,username,password);

## Events
None
## Callbacks
Same as NNTPSimpleClient and NNTPClient
## Methods
Same as NNTPSimpleClient
# NNTPStreamingOverview
## Use

	var NNTPSimplePool=require("NNTPSimplePool").NNTPSimplePool;
	var NNTPStreamingOverview=require("NNTPStreamingOverview").NNTPStreamingOverview;
	var pool=new NNTPSimplePool(maxClients,port,server,username,password);
	var s=new NNTPStreamingOverview(pool,group,start,end,batchSize,cacheBatches);

Where start and end are the articles to start and end with (for example, low and high from getGroupInfo, or one more than your previously cached article number to high),
batchSize indicating how many articles per OVER command should be issued,
cacheBatches how many batches to attempt to keep queued for handling.
E.g. batchSize 200 and cacheBatches 5 would request 200 articles at a time, and attempt to keep at least 1000 articles unprocessed articles in the queue.
## Events & Methods
All methods and properties of the ReadableStream of Node.js, with the following exceptions:
* setEncoding is not supported
* the "data" event gets an array of buffers, where each "data" event is a row in the overview table, and the array represents the columns.
Note that .pause and .resume are supported, and encouraged.