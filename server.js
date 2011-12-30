
var sys = require('sys');
var http = require('http');
var repl = require('repl');
var fs = require('fs');
var $ = require('jquery');

messages = [];
users = [];
message_queue = new process.EventEmitter();
userCount = 0;

connectAction = function(req, res){
	var id = req.url.split('?')[1];
	publicID = -1;
	if(id){
		//are we going to support reconnecting if they have an ID, this could be useful if we are worried about the server going away temporarily,
		//for now we will probably just ignore it…
		res.writeHead(200, { 'content-type':'text/plain'});
		res.write("Unsupported");
		res.end();
		return;
	}else{
		publicID = userCount;
		newID = Math.floor(Math.random()*1000000)+":"+publicID;
	}
	
	u = "Anonymous " + userCount;
	time = Date.now();
	
	users[newID]= ({
		guid: newID,
		time: time,
		lastAction: time,
		status: 'connected',
		username: u
	});
	
	userCount++;
	
	messages.push({
		userid: newID,
		guid: messages.length,
		type: "connection",
		content: u,
		time: Date.now()
	});
	
	message_queue.emit("newMessage");
	
	
	res.writeHead(200, { 'content-type':'text/plain'});
	res.write(newID);
	res.end();
};

userExists = function(userID){
	if(users[userID]){
		return true;
	}
	return false;
};

getUsername = function(userID){
	return users[userID];
};

updateUsername = function(userID, newName){
	newName = $('<div/>').text(decodeURIComponent(newName)).html();
	oldName = "";
	
	//check the new name is free
	deny = 0;
	for(var i=0; i < users.length; i++){
		if(users[i].username == newName){
			deny = 1;
		}
	}
	
	if(!deny){
		
		
		oldName = users[userID].username;
		users[userID].username = newName;
		
		messages.push({
			userid: userID,
			guid: messages.length,
			type: "username",
			content: newName,
			time: Date.now()
		});
		
		message_queue.emit("newMessage");
	}else{
		
	}
};

addMessage = function(userID, message){
	message = $('<div/>').text(decodeURIComponent(message)).html();
	messages.push({
		userid: userID,
		guid: messages.length,
		type: "message",
		content:message,
		time: Date.now()
	});
	
	message_queue.emit("newMessage");
};

getMessagesSince = function(lastTimeAsked){

	if(!lastTimeAsked){
		return messages.filter(function(m){
			return ( m.type != "event");
		});
	}
	
	return messages.filter(function(m){
		return (m.time > lastTimeAsked);
	});
};

formatMessages = function(mess){

	var ret = [];

	for(i=0;i<mess.length;i++){		
		uID = mess[i].userid.split(':')[1];
		
		ret.push({
			userID: uID,
			guid: mess[i].guid,
			type: mess[i].type,
			content: mess[i].content,
			time: mess[i].time
		});	
	}
	
	return ret;
}

typingAction = function(req, res){
	//accept so the request can close
	res.writeHead(200, { 'content-type':'text/html'});
	res.write('1');
	res.end();

	//tell everyone else that the user is gone
	var id = req.url.split('?')[1];
	
	if(users[id]){
		messages.push({
			userid: id,
			guid: messages.length,
			type: "event",
			content:"typing",
			time: Date.now()
		});
	}
	
	message_queue.emit("newMessage");	
}

disconnectAction = function(req, res){
	//accept so the page can close
	res.writeHead(200, { 'content-type':'text/html'});
	res.write('1');
	res.end();
	
	//tell everyone else that the user is gone
	var id = req.url.split('?')[1];
	
	if(users[id]){
		users[id].lastAction = Date.now();
		users[id].status = 'disconnected';
	}
	
	messages.push({
		userid: id,
		guid: messages.length,
		type: "disconnect",
		content:'',
		time: Date.now()
	});
	
	
	
	message_queue.emit("newMessage");
	
}

routeToAction = function(route, req, res){
	
	if(route === '/messages'){
		getMessagesAction(req, res);
	}else if(route === '/add'){
		addMessageAction(req, res);
	}else if(route === '/connect'){
		connectAction(req, res);
	}else if(route === '/username'){
		updateUsernameAction(req, res);
	}else if(route === '/disconnect'){
		disconnectAction(req, res);
	}else if(route === '/typing'){
		typingAction(req, res);
	}else{
		//no order, must be a page load...
		displayWebpage(route, req, res);
	}
};

