function LinkedList() {
	this._front=null;
	this._back=null;
	this._size=0;
}
LinkedList.prototype.size=function() {
	return this._size;
}
LinkedList.prototype.push_front=function(v) {
	var item={
		value: v,
		next: this._front,
		prev: null
	};
	if (this._front!==null) {
		this._front.prev=item;
	}
	this._front=item;
	if (this._back===null) {
		this._back=item;
	}
	this._size++;
	return item;
}
LinkedList.prototype.push_back=function(v) {
	var item={
		value: v,
		next: null,
		prev: this._back
	};
	if (this._back!==null) {
		this._back.next=item;
	}
	this._back=item;
	if (this._front===null) {
		this._front=item;
	}
	this._size++;
	return item;
}
LinkedList.prototype.front=function() {
	return (this._front===null)?undefined:this._front.value;
}

LinkedList.prototype.back=function() {
	return (this._back===null)?undefined:this._back.value;
}
LinkedList.prototype.pop_front=function() {
	if (this._front===null) {
		return undefined;
	}
	var item=this._front;
	this._front=item.next;
	if (item.next) {
		item.next.prev=undefined;
	}
	if (item===this._back) {
		this._back=null;
	}
	this._size--;
	return item.value;
}
LinkedList.prototype.pop_back=function() {
	if (this._back===null) {
		return undefined;
	}
	var item=this._back;
	this._back=item.prev;
	if (item.prev) {
		item.prev.next=undefined;
	}
	if (item===this._front) {
		this._front=null;
	}
	this._size--;
	return item.value;
}
LinkedList.prototype.insertBefore=function(item,value) {
	var next=item;
	item={
		prev: next.prev,
		next: next,
		value: value
	};
	if (next.prev) {
		next.prev.next=item;
	}
	next.prev=item;
	if (next===this._front) {
		this._front=item;
	}
	this._size++;
	return item;
}
LinkedList.prototype.remove=function(item) {
	if (item.prev) {
		item.prev.next=item.next;
	}
	if (item.next) {
		item.next.prev=item.prev;
	}
	if (item===this._front) {
		this._front=item.next;
	}
	if (item===this._back) {
		this._back=item.prev;
	}
	this._size--;
}
exports.LinkedList=LinkedList;