displayWebpage = function(route, req, res){
	res.writeHead(200, { 'content-type':'text/html'});

	var path = route.substr(1, route.length-1);
	
	if(path == ""){
		path = "index.html";
	}
	
	fs.readFile(path, function(err, data){
		if(err) return;
		res.write(data);
		res.end();
	});
	
	/*var file = new fs.File();
	file.onError = function (method, errno, msg) {
	  stderr.puts("An error occurred calling " + method);
	  stderr.puts(msg);
	  node.exit(1);
	}*/
	
	//fs.read(fd, buffer, offset, length, position, [callback])
	
};

dumpObject = function(object){
	var ret = '';
	
	for(var o in object){
		ret += o + " => " + object[o] + "\n";
	}
	
	return ret;
};

updateUsernameAction = function(req, res){
	userID = req.url.split('?')[1];
	userName = decodeURIComponent(req.url.split('?')[2]);
	
	if(userExists(userID)){
		users[userID].lastAction = Date.now();
		
		updateUsername(userID, userName);
		
		res.writeHead(200, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin' : '*', "Connection": 'Close'});
		res.write('1');
		res.end();
	}	
}

getMessagesAction = function(req, res){
	userID = req.url.split('?')[1];
	lastTimeAsked = req.url.split('?')[2];
	
	users[userID].lastAction = Date.now();
		
	if(userExists(userID)){
		
		res.writeHead(200, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin' : '*', "Connection": 'Close'});
		
		var m = getMessagesSince(lastTimeAsked);
		
		if(m.length){
			res.write(JSON.stringify( formatMessages(m) ));
			res.end();
		}else{
			var timeout;
			var listener;
			
			//detect close also
			/*req.addListener('close', function(){
				users[id].lastAction = Date.now();
				users[id].status = 'disconnected';
				
				messages.push({
					userid: id,
					guid: messages.length,
					type: "disconnect",
					content:'',
					time: Date.now()
				});
				
				message_queue.emit("newMessage");
			});*/
			
			listener = function(e){
				var m = getMessagesSince(lastTimeAsked);
				
				res.write(JSON.stringify( formatMessages(m) ));
				res.end();
				clearTimeout(timeout);
				message_queue.removeListener("newMessage", listener);
			};
			
			message_queue.addListener("newMessage", listener);
			
			users[userID].lastAction = Date.now() + 10000;
			
			timeout = setTimeout(function(){
				res.write(JSON.stringify([]));
				res.end();
				if(listener){
					message_queue.removeListener("newMessage", listener);
				}
			}, 10000);
		}
	}else{
		//user id not in array
		res.writeHead(200, { 'content-type':'text/plain'});
		res.write("Unauthorized");
		res.end();
		return;
	}
}

addMessageAction = function(req, res){
	userID = req.url.split('?')[1];
		
	if(userExists(userID)){
		users[userID].lastAction = Date.now();
		
		message = req.url.split('?')[2];
		
		res.writeHead(201, {'Content-Type': 'text/plain', 'Access-Control-Allow-Origin' : '*', "Connection": 'close'});
		
		addMessage(userID, message);
		res.end();
	}else{
		res.writeHead(200, { 'content-type':'text/plain'});
		res.write("Unauthorized");
		res.end();
		return;
	}
};

userCleanup = function(){
	
	for(user in users){
		
		if(user.lastAction < Date.now()-60000){
			
			users[id].status = 'disconnected';
			
			messages.push({
				userid: id,
				guid: messages.length,
				type: "disconnect",
				content:'',
				time: Date.now()
			});
			
						
			message_queue.emit("newMessage");
		}
	}
	
	setTimeout('userCleanup', 5000);
}

server = http.createServer(function(req, res){
	// /messages
	// /add
	var route = req.url.split('?')[0];
	routeToAction(route, req, res);
});

server.addListener("connection", function(s){

});

server.listen(8001);
sys.puts('Server running at http://linode.stuartcoope.com:8001/');
repl.start('>');
